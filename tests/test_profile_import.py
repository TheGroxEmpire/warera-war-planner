import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ProfileImportContractTest(unittest.TestCase):
    def run_node_json(self, script):
        completed = subprocess.run(
            ["node", "-e", script],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        if completed.returncode != 0:
            self.fail(completed.stderr or completed.stdout)
        return json.loads(completed.stdout)

    def test_profile_fields_map_to_the_planner_skill_and_item_order(self):
        result = self.run_node_json(
            r"""
            const importer = require("./static/profile-import.js");
            const skillLevels = {
                attack: 1,
                precision: 2,
                criticalChance: 3,
                criticalDamages: 4,
                armor: 5,
                dodge: 6,
                health: 7,
                hunger: 8,
                lootChance: 9,
            };
            const skills = Object.fromEntries(
                Object.entries(skillLevels).map(([key, level]) => [key, { level }]),
            );
            skills.attack.militaryRankPercent = 37.5;
            skills.attack.ammoPercent = 20;
            const profile = importer.normalizeProfile({
                _id: "player-42",
                username: "Fixture Fighter",
                avatarUrl: "https://media.warera.io/avatar.png",
                leveling: { level: 50 },
                skills,
            }, {
                weapon: { code: "pistol_2" },
                helmet: { code: "helmet6" },
                gloves: { code: "gloves2" },
                chest: { code: "chest3" },
                pants: { code: "pants4" },
                boots: { code: "boots5" },
                ammo: "green",
            });
            console.log(JSON.stringify(profile));
            """
        )

        self.assertEqual(result["id"], "player-42")
        self.assertEqual(result["username"], "Fixture Fighter")
        self.assertEqual(result["level"], 50)
        self.assertEqual(result["rankBonusPct"], 37.5)
        self.assertEqual(result["skillLevels"], [1, 2, 3, 4, 5, 6, 7, 8, 9])
        self.assertEqual(result["gearTiers"], [2, 6, 2, 3, 4, 5])
        self.assertEqual(result["ammoIndex"], 1)
        self.assertTrue(result["skillsAvailable"])
        self.assertTrue(result["loadoutAvailable"])
        self.assertEqual(result["loadoutWarnings"], [])

    def test_known_equipment_codes_are_allowlisted(self):
        result = self.run_node_json(
            r"""
            const importer = require("./static/profile-import.js");
            console.log(JSON.stringify({
                weapons: ["knife", "pistol", "gun", "rifle", "sniper", "tank", "jet", "laser"]
                    .map((code) => importer.equipmentTierIndex(0, { code })),
                armor: ["helmet1", "helmet_2", "helmet6", "helmet7", "pants6", "eventItem6", "unknown"]
                    .map((code) => importer.equipmentTierIndex(1, { code })),
                malformed: [
                    importer.equipmentTierIndex(1, undefined),
                    importer.equipmentTierIndex(1, {}),
                    importer.equipmentTierIndex(1, null, true),
                ],
                ammo: [
                    importer.ammoTierIndex({ skills: { attack: { ammoPercent: 10 } } }, {}),
                    importer.ammoTierIndex({ skills: { attack: { ammoPercent: 0 } } }, { ammo: "blue" }),
                    importer.ammoTierIndex({ skills: { attack: { ammoPercent: 0 } } }, { ammo: "heavyAmmo" }),
                    importer.ammoTierIndex({ skills: { attack: { ammoPercent: 40 } } }, { ammo: "green" }),
                ],
            }));
            """
        )

        self.assertEqual(result["weapons"], [1, 2, 2, 3, 4, 5, 6, None])
        self.assertEqual(result["armor"], [1, 2, 6, None, None, None, None])
        self.assertEqual(result["malformed"], [0, None, None])
        self.assertEqual(result["ammo"], [0, 2, 3, 1])

    def test_selective_import_preserves_unchecked_and_unavailable_pins(self):
        result = self.run_node_json(
            r"""
            const importer = require("./static/profile-import.js");
            const current = {
                skills: [9, 8, 7, 6, 5, 4, 3, 2, 1],
                gear: [1, 2, 3, 4, 5, 6],
                ammo: 3,
                food: 2,
            };
            const profile = {
                skillLevels: [1, 1, 2, 2, 3, 3, 4, 4, 5],
                gearTiers: [6, 0, 4, null, 2, 1],
                ammoIndex: 0,
            };
            console.log(JSON.stringify({
                base: importer.buildImportedConstraints(current, profile),
                skills: importer.buildImportedConstraints(current, profile, { pinSkills: true }),
                loadout: importer.buildImportedConstraints(current, profile, { pinLoadout: true }),
                both: importer.buildImportedConstraints(current, profile, {
                    pinSkills: true,
                    pinLoadout: true,
                }),
            }));
            """
        )

        self.assertEqual(result["base"], {
            "skills": [9, 8, 7, 6, 5, 4, 3, 2, 1],
            "gear": [1, 2, 3, 4, 5, 6],
            "ammo": 3,
            "food": 2,
        })
        self.assertEqual(result["skills"]["skills"], [1, 1, 2, 2, 3, 3, 4, 4, 5])
        self.assertEqual(result["skills"]["gear"], [1, 2, 3, 4, 5, 6])
        self.assertEqual(result["loadout"]["skills"], [9, 8, 7, 6, 5, 4, 3, 2, 1])
        self.assertEqual(result["loadout"]["gear"], [6, 0, 4, 4, 2, 1])
        self.assertEqual(result["loadout"]["ammo"], 0)
        self.assertEqual(result["loadout"]["food"], 2)
        self.assertEqual(result["both"]["skills"], [1, 1, 2, 2, 3, 3, 4, 4, 5])

    def test_malformed_optional_sections_cannot_be_selected(self):
        result = self.run_node_json(
            r"""
            const importer = require("./static/profile-import.js");
            function user(overrides = {}) {
                return {
                    _id: "p1",
                    username: "Incomplete",
                    leveling: { level: 20 },
                    skills: {
                        attack: { level: 2, militaryRankPercent: 5 },
                    },
                    ...overrides,
                };
            }
            let missingRequired;
            try {
                importer.normalizeProfile(user({ leveling: {} }), {});
                missingRequired = false;
            } catch {
                missingRequired = true;
            }
            const incomplete = importer.normalizeProfile(user(), {
                weapon: { code: "laser" },
            });
            console.log(JSON.stringify({
                missingRequired,
                skillsAvailable: incomplete.skillsAvailable,
                skillsError: incomplete.skillsError,
                gearTiers: incomplete.gearTiers,
                warnings: incomplete.loadoutWarnings,
            }));
            """
        )

        self.assertTrue(result["missingRequired"])
        self.assertFalse(result["skillsAvailable"])
        self.assertIn("missing", result["skillsError"])
        self.assertEqual(result["gearTiers"], [None, 0, 0, 0, 0, 0])
        self.assertEqual(result["warnings"], ["Unknown weapon code"])

    def test_null_blank_fractional_and_out_of_range_numbers_are_not_importable(self):
        result = self.run_node_json(
            r"""
            const importer = require("./static/profile-import.js");
            function validUser() {
                const skills = Object.fromEntries(
                    importer.SKILL_KEYS.map((key) => [key, { level: 2 }]),
                );
                skills.attack.militaryRankPercent = 5;
                return {
                    _id: "p1",
                    username: "Numeric Fixture",
                    leveling: { level: 20 },
                    skills,
                };
            }
            const invalidRequired = [
                [null, 5], ["", 5], [true, 5], [[20], 5], [{ value: 20 }, 5],
                [20.5, 5], [0, 5], [51, 5],
                [20, null], [20, ""], [20, true], [20, [5]], [20, { value: 5 }],
                [20, -1], [20, 5.1], [20, 38],
            ].map(([level, rank]) => {
                const user = validUser();
                user.leveling.level = level;
                user.skills.attack.militaryRankPercent = rank;
                try {
                    importer.normalizeProfile(user, {});
                    return false;
                } catch {
                    return true;
                }
            });
            const invalidSkills = [null, "", true, [2], { value: 2 }, 1.5, -1, 11].map((skillLevel) => {
                const user = validUser();
                user.skills.health.level = skillLevel;
                return importer.normalizeProfile(user, {}).skillsAvailable;
            });
            console.log(JSON.stringify({ invalidRequired, invalidSkills }));
            """
        )

        self.assertTrue(all(result["invalidRequired"]))
        self.assertFalse(any(result["invalidSkills"]))

    def test_avatar_urls_must_be_nonblank_absolute_http_urls(self):
        result = self.run_node_json(
            r"""
            const importer = require("./static/profile-import.js");
            console.log(JSON.stringify([
                importer.safeAvatarUrl(""),
                importer.safeAvatarUrl("/relative-avatar.png"),
                importer.safeAvatarUrl("javascript:alert(1)"),
                importer.safeAvatarUrl("https://media.warera.io/avatar.png"),
            ]));
            """
        )

        self.assertEqual(result[:3], ["", "", ""])
        self.assertEqual(result[3], "https://media.warera.io/avatar.png")

    def test_api_key_stays_in_the_direct_request_header(self):
        result = self.run_node_json(
            r"""
            const importer = require("./static/profile-import.js");
            const calls = [];
            const fetchImpl = async (url, options) => {
                calls.push({ url, headers: options.headers, body: options.body });
                return {
                    ok: true,
                    status: 200,
                    async json() { return { result: { data: { ok: true } } }; },
                };
            };
            (async () => {
                const data = await importer.request("user.getUserLite", { userId: "p1" }, {
                    apiKey: "super-secret",
                    fetchImpl,
                });
                console.log(JSON.stringify({ calls, data }));
            })().catch((error) => {
                console.error(error);
                process.exitCode = 1;
            });
            """
        )

        call = result["calls"][0]
        self.assertNotIn("super-secret", call["url"])
        self.assertNotIn("super-secret", call["body"])
        self.assertEqual(call["headers"]["X-API-Key"], "super-secret")
        self.assertEqual(result["data"], {"ok": True})

    def test_profile_load_survives_an_equipment_request_failure(self):
        result = self.run_node_json(
            r"""
            const importer = require("./static/profile-import.js");
            const skillKeys = importer.SKILL_KEYS;
            const fetchImpl = async (url) => {
                if (url.endsWith("inventory.fetchCurrentEquipment")) {
                    return {
                        ok: false,
                        status: 503,
                        async json() { return { error: { message: "Unavailable" } }; },
                    };
                }
                const skills = Object.fromEntries(skillKeys.map((key) => [key, { level: 1 }]));
                skills.attack.militaryRankPercent = 8.25;
                return {
                    ok: true,
                    status: 200,
                    async json() {
                        return { result: { data: {
                            _id: "p1",
                            username: "Available Player",
                            leveling: { level: 22 },
                            skills,
                        } } };
                    },
                };
            };
            (async () => {
                const profile = await importer.loadProfile("p1", { fetchImpl });
                console.log(JSON.stringify(profile));
            })().catch((error) => {
                console.error(error);
                process.exitCode = 1;
            });
            """
        )

        self.assertEqual(result["level"], 22)
        self.assertEqual(result["rankBonusPct"], 8.25)
        self.assertFalse(result["loadoutAvailable"])
        self.assertIn("still import", result["loadoutError"])

    def test_malformed_equipment_payload_cannot_clear_loadout_pins(self):
        result = self.run_node_json(
            r"""
            const importer = require("./static/profile-import.js");
            const fetchImpl = async (url) => {
                if (url.endsWith("inventory.fetchCurrentEquipment")) {
                    return {
                        ok: true,
                        status: 200,
                        async json() { return { result: { data: null } }; },
                    };
                }
                const skills = Object.fromEntries(
                    importer.SKILL_KEYS.map((key) => [key, { level: 1 }]),
                );
                skills.attack.militaryRankPercent = 8.25;
                return {
                    ok: true,
                    status: 200,
                    async json() {
                        return { result: { data: {
                            _id: "p1",
                            username: "Available Player",
                            leveling: { level: 22 },
                            skills,
                        } } };
                    },
                };
            };
            (async () => {
                const profile = await importer.loadProfile("p1", { fetchImpl });
                console.log(JSON.stringify(profile));
            })().catch((error) => {
                console.error(error);
                process.exitCode = 1;
            });
            """
        )

        self.assertFalse(result["loadoutAvailable"])
        self.assertIn("could not be loaded", result["loadoutError"])

    def test_request_surfaces_api_errors_and_preserves_abort(self):
        result = self.run_node_json(
            r"""
            const importer = require("./static/profile-import.js");
            async function messageFor(fetchImpl) {
                try {
                    await importer.request("test.procedure", {}, { fetchImpl });
                    return { resolved: true };
                } catch (error) {
                    return { name: error.name, message: error.message };
                }
            }
            (async () => {
                const http = await messageFor(async () => ({
                    ok: false,
                    status: 429,
                    async json() { return { error: { message: "Rate limited" } }; },
                }));
                const trpc = await messageFor(async () => ({
                    ok: true,
                    status: 200,
                    async json() { return { error: { json: { message: "Denied" } } }; },
                }));
                const malformed = await messageFor(async () => ({
                    ok: true,
                    status: 200,
                    async json() { throw new SyntaxError("bad json"); },
                }));
                const aborted = await messageFor(async () => ({
                    ok: true,
                    status: 200,
                    async json() {
                        const error = new Error("cancelled");
                        error.name = "AbortError";
                        throw error;
                    },
                }));
                console.log(JSON.stringify({ http, trpc, malformed, aborted }));
            })().catch((error) => {
                console.error(error);
                process.exitCode = 1;
            });
            """
        )

        self.assertEqual(result["http"]["message"], "Rate limited")
        self.assertEqual(result["trpc"]["message"], "Denied")
        self.assertIn("invalid response", result["malformed"]["message"])
        self.assertEqual(result["aborted"]["name"], "AbortError")

    def test_search_reports_total_detail_failure_but_keeps_partial_success(self):
        result = self.run_node_json(
            r"""
            const importer = require("./static/profile-import.js");
            function response(ok, status, payload) {
                return { ok, status, async json() { return payload; } };
            }
            function fetchFor(failingIds) {
                return async (url, options) => {
                    if (url.endsWith("search.searchAnything")) {
                        return response(true, 200, { result: { data: { userIds: ["p1", "p2"] } } });
                    }
                    const { userId } = JSON.parse(options.body);
                    if (failingIds.includes(userId)) {
                        return response(false, 503, { error: { message: `Failed ${userId}` } });
                    }
                    return response(true, 200, { result: { data: {
                        _id: userId,
                        username: `Player ${userId}`,
                        leveling: { level: 12 },
                    } } });
                };
            }
            (async () => {
                const partial = await importer.searchUsers("player", { fetchImpl: fetchFor(["p2"]) });
                let totalFailure = "";
                try {
                    await importer.searchUsers("player", { fetchImpl: fetchFor(["p1", "p2"]) });
                } catch (error) {
                    totalFailure = error.message;
                }
                console.log(JSON.stringify({ partial, totalFailure }));
            })().catch((error) => {
                console.error(error);
                process.exitCode = 1;
            });
            """
        )

        self.assertEqual([entry["id"] for entry in result["partial"]], ["p1"])
        self.assertEqual(result["totalFailure"], "Failed p1")


if __name__ == "__main__":
    unittest.main()
