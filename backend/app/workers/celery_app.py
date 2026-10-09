from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "acco_workers",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone=settings.BUSINESS_TIMEZONE,
    enable_utc=True,
)
