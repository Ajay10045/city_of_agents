"""Game endpoints — full game lifecycle.

All sessions are stored in-process memory (dict keyed by game_id).
For production you would persist GameSession to a database/Redis.

Endpoints:
  POST  /game/profile          — generate a city profile from a city hint
  POST  /game/new              — start a new game from a profile
  GET   /game/{id}/candidates  — list minister candidates for cabinet
  POST  /game/{id}/cabinet     — assign cabinet ministers
  POST  /game/{id}/consult     — open / message / close minister consultation
  GET   /game/{id}/policies    — generate policy options for current turn
  POST  /game/{id}/turn        — execute a full turn
  GET   /game/{id}/state       — current game snapshot
  GET   /game/{id}/scorecard   — final scorecard (game over)
"""
from __future__ import annotations

import traceback
from typing import Any

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from engine.models import CityProfile
from llm.llm_client import LLMClient
from simulation.llm_calls import generate_city_profile
from simulation.session import GameSession

router = APIRouter()

# In-process session store: game_id → GameSession
_sessions: dict[str, GameSession] = {}

# Lazy LLM client — instantiated on first use so env vars load first
_llm_instance: LLMClient | None = None


def _get_llm() -> LLMClient:
    global _llm_instance
    if _llm_instance is None:
        _llm_instance = LLMClient()
    return _llm_instance


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class CityHintRequest(BaseModel):
    city_hint: str  # e.g. "Lagos, Nigeria" or "a coastal city in Vietnam"


class NewGameRequest(BaseModel):
    city_profile: dict[str, Any]   # raw profile dict (from /game/profile or custom)
    seed: int | None = None
    challenge_mode: str = "standard"  # standard | reformist | populist | fiscal_hawk


class ConsultRequest(BaseModel):
    action: str  # "open" | "message" | "close"
    minister_id: str | None = None
    message: str | None = None
    silent: bool = False  # if True, skip opening LLM call (used for broadcast @all)


class CabinetAssignmentRequest(BaseModel):
    assignments: list[dict[str, str]]  # [{"citizen_id": str, "portfolio": str}]


class TurnRequest(BaseModel):
    policy_index: int                     # index from last /policies call
    minor_action: dict[str, Any]          # MinorAction schema dict
    counter_frame: str = "Delivery Receipts"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_session(game_id: str) -> GameSession:
    session = _sessions.get(game_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Game {game_id!r} not found")
    return session


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/profile")
def create_city_profile(req: CityHintRequest) -> dict[str, Any]:
    """Generate a city profile JSON from a text hint.

    The returned dict can be passed directly to POST /game/new.
    """
    try:
        profile_dict = generate_city_profile(_get_llm(), req.city_hint)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Profile generation failed: {exc}") from exc
    return profile_dict


@router.post("/new")
def new_game(req: NewGameRequest) -> dict[str, Any]:
    """Initialise a new game from a city profile.

    Returns the game_id and initial state snapshot.
    """
    try:
        profile_dict = dict(req.city_profile)
        # Inject challenge_mode into game_config before constructing CityProfile
        gc = dict(profile_dict.get("game_config") or {})
        gc["challenge_mode"] = req.challenge_mode
        profile_dict["game_config"] = gc
        profile = CityProfile(**profile_dict)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Invalid city profile: {exc}") from exc

    try:
        session = GameSession.start_new(_get_llm(), profile, seed=req.seed)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Game initialisation failed: {exc}") from exc

    assert session.state
    game_id = session.state.game_id
    _sessions[game_id] = session

    return {
        "game_id": game_id,
        "state": session.get_state_snapshot(),
    }


@router.get("/{game_id}/candidates")
def get_minister_candidates(game_id: str) -> dict[str, Any]:
    """Return minister candidate pool (3× minister_count) for cabinet selection."""
    session = _get_session(game_id)
    candidates = session.get_minister_candidates()
    return {"candidates": candidates}


@router.post("/{game_id}/cabinet")
def assign_cabinet(game_id: str, req: CabinetAssignmentRequest) -> dict[str, Any]:
    """Assign ministers to portfolios.

    assignments: [{"citizen_id": "abc", "portfolio": "Infrastructure"}, ...]
    """
    session = _get_session(game_id)
    try:
        session.assign_cabinet(req.assignments)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"ok": True, "ministers": session.get_state_snapshot()["ministers"]}


