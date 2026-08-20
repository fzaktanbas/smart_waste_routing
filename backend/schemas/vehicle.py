from pydantic import BaseModel


class VehicleCreate(BaseModel):
    name: str
    plate_number: str
    capacity: int
    latitude: float
    longitude: float
    status: str = "active"


class VehicleUpdate(BaseModel):
    name: str | None = None
    plate_number: str | None = None
    capacity: int | None = None
    latitude: float | None = None
    longitude: float | None = None
    status: str | None = None


class VehicleResponse(BaseModel):
    id: int
    name: str
    plate_number: str
    capacity: int
    latitude: float
    longitude: float
    status: str