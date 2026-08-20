from pydantic import BaseModel


class RouteCapacityCheck(BaseModel):
    vehicle_id: int
    container_ids: list[int]


class RouteCapacityResponse(BaseModel):
    vehicle_id: int
    vehicle_capacity: float
    selected_containers_count: int
    total_waste_amount: float
    remaining_capacity: float
    capacity_ok: bool