@router.post("/{game_id}/consult")
def consult(game_id: str, req: ConsultRequest) -> dict[str, Any]:
    """Minister consultation endpoint.

    action = "open":    req.minister_id required; returns opening statement
    action = "message": req.minister_id + req.message required; returns minister reply
    action = "close":   seals the transcript; returns sealed transcript text
    """
    session = _get_session(game_id)

    if req.action == "open":
        if not req.minister_id:
            raise HTTPException(status_code=422, detail="minister_id required for action=open")
        try:
            reply = session.open_consultation(req.minister_id, silent=req.silent)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return {"action": "open", "minister_id": req.minister_id, "reply": reply}

    elif req.action == "message":
        if not req.message:
            raise HTTPException(status_code=422, detail="message required for action=message")
        try:
            reply = session.consult_minister(req.message)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"action": "message", "reply": reply}

    elif req.action == "close":
        transcript = session.close_consultation()
        return {"action": "close", "transcript": transcript}

    else:
        raise HTTPException(status_code=422, detail=f"Unknown action {req.action!r}. Use open|message|close")


@router.get("/{game_id}/policies")
def get_policies(game_id: str) -> dict[str, Any]:
    """Generate policy options for the current turn.

    Should be called after consultation(s) for the turn.
    Returns the options and caches them in the session.
    """
    session = _get_session(game_id)
    try:
        options = session.get_policy_options()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Policy generation failed: {exc}") from exc
    return {"options": options, "turn": session.state.current_turn if session.state else None}


class AmendPolicyRequest(BaseModel):
    index: int
    transcript: str


@router.post("/{game_id}/policies/amend")
def amend_policy(game_id: str, req: AmendPolicyRequest) -> dict[str, Any]:
    """Amend a single policy option based on advisory discussion."""
    session = _get_session(game_id)
    try:
        amended = session.amend_single_policy(req.index, req.transcript)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Policy amendment failed: {exc}") from exc
    return {
        "amended_index": req.index,
        "amended_policy": amended,
        "options": session._pending_policy_options,
        "turn": session.state.current_turn if session.state else None,
    }


