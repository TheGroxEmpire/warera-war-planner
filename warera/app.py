import logging
import os
from typing import Optional

from flask import Flask, jsonify, render_template, send_from_directory

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
    settings = flask_app.config["WARERA_SETTINGS"]
    static_asset_version = _static_asset_version(flask_app)
    assets_folder = os.path.abspath(os.path.join(flask_app.root_path, "..", "assets"))

    @flask_app.context_processor
    def asset_context():
        static_base = f"{settings.app_base_path}/static" if settings.app_base_path else "/static"
        asset_base = f"{settings.app_base_path}/assets" if settings.app_base_path else "/assets"
        campaign_recommendation_config = {
            "limit": settings.campaign_recommendation_limit,
            "damageGapRatio": settings.campaign_recommendation_damage_gap_ratio,
            "costGapRatio": settings.campaign_recommendation_cost_gap_ratio,
        }
        return {
            "static_base": static_base,
            "asset_base": asset_base,
            "static_asset_version": static_asset_version,
            "campaign_recommendation_config": campaign_recommendation_config,
        }

    @flask_app.route("/")
    def index():
        return render_template("index.html")

    if settings.app_base_path:
        @flask_app.route(settings.app_base_path)
        @flask_app.route(f"{settings.app_base_path}/")
        def prefixed_index():
            return render_template("index.html")

        @flask_app.route(f"{settings.app_base_path}/static/<path:filename>")
        def prefixed_static(filename: str):
            return send_from_directory(flask_app.static_folder, filename)

        @flask_app.route(f"{settings.app_base_path}/assets/<path:filename>")
        def prefixed_assets(filename: str):
            return send_from_directory(assets_folder, filename)

    @flask_app.route("/assets/<path:filename>")
    def assets(filename: str):
        return send_from_directory(assets_folder, filename)

    @flask_app.route("/healthz")
    def healthz():
        return jsonify(status="ok")


def _static_asset_version(flask_app: Flask) -> str:
    static_folder = flask_app.static_folder
    if not static_folder:
        return "1"

    candidates = ("style.css", "optimizer-core.js", "browser-optimizer.js", "script.js")
    mtimes = []
    for filename in candidates:
        path = os.path.join(static_folder, filename)
        if os.path.exists(path):
            mtimes.append(os.path.getmtime(path))

    assets_folder = os.path.abspath(os.path.join(flask_app.root_path, "..", "assets"))
    for dirpath, _, filenames in os.walk(assets_folder):
        for filename in filenames:
            path = os.path.join(dirpath, filename)
            if os.path.exists(path):
                mtimes.append(os.path.getmtime(path))

    return str(int(max(mtimes))) if mtimes else "1"


app = create_app()
