from celery import shared_task


@shared_task
def consume(path: str, owner: str | None = None) -> str:
    return path.upper()


def upload(name: str) -> str:
    handle = consume.delay(name, owner="me")
    return handle.id


def bulk(source: str) -> None:
    consume.apply_async(kwargs={"path": source}, countdown=3)
