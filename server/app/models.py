from typing import List
from pydantic import BaseModel, Field

class Metrics(BaseModel):
    loc: int = 0
    # Cyclomatic complexity can be fractional (e.g. average complexity),
    # so we store it as a float to match the analysis values.
    complexity: float = 0.0
    function_count: int = 0
    last_modified: float = 0.0
    gitignored_count: int = 0

class Node(BaseModel):
    name: str
    type: str  # "folder", "file", "function", "code_fragment"
    path: str
    metrics: Metrics
    # Use default_factory to avoid sharing the same list across instances
    children: List["Node"] = Field(default_factory=list)

    model_config = {
        "populate_by_name": True
    }
