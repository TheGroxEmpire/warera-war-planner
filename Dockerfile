FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=10000

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app

RUN useradd --create-home appuser
USER appuser

EXPOSE 10000

CMD ["sh", "-c", "exec gunicorn warera.app:app --bind 0.0.0.0:${PORT:-10000} --workers 1 --preload --max-requests 50 --timeout 300"]
