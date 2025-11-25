import json
from pathlib import Path
from typing import Optional
from app.models import Node

CACHE_FILE_NAME = "codebase_mri.json"

def get_cache_path(root_path: Path) -> Path:
    return root_path / CACHE_FILE_NAME

def save_analysis(root_path: Path, tree: Node) -> None:
    cache_path = get_cache_path(root_path)
    # with open(cache_path, "w") as f:
    #     f.write(tree.model_dump_json(indent=2, by_alias=True))
    # print(f"✅ Saved scan to {cache_path}")

def load_analysis(root_path: Path) -> Optional[Node]:
    return None

