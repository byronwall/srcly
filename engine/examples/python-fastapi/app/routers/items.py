from fastapi import APIRouter, HTTPException, Query

from app.config import load_settings
from app.models import Item, ItemIn, Settings
from app.store import all_items, find_item, logger, save_item

router = APIRouter(prefix="/items")


@router.post("")
def create_item(body: ItemIn) -> Item:
    name = body.name.strip()
    item = save_item(name, body.price, body.tags)
    logger.info("created item %s", item.id)
    return item


@router.get("/{item_id}")
def read_item(item_id: int, verbose: bool = False) -> Item:
    item = find_item(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail=f"no item {item_id}")
    if verbose:
        logger.info("read %s", item.name)
    return item


@router.get("")
def list_items(tag: str | None = Query(default=None), limit: int = 20) -> list[Item]:
    items = [item for item in all_items() if tag is None or tag in item.tags]
    return items[:limit]


@router.delete("/{item_id}")
def delete_item(item_id: int) -> dict[str, int]:
    item = find_item(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="missing")
    return {"deleted": item.id}


settings_router = APIRouter()


@settings_router.get("/settings")
def read_settings() -> Settings:
    return load_settings()
