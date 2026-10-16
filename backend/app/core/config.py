import urllib.parse
from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

MIN_JWT_SECRET_LENGTH = 32

# Example/placeholder values that must never be accepted outside development.
_PLACEHOLDER_EXACT = frozenset(
    {"secret", "password", "changeme", "change_me", "test", "default", "jwt_secret"}
)
_PLACEHOLDER_MARKERS = ("replace_this", "change_me", "changeme", "your_secret", "your-secret")


def _is_placeholder_secret(value: str) -> bool:
    """Return True for known example/development-only secret values."""
    normalised = value.strip().lower()
    return normalised in _PLACEHOLDER_EXACT or any(m in normalised for m in _PLACEHOLDER_MARKERS)


class ConfigurationError(RuntimeError):
    """Raised when application configuration is invalid or missing required security settings."""


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
    database_pool_size: int = Field(default=5, ge=1, le=50)
    database_max_overflow: int = Field(default=5, ge=0, le=50)
    database_pool_timeout_seconds: float = Field(default=15.0, ge=1.0, le=120.0)
    database_pool_recycle_seconds: int = Field(default=300, ge=60, le=3600)
    database_connect_timeout_seconds: int = Field(default=10, ge=1, le=60)
    database_direct_url: str | None = None  # Dedicated direct connection for migrations/admin
    jwt_secret_key: str | None = None
    access_token_expire_minutes: int = Field(default=15, ge=1, le=120)
    refresh_token_expire_days: int = Field(default=7, ge=1, le=90)
    # A just-rotated refresh token presented again within this window (parallel browser requests
    # racing on refresh) receives a fresh pair instead of revoking the session. 0 = strict.
    refresh_reuse_leeway_seconds: int = Field(default=10, ge=0, le=60)
    jwt_issuer: str = "acco"

    # Sign-in security (Tasks 0.4, 0.5, 0.7)
    frontend_base_url: str = "http://localhost:3000"  # used to build emailed links
    require_email_verification: bool | None = None  # None -> required outside development
    login_max_failed_attempts: int = Field(default=5, ge=3, le=20)
    login_lockout_minutes: int = Field(default=15, ge=1, le=1440)
    password_reset_ttl_minutes: int = Field(default=60, ge=5, le=1440)
    email_verification_ttl_hours: int = Field(default=24, ge=1, le=168)
    mfa_issuer: str = "ACCO"
    mfa_recovery_code_count: int = Field(default=10, ge=5, le=20)

    # Number of trusted reverse-proxy hops whose X-Forwarded-For entry may be believed (0 = none).
    trusted_proxy_hops: int = Field(default=0, ge=0, le=5)

    # Field-level encryption: "key_id=base64key[,key_id2=base64key2]"; first (or the id named
    # by encryption_primary_key_id) encrypts, all can decrypt. Generate with
    # `python -c "from app.core.encryption import generate_key; print(generate_key())"`.
    encryption_keys: SecretStr | None = None
    encryption_primary_key_id: str | None = None

    # AI execution is opt-in: without a key, requests fail closed.
    openai_api_key: SecretStr | None = None
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str | None = None
    openai_timeout_seconds: float = Field(default=20.0, ge=1.0, le=60.0)
    openai_max_retries: int = Field(default=0, ge=0, le=2)
    reply_analysis_max_input_chars: int = Field(default=12000, ge=100, le=50000)
    reply_analysis_prompt_version: str = "reply-v1"

    # Worker & Background Tasks
    celery_broker_url: str = "memory://"
    celery_result_backend: str = "cache+memory://"
    business_timezone: str = "UTC"

    # Email provider configuration
    resend_api_key: SecretStr | None = None
    resend_from_email: str = "billing@acco.app"
    email_webhook_signing_secret: SecretStr | None = None

    @property
    def email_verification_required(self) -> bool:
        if self.require_email_verification is not None:
            return self.require_email_verification
        return not self.is_development

    @property
    def is_development(self) -> bool:
        """Return True if running in development environment."""
        return (self.environment or "").strip().lower() == "development"

    def validate_runtime_configuration(self) -> None:
        """
        Validate that all required settings are configured and valid for the active environment.
        Fails closed on missing or blank secrets, or invalid configurations in non-development environments.
        Never prints or logs secret values.
        """
        raw_env = self.environment
        if not raw_env or not raw_env.strip():
            raise ConfigurationError(
                "Invalid configuration: ACCO_ENVIRONMENT cannot be empty or whitespace-only."
            )

        env_name = raw_env.strip().lower()
        if env_name == "development":
            # Developer-friendly lenient defaults allowed in local development
            return

        # In test, staging, production, or any other non-development environment:
        # All required settings must be present, non-blank, and syntactically valid.
        errors: list[str] = []

        # 1. JWT secret key
        if not self.jwt_secret_key or not self.jwt_secret_key.strip():
            errors.append(
                "ACCO_JWT_SECRET_KEY is required and cannot be blank in non-development environments."
            )
        else:
            jwt_secret = self.jwt_secret_key.strip()
            if _is_placeholder_secret(jwt_secret):
                errors.append(
                    "ACCO_JWT_SECRET_KEY is a known placeholder/example value and is not "
                    "permitted in non-development environments."
                )
            elif len(jwt_secret) < MIN_JWT_SECRET_LENGTH:
                errors.append(
                    f"ACCO_JWT_SECRET_KEY must be at least {MIN_JWT_SECRET_LENGTH} characters "
                    "in non-development environments."
                )

        # 1b. Field-encryption keys (imported lazily: encryption imports this module)
        from app.core.encryption import EncryptionError, parse_keys

        key_spec = self.encryption_keys.get_secret_value() if self.encryption_keys else ""
        if not key_spec.strip():
            errors.append(
                "ACCO_ENCRYPTION_KEYS is required and cannot be blank in non-development "
                "environments."
            )
        else:
            try:
                parsed_keys = parse_keys(key_spec)
            except EncryptionError as exc:
                errors.append(f"ACCO_ENCRYPTION_KEYS is invalid: {exc}")
            else:
                if not parsed_keys:
                    errors.append("ACCO_ENCRYPTION_KEYS contains no keys.")
                elif (
                    self.encryption_primary_key_id
                    and self.encryption_primary_key_id not in parsed_keys
                ):
                    errors.append(
                        "ACCO_ENCRYPTION_PRIMARY_KEY_ID does not match any configured key id."
                    )

        # 2. Database URL
        if not self.database_url or not self.database_url.strip():
            errors.append(
                "ACCO_DATABASE_URL is required and cannot be blank in non-development environments."
            )

        # 3. Email webhook signing secret
        webhook_secret = ""
        if self.email_webhook_signing_secret is not None:
            if isinstance(self.email_webhook_signing_secret, SecretStr):
                webhook_secret = self.email_webhook_signing_secret.get_secret_value()
            else:
                webhook_secret = str(self.email_webhook_signing_secret)
        if not webhook_secret or not webhook_secret.strip():
            errors.append(
                "ACCO_EMAIL_WEBHOOK_SIGNING_SECRET is required and cannot be blank in non-development environments."
            )
        elif _is_placeholder_secret(webhook_secret):
            errors.append(
                "ACCO_EMAIL_WEBHOOK_SIGNING_SECRET is a known placeholder/example value and is "
                "not permitted in non-development environments."
            )

        # 4. Celery broker URL
        if not self.celery_broker_url or not self.celery_broker_url.strip():
            errors.append(
                "ACCO_CELERY_BROKER_URL is required and cannot be blank in non-development environments."
            )
        else:
            broker_clean = self.celery_broker_url.strip()
            parsed = urllib.parse.urlparse(broker_clean)
            scheme = (parsed.scheme or "").lower()
            if scheme not in ("redis", "rediss"):
                errors.append(
                    "ACCO_CELERY_BROKER_URL must use 'redis://' or 'rediss://' scheme in "
                    f"non-development environments; got scheme '{scheme or 'none'}'. "
                    "In-memory brokers are not permitted."
                )
            elif not parsed.netloc or not parsed.hostname:
                errors.append(
                    "ACCO_CELERY_BROKER_URL is malformed: missing host or network location."
                )

        if errors:
            formatted_errors = "\n  - " + "\n  - ".join(errors)
            raise ConfigurationError(
                f"Configuration validation failed for environment '{raw_env}':{formatted_errors}"
            )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Create and cache application settings."""
    return Settings()


settings = get_settings()


def validate_settings(s: Settings | None = None) -> Settings:
    """
    Startup validation function ensuring fail-closed security configuration.
    Validates the provided Settings instance or cached global settings.
    """
    target = s or get_settings()
    target.validate_runtime_configuration()
    return target
