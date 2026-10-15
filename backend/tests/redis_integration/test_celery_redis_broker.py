"""Publish a synthetic task through real Redis and consume it with a real worker."""

import uuid

import pytest
from celery.contrib.testing.worker import start_worker
from kombu import pools

from app.workers.celery_app import celery_app

pytestmark = pytest.mark.redis_integration

WORKER_TIMEOUT_SECONDS = 30


@pytest.fixture()
def acco_celery_on_test_redis(redis_url):
    """Point the real ACCO Celery app at the test Redis, restoring settings afterwards."""
    original = {
        "broker_url": celery_app.conf.broker_url,
        "result_backend": celery_app.conf.result_backend,
    }
    celery_app.conf.update(
        broker_url=redis_url,
        result_backend=redis_url,
        broker_connection_retry_on_startup=False,
        broker_connection_timeout=5,
        broker_transport_options={"socket_timeout": 5, "socket_connect_timeout": 5},
        result_expires=60,
    )
    yield celery_app
    pools.reset()
    # Drop cached broker pool / result backend so later users of the app rebuild from restored conf.
    celery_app._pool = None
    celery_app.amqp._producer_pool = None
    celery_app._local.__dict__.pop("backend", None)
    celery_app.conf.update(**original)


def test_task_round_trips_through_real_redis_and_worker(acco_celery_on_test_redis, redis_client):
    app = acco_celery_on_test_redis
    run_id = uuid.uuid4().hex
    queue = f"acco-test-{run_id}"
    task_name = f"acco.test.redis_roundtrip_{run_id}"

    @app.task(name=task_name)
    def roundtrip(nonce: str, a: int, b: int) -> dict:
        return {"nonce": nonce, "sum": a + b}

    result = None
    try:
        result = roundtrip.apply_async(args=(run_id, 2, 3), queue=queue, expires=60)

        # Evidence the broker is real Redis: the message is a list entry under our queue key
        # before any worker exists, and is gone once consumed.
        assert redis_client.llen(queue) == 1

        with start_worker(
            app,
            queues=[queue],
            pool="solo",
            perform_ping_check=False,
            shutdown_timeout=WORKER_TIMEOUT_SECONDS,
        ):
            payload = result.get(timeout=WORKER_TIMEOUT_SECONDS)

        assert payload == {"nonce": run_id, "sum": 5}
        assert redis_client.llen(queue) == 0
        assert redis_client.exists(f"celery-task-meta-{result.id}") == 1
    finally:
        # Clean up only this test's resources.
        redis_client.delete(queue, f"_kombu.binding.{queue}")
        if result is not None:
            result.forget()
        app.tasks.pop(task_name, None)


def test_unconsumed_task_is_not_executed_without_worker(acco_celery_on_test_redis, redis_client):
    """Without a worker the task stays queued, proving execution needs real consumption."""
    app = acco_celery_on_test_redis
    run_id = uuid.uuid4().hex
    queue = f"acco-test-{run_id}"
    task_name = f"acco.test.redis_pending_{run_id}"

    @app.task(name=task_name)
    def pending() -> str:
        return "ran"

    result = pending.apply_async(queue=queue, expires=60)
    try:
        assert redis_client.llen(queue) == 1
        assert result.state == "PENDING"
    finally:
        redis_client.delete(queue, f"_kombu.binding.{queue}")
        result.forget()
        app.tasks.pop(task_name, None)
