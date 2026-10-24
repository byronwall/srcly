from fastapi import FastAPI

from app.routers import items

app = FastAPI()
app.include_router(items.router, prefix="/v1")
app.include_router(items.settings_router, prefix="/v1")
