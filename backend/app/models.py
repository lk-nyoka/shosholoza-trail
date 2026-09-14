from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Index
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PassengerPing(SQLModel, table=True):
    __tablename__ = "passenger_pings"
    id: int | None = Field(default=None, primary_key=True)
    journey_id: str = Field(index=True, max_length=64)
    session_hash: str = Field(index=True, max_length=32)
    latitude: float
    longitude: float
    accuracy_metres: float
    speed_kmh: float | None = None
    route_km: float
    route_distance_km: float
    created_at: datetime = Field(default_factory=utc_now, index=True)

    __table_args__ = (Index("ix_ping_journey_created", "journey_id", "created_at"),)


class Disruption(SQLModel, table=True):
    __tablename__ = "disruptions"
    id: int | None = Field(default=None, primary_key=True)
    journey_id: str = Field(index=True, max_length=64)
    active: bool = Field(default=True, index=True)
    kind: str = Field(default="rail_service", max_length=40)
    start_km: float = 0
    end_km: float = 0
    title: str = Field(max_length=120)
    message: str = Field(max_length=500)
    shuttle_stop: str | None = Field(default=None, max_length=120)
    shuttle_departure: datetime | None = None
    created_at: datetime = Field(default_factory=utc_now, index=True)
