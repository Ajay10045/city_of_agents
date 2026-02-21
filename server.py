from __future__ import annotations

import json
import random
import time
import uuid
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from typing import Any
from urllib.parse import parse_qs, urlparse

from agents.agent_engine import AgentEngine
from agents.identity_group import IdentityGroup
from core.advisor_session import AdvisorSession, new_advisor_session
from core.city_profile import (
    CityProfileError,
    city_profile_status,
    load_city_profile,
)
from core.city_stats import CityStats
from core.game_state import GameState
from core.turn_manager import TurnManager
from events.event_engine import EventEngine
from llm.advisor_chat import AdvisorChat
from llm.llm_client import _load_env
from media.media_engine import MediaEngine, MediaState
from politics.election_engine import ElectionEngine
from politics.policy_engine import PolicyEngine
from setup.profile_generator import CityProfileGenerator

_load_env()

ROOT = Path(__file__).resolve().parent
CONFIG_DIR = ROOT / "config"
UI_DIST_DIR = ROOT / "city_of_agents_ui" / "dist"

DEFAULT_GAME_ID = "default"
MAX_BUFFERED_EVENTS = 3000
MAX_BUFFERED_ACTION_RESULTS = 1000
ALLOWED_PARTICIPANT_ROLES = {"mayor", "opposition", "spectator"}
ALLOWED_LLM_SAMPLING_STRATEGIES = {"stratified", "uniform", "none"}

CITY_OPTIONS = [
    {"id": "new_delhi", "name": "New Delhi"},
    {"id": "new_york", "name": "New York"},
    {"id": "london", "name": "London"},
    {"id": "tokyo", "name": "Tokyo"},
    {"id": "dubai", "name": "Dubai"},
]
CITY_NAMES_BY_ID = {item["id"]: item["name"] for item in CITY_OPTIONS}

_profile_generator = CityProfileGenerator()
_advisor_chat = AdvisorChat()

SETUP_DEFAULTS: dict[str, Any] = {
    "turns_to_election": 10,
    "city_id": "new_delhi",
    "population_scale": 50_000,
    "agent_count": 5_000,
    "llm_panel_size": 500,
    "llm_sampling_strategy": "stratified",
    "llm_micro_batch_size": 20,
    "max_parallel_llm_requests": 8,
    "randomness_scale": 0.10,
}

SETUP_LIMITS: dict[str, dict[str, Any]] = {
    "turns_to_election": {"min": 3, "max": 100},
    "population_scale": {"min": 10_000, "max": 200_000},
    "agent_count": {"min": 1_000, "max": 50_000},
    "llm_panel_size": {"min": 0, "max": 5_000},
    "llm_micro_batch_size": {"min": 1, "max": 100},
    "max_parallel_llm_requests": {"min": 1, "max": 32},
    "randomness_scale": {"min": 0.0, "max": 1.0},
}


@dataclass(frozen=True)
class CachedActionResult:
    status: int
    body: dict[str, Any]


@dataclass(frozen=True)
class ActionSubmission:
    actor: str
    policy_id: str
    advisor_session_id: str | None = None
    counter_frame_id: str | None = None
    participant_id: str | None = None
    expected_turn: int | None = None
    action_id: str | None = None


@dataclass
class GameSession:
    game_id: str
    turn_manager: TurnManager
    agent_engine: AgentEngine
    setup: dict[str, Any] = field(default_factory=dict)
    events: list[dict] = field(default_factory=list)
    next_event_id: int = 1
    participants: dict[str, dict[str, str]] = field(default_factory=dict)
    action_results: dict[str, CachedActionResult] = field(default_factory=dict)
    action_order: list[str] = field(default_factory=list)
    advisor_sessions: dict[str, AdvisorSession] = field(default_factory=dict)
    advisor_session_by_turn: dict[int, str] = field(default_factory=dict)
    action_lock: object = field(default_factory=Lock, repr=False)


_sessions: dict[str, GameSession] = {}
_sessions_lock = Lock()


def _load_identity_config(payload: dict[str, Any]) -> tuple[list[IdentityGroup], dict[str, float], CityStats]:
    groups = [IdentityGroup.from_dict(item) for item in payload.get("identity_groups", [])]
    role_distribution = {
        str(role): float(weight)
        for role, weight in payload.get("role_distribution", {}).items()
    }
    initial_city_stats = CityStats(**payload.get("initial_city_stats", {}))
    return groups, role_distribution, initial_city_stats


def _build_game(
    seed: int | None = None,
    turns: int = 50,
    election_turn: int = 50,
    simulation_profile: dict[str, Any] | None = None,
) -> tuple[TurnManager, AgentEngine]:
    if seed is None:
        seed = random.SystemRandom().randrange(1, 10**9)

    rng = random.Random(seed)
    profile = dict(simulation_profile or {})
    city_id = _normalize_city_id(profile.get("city_id", SETUP_DEFAULTS["city_id"]))
    city_bundle = load_city_profile(city_id)
    profile_payload = city_bundle.payload

    identity_groups, role_distribution, city_stats = _load_identity_config(profile_payload)

    agent_engine = AgentEngine()
    target_agent_count: int | None = None
    try:
        raw_target = int(profile.get("agent_count", 0))
        if raw_target > 0:
            target_agent_count = raw_target
    except (TypeError, ValueError):
        target_agent_count = None

    agents, relationships = agent_engine.initialize_population(
        identity_groups,
        rng,
        role_distribution=role_distribution,
        representatives_per_cell=6,
        target_agent_count=target_agent_count,
    )
    meta = profile_payload.get("meta", {})
    profile["city_id"] = city_id
    profile["city_name"] = str(meta.get("city_name", CITY_NAMES_BY_ID.get(city_id, city_id)))
    profile["profile_version"] = str(meta.get("profile_version", "unknown"))
    profile["profile_generated_at"] = str(meta.get("generated_at", ""))
    profile["profile_source_path"] = str(city_bundle.source_path)
    profile["issue_front_baseline"] = dict(profile_payload.get("issue_front_baseline", {}))
    profile["starter_issues"] = list(profile_payload.get("starter_issues", []))
    profile["evidence_sources"] = list(meta.get("evidence_sources", []))
    profile["actual_agent_count"] = len(agents)

    game_state = GameState(
        turn_number=0,
        total_turns=turns,
        election_turn=election_turn,
        mayor_popularity=50.0,
        opposition_popularity=50.0,
        city_stats=city_stats,
        identity_groups={g.id: g for g in identity_groups},
        agents=agents,
        relationships=relationships,
        active_events=[],
        media_state=MediaState(),
        rng=rng,
        rng_seed=seed,
        simulation_profile=profile,
    )

    policy_engine = PolicyEngine(CONFIG_DIR / "policies.json")
    event_engine = EventEngine(CONFIG_DIR / "events.json")
    media_engine = MediaEngine()
    election_engine = ElectionEngine()

    tm = TurnManager(
        game_state=game_state,
        agent_engine=agent_engine,
        policy_engine=policy_engine,
        event_engine=event_engine,
        media_engine=media_engine,
        election_engine=election_engine,
    )
    return tm, agent_engine


def _create_session(
    seed: int | None = None,
    turns: int = 50,
    election_turn: int = 50,
    game_id: str | None = None,
    setup: dict[str, Any] | None = None,
) -> GameSession:
    tm, agent_engine = _build_game(
        seed=seed,
        turns=turns,
        election_turn=election_turn,
        simulation_profile=setup,
    )
    return GameSession(
        game_id=game_id or str(uuid.uuid4()),
        turn_manager=tm,
        agent_engine=agent_engine,
        setup=dict(setup or {}),
    )


def _set_default_session(seed: int | None = None, turns: int = 50, election_turn: int = 50) -> None:
    session = _create_session(
        seed=seed,
        turns=turns,
        election_turn=election_turn,
        game_id=DEFAULT_GAME_ID,
    )
    with _sessions_lock:
        _sessions[DEFAULT_GAME_ID] = session


