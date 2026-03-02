"""API routes for The Mayor's Phone game."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from llm.llm_client import LLMClient
from engine.models import CityProfile
from simulation.llm_calls import generate_city_profile
from phone.session import PhoneSession

log = logging.getLogger("phone.routes")
router = APIRouter(prefix="/api/phone", tags=["phone"])

# Active game sessions (in-memory)
_sessions: dict[str, PhoneSession] = {}


def _get_llm() -> LLMClient:
    return LLMClient()


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class NewGameRequest(BaseModel):
    city_hint: str  # e.g. "Lucknow", "Bhopal", "A mid-size city in Rajasthan"


class ResponseRequest(BaseModel):
    message_id: str
    text: str | None = None  # free-text response
    option_index: int | None = None  # secretary draft index (0-2)


class MinisterChatRequest(BaseModel):
    minister_id: str
    text: str


# ---------------------------------------------------------------------------
# Create new game
# ---------------------------------------------------------------------------


@router.post("/new")
async def new_game(req: NewGameRequest) -> dict[str, Any]:
    """Create a new Mayor's Phone game."""
    try:
        llm = _get_llm()
        profile_dict = generate_city_profile(llm, req.city_hint)
        profile = CityProfile(**profile_dict)
    except Exception as e:
        raise HTTPException(400, f"Failed to generate city: {e}")

    llm = LLMClient()
    session = PhoneSession(llm, profile)
    state = session.new_game()

    _sessions[state.game_id] = session

    # Generate Day 1 inbox
    inbox = session.end_day()

    return {
        "game_id": state.game_id,
        "city_name": profile.city_name,
        "snapshot": session.get_snapshot(),
        "inbox": [m.model_dump() for m in inbox],
        "ministers": [
            {
                "id": m.citizen.id,
                "name": m.citizen.name,
                "portfolio": m.portfolio,
                "competence": round(m.citizen.capability.competence),
            }
            for m in state.ministers
        ],
    }


# ---------------------------------------------------------------------------
# Get current inbox
# ---------------------------------------------------------------------------


@router.get("/{game_id}/inbox")
async def get_inbox(game_id: str, tab: str | None = None) -> dict[str, Any]:
    """Get current day's inbox, optionally filtered by tab."""
    session = _get_session(game_id)
    state = session.state

    messages = state.current_inbox
    if tab:
        messages = [m for m in messages if m.tab == tab]

    return {
        "day": state.current_day,
        "messages": [m.model_dump() for m in messages],
        "snapshot": session.get_snapshot(),
    }


# ---------------------------------------------------------------------------
# Respond to a message
# ---------------------------------------------------------------------------


@router.post("/{game_id}/respond")
async def respond(game_id: str, req: ResponseRequest) -> dict[str, Any]:
    """Respond to an inbox message."""
    session = _get_session(game_id)

    text = req.text or ""
    if req.option_index is not None:
        # Using secretary draft — text not needed (will be filled from option)
        text = text or "selected option"

    result = session.respond_to_message(req.message_id, text, req.option_index)

    return {
        **result,
        "snapshot": session.get_snapshot(),
    }


# ---------------------------------------------------------------------------
# End day — advance to next day
# ---------------------------------------------------------------------------


@router.post("/{game_id}/end-day")
async def end_day(game_id: str) -> dict[str, Any]:
    """End the current day and generate next day's inbox."""
    session = _get_session(game_id)
    state = session.state

    if state.phase != "playing":
        return {
            "phase": state.phase,
            "loss_reason": state.loss_reason,
            "snapshot": session.get_snapshot(),
            "inbox": [],
        }

    inbox = session.end_day()

    # Check if survey was delivered
    latest_survey = None
    if state.surveys and state.surveys[-1].day_delivered == state.current_day:
        latest_survey = state.surveys[-1].model_dump()

    return {
        "snapshot": session.get_snapshot(),
        "inbox": [m.model_dump() for m in inbox],
        "survey": latest_survey,
    }


# ---------------------------------------------------------------------------
# Request a survey
# ---------------------------------------------------------------------------


@router.post("/{game_id}/survey")
async def request_survey(game_id: str) -> dict[str, Any]:
    """Commission a citizen survey (₹20 Cr, delivered next day)."""
    session = _get_session(game_id)
    success = session.request_survey()

    if not success:
        raise HTTPException(400, "Not enough treasury for survey (₹20 Cr required)")

    return {
        "status": "Survey commissioned. Results will arrive tomorrow.",
        "snapshot": session.get_snapshot(),
    }


# ---------------------------------------------------------------------------
# Chat with a minister
# ---------------------------------------------------------------------------


@router.post("/{game_id}/minister")
async def chat_minister(game_id: str, req: MinisterChatRequest) -> dict[str, Any]:
    """Send a message to a minister."""
    session = _get_session(game_id)
    reply = session.message_minister(req.minister_id, req.text)

    return {
        "minister_id": req.minister_id,
        "reply": reply,
        "snapshot": session.get_snapshot(),
    }


# ---------------------------------------------------------------------------
# Get game state
# ---------------------------------------------------------------------------


@router.get("/{game_id}/state")
async def get_state(game_id: str) -> dict[str, Any]:
    """Get full game state snapshot."""
    session = _get_session(game_id)
    state = session.state

    return {
        "snapshot": session.get_snapshot(),
        "ministers": [
            {
                "id": m.citizen.id,
                "name": m.citizen.name,
                "portfolio": m.portfolio,
                "competence": round(m.citizen.capability.competence),
                "loyalty": round(m.state.loyalty),
            }
            for m in state.ministers
        ],
        "active_crises": [e.model_dump() for e in state.active_events],
        "active_problems": [p.model_dump() for p in state.active_problems],
        "approval_history": state.approval_history,
    }


# ---------------------------------------------------------------------------
# Get conversation thread with a citizen
# ---------------------------------------------------------------------------


@router.get("/{game_id}/thread/{citizen_id}")
async def get_thread(game_id: str, citizen_id: str) -> dict[str, Any]:
    """Get full conversation thread with a citizen."""
    session = _get_session(game_id)
    state = session.state

    if citizen_id not in state.citizen_threads:
        raise HTTPException(404, "Citizen thread not found")

    thread = state.citizen_threads[citizen_id]
    return {
        "citizen_id": citizen_id,
        "citizen_name": thread.citizen_name,
        "citizen_occupation": thread.citizen_occupation,
        "citizen_area": thread.citizen_area,
        "expression_type": thread.expression_type,
        "relationship": thread.relationship,
        "messages": [m.model_dump() for m in thread.messages],
    }


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _get_session(game_id: str) -> PhoneSession:
    if game_id not in _sessions:
        raise HTTPException(404, f"Game {game_id} not found")
    session = _sessions[game_id]
    if not session.state:
        raise HTTPException(400, "Game not initialized")
    return session
