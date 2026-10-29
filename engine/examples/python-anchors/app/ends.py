# Where values naturally begin and end: constants and empty collections begin
# a value, a module outside the program begins one, a statement drops its
# result, and an attribute write stores one.
import os

CONFIG = {"a": 1, "b": 2}
EMPTY: list[str] = []


def first() -> int:
    return CONFIG["a"]


def second() -> int:
    return CONFIG["b"]


def separator() -> str:
    return os.sep


class Holder:
    text = ""


holder = Holder()


def store(text: str) -> None:
    holder.text = text


def remember(text: str) -> None:
    EMPTY.append(text)
    store(text)
    shout(text)


def shout(text: str) -> str:
    return text.upper()
