from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

from fastapi import HTTPException, status
from sqlmodel import Session, col, select

from .config import settings
from .models import Disruption, PassengerPing
from .schemas import DisruptionOut, JourneyStatus, PingCreate

from . import corridor

# Both of these used to be typed here as well. They are imported now so that the
# API, the app and the database cannot disagree about how long the line is.
TOTAL_KM = corridor.TOTAL_KM
JOURNEY_ID = corridor.JOURNEY_ID
GEOMETRY_FILE = Path(__file__).parent / "data" / "route-geometry.json"


@lru_cache(maxsize=1)
def route_data() -> dict:
    with GEOMETRY_FILE.open(encoding="utf-8") as source:
        return json.load(source)


@lru_cache(maxsize=1)
def route_distances() -> tuple[tuple[float, ...], float]:
    coordinates = route_data()["coordinates"]
    cumulative = [0.0]
    for previous, current in zip(coordinates, coordinates[1:]):
        cumulative.append(
            cumulative[-1]
            + _haversine(previous[1], previous[0], current[1], current[0])
        )
    return tuple(cumulative), cumulative[-1]


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat, dlon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    h = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 6371.0088 * 2 * math.asin(math.sqrt(h))


def nearest_route_position(latitude: float, longitude: float) -> tuple[float, float]:
    coordinates = route_data()["coordinates"]
    index, coordinate = min(
        enumerate(coordinates),
        key=lambda item: _haversine(latitude, longitude, item[1][1], item[1][0]),
    )
    distance = _haversine(latitude, longitude, coordinate[1], coordinate[0])
    cumulative, mapped_total = route_distances()
    return (cumulative[index] / max(mapped_total, 1)) * TOTAL_KM, distance


def active_disruption(session: Session, journey_id: str, current_km: float) -> Disruption | None:
    statement = select(Disruption).where(
        Disruption.journey_id == journey_id,
        Disruption.active == True,  # noqa: E712 - SQL expression
        Disruption.start_km <= current_km,
        Disruption.end_km >= current_km,
    ).order_by(col(Disruption.created_at).desc())
    return session.exec(statement).first()


def journey_status(session: Session, journey_id: str = JOURNEY_ID, current_km: float | None = None) -> JourneyStatus:
    since = datetime.now(timezone.utc) - timedelta(minutes=30)
    pings = list(session.exec(select(PassengerPing).where(PassengerPing.journey_id == journey_id, PassengerPing.created_at >= since).order_by(col(PassengerPing.created_at).desc())).all())
    if current_km is None:
        current_km = pings[0].route_km if pings else 0.0
    speed_samples = sorted(p.speed_kmh for p in pings if p.speed_kmh is not None and p.speed_kmh > 2)
    rolling_speed = None
    if speed_samples:
        trim = 1 if len(speed_samples) >= 7 else 0
        usable = speed_samples[trim:len(speed_samples)-trim] if trim else speed_samples
        rolling_speed = round(sum(usable) / len(usable), 1)
    disruption = active_disruption(session, journey_id, current_km)
    effective_speed = rolling_speed or 72.0
    eta = 0 if current_km >= TOTAL_KM else round(((TOTAL_KM - current_km) / effective_speed) * 60)
    count = len(pings)
    confidence = "high" if count >= 10 else "medium" if count >= 4 else "low" if count else "none"
    state = "arrived" if current_km >= TOTAL_KM else "disrupted" if disruption else "moving" if rolling_speed else "scheduled"
    return JourneyStatus(
        journey_id=journey_id, state=state, current_km=round(current_km, 2), total_km=TOTAL_KM,
        rolling_speed_kmh=rolling_speed, eta_minutes=eta, confidence=confidence,
        recent_ping_count=count, last_ping_at=pings[0].created_at if pings else None,
        data_mode="passenger_pings" if pings else "demo_baseline",
        disruption=DisruptionOut.model_validate(disruption, from_attributes=True) if disruption else None,
    )


def accept_ping(session: Session, payload: PingCreate) -> PassengerPing:
    if payload.journey_id != JOURNEY_ID:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Journey not found")
    if payload.accuracy_metres > settings.max_ping_accuracy_metres:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Location accuracy is too low for a route ping")
    session_hash = hashlib.sha256(payload.session_id.encode()).hexdigest()[:32]
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=settings.ping_rate_limit_seconds)
    recent = session.exec(select(PassengerPing).where(PassengerPing.session_hash == session_hash, PassengerPing.created_at >= cutoff)).first()
    if recent:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Please wait before sending another ping", headers={"Retry-After": str(settings.ping_rate_limit_seconds)})
    route_km, distance = nearest_route_position(payload.latitude, payload.longitude)
    if distance > settings.max_route_distance_km:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Location is too far from the mapped rail corridor")
    ping = PassengerPing(journey_id=payload.journey_id, session_hash=session_hash, latitude=payload.latitude, longitude=payload.longitude, accuracy_metres=payload.accuracy_metres, speed_kmh=payload.speed_kmh, route_km=route_km, route_distance_km=distance)
    session.add(ping); session.commit(); session.refresh(ping)
    return ping


# ── Simulated live position ───────────────────────────────────────────────────
# Advances from a fixed epoch so every client sees the same position, and resets
# once per scheduled journey to imitate a daily service.
#
# This is a SIMULATION. It is wall-clock arithmetic over the published duration,
# not a train. Any endpoint serving it must say so.

import time as _time

_JOURNEY_DURATION_SECONDS = corridor.JOURNEY_DURATION_SECONDS  # 28 h 10 m
_SPEED_KM_PER_SECOND = TOTAL_KM / _JOURNEY_DURATION_SECONDS  # ≈ 0.02 km/s


def simulated_position() -> float:
    """Return the current simulated route km based on wall-clock time."""
    elapsed = _time.time() % _JOURNEY_DURATION_SECONDS
    return min(TOTAL_KM, elapsed * _SPEED_KM_PER_SECOND)
