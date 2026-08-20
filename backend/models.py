from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from geoalchemy2 import Geometry

from database import Base


class Container(Base):
    __tablename__ = "containers"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(
        String,
        nullable=False
    )

    location = Column(
        Geometry("POINT", srid=4326),
        nullable=False
    )

    capacity = Column(
        Integer,
        nullable=False
    )

    fill_level = Column(
        Integer,
        nullable=False,
        default=0
    )

    fill_duration_days = Column(
        Integer,
        nullable=False
    )

    fill_started_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )

    status = Column(
        String,
        nullable=False,
        default="active"
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )


class SystemSettings(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)

    collection_threshold = Column(
        Integer,
        nullable=False,
        default=80
    )    