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
        self.assertIn("Warera Build Tool", response.get_data(as_text=True))
        self.assertIn("Eco Simulator Import", response.get_data(as_text=True))
        self.assertIn("reserved_skill_points", response.get_data(as_text=True))


if __name__ == "__main__":
    unittest.main()