def _get_session(game_id: str) -> GameSession | None:
    with _sessions_lock:
        return _sessions.get(game_id)


def _get_default_session() -> GameSession | None:
    return _get_session(DEFAULT_GAME_ID)


def _snapshot_for_session(session: GameSession) -> dict:
    with session.action_lock:
        group_metrics = session.agent_engine.group_metrics(session.turn_manager.game_state.agents)
        return session.turn_manager._build_state_snapshot(group_metrics)


def _actor_for_message(message_type: str, payload: dict) -> str | None:
    if message_type in {"mayor_action", "mayor_action_submitted", "mayor_counter_frame"}:
        return "mayor"
    if message_type in {"opposition_action", "opposition_frame_primary", "opposition_frame_followup"}:
        return "opposition"
    if message_type == "media_narrative_published":
        return "media"
    if message_type in {
        "agent_impact_assessed",
        "cohort_shift_aggregated",
        "street_chatter_synthesized",
        "simulation_stats_applied",
        "popularity_recalculated",
        "turn_closed",
    }:
        return "simulation"
    if message_type == "debate":
        debate = payload.get("debate", {})
        group_id = debate.get("group_id")
        return f"group:{group_id}" if group_id else "group"
    return None


def _append_event(session: GameSession, game_id: str, payload: dict) -> dict:
    event_type = str(payload.get("type", "unknown"))
    turn = payload.get("turn")
    if turn is None:
        turn = session.turn_manager.game_state.turn_number

    envelope = {
        "event_id": session.next_event_id,
        "game_id": game_id,
        "turn": int(turn),
        "type": event_type,
        "actor": _actor_for_message(event_type, payload),
        "timestamp": time.time(),
        "payload": payload,
    }
    session.next_event_id += 1

    session.events.append(envelope)
    if len(session.events) > MAX_BUFFERED_EVENTS:
        session.events = session.events[-MAX_BUFFERED_EVENTS:]

    return envelope


def _coerce_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _compact_event_payload(envelope: dict[str, Any]) -> dict[str, Any]:
    return {
        "event_id": int(envelope.get("event_id", 0)),
        "type": str(envelope.get("type", "unknown")),
        "actor": envelope.get("actor"),
        "timestamp": float(envelope.get("timestamp", 0.0)),
        "payload": envelope.get("payload", {}),
    }


def _build_turn_record(turn: int, events: list[dict[str, Any]]) -> dict[str, Any]:
    mayor_action: str | None = None
    opposition_action: str | None = None
    winner_fronts: list[str] = []
    key_events: list[str] = []
    media_cards: list[dict[str, Any]] = []
    done_payload: dict[str, Any] | None = None

    for envelope in events:
        payload = envelope.get("payload", {})
        if not isinstance(payload, dict):
            continue
        payload_type = str(payload.get("type", "unknown"))

        if payload_type in {"mayor_action", "mayor_action_submitted"}:
            action = payload.get("action", {})
            if isinstance(action, dict):
                candidate = action.get("name")
                if isinstance(candidate, str) and candidate.strip():
                    mayor_action = candidate

        elif payload_type in {"opposition_action", "opposition_frame_primary"}:
            action = payload.get("action", {})
            if isinstance(action, dict):
                candidate = action.get("name")
                if isinstance(candidate, str) and candidate.strip():
                    opposition_action = candidate

        elif payload_type == "agent_impact_assessed":
            summary = payload.get("summary", {})
            if isinstance(summary, dict):
                fronts = summary.get("dominant_fronts", [])
                if isinstance(fronts, list):
                    winner_fronts = [str(front) for front in fronts if str(front).strip()]

        elif payload_type == "generated_event":
            generated = payload.get("event")
            if isinstance(generated, dict):
                name = generated.get("name")
                if isinstance(name, str) and name.strip():
                    key_events.append(name)

        elif payload_type == "media_narrative_published":
            cards = payload.get("cards", [])
            if isinstance(cards, list):
                for card in cards:
                    if isinstance(card, dict):
                        media_cards.append({"turn": turn, **card})

        elif payload_type == "turn_closed":
            done_payload = payload
            key_events.extend(
                [
                    str(item)
                    for item in payload.get("key_events", [])
                    if isinstance(item, str) and item.strip()
                ]
            )

        elif payload_type == "done":
            done_payload = payload

    if done_payload:
        for event_name in done_payload.get("triggered_events", []):
            if isinstance(event_name, str) and event_name.strip():
                key_events.append(event_name)

    deduped_key_events: list[str] = []
    seen_events: set[str] = set()
    for item in key_events:
        if item in seen_events:
            continue
        seen_events.add(item)
        deduped_key_events.append(item)

    if deduped_key_events:
        headline = f"Triggered {deduped_key_events[0]}"
    elif mayor_action and opposition_action:
        headline = f"{mayor_action} vs {opposition_action}"
    elif mayor_action:
        headline = mayor_action
    else:
        headline = f"Turn {turn}"

    state_payload = {}
    if isinstance(done_payload, dict) and isinstance(done_payload.get("state"), dict):
        state_payload = done_payload.get("state", {})

    stat_changes = (
        done_payload.get("stat_changes", done_payload.get("stat_deltas", {}))
        if isinstance(done_payload, dict) and isinstance(done_payload.get("stat_changes"), dict)
        else (
            done_payload.get("stat_deltas", {})
            if isinstance(done_payload, dict) and isinstance(done_payload.get("stat_deltas"), dict)
            else {}
        )
    )

    mayor_pop = state_payload.get("mayor_popularity")
    opposition_pop = state_payload.get("opposition_popularity")

    popularity = {
        "mayor": float(mayor_pop) if isinstance(mayor_pop, (int, float)) else None,
        "opposition": float(opposition_pop) if isinstance(opposition_pop, (int, float)) else None,
    }

    return {
        "turn": turn,
        "headline": headline,
        "winner_fronts": winner_fronts,
        "event_count": len(events),
        "mayor_action": mayor_action,
        "opposition_action": opposition_action,
        "key_events": deduped_key_events,
        "in_power": state_payload.get("governing_party"),
        "stat_deltas": stat_changes,
        "popularity": popularity,
        "media_cards": media_cards,
        "events": [_compact_event_payload(envelope) for envelope in events],
    }


def _build_turn_archive(session: GameSession) -> list[dict[str, Any]]:
    events_by_turn: dict[int, list[dict[str, Any]]] = {}
    for envelope in session.events:
        turn = _coerce_int(envelope.get("turn"))
        if turn is None or turn <= 0:
            continue
        events_by_turn.setdefault(turn, []).append(envelope)

    records: list[dict[str, Any]] = []
    for turn in sorted(events_by_turn):
        turn_events = sorted(events_by_turn[turn], key=lambda item: int(item.get("event_id", 0)))
        records.append(_build_turn_record(turn, turn_events))
    return records


def _turn_summary_payload(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "turn": record["turn"],
        "headline": record.get("headline"),
        "winner_fronts": record.get("winner_fronts", []),
        "event_count": record.get("event_count", 0),
        "mayor_action": record.get("mayor_action"),
        "opposition_action": record.get("opposition_action"),
        "key_events": record.get("key_events", []),
        "in_power": record.get("in_power"),
        "popularity": record.get("popularity", {}),
    }


def _media_timeline(records: list[dict[str, Any]], since_turn: int) -> list[dict[str, Any]]:
    timeline: list[dict[str, Any]] = []
    for record in records:
        turn = int(record.get("turn", 0))
        if turn < since_turn:
            continue
        for card in record.get("media_cards", []):
            if isinstance(card, dict):
                timeline.append(card)
    timeline.sort(key=lambda item: int(item.get("turn", 0)), reverse=True)
    return timeline


