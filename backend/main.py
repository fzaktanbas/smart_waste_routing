from turtle import rt

from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from datetime import datetime, timezone
from geoalchemy2 import WKTElement

from database import engine, Base, SessionLocal
from models import Container, SystemSettings
from schemas.container import ContainerCreate, ContainerResponse, ContainerUpdate
from schemas.settings import SettingsResponse, SettingsUpdate


app = FastAPI()

Base.metadata.create_all(bind=engine)


def create_default_settings():
    # Sistem ayarı yoksa varsayılan toplama eşiğini oluşturur.
    db = SessionLocal()

    try:
        settings = db.query(SystemSettings).first()

        if settings is None:
            settings = SystemSettings(
                collection_threshold=80
            )

            db.add(settings)
            db.commit()

    finally:
        db.close()


create_default_settings()


@app.get("/")
def root():
    return {
        "message": "Smart Waste Routing API çalışıyor!"
    }


@app.get("/test-db")
def test_database():
    with engine.connect() as connection:
        result = connection.execute(text("SELECT 1"))

        return {
            "database": "connected",
            "result": result.scalar()
        }


def get_db():
    db = SessionLocal()

    try:
        yield db

    finally:
        db.close()


def calculate_fill_level(container: Container) -> int:
    """
    Konteynerin boşaltılmasından/oluşturulmasından
    bu yana geçen zamana göre tahmini doluluk oranını hesaplar.
    """

    now = datetime.now(timezone.utc)

    start_time = container.fill_started_at

    # PostgreSQL timezone bilgisi olmadan tarih döndürürse
    # UTC olarak kabul ediyoruz.
    if start_time.tzinfo is None:
        start_time = start_time.replace(
            tzinfo=timezone.utc
        )

    elapsed_seconds = (
        now - start_time
    ).total_seconds()

    total_seconds = (
        container.fill_duration_days
        * 24
        * 60
        * 60
    )

    # Geçersiz bir dolma süresi varsa %100 kabul ediyoruz.
    if total_seconds <= 0:
        return 100

    fill_percentage = (
        elapsed_seconds / total_seconds
    ) * 100

    # Değeri %0 ile %100 arasında tutuyoruz.
    fill_percentage = max(
        0,
        min(100, fill_percentage)
    )

    return round(fill_percentage)


# --------------------------------------------------
# CREATE CONTAINER
# --------------------------------------------------

@app.post("/containers")
def create_container(
    container: ContainerCreate,
    db: Session = Depends(get_db)
):
    location = WKTElement(
        f"POINT({container.longitude} {container.latitude})",
        srid=4326
    )

    new_container = Container(
    name=container.name,
    location=location,
    capacity=container.capacity,
    fill_level=0,
    fill_duration_days=container.fill_duration_days,
    status=container.status
)

    db.add(new_container)
    db.commit()
    db.refresh(new_container)

    return {
        "message": "Container created successfully",
        "id": new_container.id
    }


# --------------------------------------------------
# GET ALL CONTAINERS
# --------------------------------------------------

@app.get(
    "/containers",
    response_model=list[ContainerResponse]
)
def get_containers(
    db: Session = Depends(get_db)
):
    containers = db.query(
        Container,
        func.ST_X(Container.location).label("longitude"),
        func.ST_Y(Container.location).label("latitude")
    ).all()

    result = []

    for container, longitude, latitude in containers:
        result.append({
            "id": container.id,
            "name": container.name,
            "latitude": latitude,
            "longitude": longitude,
            "capacity": container.capacity,
            "fill_level": container.fill_level,
            "fill_duration_days": container.fill_duration_days,
            "status": container.status
        })

    return result


# --------------------------------------------------
# GET FULL CONTAINERS
# --------------------------------------------------

@app.get(
    "/containers/full",
    response_model=list[ContainerResponse]
)
def get_full_containers(
    db: Session = Depends(get_db)
):
    containers = db.query(
        Container,
        func.ST_X(Container.location).label("longitude"),
        func.ST_Y(Container.location).label("latitude")
    ).filter(
        Container.fill_level >= 80
    ).all()

    result = []

    for container, longitude, latitude in containers:
        result.append({
            "id": container.id,
            "name": container.name,
            "latitude": latitude,
            "longitude": longitude,
            "capacity": container.capacity,
            "fill_level": container.fill_level,
            "fill_duration_days": container.fill_duration_days,
            "status": container.status
        })

    return result


# --------------------------------------------------
# GET SINGLE CONTAINER
# --------------------------------------------------

@app.get(
    "/containers/{container_id}",
    response_model=ContainerResponse
)
def get_container(
    container_id: int,
    db: Session = Depends(get_db)
):
    result = db.query(
        Container,
        func.ST_X(Container.location).label("longitude"),
        func.ST_Y(Container.location).label("latitude")
    ).filter(
        Container.id == container_id
    ).first()

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Container not found"
        )

    container, longitude, latitude = result

    return {
        "id": container.id,
        "name": container.name,
        "latitude": latitude,
        "longitude": longitude,
        "capacity": container.capacity,
        "fill_level": container.fill_level,
        "fill_duration_days": container.fill_duration_days,
        "status": container.status
    }


# --------------------------------------------------
# UPDATE CONTAINER
# --------------------------------------------------

@app.put("/containers/{container_id}")
def update_container(
    container_id: int,
    container: ContainerUpdate,
    db: Session = Depends(get_db)
):
    existing_container = db.query(
        Container
    ).filter(
        Container.id == container_id
    ).first()

    if existing_container is None:
        raise HTTPException(
            status_code=404,
            detail="Container not found"
        )

    if container.name is not None:
        existing_container.name = container.name

    if container.capacity is not None:
        existing_container.capacity = container.capacity

    

    if container.fill_duration_days is not None:
        existing_container.fill_duration_days = (
            container.fill_duration_days
        )

    if container.status is not None:
        existing_container.status = container.status

    if (
        container.latitude is not None
        and container.longitude is not None
    ):
        existing_container.location = WKTElement(
            f"POINT({container.longitude} {container.latitude})",
            srid=4326
        )

    db.commit()
    db.refresh(existing_container)

    return {
        "message": "Container updated successfully",
        "id": existing_container.id
    }


# --------------------------------------------------
# DELETE CONTAINER
# --------------------------------------------------

@app.delete("/containers/{container_id}")
def delete_container(
    container_id: int,
    db: Session = Depends(get_db)
):
    container = db.query(
        Container
    ).filter(
        Container.id == container_id
    ).first()

    if container is None:
        raise HTTPException(
            status_code=404,
            detail="Container not found"
        )

    db.delete(container)
    db.commit()

    return {
        "message": "Container deleted successfully",
        "id": container_id
    }


@app.get("/settings", response_model=SettingsResponse)
def get_settings(
    db: Session = Depends(get_db)
):
    settings = db.query(SystemSettings).first()

    if settings is None:
        settings = SystemSettings(
            collection_threshold=80
        )

        db.add(settings)
        db.commit()
        db.refresh(settings)

    return settings


@app.put("/settings", response_model=SettingsResponse)
def update_settings(
    settings_data: SettingsUpdate,
    db: Session = Depends(get_db)
):
    settings = db.query(SystemSettings).first()

    if settings is None:
        settings = SystemSettings(
            collection_threshold=settings_data.collection_threshold
        )

        db.add(settings)

    else:
        settings.collection_threshold = (
            settings_data.collection_threshold
        )

    db.commit()
    db.refresh(settings)

    return settings