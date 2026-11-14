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
