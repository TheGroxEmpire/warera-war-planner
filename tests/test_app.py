import unittest

from warera.app import create_app
from warera.settings import Settings


class AppFactoryTest(unittest.TestCase):
    def setUp(self):
        self.app = create_app(Settings())
        self.client = self.app.test_client()

    def test_healthz_reports_ok(self):
        response = self.client.get("/healthz")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "ok"})

    def test_index_renders_app_shell(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertIn("Warera War Planner", response.get_data(as_text=True))
        self.assertIn("Economy Profile", response.get_data(as_text=True))
        self.assertIn("War Mode Economy", response.get_data(as_text=True))
        self.assertIn("Minimum SP", response.get_data(as_text=True))
        self.assertIn('id="war-company-count"', response.get_data(as_text=True))
        self.assertIn('id="war-company-list"', response.get_data(as_text=True))
        self.assertNotIn("Legacy Eco Simulator Import", response.get_data(as_text=True))
        self.assertNotIn("War Planner Export", response.get_data(as_text=True))
        self.assertIn('target="_blank"', response.get_data(as_text=True))
        self.assertIn("reserved_skill_points", response.get_data(as_text=True))
        self.assertNotIn("eco_export_imported", response.get_data(as_text=True))
        self.assertIn("stockpiled_money", response.get_data(as_text=True))
        self.assertIn("Added to the eco stockpile before the first simulated war day.", response.get_data(as_text=True))
        self.assertIn("bounty_per_1k_damage", response.get_data(as_text=True))
        self.assertIn("Battle Loot", response.get_data(as_text=True))
        self.assertIn("earning_cases_enabled", response.get_data(as_text=True))
        self.assertIn("earning_scrap_enabled", response.get_data(as_text=True))
        self.assertIn("earning_companies_enabled", response.get_data(as_text=True))
        self.assertIn("Pin Skills", response.get_data(as_text=True))
        self.assertIn("Pin Gear &amp; Consumables", response.get_data(as_text=True))
        self.assertIn('id="import-profile-btn"', response.get_data(as_text=True))
        self.assertIn('id="profile-import-dialog"', response.get_data(as_text=True))
        self.assertIn('id="profile-import-pin-skills"', response.get_data(as_text=True))
        self.assertIn('id="profile-import-pin-loadout"', response.get_data(as_text=True))
        self.assertIn('aria-describedby="profile-import-apply-status"', response.get_data(as_text=True))
        self.assertIn('aria-describedby="profile-import-loadout-status"', response.get_data(as_text=True))
        self.assertIn('id="profile-import-loadout-status" class="profile-import-status profile-import-error" role="status" aria-live="polite"', response.get_data(as_text=True))
        self.assertIn("Level and rank bonus are always imported.", response.get_data(as_text=True))
        self.assertIn('name="pinned_skills"', response.get_data(as_text=True))
        self.assertIn('name="pinned_gear"', response.get_data(as_text=True))
        self.assertIn('name="pinned_ammo"', response.get_data(as_text=True))
        self.assertIn('name="pinned_food"', response.get_data(as_text=True))
        self.assertIn('name="objective" value="damage"', response.get_data(as_text=True))
        self.assertNotIn("Optimize Cases", response.get_data(as_text=True))
        self.assertNotIn("War Companies", response.get_data(as_text=True))

    def test_index_uses_configured_base_path_for_assets(self):
        app = create_app(Settings(app_base_path="/war-planner"))
        client = app.test_client()

        response = client.get("/war-planner")

        self.assertEqual(response.status_code, 200)
        text = response.get_data(as_text=True)
        self.assertIn('href="/war-planner/static/style.css?v=', text)
        self.assertIn('src="/war-planner/static/eco-engine.js?v=', text)
        self.assertIn('src="/war-planner/static/profile-import.js?v=', text)
        self.assertIn('src="/war-planner/static/script.js?v=', text)
        self.assertIn('window.WARERA_ASSET_BASE = "/war-planner/assets"', text)

    def test_index_injects_campaign_recommendation_config(self):
        app = create_app(
            Settings(
                campaign_recommendation_limit=12,
                campaign_recommendation_damage_gap_ratio=0.08,
                campaign_recommendation_cost_gap_ratio=0.12,
            )
        )
        client = app.test_client()

        response = client.get("/")

        self.assertEqual(response.status_code, 200)
        text = response.get_data(as_text=True)
        self.assertIn('"limit": 12', text)
        self.assertIn('"damageGapRatio": 0.08', text)
        self.assertIn('"costGapRatio": 0.12', text)

    def test_optimizer_loading_tip_is_included_in_script_asset(self):
        app = create_app(Settings())
        client = app.test_client()

        response = client.get("/static/script.js")

        self.assertEqual(response.status_code, 200)
        self.assertIn("Warera War Planner runs faster on a more powerful CPU", response.get_data(as_text=True))

    def test_prefixed_static_asset_is_served(self):
        app = create_app(Settings(app_base_path="/war-planner"))
        client = app.test_client()

        response = client.get("/war-planner/static/style.css")

        self.assertEqual(response.status_code, 200)
        self.assertIn("text/css", response.content_type)
        response.close()

        response = client.get("/war-planner/static/eco-engine.js")

        self.assertEqual(response.status_code, 200)
        self.assertIn("javascript", response.content_type)
        response.close()

        response = client.get("/war-planner/static/profile-import.js")

        self.assertEqual(response.status_code, 200)
        self.assertIn("javascript", response.content_type)
        response.close()

    def test_prefixed_asset_is_served(self):
        app = create_app(Settings(app_base_path="/war-planner"))
        client = app.test_client()

        response = client.get("/war-planner/assets/market_item_icons/knife.png")

        self.assertEqual(response.status_code, 200)
        self.assertIn("image/png", response.content_type)
        response.close()


if __name__ == "__main__":
    unittest.main()
