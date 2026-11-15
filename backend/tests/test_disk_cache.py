import os
from concurrent.futures import ThreadPoolExecutor

from app.services import disk_cache
from app.services.disk_cache import JsonDiskCache


def test_round_trip(tmp_path) -> None:
    cache = JsonDiskCache(tmp_path / "sub")
    key = JsonDiskCache.make_key({"a": 1})

    assert cache.get(key) is None
    cache.set(key, {"x": [1, 2]})
    assert cache.get(key) == {"x": [1, 2]}


def test_failed_replace_is_a_miss_not_an_error(tmp_path, monkeypatch) -> None:
    # What Windows does when another request holds the same entry: PermissionError.
    def locked(src, dst):
        raise PermissionError(5, "Access is denied")

    monkeypatch.setattr(disk_cache.os, "replace", locked)
    cache = JsonDiskCache(tmp_path)

    cache.set("k", {"x": 1})  # must not raise

    assert cache.get("k") is None
    assert list(tmp_path.iterdir()) == []  # no stray temp files


def test_unreadable_entry_is_a_miss(tmp_path, monkeypatch) -> None:
    cache = JsonDiskCache(tmp_path)
    cache.set("k", {"x": 1})

    def locked(*args, **kwargs):
        raise PermissionError(13, "Permission denied")

    monkeypatch.setattr(disk_cache.Path, "read_text", locked)
    assert cache.get("k") is None


def test_parallel_writes_of_the_same_key(tmp_path) -> None:
    cache = JsonDiskCache(tmp_path)
    value = {"elevations": list(range(720))}

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda _: cache.set("same", value), range(64)))

    assert cache.get("same") == value
    assert [p.suffix for p in tmp_path.iterdir()] == [".json"]
    assert os.listdir(tmp_path) == ["same.json"]


def test_failed_cleanup_does_not_fail_the_request(tmp_path, monkeypatch) -> None:
    def denied(*args, **kwargs):
        raise PermissionError("Filesystem denied operation")

    monkeypatch.setattr(disk_cache.os, "replace", denied)
    monkeypatch.setattr(disk_cache.Path, "unlink", denied)
    cache = JsonDiskCache(tmp_path)
    cache.set("k", {"x": 1})
    assert cache.get("k") is None
