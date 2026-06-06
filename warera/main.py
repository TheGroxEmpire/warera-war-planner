from .app import create_app
from .settings import Settings

def main():
    settings = Settings.from_env()
    app = create_app(settings)
    app.run(host="0.0.0.0", port=settings.port, debug=settings.flask_debug)

if __name__ == "__main__":
    main()
