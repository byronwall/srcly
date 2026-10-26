# Another file whose parameter is annotated with `ItemCreate`: annotated uses
# fold by file, so this one keeps a box of its own.
from app.schemas import ItemCreate


def title_of(item: ItemCreate) -> str:
    return item.title
