# WarEra War Planner

Browser app for planning WarEra eco and war durations.

The optimizer runs entirely in the browser. It uses Web Workers to split a deterministic exact search across local CPU threads and returns budget-tier build candidates for the selected objective.

Skills, gear, ammo, and food can be pinned before a run so the optimizer only changes slots left on **Any**. A result card can also be copied back with **Pin Full Build**. Current pins and named skill/gear sets are stored locally in the browser.

## WarEra Profile Import

**Import Profile** searches WarEra's public player profiles and always imports the selected player's level and military-rank damage bonus. The preview also lets the user independently replace combat skill pins and recognized equipped gear/ammo pins with the player's current values. Unchecked or unavailable pin groups stay unchanged, and the existing food pin is preserved because WarEra does not expose current food in its equipped-loadout response.

Profile requests go directly from the browser to `api2.warera.io`, and raw API responses are never stored. For the **Recent** shortcut, the browser keeps only the last player's ID, username, avatar URL, and level in local storage; clearing this site's browser data removes it. The shared API key remains in the browser and is sent only to WarEra.

## Economy Profile Integration

The Eco Simulator's **Use in War Planner** action saves its active scenario as a credential-free `EcoProfileV1` profile and opens the planner with `?ecoProfile=latest`. Both tools are served from the same origin, so the handoff stays in browser storage and never includes the WarEra API key.

War Planner recalculates the imported profile with the Eco Simulator's shared browser engine. War mode supports minimum required eco skills, the imported skill allocation, or custom eco skills, along with explicit company selection and optional workers. The resulting daily profit and eco skill-point reserve feed the existing campaign and combat optimizer.

## Configuration

Runtime configuration is read from environment variables. Start from the sample file:

```bash
cp .env.example .env
```

Users must enter a WarEra API key when running an optimization. War Planner and Economy Simulator share one logical key through the same-origin browser-storage key `warera-toolkit-api-key-v1`, so saving or clearing it in either tool updates the other (including already-open tabs). Existing keys from both tools are migrated automatically; a mismatch is surfaced for the user to resolve instead of silently choosing a credential.

The key is device- and browser-profile-specific. It is sent only to WarEra as `X-API-Key` and is never placed in URLs, shared configurations, or `EcoProfileV1` data. Production sharing works because both tools use paths on the same `https://warera.xorgress.com` origin; separate localhost ports do not share browser storage.

Useful variables:

- `PORT`: HTTP port used by Flask/Gunicorn. Defaults to `10000`.
- `WEB_PORT`: container port used by Docker Compose. Defaults to `10000`.
- `WEB_PUBLISHED_PORT`: local host port published by Docker Compose. Defaults to `10000`.
- `FLASK_DEBUG`: local Flask debug mode. Defaults to `false`.
- `LOG_LEVEL`: server logging level. Defaults to `INFO`.
- `CAMPAIGN_RECOMMENDATION_LIMIT`: maximum campaign recommendation cards. Defaults to `19`.
- `CAMPAIGN_RECOMMENDATION_DAMAGE_GAP_RATIO`: minimum damage difference from selected campaign cards. Defaults to `0.05`.
- `CAMPAIGN_RECOMMENDATION_COST_GAP_RATIO`: minimum displayed $/K efficiency difference from selected campaign cards. Defaults to `0.05`.

## Run Locally

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
./run_local.sh
```

The app exposes a basic health endpoint at `/healthz`.

## Docker

```bash
docker compose up --build
```

The Docker image serves the browser app.

For Traefik at `https://warera.yourdomain.com/war-planner`, run:

```bash
docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d --build
```

The Traefik override removes the direct host port binding, joins the external proxy network, routes `WARERA_HOST` plus `APP_BASE_PATH`, and strips the path prefix before requests reach Flask.

## Deployment

Pushes to `master` or `main` run CI, then the deploy workflow SSHes into the server, pulls the pushed branch, and runs `scripts/deploy.sh`.

Configure these repository secrets:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `DEPLOY_PORT`
- `DEPLOY_PATH` set to `/home/opc/docker/warera-war-planner`
- `DEPLOY_ENABLE_TRAEFIK` set to `1`

Configure this repository variable so the deployment appears with the correct link on the GitHub Deployments page:

- `DEPLOY_URL` set to `https://warera.yourdomain.com/war-planner/`

Manual server deploy:

```bash
ENABLE_TRAEFIK=1 bash scripts/deploy.sh
```

## Verification

```bash
python -m unittest discover -s tests
python -m compileall warera tests
```

Simulation objective snapshots are stored in `tests/fixtures/simulation_objectives.json`.
Normal test runs fail if the deterministic optimizer output changes. To accept a new
objective value after reviewing the diff, run:

```bash
UPDATE_SIMULATION_OBJECTIVES=1 python -m unittest tests.test_simulation_objectives
```

Profile simulation speed with:

```bash
node scripts/benchmark-simulation.js --iterations 3
```

Benchmark cases live in `tests/fixtures/benchmark_cases.json`.
