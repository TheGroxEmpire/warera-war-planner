import os
from dataclasses import dataclass
from typing import Mapping, Optional


TRUTHY_VALUES = {"1", "true", "yes", "y", "on"}
FALSY_VALUES = {"0", "false", "no", "n", "off"}


def _env(environ: Optional[Mapping[str, str]]) -> Mapping[str, str]:
    return os.environ if environ is None else environ


def env_bool(name: str, default: bool = False, environ: Optional[Mapping[str, str]] = None) -> bool:
    value = _env(environ).get(name)
    if value is None:
        return default

    normalized = value.strip().lower()
    if normalized in TRUTHY_VALUES:
        return True
    if normalized in FALSY_VALUES:
        return False

    return default


def env_int(
    name: str,
    default: int,
    *,
    min_value: Optional[int] = None,
    max_value: Optional[int] = None,
    environ: Optional[Mapping[str, str]] = None,
) -> int:
    value = _env(environ).get(name)
    if value is None:
        parsed = default
    else:
        try:
            parsed = int(value)
        except ValueError:
            parsed = default

    if min_value is not None:
        parsed = max(min_value, parsed)
    if max_value is not None:
        parsed = min(max_value, parsed)
    return parsed


@dataclass(frozen=True)
class Settings:
    flask_debug: bool = False
    log_level: str = "INFO"
    port: int = 10000

    @classmethod
    def from_env(cls, environ: Optional[Mapping[str, str]] = None) -> "Settings":
        source = _env(environ)
        log_level = source.get("LOG_LEVEL", cls.log_level).upper()

        return cls(
            flask_debug=env_bool("FLASK_DEBUG", cls.flask_debug, environ=source),
            log_level=log_level,
            port=env_int("PORT", cls.port, min_value=1, max_value=65535, environ=source),
        )
