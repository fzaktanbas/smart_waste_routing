from turtle import rt

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from datetime import datetime, timezone
from geoalchemy2 import WKTElement

from database import engine, Base, SessionLocal
from models import Container, Vehicle, SystemSettings
from schemas.container import ContainerCreate, ContainerResponse, ContainerUpdate
from schemas.settings import SettingsResponse, SettingsUpdate
from schemas.vehicle import VehicleCreate, VehicleResponse, VehicleUpdate
from schemas.route import ( RouteCapacityCheck, RouteCapacityResponse, RouteCreate
)
from services.ors_service import get_route


app = FastAPI()



# --------------------------------------------------
# ENCODED POLYLINE -> GEOJSON DECODER
# --------------------------------------------------

def decode_polyline(encoded):
    """
    ORS'nin encoded polyline formatındaki geometriyi
    GeoJSON LineString formatına çevirir.

    ORS encoded polyline:
    "abc123..."

    Çıktı:
    {
        "type": "LineString",
        "coordinates": [
            [longitude, latitude],
            ...
        ]
    }
    """

    index = 0
    latitude = 0
    longitude = 0

    coordinates = []

    while index < len(encoded):

        # Latitude
        shift = 0
        result = 0

        while True:
            byte = ord(encoded[index]) - 63
            index += 1

            result |= (byte & 0x1F) << shift
            shift += 5

            if byte < 0x20:
                break

        if result & 1:
            delta_latitude = ~(result >> 1)
        else:
            delta_latitude = result >> 1

        latitude += delta_latitude

        # Longitude
        shift = 0
        result = 0

        while True:
            byte = ord(encoded[index]) - 63
            index += 1

            result |= (byte & 0x1F) << shift
            shift += 5

            if byte < 0x20:
                break

        if result & 1:
            delta_longitude = ~(result >> 1)
        else:
            delta_longitude = result >> 1

        longitude += delta_longitude

        coordinates.append([
            longitude / 100000,
            latitude / 100000
        ])

    return {
        "type": "LineString",
        "coordinates": coordinates
    }






app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
# CREATE VEHICLE
# --------------------------------------------------

@app.post("/vehicles")
def create_vehicle(
    vehicle: VehicleCreate,
    db: Session = Depends(get_db)
):
    location = WKTElement(
        f"POINT({vehicle.longitude} {vehicle.latitude})",
        srid=4326
    )

    new_vehicle = Vehicle(
        name=vehicle.name,
        plate_number=vehicle.plate_number,
        capacity=vehicle.capacity,
        current_location=location,
        status=vehicle.status
    )

    db.add(new_vehicle)
    db.commit()
    db.refresh(new_vehicle)

    return {
        "message": "Vehicle created successfully",
        "id": new_vehicle.id
    }



# --------------------------------------------------
# GET ALL VEHICLES
# --------------------------------------------------

@app.get(
    "/vehicles",
    response_model=list[VehicleResponse]
)
def get_vehicles(
    db: Session = Depends(get_db)
):
    vehicles = db.query(
        Vehicle,
        func.ST_X(Vehicle.current_location).label("longitude"),
        func.ST_Y(Vehicle.current_location).label("latitude")
    ).all()

    result = []

    for vehicle, longitude, latitude in vehicles:
        result.append({
            "id": vehicle.id,
            "name": vehicle.name,
            "plate_number": vehicle.plate_number,
            "capacity": vehicle.capacity,
            "latitude": latitude,
            "longitude": longitude,
            "status": vehicle.status
        })

    return result


# --------------------------------------------------
# GET SINGLE VEHICLE
# --------------------------------------------------

@app.get(
    "/vehicles/{vehicle_id}",
    response_model=VehicleResponse
)
def get_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db)
):
    result = db.query(
        Vehicle,
        func.ST_X(Vehicle.current_location).label("longitude"),
        func.ST_Y(Vehicle.current_location).label("latitude")
    ).filter(
        Vehicle.id == vehicle_id
    ).first()

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Vehicle not found"
        )

    vehicle, longitude, latitude = result

    return {
        "id": vehicle.id,
        "name": vehicle.name,
        "plate_number": vehicle.plate_number,
        "capacity": vehicle.capacity,
        "latitude": latitude,
        "longitude": longitude,
        "status": vehicle.status
    }



# --------------------------------------------------
# UPDATE VEHICLE
# --------------------------------------------------

