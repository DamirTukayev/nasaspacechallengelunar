import hashlib
import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


class JsonDiskCache:
    """Stores JSON-serializable values on disk under a hash of their key.

    Best effort: a value that cannot be read or written is treated as a cache miss,
    never as an error of the request that wanted it.
    """

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
        except (OSError, json.JSONDecodeError):
            # Missing, or on Windows briefly locked while another request replaces it.
            return None

    def set(self, key: str, value: Any) -> None:
        # Write to a temp file first so a crash never leaves a half-written entry.
        tmp: str | None = None
        try:
            self.directory.mkdir(parents=True, exist_ok=True)
            fd, tmp = tempfile.mkstemp(dir=self.directory, suffix=".tmp")
            with os.fdopen(fd, "w") as f:
                json.dump(value, f, separators=(",", ":"))
            # On Windows this fails while another request writes or reads the same key
            # (two requests computing the same skyline at once). Their values are equal,
            # so losing this write costs nothing.
            os.replace(tmp, self._path(key))
            tmp = None
        except OSError as exc:
            log.warning("Could not write cache entry %s: %s", key[:12], exc)
        finally:
            if tmp is not None:
                try:
                    Path(tmp).unlink(missing_ok=True)
                except OSError as exc:
                    log.warning("Could not remove temporary cache file: %s", exc)
