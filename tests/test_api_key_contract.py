import json
import subprocess
import unittest
from pathlib import Path

from warera.app import create_app
from warera.settings import Settings


ROOT = Path(__file__).resolve().parents[1]


class SharedApiKeyContractTest(unittest.TestCase):
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

    def test_storage_contract_migrates_and_resolves_safely(self):
        result = self.run_node_json(
            r"""
            const apiKey = require("./static/api-key.js");

            class MemoryStorage {
                constructor(values = {}) { this.values = new Map(Object.entries(values)); }
                getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
                setItem(key, value) { this.values.set(key, String(value)); }
                removeItem(key) { this.values.delete(key); }
                snapshot() { return Object.fromEntries(this.values); }
            }

            const canonical = new MemoryStorage({
                [apiKey.STORAGE_KEY]: "canonical-key",
                [apiKey.LEGACY_STORAGE_KEYS[0]]: "old-eco-key",
                [apiKey.LEGACY_STORAGE_KEYS[1]]: "old-planner-key",
            });
            const canonicalResult = apiKey.load(canonical);

            const ecoLegacy = new MemoryStorage({
                [apiKey.LEGACY_STORAGE_KEYS[0]]: "shared-key",
            });
            const ecoLegacyResult = apiKey.load(ecoLegacy);

            const plannerLegacy = new MemoryStorage({
                [apiKey.LEGACY_STORAGE_KEYS[1]]: "shared-key",
            });
            const plannerLegacyResult = apiKey.load(plannerLegacy);

            const conflict = new MemoryStorage({
                [apiKey.LEGACY_STORAGE_KEYS[0]]: "eco-key",
                [apiKey.LEGACY_STORAGE_KEYS[1]]: "planner-key",
            });
            const conflictBefore = conflict.snapshot();
            const conflictResult = apiKey.load(conflict);

            const cleared = new MemoryStorage();
            apiKey.save(cleared, "one-key-for-both");
            const savedSnapshot = cleared.snapshot();
            const clearResult = apiKey.clear(cleared);

            const partialClear = new MemoryStorage(Object.fromEntries(
                apiKey.STORAGE_KEYS.map((key) => [key, "stale-key"])
            ));
            const removeItem = partialClear.removeItem.bind(partialClear);
            partialClear.removeItem = (key) => {
                if (key === apiKey.LEGACY_STORAGE_KEYS[0]) throw new Error("blocked");
                removeItem(key);
            };
            const partialClearResult = apiKey.clear(partialClear);

            const unavailableLoad = apiKey.load({
                getItem() { throw new Error("blocked"); },
            });
            const unavailableSave = apiKey.save({
                setItem() { throw new Error("blocked"); },
            }, "tab-only-key");

            console.log(JSON.stringify({
                storageKey: apiKey.STORAGE_KEY,
                legacyKeys: apiKey.LEGACY_STORAGE_KEYS,
                canonicalResult,
                canonicalSnapshot: canonical.snapshot(),
                ecoLegacyResult,
                ecoLegacySnapshot: ecoLegacy.snapshot(),
                plannerLegacyResult,
                plannerLegacySnapshot: plannerLegacy.snapshot(),
                conflictBefore,
                conflictResult,
                conflictAfter: conflict.snapshot(),
                savedSnapshot,
                clearResult,
                clearedSnapshot: cleared.snapshot(),
                partialClearResult: {
                    status: partialClearResult.status,
                    persisted: partialClearResult.persisted,
                },
                partialClearSnapshot: partialClear.snapshot(),
                unavailableLoad,
                unavailableSave: {
                    status: unavailableSave.status,
                    value: unavailableSave.value,
                    persisted: unavailableSave.persisted,
                },
                handlesCanonical: apiKey.handlesStorageKey(apiKey.STORAGE_KEY),
                handlesLegacy: apiKey.handlesStorageKey(apiKey.LEGACY_STORAGE_KEYS[0]),
                handlesClear: apiKey.handlesStorageKey(null),
            }));
            """
        )

        self.assertEqual(result["storageKey"], "warera-toolkit-api-key-v1")
        self.assertEqual(
            result["legacyKeys"],
            ["warera-eco-simulator-warera-api-token-v1", "wbt_warera_api_key"],
        )
        self.assertEqual(result["canonicalResult"]["value"], "canonical-key")
        self.assertTrue(all(value == "canonical-key" for value in result["canonicalSnapshot"].values()))

        for prefix in ("ecoLegacy", "plannerLegacy"):
            self.assertEqual(result[f"{prefix}Result"]["status"], "saved")
            self.assertTrue(result[f"{prefix}Result"]["migrated"])
            snapshot = result[f"{prefix}Snapshot"]
            self.assertEqual(snapshot[result["storageKey"]], "shared-key")
            self.assertTrue(all(snapshot[key] == "shared-key" for key in result["legacyKeys"]))

        self.assertEqual(result["conflictResult"]["status"], "conflict")
        self.assertEqual(result["conflictBefore"], result["conflictAfter"])
        self.assertNotIn(result["storageKey"], result["conflictAfter"])

        self.assertEqual(result["savedSnapshot"][result["storageKey"]], "one-key-for-both")
        self.assertEqual(result["clearResult"]["status"], "missing")
        self.assertEqual(result["clearedSnapshot"], {})
        self.assertEqual(result["partialClearResult"]["status"], "unavailable")
        self.assertIn(result["legacyKeys"][0], result["partialClearSnapshot"])
        self.assertEqual(result["unavailableLoad"]["status"], "unavailable")
        self.assertEqual(result["unavailableSave"]["status"], "unavailable")
        self.assertEqual(result["unavailableSave"]["value"], "tab-only-key")
        self.assertTrue(result["handlesCanonical"])
        self.assertTrue(result["handlesLegacy"])
        self.assertTrue(result["handlesClear"])

    def test_page_renders_required_shared_connection_card(self):
        app = create_app(Settings(app_base_path="/war-planner"))
        response = app.test_client().get("/war-planner")
        text = response.get_data(as_text=True)

        self.assertEqual(response.status_code, 200)
        self.assertIn('id="warera-api-key-card"', text)
        self.assertIn('id="warera_api_key"', text)
        self.assertIn('id="warera-api-key-save"', text)
        self.assertIn('id="warera-api-key-clear"', text)
        self.assertIn('src="/war-planner/static/api-key.js?v=', text)
        self.assertIn("One API key for War Planner and Economy Simulator.", text)
        self.assertIn("never included in shared profiles or links", text)

        asset_response = app.test_client().get("/war-planner/static/api-key.js")
        self.assertEqual(asset_response.status_code, 200)
        self.assertIn("javascript", asset_response.content_type)
        asset_response.close()
        response.close()


if __name__ == "__main__":
    unittest.main()
