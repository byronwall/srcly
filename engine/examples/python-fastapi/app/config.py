import os
from pathlib import Path

from app.models import Settings


def load_settings() -> Settings:
    data_dir = os.environ.get("ITEMS_DIR", "/tmp/items")
    seed = Path(data_dir, "seed.json").read_text()
    return Settings(data_dir=data_dir, seed=seed)
