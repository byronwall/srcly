from typing import Callable

from fastapi import APIRouter

router = APIRouter()


def finish(text: str) -> str:
    return text.upper()


def run(job: Callable[[], str]) -> str:
    return job()


@router.get("/closure")
def from_web(url: str) -> str:
    clean = url.strip()

    def create() -> str:
        return finish(clean)

    return run(create)
