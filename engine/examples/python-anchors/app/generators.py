from contextlib import contextmanager
from typing import Iterator


def numbered(lines: list[str]) -> Iterator[str]:
    for index, line in enumerate(lines):
        yield f"{index}: {line}"


def again(lines: list[str]) -> Iterator[str]:
    yield from numbered(lines)


def show(lines: list[str]) -> None:
    for entry in again(lines):
        print(entry)


@contextmanager
def opened(label: str) -> Iterator[str]:
    yield label.upper()


def use_opened(label: str) -> None:
    with opened(label) as value:
        print(value)


def echo(seed: str) -> Iterator[str]:
    reply = yield seed
    print(reply)