def _planned_turn_number(session: GameSession) -> int:
    state = session.turn_manager.game_state
    return min(state.turn_number + 1, state.total_turns)


def _sync_mayor_option_cache(session: GameSession, options: list[Any]) -> None:
    session.turn_manager._cached_mayor_options = {str(option.id): option for option in options}


def _active_advisor_session_unlocked(session: GameSession) -> AdvisorSession:
    return _ensure_advisor_session_unlocked(session, force_refresh=False)


def _ensure_advisor_session_unlocked(
    session: GameSession,
    force_refresh: bool = False,
    guidance: str | None = None,
) -> AdvisorSession:
    turn_number = _planned_turn_number(session)
    existing_id = session.advisor_session_by_turn.get(turn_number)
    if existing_id and not force_refresh:
        existing = session.advisor_sessions.get(existing_id)
        if existing is not None:
            _sync_mayor_option_cache(session, existing.options)
            return existing

    if guidance:
        options = session.turn_manager.mayor_advisor.generate_options(
            session.turn_manager.game_state,
            guidance=guidance,
        )
    else:
        options = session.turn_manager.get_mayor_options()

    options = list(options[:5])
    advisor_session = new_advisor_session(turn_number=turn_number, options=options)
    session.advisor_sessions[advisor_session.advisor_session_id] = advisor_session
    session.advisor_session_by_turn[turn_number] = advisor_session.advisor_session_id
    _sync_mayor_option_cache(session, advisor_session.options)
    return advisor_session


def _get_advisor_session_unlocked(session: GameSession, advisor_session_id: str) -> AdvisorSession | None:
    return session.advisor_sessions.get(advisor_session_id)


def _run_turn_and_capture_events_unlocked(
    session: GameSession,
    game_id: str,
    policy_id: str,
    counter_frame_id: str | None = None,
) -> list[dict]:
    emitted: list[dict] = []
    for msg in session.turn_manager.stream_step(policy_id, counter_frame_id=counter_frame_id):
        emitted.append(_append_event(session, game_id, msg))
    return emitted


def _run_turn_and_capture_events(
    session: GameSession,
    game_id: str,
    policy_id: str,
    counter_frame_id: str | None = None,
) -> list[dict]:
    with session.action_lock:
        return _run_turn_and_capture_events_unlocked(
            session,
            game_id,
            policy_id,
            counter_frame_id=counter_frame_id,
        )


def _cache_action_result(session: GameSession, action_id: str, status: int, body: dict[str, Any]) -> None:
    if action_id in session.action_results:
        return
    session.action_results[action_id] = CachedActionResult(status=status, body=dict(body))
    session.action_order.append(action_id)
    if len(session.action_order) > MAX_BUFFERED_ACTION_RESULTS:
        evict = session.action_order[:-MAX_BUFFERED_ACTION_RESULTS]
        session.action_order = session.action_order[-MAX_BUFFERED_ACTION_RESULTS:]
        for action_key in evict:
            session.action_results.pop(action_key, None)


def _parse_action_submission(
    body: dict,
) -> tuple[ActionSubmission | None, tuple[int, str] | None]:
    actor = str(body.get("actor", "mayor")).strip().lower()
    policy_id = str(body.get("policy_id", "")).strip()
    if not policy_id:
        return None, (400, "policy_id is required")

    advisor_session_id_raw = body.get("advisor_session_id")
    advisor_session_id = (
        str(advisor_session_id_raw).strip()
        if advisor_session_id_raw is not None and str(advisor_session_id_raw).strip()
        else None
    )
    counter_frame_id_raw = body.get("counter_frame_id")
    counter_frame_id = (
        str(counter_frame_id_raw).strip()
        if counter_frame_id_raw is not None and str(counter_frame_id_raw).strip()
        else None
    )

    participant_id_raw = body.get("participant_id")
    participant_id = (
        str(participant_id_raw).strip()
        if participant_id_raw is not None and str(participant_id_raw).strip()
        else None
    )

    expected_turn_raw = body.get("expected_turn")
    expected_turn: int | None = None
    if expected_turn_raw is not None:
        try:
            expected_turn = int(expected_turn_raw)
        except (TypeError, ValueError):
            return None, (400, "expected_turn must be an integer")
        if expected_turn < 1:
            return None, (400, "expected_turn must be >= 1")

    action_id_raw = body.get("action_id")
    action_id = (
        str(action_id_raw).strip()
        if action_id_raw is not None and str(action_id_raw).strip()
        else None
    )

    return (
        ActionSubmission(
            actor=actor,
            policy_id=policy_id,
            advisor_session_id=advisor_session_id,
            counter_frame_id=counter_frame_id,
            participant_id=participant_id,
            expected_turn=expected_turn,
            action_id=action_id,
        ),
        None,
    )


def _parse_int(value: str | None, fallback: int, lower: int | None = None, upper: int | None = None) -> int:
    try:
        parsed = int(value) if value is not None else fallback
    except ValueError:
        parsed = fallback
    if lower is not None:
        parsed = max(lower, parsed)
    if upper is not None:
        parsed = min(upper, parsed)
    return parsed


def _parse_bounded_int(
    raw: Any,
    field_name: str,
    lower: int,
    upper: int,
) -> tuple[int | None, str | None]:
    try:
        parsed = int(raw)
    except (TypeError, ValueError):
        return None, f"{field_name} must be an integer"
    if parsed < lower or parsed > upper:
        return None, f"{field_name} must be between {lower} and {upper}"
    return parsed, None


def _parse_bounded_float(
    raw: Any,
    field_name: str,
    lower: float,
    upper: float,
) -> tuple[float | None, str | None]:
    try:
        parsed = float(raw)
    except (TypeError, ValueError):
        return None, f"{field_name} must be a number"
    if parsed < lower or parsed > upper:
        return None, f"{field_name} must be between {lower} and {upper}"
    return parsed, None


def _normalize_city_id(value: Any) -> str:
    return str(value).strip().lower().replace("-", "_").replace(" ", "_")


