import unittest

from warera.settings import Settings, env_bool, env_int


class SettingsTest(unittest.TestCase):
    def test_env_parsers_use_safe_defaults_for_invalid_values(self):
        environ = {
            "FLAG": "not-bool",
            "COUNT": "not-int",
        }

        self.assertTrue(env_bool("FLAG", True, environ=environ))
        self.assertEqual(env_int("COUNT", 3, environ=environ), 3)

    def test_settings_parse_runtime_values(self):
        settings = Settings.from_env(
            {
                "PORT": "8080",
                "LOG_LEVEL": "debug",
            }
        )

        self.assertEqual(settings.port, 8080)
        self.assertEqual(settings.log_level, "DEBUG")

    def test_default_port(self):
        settings = Settings.from_env({})

        self.assertEqual(settings.port, 10000)


if __name__ == "__main__":
    unittest.main()
