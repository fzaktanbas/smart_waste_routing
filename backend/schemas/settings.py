from pydantic import BaseModel, Field


class SettingsResponse(BaseModel):
    collection_threshold: int


class SettingsUpdate(BaseModel):
    collection_threshold: int = Field(
        ge=1,
        le=100
    )