@router.get("/{game_id}/briefing")
def get_turn_briefing(game_id: str) -> StreamingResponse:
    """Stream situational briefing: city snapshot → headlines → chatter → policies."""
    session = _get_session(game_id)

    def _stream():
        try:
            for event in session.generate_turn_briefing_stream():
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:
            traceback.print_exc()
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(_stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/{game_id}/turn")
def execute_turn(game_id: str, req: TurnRequest) -> dict[str, Any]:
    """Execute a full turn.

    Requires:
    - GET /game/{id}/policies to have been called first this turn
    - policy_index: index into the generated options list
    - minor_action: {"type": "banking"|"maintenance"|..., "target": str|null, "budget": float}
    - counter_frame: optional counter-frame strategy name

    Returns the full TurnResult plus updated state snapshot.
    """
    session = _get_session(game_id)
    assert session.state

    # Loss check before turn executes
    loss_reason = session.check_loss()
    if loss_reason:
        session.state.phase = "game_over"
        return {
            "game_over": True,
            "loss_reason": loss_reason,
            "state": session.get_state_snapshot(),
        }

    try:
        turn_result = session.execute_turn(
            policy_index=req.policy_index,
            minor_action=req.minor_action,
            counter_frame_strategy=req.counter_frame,
        )
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Turn execution failed: {exc}") from exc

    # Post-turn loss check
    loss_reason = session.check_loss()
    if loss_reason:
        session.state.phase = "game_over"

    # End of game check (all turns exhausted)
    is_final = session.state.phase == "game_over" or (
        session.state.current_turn > session.state.city_profile.game_config.total_turns
    )

    response: dict[str, Any] = {
        "turn_result": turn_result.model_dump(),
        "state": session.get_state_snapshot(),
        "game_over": is_final,
    }
    if loss_reason:
        response["loss_reason"] = loss_reason
    if is_final:
        try:
            scorecard = session.compute_final_score()
            response["scorecard"] = scorecard.model_dump()
        except Exception:
            pass

    return response


@router.post("/{game_id}/turn/stream")
def execute_turn_stream(game_id: str, req: TurnRequest) -> StreamingResponse:
    """Execute a turn and stream milestone events as SSE.

    Events arrive as `data: <json>\\n\\n` with type:
      policy_start, implementation, events, politics,
      narrative_chunk (key=delivery|headlines|voices|advisor),
      complete, error
    """
    session = _get_session(game_id)
    assert session.state

    loss_reason = session.check_loss()
    if loss_reason:
        session.state.phase = "game_over"

        def _lost():
            yield f"data: {json.dumps({'type': 'game_over', 'loss_reason': loss_reason, 'state': session.get_state_snapshot()})}\n\n"

        return StreamingResponse(_lost(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    def _event_stream():
        try:
            for milestone in session.execute_turn_streaming(
                policy_index=req.policy_index,
                minor_action=req.minor_action,
                counter_frame_strategy=req.counter_frame,
            ):
                yield f"data: {json.dumps(milestone)}\n\n"
        except Exception as exc:
            traceback.print_exc()
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(_event_stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


class TurnRequestV2(BaseModel):
    policy_index: int
    minister_id: str
    minor_action: dict[str, Any]
    counter_frame: str = "Delivery Receipts"
    power_move: dict[str, Any] = {"type": "none"}


@router.post("/{game_id}/turn/stream/v2")
def execute_turn_stream_v2(game_id: str, req: TurnRequestV2) -> StreamingResponse:
    """Fully agentic turn — AI policy evaluation + citizen approval poll.

    Events arrive as `data: <json>\\n\\n` with type:
      announcement, announcement_voices, assignment, evaluation,
      wellbeing_update, implementation_voices, approval_vote, approval_final,
      events, narrative_chunk (key=headlines|advisor), complete, error
    """
    session = _get_session(game_id)

    loss_reason = session.check_loss()
    if loss_reason:
        def _lost():
            yield f"data: {json.dumps({'type': 'game_over', 'loss_reason': loss_reason, 'state': session.get_state_snapshot()})}\n\n"
        return StreamingResponse(_lost(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    def _event_stream():
        try:
            for milestone in session.execute_turn_agentic(
                policy_index=req.policy_index,
                minister_id=req.minister_id,
                minor_action=req.minor_action,
                counter_frame_strategy=req.counter_frame,
                power_move=req.power_move,
            ):
                yield f"data: {json.dumps(milestone)}\n\n"
        except Exception as exc:
            traceback.print_exc()
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(_event_stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


class DilemmaRequest(BaseModel):
    choice: str   # "a" or "b"


@router.post("/{game_id}/turn/dilemma")
def resolve_dilemma(game_id: str, req: DilemmaRequest) -> StreamingResponse:
    """Resolve the mid-execution dilemma and resume the turn stream.

    Returns SSE stream of remaining turn events (phases 4+).
    """
    session = _get_session(game_id)

    def _event_stream():
        try:
            for milestone in session.resume_after_dilemma(choice=req.choice):
                yield f"data: {json.dumps(milestone)}\n\n"
        except Exception as exc:
            traceback.print_exc()
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(_event_stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


class EventResponseRequest(BaseModel):
    responses: list[dict[str, Any]]  # [{event_id, strategy, minister_id?}, ...]


@router.post("/{game_id}/turn/event-response")
def resolve_event_response(game_id: str, req: EventResponseRequest) -> StreamingResponse:
    """Submit event responses and resume the turn stream.

    Returns SSE stream of remaining turn events (budget → media → complete).
    """
    session = _get_session(game_id)

    def _event_stream():
        try:
            for milestone in session.resume_after_event_response(responses=req.responses):
                yield f"data: {json.dumps(milestone)}\n\n"
        except Exception as exc:
            traceback.print_exc()
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(_event_stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


class AccountabilityRequest(BaseModel):
    action: str          # "praise" | "reprimand" | "investigate" | "skip"
    minister_id: str


@router.post("/{game_id}/turn/accountability")
def apply_accountability(game_id: str, req: AccountabilityRequest) -> dict[str, Any]:
    """Post-turn minister accountability action."""
    session = _get_session(game_id)
    try:
        result = session.apply_accountability(req.action, req.minister_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return result


@router.get("/{game_id}/state")
def get_state(game_id: str) -> dict[str, Any]:
    """Return the current game state snapshot."""
    session = _get_session(game_id)
    return session.get_state_snapshot()


@router.get("/{game_id}/history")
def get_history(game_id: str) -> dict[str, Any]:
    """Return the full turn history (for trend charts)."""
    session = _get_session(game_id)
    return {"game_id": game_id, "turns": session.get_turn_history()}


@router.get("/{game_id}/scorecard")
def get_scorecard(game_id: str) -> dict[str, Any]:
    """Return the final governance scorecard.

    Only meaningful after all turns are complete.
    """
    session = _get_session(game_id)
    assert session.state
    try:
        scorecard = session.compute_final_score()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Scorecard computation failed: {exc}") from exc
    return scorecard.model_dump()
