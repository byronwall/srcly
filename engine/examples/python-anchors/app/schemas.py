# A model's data flow: fields set by its constructor, read on values typed
# with it, and parameters annotated with it.
from dataclasses import dataclass

from pydantic import BaseModel


class ItemCreate(BaseModel):
    title: str
    size: int = 1


class Other(BaseModel):
    title: str


@dataclass
class Point:
    x: int
    y: int


def create(item: ItemCreate) -> str:
    return item.title


def describe(other: Other) -> str:
    return other.title


def build(title: str) -> ItemCreate:
    return ItemCreate(title=title)


def make_point(a: int) -> Point:
    return Point(a, 2)


def only_annotated(item: ItemCreate) -> int:
    return item.size


class Note(BaseModel):
    text: str
    kind: str = "plain"


def note() -> Note:
    return Note(text="hi")
