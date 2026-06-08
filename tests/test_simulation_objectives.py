import difflib
import json
import os
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CASES_PATH = ROOT / "tests" / "fixtures" / "simulation_cases.json"
OBJECTIVES_PATH = ROOT / "tests" / "fixtures" / "simulation_objectives.json"
UPDATE_ENV = "UPDATE_SIMULATION_OBJECTIVES"


class SimulationObjectivesTest(unittest.TestCase):
    def load_actual_objectives(self):
        completed = subprocess.run(
            [
                "node",
                "scripts/simulation-objectives.js",
                "--cases",
                str(CASES_PATH.relative_to(ROOT)),
            ],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        if completed.returncode != 0:
            self.fail(completed.stderr or completed.stdout)
        return json.loads(completed.stdout)

    def test_simulation_objectives_match_snapshots(self):
        actual = self.load_actual_objectives()
        actual_text = f"{json.dumps(actual, indent=2)}\n"

        if os.environ.get(UPDATE_ENV):
            OBJECTIVES_PATH.write_text(actual_text, encoding="utf-8")
            return

        if not OBJECTIVES_PATH.exists():
            self.fail(
                f"{OBJECTIVES_PATH.relative_to(ROOT)} is missing. "
                f"Run `{UPDATE_ENV}=1 python -m unittest tests.test_simulation_objectives` to create it."
            )

        expected_text = OBJECTIVES_PATH.read_text(encoding="utf-8")
        if expected_text != actual_text:
            diff = "".join(difflib.unified_diff(
                expected_text.splitlines(keepends=True),
                actual_text.splitlines(keepends=True),
                fromfile=str(OBJECTIVES_PATH.relative_to(ROOT)),
                tofile="actual simulation objectives",
            ))
            self.fail(
                "Simulation objectives are stale. "
                f"Run `{UPDATE_ENV}=1 python -m unittest tests.test_simulation_objectives` to update them.\n"
                f"{diff[:12000]}"
            )


if __name__ == "__main__":
    unittest.main()
