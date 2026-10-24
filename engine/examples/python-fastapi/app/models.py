from dataclasses import dataclass

from pydantic import BaseModel


class ItemIn(BaseModel):
    name: str
    price: float
    tags: list[str] = []


class Item(BaseModel):
    id: int
    name: str
    price: float
    tags: list[str]


@dataclass
class Settings:
    data_dir: str
    seed: str
