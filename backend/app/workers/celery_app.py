from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "acco_workers",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "app.workers.tasks.followups",
        "app.workers.tasks.reminders",
    ]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone=settings.business_timezone,
    enable_utc=True,
    beat_schedule={
        "sweep-expired-promises-hourly": {
            "task": "app.workers.tasks.followups.sweep_expired_promises_task",
            "schedule": 3600.0,
        },
        "process-queued-emails-regularly": {
            "task": "app.workers.tasks.reminders.process_email_deliveries_task",
            "schedule": 60.0,
        },
        "evaluate-receivables-reminders-daily": {
            "task": "app.workers.tasks.reminders.evaluate_receivables_reminders_task",
            "schedule": 14400.0,  # every 4 hours
        },
    }
)
