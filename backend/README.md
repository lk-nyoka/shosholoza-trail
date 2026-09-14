# Shosholoza Trail API

FastAPI backend for connected OSM rail geometry, destination/vendor content, crowdsourced passenger telemetry, rolling speed/ETA calculation and active disruption guidance.

## Local setup

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8001
```

API documentation: `http://127.0.0.1:8001/docs`

## Test

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

The SQLite database runs in WAL mode. Configure production origins, trusted hosts and database URL through the variables documented in `.env.example`. PostgreSQL can replace SQLite through `SHOSHOLOZA_DATABASE_URL` without changing endpoint code.

Passenger session identifiers are SHA-256 hashed before storage. Pings with poor accuracy, implausible speed, or excessive distance from the mapped rail corridor are rejected. Route output is cached and compressed.

## Container deployment

```powershell
docker build -t shosholoza-trail-api .
docker run --rm -p 8000:8000 -e SHOSHOLOZA_TRUSTED_HOSTS=api.example.com -e SHOSHOLOZA_CORS_ORIGINS=https://example.com -v shosholoza-data:/data shosholoza-trail-api
```

For multiple API replicas, set `SHOSHOLOZA_DATABASE_URL` to a managed PostgreSQL database instead of the default SQLite volume. Keep the static frontend on Cloudflare and set `VITE_API_BASE_URL` to the public API URL when building it.
