from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def preflight(origin: str):
    return client.options(
        "/health",
        headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
    )


def test_cors_allows_localhost_on_any_port() -> None:
    for origin in ("http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:3000"):
        response = preflight(origin)
        assert response.headers.get("access-control-allow-origin") == origin


def test_cors_rejects_unknown_origin() -> None:
    response = preflight("https://example.com")

    assert "access-control-allow-origin" not in response.headers


def test_large_responses_are_gzipped_small_ones_are_not() -> None:
    large = client.get("/api/sites", headers={"Accept-Encoding": "gzip"})
    assert large.headers.get("content-encoding") == "gzip"
    assert large.json()  # the client decompresses transparently

    small = client.get("/health", headers={"Accept-Encoding": "gzip"})
    assert "content-encoding" not in small.headers


def test_gzip_keeps_cors_headers() -> None:
    response = client.get(
        "/api/sites", headers={"Accept-Encoding": "gzip", "Origin": "http://localhost:5173"}
    )
    assert response.headers.get("content-encoding") == "gzip"
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"
