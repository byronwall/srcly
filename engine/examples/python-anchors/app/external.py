# Values handed to code outside the program: named as external code, never an
# untraced end. A call the checker cannot resolve is not named external.
import json
import time


def save(payload: dict[str, str]) -> None:
    json.dumps(payload)


def remember(items: list[str], item: str) -> None:
    items.append(item)


def poke(thing, value: str) -> None:
    thing.anything(value)


def stamp() -> float:
    started = time.time()
    return started


def connect(url: str):
    # `notinstalled` is not installed: mypy names `Engine` after this module, its import names it outside.
    from notinstalled import Engine

    return Engine(url)
