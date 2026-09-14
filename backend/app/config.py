from __future__ import annotations

import os
from dataclasses import dataclass


def _csv(name: str, default: str) -> tuple[str, ...]:
    return tuple(value.strip() for value in os.getenv(name, default).split(",") if value.strip())


@dataclass(frozen=True)
class Settings:
    environment: str = os.getenv("SHOSHOLOZA_ENV", "development")
    database_url: str = os.getenv("SHOSHOLOZA_DATABASE_URL", "sqlite:///./data/shosholoza.db")
    cors_origins: tuple[str, ...] = _csv("SHOSHOLOZA_CORS_ORIGINS", "http://localhost:5174,http://127.0.0.1:5174")
    trusted_hosts: tuple[str, ...] = _csv("SHOSHOLOZA_TRUSTED_HOSTS", "localhost,127.0.0.1,testserver")
    ping_rate_limit_seconds: int = int(os.getenv("SHOSHOLOZA_PING_RATE_LIMIT_SECONDS", "10"))
    max_ping_accuracy_metres: float = float(os.getenv("SHOSHOLOZA_MAX_PING_ACCURACY_METRES", "1000"))
    max_route_distance_km: float = float(os.getenv("SHOSHOLOZA_MAX_ROUTE_DISTANCE_KM", "20"))


settings = Settings()
