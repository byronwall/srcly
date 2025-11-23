from typing import List
from pydantic import BaseModel

class Metrics(BaseModel):
    loc: int = 0
    complexity: int = 0
    function_count: int = 0

class Node(BaseModel):
    name: str
    type: str  # "folder", "file", "function", "code_fragment"
    path: str
    metrics: Metrics
    children: List["Node"] = []

    model_config = {
        "populate_by_name": True
    }
