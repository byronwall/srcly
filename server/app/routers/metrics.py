from fastapi import APIRouter

from app.services.metric_catalog import catalog_payload

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


@router.get("/catalog")
def get_metric_catalog() -> dict:
    """Every metric's label, unit, group, direction, scope, languages and color stops."""
    return catalog_payload()