def _parse_v1_create_game_request(body: dict) -> tuple[dict[str, Any] | None, tuple[int, str] | None]:
    seed = body.get("seed")

    turns, turns_err = _parse_bounded_int(body.get("turns", 50), "turns", 1, 300)
    if turns_err is not None:
        return None, (400, turns_err)
    assert turns is not None

    if "turns_to_election" in body:
        turns_to_election, election_err = _parse_bounded_int(
            body.get("turns_to_election"),
            "turns_to_election",
            int(SETUP_LIMITS["turns_to_election"]["min"]),
            int(SETUP_LIMITS["turns_to_election"]["max"]),
        )
        if election_err is not None:
            return None, (400, election_err)
        assert turns_to_election is not None
        election_turn = min(turns_to_election, turns)
    elif "election_turn" in body:
        election_turn, election_err = _parse_bounded_int(
            body.get("election_turn"), "election_turn", 1, turns
        )
        if election_err is not None:
            return None, (400, election_err)
        assert election_turn is not None
        turns_to_election = election_turn
    else:
        turns_to_election = int(SETUP_DEFAULTS["turns_to_election"])
        election_turn = min(turns_to_election, turns)

    city_id = _normalize_city_id(body.get("city_id", SETUP_DEFAULTS["city_id"]))
    if city_id not in CITY_NAMES_BY_ID:
        allowed = ", ".join(sorted(CITY_NAMES_BY_ID))
        return None, (400, f"city_id must be one of: {allowed}")

    population_scale, population_err = _parse_bounded_int(
        body.get("population_scale", SETUP_DEFAULTS["population_scale"]),
        "population_scale",
        int(SETUP_LIMITS["population_scale"]["min"]),
        int(SETUP_LIMITS["population_scale"]["max"]),
    )
    if population_err is not None:
        return None, (400, population_err)
    assert population_scale is not None

    agent_count, agent_count_err = _parse_bounded_int(
        body.get("agent_count", SETUP_DEFAULTS["agent_count"]),
        "agent_count",
        int(SETUP_LIMITS["agent_count"]["min"]),
        int(SETUP_LIMITS["agent_count"]["max"]),
    )
    if agent_count_err is not None:
        return None, (400, agent_count_err)
    assert agent_count is not None

    sampling_strategy = str(
        body.get("llm_sampling_strategy", SETUP_DEFAULTS["llm_sampling_strategy"])
    ).strip().lower()
    if sampling_strategy not in ALLOWED_LLM_SAMPLING_STRATEGIES:
        allowed = ", ".join(sorted(ALLOWED_LLM_SAMPLING_STRATEGIES))
        return None, (400, f"llm_sampling_strategy must be one of: {allowed}")

    llm_panel_size, llm_panel_err = _parse_bounded_int(
        body.get("llm_panel_size", SETUP_DEFAULTS["llm_panel_size"]),
        "llm_panel_size",
        int(SETUP_LIMITS["llm_panel_size"]["min"]),
        int(SETUP_LIMITS["llm_panel_size"]["max"]),
    )
    if llm_panel_err is not None:
        return None, (400, llm_panel_err)
    assert llm_panel_size is not None

    if sampling_strategy == "none":
        llm_panel_size = 0
    elif llm_panel_size < 50:
        return None, (400, "llm_panel_size must be >= 50 unless llm_sampling_strategy is 'none'")

    if llm_panel_size > agent_count:
        return None, (400, "llm_panel_size must be <= agent_count")

    llm_micro_batch_size, batch_err = _parse_bounded_int(
        body.get("llm_micro_batch_size", SETUP_DEFAULTS["llm_micro_batch_size"]),
        "llm_micro_batch_size",
        int(SETUP_LIMITS["llm_micro_batch_size"]["min"]),
        int(SETUP_LIMITS["llm_micro_batch_size"]["max"]),
    )
    if batch_err is not None:
        return None, (400, batch_err)
    assert llm_micro_batch_size is not None

    max_parallel_llm_requests, parallel_err = _parse_bounded_int(
        body.get("max_parallel_llm_requests", SETUP_DEFAULTS["max_parallel_llm_requests"]),
        "max_parallel_llm_requests",
        int(SETUP_LIMITS["max_parallel_llm_requests"]["min"]),
        int(SETUP_LIMITS["max_parallel_llm_requests"]["max"]),
    )
    if parallel_err is not None:
        return None, (400, parallel_err)
    assert max_parallel_llm_requests is not None

    randomness_scale, randomness_err = _parse_bounded_float(
        body.get("randomness_scale", SETUP_DEFAULTS["randomness_scale"]),
        "randomness_scale",
        float(SETUP_LIMITS["randomness_scale"]["min"]),
        float(SETUP_LIMITS["randomness_scale"]["max"]),
    )
    if randomness_err is not None:
        return None, (400, randomness_err)
    assert randomness_scale is not None

    profile = city_profile_status(city_id)
    setup = {
        "turns_to_election": election_turn,
        "city_id": city_id,
        "city_name": CITY_NAMES_BY_ID[city_id],
        "population_scale": population_scale,
        "agent_count": agent_count,
        "llm_panel_size": llm_panel_size,
        "llm_sampling_strategy": sampling_strategy,
        "llm_micro_batch_size": llm_micro_batch_size,
        "max_parallel_llm_requests": max_parallel_llm_requests,
        "randomness_scale": round(randomness_scale, 4),
        "profile_version": profile.get("profile_version"),
        "profile_ready": bool(profile.get("profile_ready")),
        "profile_last_generated_at": profile.get("last_generated_at"),
    }

    return {
        "seed": seed,
        "turns": turns,
        "election_turn": election_turn,
        "setup": setup,
    }, None


def _setup_options_payload() -> dict[str, Any]:
    cities_with_status: list[dict[str, Any]] = []
    for city in CITY_OPTIONS:
        status = city_profile_status(city["id"])
        cities_with_status.append(
            {
                "id": city["id"],
                "name": city["name"],
                "profile_ready": bool(status.get("profile_ready")),
                "profile_version": status.get("profile_version"),
                "last_generated_at": status.get("last_generated_at"),
                "last_error": status.get("last_error"),
            }
        )

    return {
        "api_version": "v1",
        "cities": cities_with_status,
        "defaults": {
            "turns_to_election": SETUP_DEFAULTS["turns_to_election"],
            "city_id": SETUP_DEFAULTS["city_id"],
            "population_scale": SETUP_DEFAULTS["population_scale"],
            "agent_count": SETUP_DEFAULTS["agent_count"],
            "llm_panel_size": SETUP_DEFAULTS["llm_panel_size"],
            "llm_sampling_strategy": SETUP_DEFAULTS["llm_sampling_strategy"],
            "llm_micro_batch_size": SETUP_DEFAULTS["llm_micro_batch_size"],
            "max_parallel_llm_requests": SETUP_DEFAULTS["max_parallel_llm_requests"],
            "randomness_scale": SETUP_DEFAULTS["randomness_scale"],
        },
        "limits": {
            **SETUP_LIMITS,
            "llm_sampling_strategy": sorted(ALLOWED_LLM_SAMPLING_STRATEGIES),
        },
    }


def _json_response(handler: BaseHTTPRequestHandler, data: dict, status: int = 200) -> None:
    body = json.dumps(data).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(body)


