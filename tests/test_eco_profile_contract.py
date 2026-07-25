import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests" / "fixtures" / "eco_profile_v1.json"


class EcoProfileContractTest(unittest.TestCase):
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

    def test_v1_envelope_is_strict_and_uses_the_shared_storage_key(self):
        result = self.run_node_json(
            r"""
            const fs = require("fs");
            const engine = require("./static/eco-engine.js");
            const fixture = JSON.parse(fs.readFileSync("./tests/fixtures/eco_profile_v1.json", "utf8"));

            function isRejected(value) {
                try {
                    engine.normalizeEnvelope(value);
                    return false;
                } catch {
                    return true;
                }
            }

            const normalized = engine.normalizeEnvelope(JSON.stringify(fixture));
            const missingProfile = { ...fixture };
            delete missingProfile.profile;
            const missingGeneratedAt = { ...fixture };
            delete missingGeneratedAt.generatedAt;
            const missingConfig = JSON.parse(JSON.stringify(fixture));
            delete missingConfig.profile.config;
            const missingAllocation = JSON.parse(JSON.stringify(fixture));
            delete missingAllocation.profile.alloc;
            const missingCompanies = JSON.parse(JSON.stringify(fixture));
            delete missingCompanies.profile.companyConfigs;

            console.log(JSON.stringify({
                storageKey: engine.STORAGE_KEY,
                normalized: {
                    v: normalized.v,
                    source: normalized.source,
                    generatedAt: normalized.generatedAt,
                    level: normalized.profile.config.level,
                    companies: normalized.profile.companyConfigs.length,
                },
                rejected: {
                    futureVersion: isRejected({ ...fixture, v: 2 }),
                    stringVersion: isRejected({ ...fixture, v: "1" }),
                    wrongSource: isRejected({ ...fixture, source: "another-app" }),
                    missingProfile: isRejected(missingProfile),
                    missingGeneratedAt: isRejected(missingGeneratedAt),
                    invalidGeneratedAt: isRejected({ ...fixture, generatedAt: "not-a-date" }),
                    missingConfig: isRejected(missingConfig),
                    missingAllocation: isRejected(missingAllocation),
                    missingCompanies: isRejected(missingCompanies),
                    invalidJson: isRejected("{not-json}"),
                },
            }));
            """
        )

        self.assertEqual(result["storageKey"], "warera-eco-profile-v1")
        self.assertEqual(
            result["normalized"],
            {
                "v": 1,
                "source": "warera-eco-simulator-profile",
                "generatedAt": "2026-07-24T12:34:56.000Z",
                "level": 20,
                "companies": 5,
            },
        )
        self.assertTrue(all(result["rejected"].values()), result["rejected"])

    def test_profile_normalization_is_allowlisted_and_drops_credentials(self):
        result = self.run_node_json(
            r"""
            const fs = require("fs");
            const engine = require("./static/eco-engine.js");
            const fixture = JSON.parse(fs.readFileSync("./tests/fixtures/eco_profile_v1.json", "utf8"));
            const hostile = JSON.parse(JSON.stringify(fixture));

            hostile.apiToken = "secret-envelope";
            hostile.profile.apiToken = "secret-profile";
            hostile.profile.wareraApiKey = "secret-warera-key";
            hostile.profile.wareraApiToken = "secret-warera-token";
            hostile.profile.config.apiKey = "secret-config";
            hostile.profile.prices.unknown_market_item = 999;
            hostile.profile.importMeta.apiToken = "secret-import";
            hostile.profile.importMeta.user.avatarUrl = "secret-avatar";
            hostile.profile.importMeta.user.token = "secret-user";
            hostile.profile.companyConfigs[0].api_key = "secret-company";
            hostile.profile.companyConfigs[0].workers[0].accessToken = "secret-worker";

            const normalized = engine.normalizeEnvelope(hostile);
            const serialized = JSON.stringify(normalized);
            console.log(JSON.stringify({
                containsSecret: serialized.includes("secret-"),
                envelopeKeys: Object.keys(normalized).sort(),
                user: normalized.profile.importMeta.user,
                userKeys: Object.keys(normalized.profile.importMeta.user).sort(),
                hasUnknownPrice: Object.hasOwn(normalized.profile.prices, "unknown_market_item"),
                hasProfileToken: Object.hasOwn(normalized.profile, "apiToken"),
                hasConfigToken: Object.hasOwn(normalized.profile.config, "apiKey"),
                hasCompanyToken: Object.hasOwn(normalized.profile.companyConfigs[0], "api_key"),
                hasWorkerToken: Object.hasOwn(normalized.profile.companyConfigs[0].workers[0], "accessToken"),
            }));
            """
        )

        self.assertFalse(result["containsSecret"])
        self.assertEqual(result["envelopeKeys"], ["generatedAt", "profile", "source", "v"])
        self.assertEqual(
            result["user"],
            {"id": "user-42", "username": "FixtureCommander"},
        )
        self.assertEqual(result["userKeys"], ["id", "username"])
        self.assertFalse(result["hasUnknownPrice"])
        self.assertFalse(result["hasProfileToken"])
        self.assertFalse(result["hasConfigToken"])
        self.assertFalse(result["hasCompanyToken"])
        self.assertFalse(result["hasWorkerToken"])

    def test_minimum_company_and_management_skills_use_game_caps(self):
        result = self.run_node_json(
            r"""
            const fs = require("fs");
            const engine = require("./static/eco-engine.js");
            const fixture = JSON.parse(fs.readFileSync("./tests/fixtures/eco_profile_v1.json", "utf8"));
            const profile = fixture.profile;

            const threeCompanies = engine.deriveWarAllocation(profile, {
                mode: "minimum",
                activeCompanyIds: [103, 101, 102],
                companyCount: 3,
                includeWorkers: true,
            });
            const everyCompany = engine.deriveWarAllocation(profile, {
                mode: "minimum",
                companyCount: 5,
                includeWorkers: true,
            });
            const withoutWorkers = engine.deriveWarAllocation(profile, {
                mode: "minimum",
                companyCount: 5,
                includeWorkers: false,
            });
            const current = engine.deriveWarAllocation(profile, {
                mode: "current",
                companyCount: 2,
                includeWorkers: true,
            });
            const custom = engine.deriveWarAllocation(profile, {
                mode: "custom",
                companyCount: 4,
                includeWorkers: true,
                customSkills: {
                    energy: 4,
                    entrepreneurship: 0,
                    production: 2,
                    companies: 2,
                    management: 1,
                },
            });

            console.log(JSON.stringify({
                helpers: {
                    companyLevels: [0, 1, 3, 10].map((level) => engine.minimumCompaniesLevel(level + 2)),
                    managementLevels: [4, 5, 6, 7].map((workers) => engine.minimumManagementLevel(workers)),
                    levelCosts: [0, 1, 2, 3, 10].map((level) => engine.levelCost(level)),
                },
                threeCompanies,
                everyCompany,
                withoutWorkers,
                current,
                custom,
            }));
            """
        )

        self.assertEqual(result["helpers"]["companyLevels"], [0, 1, 3, 10])
        self.assertEqual(result["helpers"]["managementLevels"], [0, 1, 1, 2])
        self.assertEqual(result["helpers"]["levelCosts"], [0, 1, 3, 6, 55])

        three = result["threeCompanies"]
        self.assertEqual(three["activeCompanyIds"], [101, 102, 103])
        self.assertEqual(three["workerCount"], 6)
        self.assertEqual(three["allocation"], {
            "energy": 0,
            "entrepreneurship": 0,
            "production": 0,
            "companies": 1,
            "management": 1,
        })
        self.assertEqual(three["reservedSkillPoints"], 2)

        every = result["everyCompany"]
        self.assertEqual(every["activeCompanyIds"], [101, 102, 103, 104, 105])
        self.assertEqual(every["workerCount"], 9)
        self.assertEqual(every["allocation"]["companies"], 3)
        self.assertEqual(every["allocation"]["management"], 3)
        self.assertEqual(every["reservedSkillPoints"], 12)

        no_workers = result["withoutWorkers"]
        self.assertEqual(no_workers["workerCount"], 0)
        self.assertEqual(no_workers["allocation"]["companies"], 3)
        self.assertEqual(no_workers["allocation"]["management"], 0)
        self.assertEqual(no_workers["reservedSkillPoints"], 6)
        self.assertTrue(all(not company["workers"] for company in no_workers["companyConfigs"]))

        self.assertEqual(result["current"]["allocation"], {
            "energy": 2,
            "entrepreneurship": 1,
            "production": 3,
            "companies": 3,
            "management": 2,
        })
        self.assertEqual(result["current"]["reservedSkillPoints"], 19)
        self.assertEqual(result["custom"]["reservedSkillPoints"], 17)

    def test_calculate_war_mode_passes_selected_profile_to_shared_simulator(self):
        result = self.run_node_json(
            r"""
            const fs = require("fs");
            const engine = require("./static/eco-engine.js");
            const fixture = JSON.parse(fs.readFileSync("./tests/fixtures/eco_profile_v1.json", "utf8"));
            const calls = [];
            engine.setSimulationModuleForTests({
                simulateSnapshot(snapshot) {
                    const observed = {
                        allocation: { ...snapshot.alloc },
                        companyIds: snapshot.companyConfigs.map((company) => company.id),
                        workerCount: snapshot.companyConfigs.reduce(
                            (total, company) => total + company.workers.length,
                            0,
                        ),
                        entrePlanSlots: [...snapshot.config.entrePlanSlots],
                    };
                    calls.push(observed);
                    return observed;
                },
            });

            (async () => {
                const calculated = await engine.calculateWarMode(fixture.profile, {
                    mode: "minimum",
                    activeCompanyIds: [101, 102, 103],
                    companyCount: 3,
                    includeWorkers: true,
                });
                console.log(JSON.stringify({ calculated, calls }));
            })().catch((error) => {
                console.error(error);
                process.exitCode = 1;
            });
            """
        )

        calculated = result["calculated"]
        self.assertEqual(calculated["allocation"]["companies"], 1)
        self.assertEqual(calculated["allocation"]["management"], 1)
        self.assertEqual(calculated["reservedSkillPoints"], 2)
        self.assertEqual(calculated["activeCompanyIds"], [101, 102, 103])
        self.assertEqual(calculated["normal"], result["calls"][0])
        self.assertEqual(calculated["war"], result["calls"][1])

        normal_call, war_call = result["calls"]
        self.assertEqual(normal_call["companyIds"], [101, 102, 103, 104, 105])
        self.assertEqual(normal_call["workerCount"], 9)
        self.assertEqual(war_call["companyIds"], [101, 102, 103])
        self.assertEqual(war_call["workerCount"], 6)
        self.assertEqual(war_call["entrePlanSlots"], [101, 102, 103, None, None])

    def test_legacy_two_scenario_import_is_removed(self):
        script = (ROOT / "static" / "script.js").read_text(encoding="utf-8")
        optimizer = (ROOT / "static" / "browser-optimizer.js").read_text(encoding="utf-8")
        stylesheet = (ROOT / "static" / "style.css").read_text(encoding="utf-8")
        template = (ROOT / "templates" / "index.html").read_text(encoding="utf-8")

        self.assertNotIn("wareraPlannerExport", script)
        self.assertNotIn('payload.source !== "warera-eco-simulator"', script)
        self.assertNotIn("wbt_eco_import_payload", script)
        self.assertNotIn('id="eco-export-url"', template)
        self.assertNotIn('id="import-eco-link-btn"', template)
        self.assertNotIn("Legacy Eco Simulator Import", template)
        self.assertNotIn("legacy-eco-import", stylesheet)
        self.assertIn('searchParams.get("ecoProfile")', script)
        self.assertIn("data.set('eco_profile_imported'", script)
        self.assertIn('formData.get("eco_profile_imported")', optimizer)
        self.assertIn('id="refresh-eco-profile-btn"', template)


if __name__ == "__main__":
    unittest.main()
