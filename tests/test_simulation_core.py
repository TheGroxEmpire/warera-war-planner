import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class SimulationCoreTest(unittest.TestCase):
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

    def run_script_helper_json(self, script):
        return self.run_node_json(
            """
            const fs = require("fs");
            const vm = require("vm");
            const sandbox = {
                window: {
                    WARERA_STATIC_BASE: "static",
                    WARERA_ASSET_BASE: "assets",
                    WARERA_ASSET_VERSION: "",
                },
                document: { addEventListener() {} },
            };
            vm.createContext(sandbox);
            vm.runInContext(fs.readFileSync("./static/script.js", "utf8"), sandbox, { filename: "static/script.js" });
            """
            + script
        )

    def test_recommendations_filter_and_sort_by_displayed_efficiency(self):
        result = self.run_script_helper_json(
            """
            const build = (id, damage, dailyCost, sustainable = true) => ({
                id,
                total_damage: damage,
                net_cost: dailyCost,
                campaign: {
                    sustainable,
                    warNetCost: dailyCost + 50,
                    dailyBountyIncome: 30,
                    dailyBattleLootIncome: 20,
                    warTotalCost: (dailyCost + 50) * 10,
                },
            });
            const builds = [
                build("best_efficiency", 800000, 200),
                build("dominates", 900000, 270),
                build("dominated", 850000, 280),
                build("higher_damage_less_efficient", 1100000, 440),
            ];
            const sustainable = build("sustainable", 800000, 240, true);
            const unsustainable = build("unsustainable_better_metrics", 900000, 180, false);
            const filtered = sandbox.filterDominatedBuilds(builds, "damage");
            const mixedFiltered = sandbox.filterDominatedBuilds([sustainable, unsustainable], "damage");
            const ordered = filtered
                .slice()
                .sort((a, b) => sandbox.compareCampaignRecommendationBuilds(a, b, "damage"));
            console.log(JSON.stringify({
                filtered: filtered.map((item) => item.id),
                mixedFiltered: mixedFiltered.map((item) => item.id),
                ordered: ordered.map((item) => item.id),
                efficiencies: ordered.map((item) => Number(sandbox.buildEfficiencyValue(item).toFixed(3))),
            }));
            """
        )

        self.assertNotIn("dominated", result["filtered"])
        self.assertEqual(
            result["ordered"],
            ["best_efficiency", "dominates", "higher_damage_less_efficient"],
        )
        self.assertIn("sustainable", result["mixedFiltered"])
        self.assertEqual(result["efficiencies"], [0.25, 0.3, 0.4])

    def test_campaign_fails_when_future_income_would_be_needed(self):
        result = self.run_node_json(
            """
            const harness = require("./scripts/simulation-harness");
            const result = harness.simulateCampaignForBuild(
                { net_cost: 100, total_damage: 0 },
                {
                    campaignWarDays: 1,
                    campaignInitialStockpile: 50,
                    campaignWarProfitDay: 200,
                    bountyPer1kDamage: 0,
                    battleLootPer1kDamage: 0,
                }
            );
            console.log(JSON.stringify(result));
            """
        )

        self.assertFalse(result["sustainable"])
        self.assertEqual(result["failedDay"], 1)
        self.assertEqual(result["largestShortfall"], 50)
        self.assertEqual(result["remainingBudget"], 150)
        self.assertEqual(result["dayBudgets"][0]["startingStockpile"], 50)
        self.assertEqual(result["dayBudgets"][0]["endingStockpile"], 150)
        self.assertEqual(result["dayBudgets"][0]["shortfall"], 50)

    def test_campaign_applies_bounty_and_battle_loot_per_day(self):
        result = self.run_node_json(
            """
            const harness = require("./scripts/simulation-harness");
            const result = harness.simulateCampaignForBuild(
                { net_cost: 300, total_damage: 100000 },
                {
                    campaignWarDays: 2,
                    campaignInitialStockpile: 1000,
                    campaignWarProfitDay: 100,
                    bountyPer1kDamage: 2,
                    battleLootPer1kDamage: 0.13,
                }
            );
            console.log(JSON.stringify(result));
            """
        )

        self.assertTrue(result["sustainable"])
        self.assertEqual(result["dailyBountyIncome"], 200)
        self.assertEqual(result["dailyBattleLootIncome"], 13)
        self.assertEqual(result["bountyIncome"], 400)
        self.assertEqual(result["battleLootIncome"], 26)
        self.assertEqual(result["warTotalCost"], 600)
        self.assertEqual(result["remainingBudget"], 1026)
        self.assertAlmostEqual(result["budgetUsagePct"], 36.900369, places=6)

    def test_campaign_all_builds_exposes_best_visible_sustainable_build(self):
        result = self.run_node_json(
            """
            require("./static/optimizer-core.js");
            const harness = require("./scripts/simulation-harness");
            const optimizer = globalThis.WareraOptimizer;
            const testCase = harness.loadCases("./tests/fixtures/benchmark_cases.json")
                .find((item) => item.name === "level_40_campaign");
            const options = harness.normalizeOptions(testCase);
            const response = optimizer.prepareResponse([optimizer.runSearch(options)], options);
            const key = (build) => [
                build.skill_lvls.join(","),
                build.gear_idx.join(","),
                build.ammo_idx,
                build.food_idx,
            ].join("|");
            const isVisibleSustainable = (build) => {
                const simulation = optimizer.simulateCampaignBuild(build, options);
                return simulation.sustainable && simulation.budgetUsagePct >= 50;
            };
            const byDamage = (a, b) => b.total_damage - a.total_damage || a.net_cost - b.net_cost;
            const bestFromAll = response.all_builds.filter(isVisibleSustainable).sort(byDamage)[0];
            const bestFromReturned = response.builds.filter(isVisibleSustainable).sort(byDamage)[0];
            console.log(JSON.stringify({
                allKey: key(bestFromAll),
                returnedKey: key(bestFromReturned),
                allDamage: Math.round(bestFromAll.total_damage),
                returnedDamage: Math.round(bestFromReturned.total_damage),
                allBuildCount: response.all_builds.length,
                returnedBuildCount: response.builds.length,
            }));
            """
        )

        self.assertGreater(result["allBuildCount"], result["returnedBuildCount"])
        self.assertGreaterEqual(result["allDamage"], result["returnedDamage"])
        self.assertEqual(result["allDamage"], 4470680)

    def test_campaign_search_matches_old_frontier_for_level_31_screenshot_case(self):
        result = self.run_node_json(
            """
            require("./static/optimizer-core.js");
            const optimizer = globalThis.WareraOptimizer;
            const priceOverrides = {
                gearCosts: {
                    weapon: { knife: 1.48, gun: 3.57, rifle: 13.29, sniper: 45.1, tank: 145.35, jet: 389.3 },
                    helmet: { grey: 1.4, green: 3.98, blue: 14.31, purple: 52.72, gold: 106.41, red: 355.64 },
                    gloves: { grey: 2.35, green: 3.77, blue: 13.62, purple: 53.94, gold: 149.87, red: 345.34 },
                    chest: { grey: 1.48, green: 3.86, blue: 14.59, purple: 42.7, gold: 107.45, red: 307.66 },
                    pants: { grey: 1.32, green: 3.83, blue: 13.65, purple: 41.33, gold: 109.32, red: 305.01 },
                    boots: { grey: 1.34, green: 3.74, blue: 13.83, purple: 56.99, gold: 151.59, red: 411.08 },
                },
                foodCosts: { bread: 1.768445, steak: 3.57394, cookedFish: 7.039158 },
                ammoCosts: { lightAmmo: 0.161866, ammo: 0.625454, heavyAmmo: 2.225463 },
                rewards: { scrap_price: 0.205463, case1_price: 3.260007, case2_price: 22.85899, pill_price: 34.849736 },
            };
            const campaignBudget = 358.55 * 14 + 185.73 * 14;
            const options = {
                adjustedLevel: (31 * 4 - 11) / 4,
                pill: false,
                objective: "damage",
                rankBonus: 1.23 * 2.2,
                campaignBudget,
                campaignInitialStockpile: 358.55 * 14,
                campaignWarProfitDay: 185.73,
                campaignWarDays: 14,
                bountyPer1kDamage: 0,
                battleLootPer1kDamage: 0.13,
                budgetTargets: [0.1, 0.25, 0.35, 0.5, 0.65, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 3, 5].map((ratio) => campaignBudget * ratio),
                priceOverrides,
            };
            const response = optimizer.prepareResponse([optimizer.runSearch(options)], options);
            const simulation = (build) => optimizer.simulateCampaignBuild(build, options);
            const best = response.all_builds
                .filter((build) => {
                    const campaign = simulation(build);
                    return campaign.sustainable && campaign.budgetUsagePct >= 50;
                })
                .sort((a, b) => b.total_damage - a.total_damage || a.net_cost - b.net_cost)[0];
            const constants = optimizer.constants;
            console.log(JSON.stringify({
                damage: Math.round(best.total_damage),
                dailyNetCost: Number(best.net_cost.toFixed(2)),
                budgetUsagePct: Number(simulation(best).budgetUsagePct.toFixed(1)),
                remainingBudget: Number(simulation(best).remainingBudget.toFixed(2)),
                skills: best.skill_lvls,
                gear: best.gear_idx.map((idx, i) => i === 0 ? constants.WEAPON_TIERS[idx] : constants.GEAR_TIERS[idx]),
                ammo: constants.AMMO_NAMES[best.ammo_idx],
                food: constants.FOOD_NAMES[best.food_idx],
            }));
            """
        )

        self.assertEqual(result["damage"], 1296851)
        self.assertEqual(result["gear"], ["sniper", "purple", "purple", "purple", "purple", "purple"])
        self.assertEqual(result["ammo"], "lightAmmo")
        self.assertEqual(result["food"], "cookedFish")
        self.assertEqual(result["skills"][8], 4)
        self.assertLess(result["dailyNetCost"], 690)
        self.assertTrue(90 <= result["budgetUsagePct"] <= 100)

    def test_campaign_progress_matches_loot_search_plan_without_changing_results(self):
        result = self.run_node_json(
            """
            require("./static/optimizer-core.js");
            const optimizer = globalThis.WareraOptimizer;
            const options = {
                adjustedLevel: 3,
                pill: false,
                objective: "damage",
                rankBonus: 1,
                campaignBudget: 300,
                campaignInitialStockpile: 150,
                campaignWarProfitDay: 15,
                campaignWarDays: 10,
                bountyPer1kDamage: 0,
                battleLootPer1kDamage: 0.13,
                budgetTargets: [150, 300, 450],
                priceOverrides: {
                    rewards: {
                        scrap_price: 0.2,
                        case1_price: 3,
                        case2_price: 20,
                        pill_price: 30,
                    },
                },
            };
            const progress = [];
            const plan = optimizer.getSearchPlan(options);
            const splitChecks = Math.round(plan.checks / (plan.combatCount * plan.sustainCount));
            const withProgress = optimizer.runSearch(options, (evaluated) => progress.push(evaluated));
            const withoutProgress = optimizer.runSearch(options);
            console.log(JSON.stringify({
                planChecks: plan.checks,
                splitChecks,
                withProgressTotal: withProgress.total,
                withoutProgressTotal: withoutProgress.total,
                progressCount: progress.length,
                maxProgress: Math.max(...progress),
                lastProgress: progress[progress.length - 1],
                sameBuilds: JSON.stringify(withProgress.builds) === JSON.stringify(withoutProgress.builds),
            }));
            """
        )

        self.assertEqual(result["planChecks"], result["withProgressTotal"])
        self.assertEqual(result["withProgressTotal"], result["withoutProgressTotal"])
        self.assertGreater(result["splitChecks"], 13)
        self.assertGreater(result["progressCount"], 2)
        self.assertLessEqual(result["maxProgress"], result["withProgressTotal"])
        self.assertEqual(result["lastProgress"], result["withProgressTotal"])
        self.assertTrue(result["sameBuilds"])


if __name__ == "__main__":
    unittest.main()
