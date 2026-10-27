from typing import Awaitable, Callable

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


async def load(text: str) -> str:
    return text.lower()


async def stream(job: Callable[[], Awaitable[str]]) -> str:
    return await job()


@router.get("/closure/async")
async def from_web_async(url: str) -> str:
    if url:
        clean = url.strip()
    else:
        clean = ""

    async def create() -> str:
        loaded = await load(
            clean,
        )
        return loaded

    return await stream(create)


class Importer:
    def make(self, url: str) -> str:
        cleaned = url.strip()

        def create() -> str:
            return finish(cleaned)

        return run(create)
