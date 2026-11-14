import hashlib
import json
import os
import tempfile
from pathlib import Path
from typing import Any


class JsonDiskCache:
    """Stores JSON-serializable values on disk under a hash of their key."""

    def __init__(self, directory: Path) -> None:
        self.directory = directory

    @staticmethod
    def make_key(parts: dict[str, Any]) -> str:
        raw = json.dumps(parts, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(raw.encode()).hexdigest()

    def _path(self, key: str) -> Path:
        return self.directory / f"{key}.json"

    def get(self, key: str) -> Any | None:
        try:
            return json.loads(self._path(key).read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            return None

    def set(self, key: str, value: Any) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        # Write to a temp file first so a crash never leaves a half-written entry.
        fd, tmp = tempfile.mkstemp(dir=self.directory, suffix=".tmp")
        with os.fdopen(fd, "w") as f:
            json.dump(value, f, separators=(",", ":"))
        os.replace(tmp, self._path(key))
