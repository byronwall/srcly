from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from importlib import resources
from pathlib import Path
import os
import signal
import threading

from app.routers import analysis, files, scans
from app.services.scan_workers import cancel_all_scans

_SHUTDOWN_SIGNALS = (signal.SIGINT, signal.SIGTERM)


def _install_scan_cancelling_signal_handlers() -> dict:
    """
    Chain a "cancel running scans" step in front of the server's own
    SIGINT/SIGTERM handlers.

    Uvicorn handles Ctrl+C by waiting for in-flight requests to finish. A scan
    can run for minutes, so without this the first Ctrl+C appears to do
    nothing. Cancelling scans first lets their requests end promptly and the
    normal graceful shutdown proceed. Works for `srcly` and plain `uvicorn`.
    """
    if threading.current_thread() is not threading.main_thread():
        return {}

    previous: dict = {}
    for sig in _SHUTDOWN_SIGNALS:
        prior = signal.getsignal(sig)

        def handler(signum, frame, _prior=prior):
            cancel_all_scans()
            if callable(_prior):
                _prior(signum, frame)
            else:
                # SIG_DFL / SIG_IGN: restore it and re-deliver the signal.
                signal.signal(signum, _prior)
                signal.raise_signal(signum)

        previous[sig] = prior
        signal.signal(sig, handler)
    return previous


@asynccontextmanager
async def lifespan(_app: FastAPI):
    previous = _install_scan_cancelling_signal_handlers()
    try:
        yield
    finally:
        cancel_all_scans()
        for sig, prior in previous.items():
            signal.signal(sig, prior)


app = FastAPI(
    title="Srcly Server",
    description="API for static code analysis and file serving.",
    version="1.0.0",
    lifespan=lifespan,
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
app.include_router(scans.router)


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
