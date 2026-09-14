from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from .config import settings
from .database import get_session, init_db
from .schemas import HealthOut, JourneyStatus, PingAccepted, PingCreate, PlaceOut, StopOut
from .seed import STOPS
from . import corridor
from .services import JOURNEY_ID, accept_ping, journey_status, route_data, simulated_position


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    route_data()
    yield


app = FastAPI(
    title="Shosholoza Trail API",
    version="1.0.0",
    description="Journey telemetry, mapped railway geometry, destinations and local vendors.",
    lifespan=lifespan,
)
app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=6)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(settings.trusted_hosts))
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Accept"],
    max_age=600,
)

@app.middleware("http")
async def security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(self)"
    if request.url.path.startswith("/api/v1/route"):
        response.headers["Cache-Control"] = "public, max-age=86400, stale-while-revalidate=604800"
        response.headers["ETag"] = '"osm-rail-2026-09-09"'
    else:
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/health", response_model=HealthOut, tags=["system"])
def health() -> HealthOut:
    return HealthOut(environment=settings.environment)


@app.get("/api/v1/route", tags=["journey"])
def get_route() -> dict:
    data = route_data()
    return {
        "type": "Feature",
        "properties": {**data["meta"], "journeyId": JOURNEY_ID},
        "geometry": {"type": "LineString", "coordinates": data["coordinates"]},
    }


@app.get("/api/v1/stops", response_model=list[StopOut], tags=["destinations"])
def get_stops() -> list[dict]:
    return STOPS


@app.get("/api/v1/stops/{stop_id}", response_model=StopOut, tags=["destinations"])
def get_stop(stop_id: str) -> dict:
    stop = next((item for item in STOPS if item["id"] == stop_id), None)
    if not stop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stop not found")
    return stop


@app.get("/api/v1/stops/{stop_id}/places", response_model=list[PlaceOut], tags=["destinations"])
def get_places(stop_id: str, place_type: str | None = Query(default=None, alias="type", pattern="^(attraction|vendor)$")) -> list[dict]:
    stop = get_stop(stop_id)
    return [place for place in stop["places"] if place_type is None or place["type"] == place_type]


@app.get("/api/v1/journeys/{journey_id}/status", response_model=JourneyStatus, tags=["telemetry"])
def get_journey_status(journey_id: str, current_km: float | None = Query(default=None, ge=0, le=corridor.TOTAL_KM), session: Session = Depends(get_session)) -> JourneyStatus:
    if journey_id != JOURNEY_ID:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Journey not found")
    return journey_status(session, journey_id, current_km)


@app.post("/api/v1/telemetry/pings", response_model=PingAccepted, status_code=status.HTTP_201_CREATED, tags=["telemetry"])
def create_ping(payload: PingCreate, session: Session = Depends(get_session)) -> PingAccepted:
    ping = accept_ping(session, payload)
    return PingAccepted(
        ping_id=ping.id or 0,
        route_km=round(ping.route_km, 2),
        distance_from_route_km=round(ping.route_distance_km, 3),
        journey_status=journey_status(session, payload.journey_id, ping.route_km),
    )


# ── SSE: live simulated position stream ──────────────────────────────────────

@app.get(
    "/api/v1/journeys/{journey_id}/stream",
    tags=["telemetry"],
    summary="Server-Sent Events stream of simulated train position (2 s interval)",
    response_class=StreamingResponse,
)
async def stream_journey(journey_id: str) -> StreamingResponse:
    if journey_id != JOURNEY_ID:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Journey not found")

    async def event_generator():
        while True:
            km = simulated_position()
            payload = json.dumps({"km": round(km, 2), "journey_id": journey_id})
            yield f"data: {payload}\n\n"
            await asyncio.sleep(2)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ── GTFS-style timetable ──────────────────────────────────────────────────────

# Modelled on the GTFS stop_times concept. The numbers are NOT typed here - they
# come from app/corridor.py, which is the one place the corridor is described.
# This endpoint used to carry its own copy (06:00 from Pretoria, 1 582 km,
# invented platform numbers), and it drifted away from the app the moment the
# app was corrected. Three separate audits caught the contradiction.

@app.get("/api/v1/timetable", tags=["destinations"], summary="GTFS-style stop timetable for journey pretoria-cape-town")
def get_timetable() -> dict:
    """The published calls, with an explicit statement that they are not live."""
    return {
        "journey_id": corridor.JOURNEY_ID,
        "total_km": corridor.TOTAL_KM,
        "duration_seconds": corridor.JOURNEY_DURATION_SECONDS,
        "is_live": False,
        "notice": corridor.SCHEDULE_NOTICE,
        "calls": corridor.CALLS,
    }
