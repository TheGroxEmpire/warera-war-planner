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


if __name__ == "__main__":
    unittest.main()
