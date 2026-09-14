from __future__ import annotations

from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

from .config import settings

if settings.database_url.startswith("sqlite:///"):
    db_path = settings.database_url.removeprefix("sqlite:///")
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False, "timeout": 20} if settings.database_url.startswith("sqlite") else {},
    pool_pre_ping=True,
)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    if settings.database_url.startswith("sqlite"):
        with engine.connect() as connection:
            connection.exec_driver_sql("PRAGMA journal_mode=WAL")
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")


def get_session():
    with Session(engine) as session:
        yield session
