import functools
from collections.abc import Generator

from app.models import Ledger


def get_ledger() -> Generator[Ledger]:
    ledger = Ledger("db")
    yield ledger


@functools.cache
def parse_count(text: str) -> int | None:
    try:
        return int(text)
    except ValueError, TypeError:
        return None


async def load_count(text: str) -> int | None:
    return parse_count(text)


def label(kind: str) -> str:
    # "except ValueError, TypeError:" in a string or a comment is left alone.
    message = "except ValueError, TypeError:"
    return f"{kind}: {message}"


for _suffix in ("a", "b"):

    def made_in_loop(value: str) -> str:
        return value + _suffix
