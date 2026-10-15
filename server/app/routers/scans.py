"""
Scan jobs with live progress over Server-Sent Events.

    POST   /api/scans               start (or join) a scan    -> snapshot
    GET    /api/scans/{id}          current snapshot (polling fallback)
    GET    /api/scans/{id}/events   SSE stream of snapshots
    GET    /api/scans/{id}/result   analysis tree once complete
    DELETE /api/scans/{id}          cancel                    -> snapshot

SSE rather than WebSockets: progress only flows server -> client, cancel is
a plain HTTP call, and EventSource gives reconnects for free. Each stream
sends the full snapshot (not deltas), so a reconnecting client is always
consistent without replay. Snapshots are checked every ``STREAM_TICK_SECONDS``
and sent when the job's version changed (which throttles bursts), or every
``REFRESH_SECONDS`` regardless so elapsed and in-flight timers keep moving
while a slow file holds things up. The refresh doubles as a keep-alive.
"""

from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.models import Node
from app.routers import analysis as analysis_router
from app.services.scan_jobs import TERMINAL_PHASES, ScanJob, manager

router = APIRouter(prefix="/api/scans", tags=["scans"])

STREAM_TICK_SECONDS = 0.1
REFRESH_SECONDS = 1.0
CLIENT_RETRY_MS = 2000


class StartScanRequest(BaseModel):
    path: Optional[str] = None


def _job_or_404(job_id: str) -> ScanJob:
    job = manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    return job


def _sse(event: str, data: dict, event_id: Optional[int] = None) -> str:
    lines = [f"event: {event}"]
    if event_id is not None:
        lines.append(f"id: {event_id}")
    lines.append(f"data: {json.dumps(data, separators=(',', ':'))}")
    return "\n".join(lines) + "\n\n"


@router.post("", status_code=202)
def start_scan(req: StartScanRequest) -> dict:
    target = Path(req.path) if req.path else analysis_router.ROOT_PATH
    if not target.exists():
        raise HTTPException(status_code=404, detail=f"Path not found: {target}")
    return manager.start(target).snapshot()


@router.get("/{job_id}")
def get_scan(job_id: str) -> dict:
    return _job_or_404(job_id).snapshot()


@router.delete("/{job_id}")
def cancel_scan(job_id: str) -> dict:
    job = _job_or_404(job_id)
    job.cancel()
    return job.snapshot()


@router.get("/{job_id}/result", response_model=Node)
def get_scan_result(job_id: str):
    job = _job_or_404(job_id)
    if job.phase != "complete" or job.result is None:
        raise HTTPException(status_code=409, detail=f"Scan is {job.phase}, not complete")
    return job.result


@router.get("/{job_id}/events")
async def stream_scan(job_id: str, request: Request) -> StreamingResponse:
    job = _job_or_404(job_id)

    async def events():
        yield f"retry: {CLIENT_RETRY_MS}\n\n"
        sent_version = -1
        last_write = time.monotonic()
        while True:
            snapshot = job.snapshot()
            stale = time.monotonic() - last_write >= REFRESH_SECONDS
            if snapshot["version"] != sent_version or stale:
                sent_version = snapshot["version"]
                last_write = time.monotonic()
                if snapshot["phase"] in TERMINAL_PHASES:
                    yield _sse(snapshot["phase"], snapshot, sent_version)
                    return
                yield _sse("progress", snapshot, sent_version)

            if await request.is_disconnected():
                return
            await asyncio.sleep(STREAM_TICK_SECONDS)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # Disable proxy buffering (nginx and friends) so events flush immediately.
            "X-Accel-Buffering": "no",
        },
    )
