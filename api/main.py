"""FastAPI application entry point."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes.game import router as game_router

app = FastAPI(
    title="City of Agents",
    description="AI-powered city governance simulation",
    version="0.4.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # dev: tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(game_router, prefix="/game", tags=["game"])


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "version": "0.4.0"}
