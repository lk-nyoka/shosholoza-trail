import importlib
import os

os.environ["SHOSHOLOZA_DATABASE_URL"] = "sqlite:///./data/test-shosholoza.db"
os.environ["SHOSHOLOZA_PING_RATE_LIMIT_SECONDS"] = "0"

from fastapi.testclient import TestClient
from app.main import app


def test_health():
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.headers["x-content-type-options"] == "nosniff"


def test_route_is_connected_geojson():
    with TestClient(app) as client:
        response = client.get("/api/v1/route")
    body = response.json()
    assert response.status_code == 200
    assert body["geometry"]["type"] == "LineString"
    assert len(body["geometry"]["coordinates"]) == 7049
    assert body["properties"]["connected"] is True


def test_stop_place_filter():
    with TestClient(app) as client:
        response = client.get("/api/v1/stops/pretoria/places?type=vendor")
    assert response.status_code == 200
    assert all(place["type"] == "vendor" for place in response.json())


def test_timetable_contract_exposes_calls():
    with TestClient(app) as client:
        response = client.get("/api/v1/timetable")
    body = response.json()
    assert response.status_code == 200
    assert isinstance(body["calls"], list)
    assert body["calls"]
    assert {"stop_id", "stop_name", "km"}.issubset(body["calls"][0])


def test_ping_is_snapped_and_updates_status():
    payload = {"journey_id":"pretoria-cape-town","session_id":"test-session-123","latitude":-25.7641,"longitude":28.1948,"accuracy_metres":10,"speed_kmh":64}
    with TestClient(app) as client:
        response = client.post("/api/v1/telemetry/pings", json=payload)
    assert response.status_code == 201
    assert response.json()["accepted"] is True
    assert response.json()["journey_status"]["rolling_speed_kmh"] == 64


def test_rejects_ping_far_from_route():
    payload = {"journey_id":"pretoria-cape-town","session_id":"far-session-123","latitude":-23.0,"longitude":32.5,"accuracy_metres":10,"speed_kmh":64}
    with TestClient(app) as client:
        response = client.post("/api/v1/telemetry/pings", json=payload)
    assert response.status_code == 422


def test_rejects_unknown_journey_ping():
    payload = {"journey_id":"unknown-route","session_id":"unknown-session-123","latitude":-25.7641,"longitude":28.1948,"accuracy_metres":10,"speed_kmh":64}
    with TestClient(app) as client:
        response = client.post("/api/v1/telemetry/pings", json=payload)
    assert response.status_code == 404
