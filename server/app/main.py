from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from importlib import resources
from pathlib import Path
import os

from app.routers import analysis, files

app = FastAPI(
    title="Srcly Server",
    description="API for static code analysis and file serving.",
    version="1.0.0",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for local development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(analysis.router)
app.include_router(files.router)


def _find_static_dir() -> str | None:
    """
    Locate the directory that contains the built SPA assets.

    Priority:
    1. Packaged assets under the installed `app` package (for PyPI/uvx use).
    2. Local `client/dist` folder relative to the repository layout (for dev).
    """
    # 1) Packaged assets (wheel installed)
    try:
        package_root = resources.files("app")
        static_dir = package_root / "static"
        if static_dir.is_dir():
            return os.fspath(static_dir)
    except Exception:
        # If anything goes wrong, fall back to dev lookup
        pass

    # 2) Dev layout: ../client/dist from this file
    dev_dist = (
        Path(__file__)
        .resolve()
        .parent.parent  # server/app -> server
        / ".."
        / "client"
        / "dist"
    ).resolve()
    if dev_dist.is_dir():
        return str(dev_dist)

    return None


# Serve SPA if we can find built assets
static_dir = _find_static_dir()
if static_dir:
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")


@app.get("/api-status")
async def root():
    return {
        "message": "Srcly server is running. Visit /docs for API documentation."
    }
