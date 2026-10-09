from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="ACCO_",
        extra="ignore",
    )

    app_name: str = "ACCO"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"
    database_url: str | None = None
    database_echo: bool = False


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Create and cache application settings."""
    return Settings()


settings = get_settings()
