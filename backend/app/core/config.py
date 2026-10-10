from functools import lru_cache

from pydantic import Field, SecretStr
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
    jwt_secret_key: str | None = None
    access_token_expire_minutes: int = 30
    jwt_issuer: str = "acco"

    # AI execution is opt-in: without a key, requests fail closed.
    openai_api_key: SecretStr | None = None
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str | None = None
    openai_timeout_seconds: float = Field(default=20.0, ge=1.0, le=60.0)
    openai_max_retries: int = Field(default=0, ge=0, le=2)
    reply_analysis_max_input_chars: int = Field(default=12000, ge=100, le=50000)
    reply_analysis_prompt_version: str = "reply-v1"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Create and cache application settings."""
    return Settings()


settings = get_settings()
