from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PingCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    journey_id: str = Field(default="pretoria-cape-town", min_length=3, max_length=64, pattern=r"^[a-z0-9-]+$")
    session_id: str = Field(min_length=8, max_length=128)
    latitude: float = Field(ge=-35.5, le=-22)
    longitude: float = Field(ge=16, le=33)
    accuracy_metres: float = Field(gt=0, le=5000)
    speed_kmh: float | None = Field(default=None, ge=0, le=180)


class PingAccepted(BaseModel):
    accepted: Literal[True] = True
    ping_id: int
    route_km: float
    distance_from_route_km: float
    journey_status: "JourneyStatus"


class DisruptionOut(BaseModel):
    id: int
    kind: str
    start_km: float
    end_km: float
    title: str
    message: str
    shuttle_stop: str | None
    shuttle_departure: datetime | None


class JourneyStatus(BaseModel):
    journey_id: str
    state: Literal["scheduled", "moving", "delayed", "disrupted", "arrived"]
    current_km: float
    total_km: float
    rolling_speed_kmh: float | None
    eta_minutes: int | None
    confidence: Literal["none", "low", "medium", "high"]
    recent_ping_count: int
    last_ping_at: datetime | None
    data_mode: Literal["passenger_pings", "demo_baseline"]
    disruption: DisruptionOut | None = None


class PlaceOut(BaseModel):
    id: str
    name: str
    category: str
    type: Literal["attraction", "vendor"]
    distance: str
    rating: float
    price: str | None = None
    blurb: str
    image: str


class StopOut(BaseModel):
    id: str
    name: str
    province: str
    km: float
    latitude: float
    longitude: float
    teaser: str
    places: list[PlaceOut]


class HealthOut(BaseModel):
    status: Literal["ok"] = "ok"
    service: str = "shosholoza-trail-api"
    environment: str


PingAccepted.model_rebuild()
