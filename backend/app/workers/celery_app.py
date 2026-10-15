from celery import Celery
from celery.schedules import crontab
from celery.signals import worker_process_init, worker_process_shutdown

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


@worker_process_init.connect
def on_worker_process_init(**kwargs) -> None:
    """
    Ensure each prefork child worker gets a fresh connection pool.
    Disposing inherited parent engine with close=False replaces the pool
    without closing connections owned by the parent process.
    """
    from app.db.session import dispose_engine
    dispose_engine(close=False)


@worker_process_shutdown.connect
def on_worker_process_shutdown(**kwargs) -> None:
    """Cleanly close all database connections when worker child process terminates."""
    from app.db.session import dispose_engine
    dispose_engine(close=True)
