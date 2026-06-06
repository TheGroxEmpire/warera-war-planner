#!/bin/bash
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

export FLASK_APP="${FLASK_APP:-warera.app:app}"
export FLASK_DEBUG="${FLASK_DEBUG:-1}"
export PORT="${PORT:-5000}"
flask run --host 0.0.0.0 --port "$PORT"
