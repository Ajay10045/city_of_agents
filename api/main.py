"""FastAPI application entry point."""

from __future__ import annotations

import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


class _Tee:
    """Write to both original stdout and a log file simultaneously."""

    def __init__(self, stream, filepath: str) -> None:
        self._stream = stream
        self._file = open(filepath, "a", buffering=1, encoding="utf-8")  # noqa: SIM115

    def write(self, data: str) -> int:
        self._stream.write(data)
        self._file.write(data)
        return len(data)

    def flush(self) -> None:
        self._stream.flush()
        self._file.flush()

    def fileno(self):
        return self._stream.fileno()

    def isatty(self):
        return False


sys.stdout = _Tee(sys.stdout, "server.log")  # type: ignore[assignment]
sys.stderr = _Tee(sys.stderr, "server.log")  # type: ignore[assignment]

from api.routes.game import router as game_router
from phone.routes import router as phone_router

app = FastAPI(
    title="City of Agents",
    description="AI-powered city governance simulation",
    version="0.4.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # dev: tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(game_router, prefix="/game", tags=["game"])
app.include_router(phone_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "version": "0.4.0"}
