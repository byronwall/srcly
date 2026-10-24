import logging

from app.models import Item

logger = logging.getLogger(__name__)
_items: dict[int, Item] = {}


def save_item(name: str, price: float, tags: list[str]) -> Item:
    item = Item(id=len(_items) + 1, name=name, price=price, tags=tags)
    _items[item.id] = item
    return item


def find_item(item_id: int) -> Item | None:
    return _items.get(item_id)


def all_items() -> list[Item]:
    return list(_items.values())
