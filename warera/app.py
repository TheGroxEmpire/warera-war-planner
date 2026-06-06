import logging
from typing import Optional

from flask import Flask, jsonify, render_template

from .settings import Settings


def create_app(settings: Optional[Settings] = None) -> Flask:
    settings = settings or Settings.from_env()

    flask_app = Flask(__name__, template_folder="../templates", static_folder="../static")
    flask_app.config["WARERA_SETTINGS"] = settings
    _configure_logging(flask_app, settings)
    _register_routes(flask_app)
    return flask_app


def _configure_logging(flask_app: Flask, settings: Settings) -> None:
    gunicorn_logger = logging.getLogger("gunicorn.error")
    if gunicorn_logger.handlers:
        flask_app.logger.handlers = gunicorn_logger.handlers

    level = getattr(logging, settings.log_level, logging.INFO)
    flask_app.logger.setLevel(level)


def _register_routes(flask_app: Flask) -> None:
    @flask_app.route("/")
    def index():
        return render_template("index.html")

    @flask_app.route("/healthz")
    def healthz():
        return jsonify(status="ok")


app = create_app()
