from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    flowpilot_api_url: str = Field(default="http://api:3000/api", alias="FLOWPILOT_API_URL")
    flowpilot_internal_api_token: str = Field(alias="FLOWPILOT_INTERNAL_API_TOKEN")
    http_timeout_seconds: float = Field(
        default=5.0,
        alias="AI_ORCHESTRATOR_HTTP_TIMEOUT_SECONDS",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()