def _serve_file(handler: BaseHTTPRequestHandler, path: Path) -> None:
    if not path.exists():
        handler.send_response(404)
        handler.end_headers()
        return
    suffix = path.suffix.lower()
    content_types = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css",
        ".js": "application/javascript",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".ico": "image/x-icon",
    }
    ct = content_types.get(suffix, "application/octet-stream")
    body = path.read_bytes()
    handler.send_response(200)
    handler.send_header("Content-Type", ct)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class GameHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        pass

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        path = self.path.split("?")[0]

        if path == "/" or path == "/index.html":
            if not (UI_DIST_DIR / "index.html").exists():
                _json_response(
                    self,
                    {
                        "error": "UI build not found. Run `npm run build` in city_of_agents_ui first."
                    },
                    503,
                )
                return
            _serve_file(self, UI_DIST_DIR / "index.html")
            return

        if path.startswith("/assets/"):
            _serve_file(self, UI_DIST_DIR / path[len("/"):])
            return

        if path == "/api/state":
            self._handle_state()
            return
        if path == "/api/policies":
            self._handle_policies()
            return
        if path == "/api/turn-stream":
            self._handle_turn_stream()
            return

        if self._handle_v1_get(path):
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self) -> None:
        path = self.path.split("?")[0]
        length = int(self.headers.get("Content-Length", 0))

        try:
            body = json.loads(self.rfile.read(length)) if length else {}
        except json.JSONDecodeError:
            _json_response(self, {"error": "Invalid JSON body"}, 400)
            return

        if path == "/api/turn":
            self._handle_turn(body)
            return
        if path == "/api/new-game":
            self._handle_new_game(body)
            return

        if self._handle_v1_post(path, body):
            return

        self.send_response(404)
        self.end_headers()

    # ---- Legacy /api endpoints kept for UI compatibility ----

    def _handle_state(self) -> None:
        session = _get_default_session()
        if session is None:
            _json_response(self, {"error": "No game initialised"}, 500)
            return
        _json_response(self, _snapshot_for_session(session))

    def _handle_policies(self) -> None:
        session = _get_default_session()
        if session is None:
            _json_response(self, {"error": "No game initialised"}, 500)
            return
        try:
            with session.action_lock:
                advisor_session = _ensure_advisor_session_unlocked(session, force_refresh=False)
                options = advisor_session.options
        except Exception as exc:
            _json_response(self, {"error": "Failed to generate policies", "detail": str(exc)}, 500)
            return
        _json_response(self, {"policies": [p.to_dict() for p in options]})

    def _handle_turn(self, body: dict) -> None:
        session = _get_default_session()
        if session is None:
            _json_response(self, {"error": "No game initialised"}, 500)
            return

        policy_id = body.get("policy_id", "")
        if not policy_id:
            _json_response(self, {"error": "policy_id is required"}, 400)
            return

        try:
            with session.action_lock:
                result = session.turn_manager.step(policy_id)
        except Exception as exc:
            _json_response(self, {"error": "Turn failed", "detail": str(exc)}, 500)
            return
        if isinstance(result, dict) and "error" in result:
            _json_response(self, result, 400)
            return

        _json_response(self, result)

    def _handle_turn_stream(self) -> None:
        session = _get_default_session()
        if session is None:
            _json_response(self, {"error": "No game initialised"}, 500)
            return

        qs = parse_qs(urlparse(self.path).query)
        policy_id = qs.get("policy_id", [""])[0]
        if not policy_id:
            _json_response(self, {"error": "policy_id is required"}, 400)
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        try:
            with session.action_lock:
                for event in session.turn_manager.stream_step(policy_id):
                    msg = f"data: {json.dumps(event)}\n\n"
                    self.wfile.write(msg.encode("utf-8"))
                    self.wfile.flush()
        except Exception as exc:
            err = f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
            self.wfile.write(err.encode("utf-8"))
            self.wfile.flush()

    def _handle_new_game(self, body: dict) -> None:
        seed = body.get("seed")
        turns = _parse_int(str(body.get("turns", 50)), 50, lower=1, upper=300)
        election_turn = _parse_int(str(body.get("election_turn", turns)), turns, lower=1, upper=turns)

        _set_default_session(seed=seed, turns=turns, election_turn=election_turn)
        session = _get_default_session()
        if session is None:
            _json_response(self, {"error": "Failed to initialize game"}, 500)
            return

        _json_response(self, {"status": "ok", "state": _snapshot_for_session(session)})

    # ---- Versioned /v1 contract ----

    def _handle_v1_get(self, path: str) -> bool:
        parts = [part for part in path.strip("/").split("/") if part]
        if len(parts) == 3 and parts[0] == "v1" and parts[1] == "setup" and parts[2] == "options":
            self._handle_v1_setup_options()
            return True

        if (
            len(parts) == 5
            and parts[0] == "v1"
            and parts[1] == "setup"
            and parts[2] == "cities"
            and parts[4] == "status"
        ):
            self._handle_v1_setup_city_status(parts[3])
            return True

        if (
            len(parts) == 5
            and parts[0] == "v1"
            and parts[1] == "setup"
            and parts[2] == "cities"
            and parts[4] == "profile"
        ):
            self._handle_v1_setup_city_profile(parts[3])
            return True

        if len(parts) < 2 or parts[0] != "v1" or parts[1] != "games":
            return False

        if len(parts) == 4 and parts[3] == "state":
            self._handle_v1_state(parts[2])
            return True

        if len(parts) == 4 and parts[3] == "policies":
            self._handle_v1_policies(parts[2])
            return True

        if len(parts) == 4 and parts[3] == "counter-frames":
            self._handle_v1_counter_frames(parts[2])
            return True

        if len(parts) == 4 and parts[3] == "events":
            self._handle_v1_events(parts[2])
            return True

        if len(parts) == 4 and parts[3] == "turns":
            self._handle_v1_turns(parts[2])
            return True

        if len(parts) == 5 and parts[3] == "turns":
            self._handle_v1_turn_detail(parts[2], parts[4])
            return True

        if len(parts) == 4 and parts[3] == "media":
            self._handle_v1_media(parts[2])
            return True

        if len(parts) == 6 and parts[3] == "advisor" and parts[4] == "sessions":
            self._handle_v1_advisor_session_get(parts[2], parts[5])
            return True

        return False

    def _handle_v1_post(self, path: str, body: dict) -> bool:
        parts = [part for part in path.strip("/").split("/") if part]
        if (
            len(parts) == 5
            and parts[0] == "v1"
            and parts[1] == "setup"
            and parts[2] == "cities"
            and parts[4] == "generate"
        ):
            self._handle_v1_setup_city_generate(parts[3], body)
            return True

        if len(parts) == 2 and parts[0] == "v1" and parts[1] == "games":
            self._handle_v1_create_game(body)
            return True

        if len(parts) < 2 or parts[0] != "v1" or parts[1] != "games":
            return False

        if len(parts) == 4 and parts[3] == "join":
            self._handle_v1_join(parts[2], body)
            return True

        if len(parts) == 4 and parts[3] == "actions":
            self._handle_v1_actions(parts[2], body)
            return True

        if len(parts) == 5 and parts[3] == "advisor" and parts[4] == "sessions":
            self._handle_v1_advisor_session_create(parts[2], body)
            return True

        if (
            len(parts) == 7
            and parts[3] == "advisor"
            and parts[4] == "sessions"
            and parts[6] == "messages"
        ):
            self._handle_v1_advisor_session_message(parts[2], parts[5], body)
            return True

        if (
            len(parts) == 7
            and parts[3] == "advisor"
            and parts[4] == "sessions"
            and parts[6] == "revise"
        ):
            self._handle_v1_advisor_session_revise(parts[2], parts[5], body)
            return True

        return False

    def _handle_v1_create_game(self, body: dict) -> None:
        parsed, parse_error = _parse_v1_create_game_request(body)
        if parse_error is not None:
            status, message = parse_error
            _json_response(self, {"api_version": "v1", "error": message}, status)
            return

        if parsed is None:
            _json_response(self, {"api_version": "v1", "error": "Invalid game setup payload"}, 400)
            return

        try:
            session = _create_session(
                seed=parsed["seed"],
                turns=parsed["turns"],
                election_turn=parsed["election_turn"],
                setup=parsed["setup"],
            )
        except CityProfileError as exc:
            _json_response(
                self,
                {
                    "api_version": "v1",
                    "error": "City profile unavailable",
                    "detail": str(exc),
                    "city_id": parsed["setup"].get("city_id"),
                    "hint": "Run POST /v1/setup/cities/{city_id}/generate first.",
                },
                status=400,
            )
            return
        except Exception as exc:
            _json_response(
                self,
                {
                    "api_version": "v1",
                    "error": "Failed to initialize game",
                    "detail": str(exc),
                },
                status=500,
            )
            return
        with _sessions_lock:
            _sessions[session.game_id] = session

        _json_response(
            self,
            {
                "api_version": "v1",
                "game_id": session.game_id,
                "setup": dict(session.setup),
                "state": _snapshot_for_session(session),
            },
            status=201,
        )

    def _handle_v1_setup_options(self) -> None:
        _json_response(self, _setup_options_payload())

    def _handle_v1_setup_city_status(self, city_id: str) -> None:
        normalized = _normalize_city_id(city_id)
        if normalized not in CITY_NAMES_BY_ID:
            _json_response(
                self,
                {
                    "api_version": "v1",
                    "error": f"city_id must be one of: {', '.join(sorted(CITY_NAMES_BY_ID))}",
                },
                400,
            )
            return
        status = _profile_generator.get_status(normalized)
        _json_response(
            self,
            {
                "api_version": "v1",
                **status,
            },
        )

    def _handle_v1_setup_city_profile(self, city_id: str) -> None:
        normalized = _normalize_city_id(city_id)
        if normalized not in CITY_NAMES_BY_ID:
            _json_response(
                self,
                {
                    "api_version": "v1",
                    "error": f"city_id must be one of: {', '.join(sorted(CITY_NAMES_BY_ID))}",
                },
                400,
            )
            return
        try:
            profile = _profile_generator.get_profile(normalized)
        except Exception as exc:
            _json_response(
                self,
                {
                    "api_version": "v1",
                    "city_id": normalized,
                    "error": str(exc),
                },
                404,
            )
            return
        _json_response(
            self,
            {
                "api_version": "v1",
                "city_id": normalized,
                "profile": profile,
            },
        )

    def _handle_v1_setup_city_generate(self, city_id: str, body: dict) -> None:
        normalized = _normalize_city_id(city_id)
        if normalized not in CITY_NAMES_BY_ID:
            _json_response(
                self,
                {
                    "api_version": "v1",
                    "error": f"city_id must be one of: {', '.join(sorted(CITY_NAMES_BY_ID))}",
                },
                400,
            )
            return

        force_refresh = bool(body.get("force_refresh", False))
        provider = body.get("provider")
        model = body.get("model")
        research_mode = body.get("research_mode")
        result = _profile_generator.generate(
            city_id=normalized,
            force_refresh=force_refresh,
            provider=str(provider) if provider else None,
            model=str(model) if model else None,
            research_mode=str(research_mode) if research_mode else None,
        )

        code = 200 if result.status in {"generated", "cached"} else 500
        _json_response(
            self,
            {
                "api_version": "v1",
                **result.to_dict(),
            },
            code,
        )

    def _handle_v1_state(self, game_id: str) -> None:
        session = _get_session(game_id)
        if session is None:
            _json_response(self, {"error": f"Unknown game_id: {game_id}"}, 404)
            return
        _json_response(
            self,
            {
                "api_version": "v1",
                "game_id": game_id,
                "setup": dict(session.setup),
                "state": _snapshot_for_session(session),
            },
        )

    def _handle_v1_policies(self, game_id: str) -> None:
        session = _get_session(game_id)
        if session is None:
            _json_response(self, {"error": f"Unknown game_id: {game_id}"}, 404)
            return
        try:
            with session.action_lock:
                advisor_session = _ensure_advisor_session_unlocked(session, force_refresh=False)
                options = list(advisor_session.options)
        except Exception as exc:
            _json_response(
                self,
                {
                    "api_version": "v1",
                    "game_id": game_id,
                    "error": "Failed to generate policies",
                    "detail": str(exc),
                },
                500,
            )
            return
        _json_response(
            self,
            {
                "api_version": "v1",
                "game_id": game_id,
                "advisor_session_id": advisor_session.advisor_session_id,
                "turn_number": advisor_session.turn_number,
                "policies": [p.to_dict() for p in options],
            },
        )

    def _handle_v1_counter_frames(self, game_id: str) -> None:
        session = _get_session(game_id)
        if session is None:
            _json_response(self, {"error": f"Unknown game_id: {game_id}"}, 404)
            return

        qs = parse_qs(urlparse(self.path).query)
        policy_id = str(qs.get("policy_id", [""])[0]).strip()
        if not policy_id:
            _json_response(
                self,
                {
                    "api_version": "v1",
                    "game_id": game_id,
                    "error": "policy_id is required",
                },
                400,
            )
            return

        with session.action_lock:
            active_session = _active_advisor_session_unlocked(session)
            active_option_ids = {option.id for option in active_session.options}
            if policy_id not in active_option_ids:
                _json_response(
                    self,
                    {
                        "api_version": "v1",
                        "game_id": game_id,
                        "error": "policy_id is not in the current option set",
                        "policy_id": policy_id,
                        "active_advisor_session_id": active_session.advisor_session_id,
                        "active_options": [
                            {"id": option.id, "name": option.name}
                            for option in active_session.options
                        ],
                    },
                    409,
                )
                return
            options = session.turn_manager.get_counter_frame_options(policy_id)

        _json_response(
            self,
            {
                "api_version": "v1",
                "game_id": game_id,
                "policy_id": policy_id,
                "counter_frames": options,
            },
        )

    def _handle_v1_advisor_session_create(self, game_id: str, body: dict) -> None:
        session = _get_session(game_id)
        if session is None:
            _json_response(self, {"error": f"Unknown game_id: {game_id}"}, 404)
            return

        force_refresh = bool(body.get("force_refresh", False))
        guidance = str(body.get("constraints", "")).strip() or None

        try:
            with session.action_lock:
                advisor_session = _ensure_advisor_session_unlocked(
                    session,
                    force_refresh=force_refresh,
                    guidance=guidance,
                )
                payload = advisor_session.to_dict()
        except Exception as exc:
            _json_response(
                self,
                {
                    "api_version": "v1",
                    "game_id": game_id,
                    "error": "Failed to create advisor session",
                    "detail": str(exc),
                },
                500,
            )
            return

        _json_response(
            self,
            {
                "api_version": "v1",
                "game_id": game_id,
                "session": payload,
            },
            201 if force_refresh else 200,
        )

    def _handle_v1_advisor_session_get(self, game_id: str, advisor_session_id: str) -> None:
        session = _get_session(game_id)
        if session is None:
            _json_response(self, {"error": f"Unknown game_id: {game_id}"}, 404)
            return

        with session.action_lock:
            advisor_session = _get_advisor_session_unlocked(session, advisor_session_id)
            if advisor_session is None:
                _json_response(
                    self,
                    {
                        "api_version": "v1",
                        "game_id": game_id,
                        "error": f"Unknown advisor_session_id: {advisor_session_id}",
                    },
                    404,
                )
                return
            payload = advisor_session.to_dict()

        _json_response(
            self,
            {
                "api_version": "v1",
                "game_id": game_id,
                "session": payload,
            },
        )

    def _handle_v1_advisor_session_message(
        self,
        game_id: str,
        advisor_session_id: str,
        body: dict,
    ) -> None:
        session = _get_session(game_id)
        if session is None:
            _json_response(self, {"error": f"Unknown game_id: {game_id}"}, 404)
            return

        thread_scope = str(body.get("thread_scope", "global")).strip().lower()
        if thread_scope not in {"global", "option"}:
            _json_response(
                self,
                {
                    "api_version": "v1",
                    "game_id": game_id,
                    "error": "thread_scope must be 'global' or 'option'",
                },
                400,
            )
            return

        option_id = body.get("option_id")
        option_id = str(option_id).strip() if option_id is not None else None
        if thread_scope == "option" and not option_id:
            _json_response(
                self,
                {
                    "api_version": "v1",
                    "game_id": game_id,
                    "error": "option_id is required when thread_scope='option'",
                },
                400,
            )
            return

        question = str(body.get("question", "")).strip()
        if not question:
            _json_response(
                self,
                {
                    "api_version": "v1",
                    "game_id": game_id,
                    "error": "question is required",
                },
                400,
            )
            return

        try:
            with session.action_lock:
                advisor_session = _get_advisor_session_unlocked(session, advisor_session_id)
                if advisor_session is None:
                    _json_response(
                        self,
                        {
                            "api_version": "v1",
                            "game_id": game_id,
                            "error": f"Unknown advisor_session_id: {advisor_session_id}",
                        },
                        404,
                    )
                    return

                active_advisor_session = _active_advisor_session_unlocked(session)
                if advisor_session.advisor_session_id != active_advisor_session.advisor_session_id:
                    _json_response(
                        self,
                        {
                            "api_version": "v1",
                            "game_id": game_id,
                            "error": "advisor session is stale for the current turn",
                            "provided_advisor_session_id": advisor_session.advisor_session_id,
                            "active_advisor_session_id": active_advisor_session.advisor_session_id,
                            "active_turn_number": active_advisor_session.turn_number,
                        },
                        409,
                    )
                    return

                if thread_scope == "option" and option_id not in {o.id for o in advisor_session.options}:
                    _json_response(
                        self,
                        {
                            "api_version": "v1",
                            "game_id": game_id,
                            "error": f"option_id not found in session: {option_id}",
                        },
                        400,
                    )
                    return

                if thread_scope == "option":
                    history = [
                        message.to_dict()
                        for message in advisor_session.option_threads.get(option_id or "", [])
                    ]
                else:
                    history = [message.to_dict() for message in advisor_session.global_thread]

                advisor_session.append_message(
                    role="user",
                    content=question,
                    thread_scope=thread_scope,
                    option_id=option_id,
                )

                answer = _advisor_chat.answer_question(
                    game_state=session.turn_manager.game_state,
                    options=advisor_session.options,
                    thread_scope=thread_scope,
                    option_id=option_id,
                    question=question,
                    history=history,
                )

                structured = answer.answer if isinstance(answer.answer, dict) else {}
                summary = str(structured.get("summary", "")).strip()
                if not summary:
                    summary = "Advisor response generated."

                advisor_session.append_message(
                    role="advisor",
                    content=summary,
                    thread_scope=thread_scope,
                    option_id=option_id,
                    structured=structured,
                )
                payload = advisor_session.to_dict()
        except Exception as exc:
            _json_response(
                self,
                {
                    "api_version": "v1",
                    "game_id": game_id,
                    "error": "Advisor message failed",
                    "detail": str(exc),
                },
                500,
            )
            return

        _json_response(
            self,
            {
                "api_version": "v1",
                "game_id": game_id,
                "session": payload,
                **answer.to_dict(),
            },
        )

    def _handle_v1_advisor_session_revise(
        self,
        game_id: str,
        advisor_session_id: str,
        body: dict,
    ) -> None:
        session = _get_session(game_id)
        if session is None:
            _json_response(self, {"error": f"Unknown game_id: {game_id}"}, 404)
            return

        mode = str(body.get("mode", "full")).strip().lower()
        if mode not in {"single", "full"}:
            _json_response(
                self,
                {
                    "api_version": "v1",
                    "game_id": game_id,
                    "error": "mode must be 'single' or 'full'",
                },
                400,
            )
            return

        option_id_raw = body.get("option_id")
        option_id = str(option_id_raw).strip() if option_id_raw is not None else None
        if mode == "single" and not option_id:
            _json_response(
                self,
                {
                    "api_version": "v1",
                    "game_id": game_id,
                    "error": "option_id is required when mode='single'",
                },
                400,
            )
            return

        constraints = str(body.get("constraints", "")).strip()

        try:
            with session.action_lock:
                advisor_session = _get_advisor_session_unlocked(session, advisor_session_id)
                if advisor_session is None:
                    _json_response(
                        self,
                        {
                            "api_version": "v1",
                            "game_id": game_id,
                            "error": f"Unknown advisor_session_id: {advisor_session_id}",
                        },
                        404,
                    )
                    return

                active_advisor_session = _active_advisor_session_unlocked(session)
                if advisor_session.advisor_session_id != active_advisor_session.advisor_session_id:
                    _json_response(
                        self,
                        {
                            "api_version": "v1",
                            "game_id": game_id,
                            "error": "advisor session is stale for the current turn",
                            "provided_advisor_session_id": advisor_session.advisor_session_id,
                            "active_advisor_session_id": active_advisor_session.advisor_session_id,
                            "active_turn_number": active_advisor_session.turn_number,
                        },
                        409,
                    )
                    return

                updated_options, diff = _advisor_chat.revise_options(
                    game_state=session.turn_manager.game_state,
                    current_options=advisor_session.options,
                    mayor_advisor=session.turn_manager.mayor_advisor,
                    mode=mode,
                    constraints=constraints,
                    option_id=option_id,
                )
                advisor_session.options = list(updated_options[:5])
                advisor_session.ensure_option_threads()
                diff_message = str(diff.get("message", "Options revised")).strip() or "Options revised."
                mode_label = "single-option revision" if mode == "single" else "full regeneration"
                constraint_label = constraints if constraints else "no explicit constraints provided"
                changed_count = int(diff.get("changed_count", 0))
                summary = (
                    f"{diff_message} ({mode_label}; changed {changed_count} option(s); "
                    f"constraints: {constraint_label})."
                )
                thread_scope = "option" if mode == "single" and option_id else "global"
                thread_option_id = option_id if thread_scope == "option" else None
                advisor_session.append_message(
                    role="advisor",
                    content=summary,
                    thread_scope=thread_scope,
                    option_id=thread_option_id,
                    structured={
                        "summary": summary,
                        "drivers": [f"Revision mode: {mode_label}"],
                        "assumptions": [constraint_label],
                        "tradeoffs": [
                            "Revision quality depends on available policy headroom and model reliability."
                        ],
                        "risk": "Over-constrained revisions can reduce option diversity.",
                        "confidence": 0.62,
                    },
                )
                advisor_session.updated_at = time.time()
                _sync_mayor_option_cache(session, advisor_session.options)
                payload = advisor_session.to_dict()
        except Exception as exc:
            _json_response(
                self,
                {
                    "api_version": "v1",
                    "game_id": game_id,
                    "error": "Advisor revise failed",
                    "detail": str(exc),
                },
                500,
            )
            return

        _json_response(
            self,
            {
                "api_version": "v1",
                "game_id": game_id,
                "session": payload,
                "options": [option.to_dict() for option in advisor_session.options],
                "diff_summary": diff,
            },
        )

    def _handle_v1_join(self, game_id: str, body: dict) -> None:
        session = _get_session(game_id)
        if session is None:
            _json_response(self, {"error": f"Unknown game_id: {game_id}"}, 404)
            return

        role = str(body.get("role", "spectator")).strip().lower()
        if role not in ALLOWED_PARTICIPANT_ROLES:
            _json_response(
                self,
                {
                    "api_version": "v1",
                    "game_id": game_id,
                    "error": f"role must be one of {sorted(ALLOWED_PARTICIPANT_ROLES)}",
                },
                400,
            )
            return
        player_name = str(body.get("player_name", "player"))
        participant_id = str(uuid.uuid4())
        with session.action_lock:
            session.participants[participant_id] = {
                "role": role,
                "player_name": player_name,
            }

        _json_response(
            self,
            {
                "api_version": "v1",
                "game_id": game_id,
                "participant_id": participant_id,
                "role": role,
                "player_name": player_name,
                "status": "joined",
            },
            status=201,
        )

    def _handle_v1_actions(self, game_id: str, body: dict) -> None:
        session = _get_session(game_id)
        if session is None:
            _json_response(self, {"error": f"Unknown game_id: {game_id}"}, 404)
            return

        submission, parse_error = _parse_action_submission(body)
        if parse_error is not None:
            status, message = parse_error
            _json_response(
                self,
                {
                    "api_version": "v1",
                    "game_id": game_id,
                    "error": message,
                },
                status,
            )
            return

        if submission is None:
            _json_response(
                self,
                {"api_version": "v1", "game_id": game_id, "error": "Invalid action payload"},
                400,
            )
            return

        try:
            with session.action_lock:
                if submission.action_id:
                    cached = session.action_results.get(submission.action_id)
                    if cached is not None:
                        replay = dict(cached.body)
                        replay["idempotent_replay"] = True
                        _json_response(self, replay, cached.status)
                        return

                if submission.participant_id is not None:
                    participant = session.participants.get(submission.participant_id)
                    if participant is None:
                        _json_response(
                            self,
                            {
                                "api_version": "v1",
                                "game_id": game_id,
                                "error": "Unknown participant_id",
                            },
                            403,
                        )
                        return
                    if participant.get("role") != submission.actor:
                        _json_response(
                            self,
                            {
                                "api_version": "v1",
                                "game_id": game_id,
                                "error": "participant role is not allowed to act as this actor",
                            },
                            403,
                        )
                        return

                if submission.actor != "mayor":
                    _json_response(
                        self,
                        {
                            "api_version": "v1",
                            "game_id": game_id,
                            "error": "Only mayor actions are supported in v1 MVP",
                        },
                        400,
                    )
                    return

                current_turn = session.turn_manager.game_state.turn_number
                next_expected_turn = current_turn + 1
                if (
                    submission.expected_turn is not None
                    and submission.expected_turn != next_expected_turn
                ):
                    conflict = {
                        "api_version": "v1",
                        "game_id": game_id,
                        "error": "turn mismatch",
                        "current_turn": current_turn,
                        "expected_turn": next_expected_turn,
                        "provided_expected_turn": submission.expected_turn,
                    }
                    if submission.action_id:
                        _cache_action_result(session, submission.action_id, 409, conflict)
                    _json_response(self, conflict, 409)
                    return

                active_advisor_session = _active_advisor_session_unlocked(session)
                active_session_id = active_advisor_session.advisor_session_id
                if (
                    submission.advisor_session_id is not None
                    and submission.advisor_session_id != active_session_id
                ):
                    conflict = {
                        "api_version": "v1",
                        "game_id": game_id,
                        "error": "advisor session mismatch; refresh policies before playing this turn",
                        "provided_advisor_session_id": submission.advisor_session_id,
                        "active_advisor_session_id": active_session_id,
                        "expected_turn": active_advisor_session.turn_number,
                    }
                    if submission.action_id:
                        _cache_action_result(session, submission.action_id, 409, conflict)
                    _json_response(self, conflict, 409)
                    return

                active_option_ids = {option.id for option in active_advisor_session.options}
                if submission.policy_id not in active_option_ids:
                    conflict = {
                        "api_version": "v1",
                        "game_id": game_id,
                        "error": "policy_id is not in the current option set; refresh policies and reselect",
                        "policy_id": submission.policy_id,
                        "active_advisor_session_id": active_session_id,
                        "expected_turn": active_advisor_session.turn_number,
                        "active_options": [
                            {"id": option.id, "name": option.name}
                            for option in active_advisor_session.options
                        ],
                    }
                    if submission.action_id:
                        _cache_action_result(session, submission.action_id, 409, conflict)
                    _json_response(self, conflict, 409)
                    return

                if submission.counter_frame_id:
                    available_counter_frames = session.turn_manager.get_counter_frame_options(
                        submission.policy_id
                    )
                    available_ids = {str(item.get("id", "")) for item in available_counter_frames}
                    if submission.counter_frame_id not in available_ids:
                        conflict = {
                            "api_version": "v1",
                            "game_id": game_id,
                            "error": "counter_frame_id is not valid for this policy",
                            "policy_id": submission.policy_id,
                            "counter_frame_id": submission.counter_frame_id,
                            "available_counter_frames": available_counter_frames,
                        }
                        if submission.action_id:
                            _cache_action_result(session, submission.action_id, 409, conflict)
                        _json_response(self, conflict, 409)
                        return

                _sync_mayor_option_cache(session, active_advisor_session.options)
                events = _run_turn_and_capture_events_unlocked(
                    session,
                    game_id,
                    submission.policy_id,
                    counter_frame_id=submission.counter_frame_id,
                )
                if events and events[-1]["type"] == "error":
                    error_body = {
                        "api_version": "v1",
                        "game_id": game_id,
                        "error": events[-1]["payload"].get("message", "action failed"),
                    }
                    if submission.action_id:
                        _cache_action_result(session, submission.action_id, 400, error_body)
                    _json_response(self, error_body, 400)
                    return

                last_event_id = events[-1]["event_id"] if events else session.next_event_id - 1
                accepted = {
                    "api_version": "v1",
                    "game_id": game_id,
                    "status": "accepted",
                    "actor": submission.actor,
                    "turn_number": session.turn_manager.game_state.turn_number,
                    "events_emitted": len(events),
                    "last_event_id": last_event_id,
                    "counter_frame_id": submission.counter_frame_id,
                    "action_id": submission.action_id,
                    "idempotent_replay": False,
                }
                if submission.action_id:
                    _cache_action_result(session, submission.action_id, 202, accepted)
                _json_response(self, accepted, status=202)
        except Exception as exc:
            _json_response(
                self,
                {
                    "api_version": "v1",
                    "game_id": game_id,
                    "error": "Action execution failed",
                    "detail": str(exc),
                },
                500,
            )

    def _handle_v1_events(self, game_id: str) -> None:
        session = _get_session(game_id)
        if session is None:
            _json_response(self, {"error": f"Unknown game_id: {game_id}"}, 404)
            return

        qs = parse_qs(urlparse(self.path).query)
        after_event_id = _parse_int(qs.get("after_event_id", ["0"])[0], 0, lower=0)
        follow = qs.get("follow", ["0"])[0].lower() in {"1", "true", "yes"}
        timeout_seconds = _parse_int(qs.get("timeout", ["30"])[0], 30, lower=1, upper=120)

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        last_seen = after_event_id
        deadline = time.time() + timeout_seconds

        try:
            while True:
                with session.action_lock:
                    pending = [event for event in session.events if int(event["event_id"]) > last_seen]

                for event in pending:
                    msg = f"data: {json.dumps(event)}\n\n"
                    self.wfile.write(msg.encode("utf-8"))
                    self.wfile.flush()
                    last_seen = int(event["event_id"])

                if not follow:
                    break
                if time.time() >= deadline:
                    break

                time.sleep(0.25)
        except Exception:
            pass

    def _handle_v1_turns(self, game_id: str) -> None:
        session = _get_session(game_id)
        if session is None:
            _json_response(self, {"error": f"Unknown game_id: {game_id}"}, 404)
            return

        qs = parse_qs(urlparse(self.path).query)
        limit = _parse_int(qs.get("limit", ["50"])[0], 50, lower=1, upper=200)

        with session.action_lock:
            records = _build_turn_archive(session)

        summaries = [_turn_summary_payload(record) for record in reversed(records)]
        _json_response(
            self,
            {
                "api_version": "v1",
                "game_id": game_id,
                "turns": summaries[:limit],
            },
        )

    def _handle_v1_turn_detail(self, game_id: str, turn_raw: str) -> None:
        session = _get_session(game_id)
        if session is None:
            _json_response(self, {"error": f"Unknown game_id: {game_id}"}, 404)
            return

        turn_number = _coerce_int(turn_raw)
        if turn_number is None or turn_number <= 0:
            _json_response(
                self,
                {
                    "api_version": "v1",
                    "game_id": game_id,
                    "error": "turn must be a positive integer",
                },
                400,
            )
            return

        with session.action_lock:
            records = _build_turn_archive(session)

        selected = next((record for record in records if int(record.get("turn", 0)) == turn_number), None)
        if selected is None:
            _json_response(
                self,
                {
                    "api_version": "v1",
                    "game_id": game_id,
                    "error": f"turn {turn_number} not found",
                },
                404,
            )
            return

        _json_response(
            self,
            {
                "api_version": "v1",
                "game_id": game_id,
                "turn": selected,
            },
        )

    def _handle_v1_media(self, game_id: str) -> None:
        session = _get_session(game_id)
        if session is None:
            _json_response(self, {"error": f"Unknown game_id: {game_id}"}, 404)
            return

        qs = parse_qs(urlparse(self.path).query)
        since_turn = _parse_int(qs.get("since_turn", ["0"])[0], 0, lower=0, upper=1000)

        with session.action_lock:
            records = _build_turn_archive(session)

        _json_response(
            self,
            {
                "api_version": "v1",
                "game_id": game_id,
                "since_turn": since_turn,
                "media": _media_timeline(records, since_turn),
            },
        )


def main() -> None:
    _set_default_session()
    port = 8000
    server = ThreadingHTTPServer(("localhost", port), GameHandler)
    print(f"City of Agents server running at http://localhost:{port}")
    print("Press Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")


if __name__ == "__main__":
    main()
