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
        self.assertIn("Eco Simulator Import", response.get_data(as_text=True))
        self.assertIn("War Planner Export", response.get_data(as_text=True))
        self.assertIn('target="_blank"', response.get_data(as_text=True))
        self.assertIn("reserved_skill_points", response.get_data(as_text=True))
        self.assertIn("eco_export_imported", response.get_data(as_text=True))
        self.assertNotIn("War Companies", response.get_data(as_text=True))

    def test_index_uses_configured_base_path_for_assets(self):
        app = create_app(Settings(app_base_path="/war-planner"))
        client = app.test_client()

        response = client.get("/war-planner")

        self.assertEqual(response.status_code, 200)
        text = response.get_data(as_text=True)
        self.assertIn('href="/war-planner/static/style.css?v=', text)
        self.assertIn('src="/war-planner/static/script.js?v=', text)

    def test_prefixed_static_asset_is_served(self):
        app = create_app(Settings(app_base_path="/war-planner"))
        client = app.test_client()

        response = client.get("/war-planner/static/style.css")

        self.assertEqual(response.status_code, 200)
        self.assertIn("text/css", response.content_type)
        response.close()


if __name__ == "__main__":
    unittest.main()
