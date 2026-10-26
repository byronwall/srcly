from pydantic import BaseModel


class Order(BaseModel):
    name: str
    quantity: int

    def scaled(self, factor: int) -> int:
        return self.quantity * factor


class Ledger:
    def describe(self, prefix: str) -> str:
        return prefix + self.owner

    def __init__(self, owner: str) -> None:
        self.owner = owner


class Unused:
    note: str = ""
