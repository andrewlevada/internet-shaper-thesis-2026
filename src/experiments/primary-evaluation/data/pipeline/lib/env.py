from __future__ import annotations

import os
from pathlib import Path

_PIPELINE_DIR = Path(__file__).resolve().parents[1]


def _should_apply_env_value(key: str, value: str) -> bool:
    if not key.endswith("_PATH"):
        return True
    return Path(value).expanduser().exists()


def load_env_files() -> None:
    for path in (
        _PIPELINE_DIR / ".env",
        _PIPELINE_DIR.parents[3] / ".env",
    ):
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            trimmed = line.strip()
            if not trimmed or trimmed.startswith("#"):
                continue
            if "=" not in trimmed:
                continue
            key, _, value = trimmed.partition("=")
            key = key.strip()
            value = value.strip()
            if (value.startswith('"') and value.endswith('"')) or (
                value.startswith("'") and value.endswith("'")
            ):
                value = value[1:-1]
            if not key or key in os.environ:
                continue
            if not _should_apply_env_value(key, value):
                continue
            os.environ[key] = value
