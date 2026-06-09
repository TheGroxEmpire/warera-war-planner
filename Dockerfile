FROM python:3.11-slim AS base

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=10000

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

RUN useradd --create-home appuser

FROM base AS runtime

COPY . /app

USER appuser

EXPOSE 10000

CMD ["sh", "-c", "exec gunicorn warera.app:app --bind 0.0.0.0:${PORT:-10000} --workers 1 --preload --max-requests 50 --timeout 300"]

FROM base AS test

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

COPY . /app

USER appuser

CMD ["python", "-m", "unittest", "discover", "-s", "tests"]
