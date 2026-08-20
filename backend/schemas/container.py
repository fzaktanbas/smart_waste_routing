from pydantic import BaseModel


class ContainerCreate(BaseModel):
    name: str
    latitude: float
    longitude: float
    capacity: int
    fill_duration_days: int
    status: str = "active"


class ContainerUpdate(BaseModel):
    name: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    capacity: int | None = None
    fill_duration_days: int | None = None
    status: str | None = None


class ContainerResponse(BaseModel):
    id: int
    name: str
    latitude: float
    longitude: float
    capacity: int
    fill_level: int
    fill_duration_days: int
    status: str

    class Config:
        from_attributes = True