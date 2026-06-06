# WarEra War Planner

Browser app for planning WarEra eco and war durations.

The optimizer runs entirely in the browser. It uses Web Workers to split a deterministic exact search across local CPU threads and returns the highest-scoring build for the selected objective.

## Configuration

Runtime configuration is read from environment variables. Start from the sample file:

```bash
cp .env.example .env
```

Users must enter a WarEra API key in the web form when running an optimization. The key stays in browser storage and is used by the browser to refresh market prices.

Useful variables:

- `PORT`: HTTP port used by Flask/Gunicorn. Defaults to `10000`.
- `WEB_PORT`: container port used by Docker Compose. Defaults to `10000`.
- `WEB_PUBLISHED_PORT`: local host port published by Docker Compose. Defaults to `10000`.
- `FLASK_DEBUG`: local Flask debug mode. Defaults to `false`.
- `LOG_LEVEL`: server logging level. Defaults to `INFO`.

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

For Traefik at `https://warera.xorgress.com/war-planner`, run:

```bash
docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d --build
```

The Traefik override removes the direct host port binding, joins the external proxy network, routes `WARERA_HOST` plus `APP_BASE_PATH`, and strips the path prefix before requests reach Flask.

## Deployment

This repository includes the same GitHub Actions deployment pattern used by WarEra Monetary Watch. Pushes to `master` or `main` run CI, then the deploy workflow SSHes into the server, pulls the pushed branch, and runs `scripts/deploy.sh`.

Configure these repository secrets:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `DEPLOY_PORT`
- `DEPLOY_PATH` set to `/home/opc/docker/warera-war-planner`
- `DEPLOY_ENABLE_TRAEFIK` set to `1`

Configure this repository variable so the deployment appears with the correct link on the GitHub Deployments page:

- `DEPLOY_URL` set to `https://warera.xorgress.com/war-planner/`

Manual server deploy:

```bash
ENABLE_TRAEFIK=1 bash scripts/deploy.sh
```

## Verification

```bash
python -m unittest discover -s tests
python -m compileall warera tests
```
