from app.models import Ledger, Order


def place(name: str, quantity: int) -> Order:
    order = Order(name=name, quantity=quantity)
    return order


def open_ledger(owner: str) -> str:
    ledger = Ledger(owner)
    return ledger.owner