@app.put("/vehicles/{vehicle_id}")
def update_vehicle(
    vehicle_id: int,
    vehicle: VehicleUpdate,
    db: Session = Depends(get_db)
):
    existing_vehicle = db.query(
        Vehicle
    ).filter(
        Vehicle.id == vehicle_id
    ).first()

    if existing_vehicle is None:
        raise HTTPException(
            status_code=404,
            detail="Vehicle not found"
        )

    if vehicle.name is not None:
        existing_vehicle.name = vehicle.name

    if vehicle.plate_number is not None:
        existing_vehicle.plate_number = vehicle.plate_number

    if vehicle.capacity is not None:
        existing_vehicle.capacity = vehicle.capacity

    if vehicle.status is not None:
        existing_vehicle.status = vehicle.status

    if (
        vehicle.latitude is not None
        and vehicle.longitude is not None
    ):
        existing_vehicle.current_location = WKTElement(
            f"POINT({vehicle.longitude} {vehicle.latitude})",
            srid=4326
        )

    db.commit()
    db.refresh(existing_vehicle)

    return {
        "message": "Vehicle updated successfully",
        "id": existing_vehicle.id
    }



# --------------------------------------------------
# DELETE VEHICLE
# --------------------------------------------------

@app.delete("/vehicles/{vehicle_id}")
def delete_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db)
):
    vehicle = db.query(
        Vehicle
    ).filter(
        Vehicle.id == vehicle_id
    ).first()

    if vehicle is None:
        raise HTTPException(
            status_code=404,
            detail="Vehicle not found"
        )

    db.delete(vehicle)
    db.commit()

    return {
        "message": "Vehicle deleted successfully",
        "id": vehicle_id
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
    "fill_level": calculate_fill_level(container),
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
    # Sistemdeki toplama eşiğini al
    settings = db.query(SystemSettings).first()

    if settings is None:
        collection_threshold = 80
    else:
        collection_threshold = settings.collection_threshold

    # Tüm konteynerleri al
    containers = db.query(
        Container,
        func.ST_X(Container.location).label("longitude"),
        func.ST_Y(Container.location).label("latitude")
    ).all()

    result = []

    for container, longitude, latitude in containers:

        # Güncel doluluk oranını hesapla
        current_fill_level = calculate_fill_level(container)

        # Kullanıcının belirlediği eşik değerine göre kontrol et
        if current_fill_level >= collection_threshold:
            result.append({
                "id": container.id,
                "name": container.name,
                "latitude": latitude,
                "longitude": longitude,
                "capacity": container.capacity,
                "fill_level": current_fill_level,
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
        "fill_level": calculate_fill_level(container),
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
# EMPTY CONTAINER
# --------------------------------------------------

@app.post("/containers/{container_id}/empty")
def empty_container(
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

    # Konteynerin doluluğunu sıfırla
    container.fill_level = 0

    # Yeni dolum sürecini şimdi başlat
    container.fill_started_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(container)

    return {
        "message": "Container emptied successfully",
        "id": container.id,
        "fill_level": 0,
        "fill_started_at": container.fill_started_at
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



# --------------------------------------------------
# CHECK ROUTE CAPACITY
# --------------------------------------------------

@app.post(
    "/route/check-capacity",
    response_model=RouteCapacityResponse
)
def check_route_capacity(
    route_data: RouteCapacityCheck,
    db: Session = Depends(get_db)
):
    # Seçilen aracı bul
    vehicle = db.query(
        Vehicle
    ).filter(
        Vehicle.id == route_data.vehicle_id
    ).first()

    if vehicle is None:
        raise HTTPException(
            status_code=404,
            detail="Vehicle not found"
        )

    # Sadece aktif araç kullanılabilsin
    if vehicle.status != "active":
        raise HTTPException(
            status_code=400,
            detail="Selected vehicle is not active"
        )

    # Aynı konteyner ID'si iki kez gönderilmesin
    unique_container_ids = list(
        set(route_data.container_ids)
    )

    # Seçilen konteynerleri bul
    containers = db.query(
        Container
    ).filter(
        Container.id.in_(unique_container_ids)
    ).all()

    # Gönderilen bazı konteynerler bulunamadıysa hata ver
    if len(containers) != len(unique_container_ids):
        raise HTTPException(
            status_code=404,
            detail="One or more containers not found"
        )

    total_waste_amount = 0

    # Her konteynerin güncel doluluk miktarını hesapla
    for container in containers:
        current_fill_level = calculate_fill_level(
            container
        )

        current_waste_amount = (
            container.capacity
            * current_fill_level
            / 100
        )

        total_waste_amount += current_waste_amount

    # Kalan araç kapasitesini hesapla
    remaining_capacity = (
        vehicle.capacity
        - total_waste_amount
    )

    # Toplam atık araç kapasitesini aşıyor mu?
    capacity_ok = (
        total_waste_amount
        <= vehicle.capacity
    )

    # Kalan kapasite negatif görünmesin
    if remaining_capacity < 0:
        remaining_capacity = 0

    return {
        "vehicle_id": vehicle.id,
        "vehicle_capacity": float(vehicle.capacity),
        "selected_containers_count": len(containers),
        "total_waste_amount": round(
            total_waste_amount,
            2
        ),
        "remaining_capacity": round(
            remaining_capacity,
            2
        ),
        "capacity_ok": capacity_ok
    }


# --------------------------------------------------
# CREATE ROUTE
# --------------------------------------------------

@app.post("/routes/{vehicle_id}")
def create_route(
    vehicle_id: int,
    route_data: RouteCreate,
    db: Session = Depends(get_db)
):
    # -----------------------------------------
    # ARACI BUL
    # -----------------------------------------

    vehicle = db.query(
        Vehicle
    ).filter(
        Vehicle.id == vehicle_id
    ).first()

    if vehicle is None:
        raise HTTPException(
            status_code=404,
            detail="Vehicle not found"
        )

    # -----------------------------------------
    # ARAÇ AKTİF Mİ?
    # -----------------------------------------

    if vehicle.status != "active":
        raise HTTPException(
            status_code=400,
            detail="Selected vehicle is not active"
        )

    # -----------------------------------------
    # KONTEYNER SEÇİLMİŞ Mİ?
    # -----------------------------------------

    if not route_data.container_ids:
        raise HTTPException(
            status_code=400,
            detail="No containers selected"
        )

    # -----------------------------------------
    # AYNI KONTEYNER İKİ KEZ GELMESİN
    # -----------------------------------------

    unique_container_ids = list(
        set(route_data.container_ids)
    )

    # -----------------------------------------
    # SEÇİLEN KONTEYNERLERİ BUL
    # -----------------------------------------

    containers = db.query(
        Container,
        func.ST_X(Container.location).label("longitude"),
        func.ST_Y(Container.location).label("latitude")
    ).filter(
        Container.id.in_(unique_container_ids)
    ).all()

    # -----------------------------------------
    # KONTEYNERLERİN HEPSİ VAR MI?
    # -----------------------------------------

    if len(containers) != len(unique_container_ids):
        raise HTTPException(
            status_code=404,
            detail="One or more containers not found"
        )

    # -----------------------------------------
    # SADECE AKTİF KONTEYNERLERİ KULLAN
    # -----------------------------------------

    inactive_containers = [
        container.id
        for container, longitude, latitude in containers
        if container.status != "active"
    ]

    if inactive_containers:
        raise HTTPException(
            status_code=400,
            detail="One or more selected containers are not active"
        )

    # -----------------------------------------
    # ARAÇ KAPASİTESİNİ KONTROL ET
    # -----------------------------------------

    total_waste_amount = 0

    for container, longitude, latitude in containers:

        current_fill_level = calculate_fill_level(
            container
        )

        current_waste_amount = (
            container.capacity
            * current_fill_level
            / 100
        )

        total_waste_amount += current_waste_amount

    # -----------------------------------------
    # KAPASİTE AŞILIYOR MU?
    # -----------------------------------------

    if total_waste_amount > vehicle.capacity:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Selected containers exceed vehicle capacity. "
                f"Total waste: {round(total_waste_amount, 2)} L, "
                f"Vehicle capacity: {vehicle.capacity} L"
            )
        )

    # -----------------------------------------
    # ARAÇ KONUMUNU AL
    # -----------------------------------------

    vehicle_longitude = db.query(
        func.ST_X(Vehicle.current_location)
    ).filter(
        Vehicle.id == vehicle.id
    ).scalar()

    vehicle_latitude = db.query(
        func.ST_Y(Vehicle.current_location)
    ).filter(
        Vehicle.id == vehicle.id
    ).scalar()

    # -----------------------------------------
    # ORS KOORDİNATLARI
    # -----------------------------------------

    # İlk nokta araç
    coordinates = [
        [
            vehicle_longitude,
            vehicle_latitude
        ]
    ]

    # Sonrasında SADECE kullanıcının seçtiği
    # konteynerleri ekliyoruz.
    selected_containers = []

    for container, longitude, latitude in containers:

        coordinates.append([
            longitude,
            latitude
        ])

        selected_containers.append({
            "id": container.id,
            "name": container.name,
            "longitude": longitude,
            "latitude": latitude,
            "fill_level": calculate_fill_level(
                container
            )
        })

    # -----------------------------------------
    # ORS'YE ROTA İSTEĞİ
    # -----------------------------------------

    route = get_route(coordinates)

    summary = route["routes"][0]["summary"]





    # -----------------------------------------
    # ORS GEOMETRY'Yİ GEOJSON'A ÇEVİR
    # ----------------------------------------- 

    encoded_geometry = route["routes"][0]["geometry"]

    geometry = decode_polyline(encoded_geometry)



    
    # -----------------------------------------
    # SONUÇ
    # -----------------------------------------

    return {
    "vehicle_id": vehicle.id,
    "vehicle_name": vehicle.name,
    "selected_containers": selected_containers,
    "total_waste_amount": round(
        total_waste_amount,
        2
    ),
    "vehicle_capacity": float(
        vehicle.capacity
    ),
    "remaining_capacity": round(
        vehicle.capacity - total_waste_amount,
        2
    ),
    "distance_meters": summary["distance"],
    "duration_seconds": summary["duration"],
    "geometry": geometry
}
