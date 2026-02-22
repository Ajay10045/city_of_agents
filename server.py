from __future__ import annotations

import json
import hashlib
import random
import re
import time
import uuid
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock, Thread
from typing import Any
from urllib.parse import parse_qs, urlparse

from agents.agent_engine import AgentEngine
from agents.identity_group import IdentityGroup
from core.advisor_session import (
    DEFAULT_ADVISORS,
    AdvisorPersona,
    AdvisorSession,
    new_advisor_session,
)
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
from llm.advisory_chamber import (
    AdvisoryChamber,
    ChamberPolicyUnavailableError,
    ChamberPolicyValidationError,
    ChamberReplyError,
)
from llm.mayor_advisor import MayorAdvisor
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
ADVISOR_OPTIONS_CACHE_TTL_SECONDS = 90.0
ALLOWED_PARTICIPANT_ROLES = {"mayor", "opposition", "spectator"}
MAX_ACTIVE_ADVISORS: int | None = None
ADVISOR_CONTEXT_RECENT_WINDOW = 12
ADVISOR_MEMORY_REFRESH_THRESHOLD = 14

CITY_OPTIONS = [
    {"id": "new_delhi", "name": "New Delhi"},
    {"id": "new_york", "name": "New York"},
    {"id": "london", "name": "London"},
    {"id": "tokyo", "name": "Tokyo"},
    {"id": "dubai", "name": "Dubai"},
]
CITY_NAMES_BY_ID = {item["id"]: item["name"] for item in CITY_OPTIONS}

DEFAULT_MEDIA_OUTLETS_BY_CITY: dict[str, list[dict[str, Any]]] = {
    "new_delhi": [
        {"id": "delhi_civic_wire", "name": "Delhi Civic Wire", "lean": "mayor", "bias": 6.0, "sensationalism": 44.0, "trust": 58.0},
        {"id": "bazaar_pulse", "name": "Bazaar Pulse", "lean": "opposition", "bias": -7.0, "sensationalism": 63.0, "trust": 45.0},
        {"id": "metro_bulletin", "name": "Metro Bulletin", "lean": "neutral", "bias": -1.0, "sensationalism": 52.0, "trust": 51.0},
    ],
    "new_york": [
        {"id": "city_hall_brief", "name": "City Hall Brief", "lean": "mayor", "bias": 5.0, "sensationalism": 47.0, "trust": 57.0},
        {"id": "borough_watch", "name": "Borough Watch", "lean": "opposition", "bias": -6.5, "sensationalism": 61.0, "trust": 46.0},
        {"id": "subway_live", "name": "Subway Live", "lean": "neutral", "bias": -0.5, "sensationalism": 54.0, "trust": 52.0},
    ],
    "london": [
        {"id": "westminster_wire", "name": "Westminster Wire", "lean": "mayor", "bias": 4.5, "sensationalism": 45.0, "trust": 59.0},
        {"id": "high_street_ledger", "name": "High Street Ledger", "lean": "opposition", "bias": -5.5, "sensationalism": 58.0, "trust": 47.0},
        {"id": "thames_report", "name": "Thames Report", "lean": "neutral", "bias": 0.2, "sensationalism": 51.0, "trust": 54.0},
    ],
    "tokyo": [
        {"id": "ward_policy_desk", "name": "Ward Policy Desk", "lean": "mayor", "bias": 4.0, "sensationalism": 41.0, "trust": 61.0},
        {"id": "commuter_mirror", "name": "Commuter Mirror", "lean": "opposition", "bias": -5.2, "sensationalism": 56.0, "trust": 48.0},
        {"id": "tokyo_city_line", "name": "Tokyo City Line", "lean": "neutral", "bias": -0.3, "sensationalism": 49.0, "trust": 56.0},
    ],
    "dubai": [
        {"id": "emirate_brief", "name": "Emirate Brief", "lean": "mayor", "bias": 5.8, "sensationalism": 43.0, "trust": 60.0},
        {"id": "district_watch", "name": "District Watch", "lean": "opposition", "bias": -6.2, "sensationalism": 57.0, "trust": 47.0},
        {"id": "gulf_street_report", "name": "Gulf Street Report", "lean": "neutral", "bias": 0.0, "sensationalism": 50.0, "trust": 54.0},
    ],
}

_profile_generator = CityProfileGenerator()
_advisor_chat = AdvisorChat()
_advisory_chamber = AdvisoryChamber()

SETUP_DEFAULTS: dict[str, Any] = {
    "turns": 10,
    "city_id": "new_delhi",
    "agent_count": 12,
}

SETUP_LIMITS: dict[str, dict[str, Any]] = {
    "turns": {"min": 3, "max": 100},
    "agent_count": {"min": 10, "max": 15},
}


@dataclass(frozen=True)
class CachedActionResult:
    status: int
    body: dict[str, Any]


@dataclass(frozen=True)
class CachedAdvisorOptions:
    options: list[Any]
    source: str
    cached_at: float


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
    advisor_options_cache: dict[str, CachedAdvisorOptions] = field(default_factory=dict)
    advisor_refresh_inflight: set[str] = field(default_factory=set)
    turn_running: bool = False
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
    raw_media_outlets = meta.get("media_outlets")
    if not isinstance(raw_media_outlets, list) or not raw_media_outlets:
        raw_media_outlets = DEFAULT_MEDIA_OUTLETS_BY_CITY.get(city_id, [])
    media_outlets = MediaEngine.outlets_from_config(raw_media_outlets)
    profile["city_id"] = city_id
    profile["city_name"] = str(meta.get("city_name", CITY_NAMES_BY_ID.get(city_id, city_id)))
    profile["profile_version"] = str(meta.get("profile_version", "unknown"))
    profile["profile_generated_at"] = str(meta.get("generated_at", ""))
    profile["profile_source_path"] = str(city_bundle.source_path)
    profile["issue_front_baseline"] = dict(profile_payload.get("issue_front_baseline", {}))
    profile["starter_issues"] = list(profile_payload.get("starter_issues", []))
    profile["evidence_sources"] = list(meta.get("evidence_sources", []))
    profile["media_outlets"] = [item.name for item in media_outlets]
    profile["actual_agent_count"] = len(agents)
    profile["mayor_competence"] = float(profile.get("mayor_competence", 0.58))
    profile["council_competence"] = float(profile.get("council_competence", 0.62))
    profile["implementation_variance"] = float(profile.get("implementation_variance", 0.08))

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
        media_state=MediaState(outlets=media_outlets),
        rng=rng,
        rng_seed=seed,
        simulation_profile=profile,
        political_capital=float(profile.get("political_capital", 60.0)),
        campaign_funds=float(profile.get("campaign_funds", 1_200_000.0)),
        opposition_budget=float(profile.get("opposition_budget", 1_200_000.0)),
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
        "implementation_gap_assessed",
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


def _parse_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "y", "on"}:
        return True
    if text in {"0", "false", "no", "n", "off"}:
        return False
    return default


def _normalize_mention_alias(value: Any) -> str:
    text = str(value).strip().lower()
    if text.startswith("@"):
        text = text[1:]
    return re.sub(r"[^a-z0-9]+", "", text)


def _extract_mentions(question: str) -> list[str]:
    seen: set[str] = set()
    tokens: list[str] = []
    for raw in re.findall(r"@([A-Za-z0-9_.-]+)", str(question)):
        normalized = _normalize_mention_alias(raw)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        tokens.append(normalized)
    return tokens


def _resolve_city_advisors(session: GameSession) -> list[AdvisorPersona]:
    city_id = _normalize_city_id(session.setup.get("city_id", SETUP_DEFAULTS["city_id"]))
    try:
        bundle = load_city_profile(city_id)
    except Exception as exc:
        _advisor_debug_log(
            "advisor_roster_resolve",
            session.game_id,
            0.0,
            status="fallback",
            city_id=city_id,
            reason=f"city-profile-load-failed:{str(exc)[:80]}",
        )
        return list(DEFAULT_ADVISORS)

    meta = bundle.payload.get("meta", {}) if isinstance(bundle.payload, dict) else {}
    raw_advisors = meta.get("advisors") if isinstance(meta, dict) else None
    if not isinstance(raw_advisors, list) or not raw_advisors:
        reason = "missing-or-empty"
        if isinstance(meta, dict) and str(meta.get("advisors_validation_error", "")).strip():
            reason = str(meta.get("advisors_validation_error", "")).strip()[:100]
        _advisor_debug_log(
            "advisor_roster_resolve",
            session.game_id,
            0.0,
            status="fallback",
            city_id=city_id,
            reason=reason,
        )
        return list(DEFAULT_ADVISORS)

    advisors: list[AdvisorPersona] = []
    for item in raw_advisors:
        if not isinstance(item, dict):
            continue
        advisor_id = str(item.get("advisor_id", "")).strip()
        name = str(item.get("name", "")).strip()
        style = str(item.get("style", "")).strip()
        portfolios = [str(value).strip().lower() for value in item.get("portfolios", []) if str(value).strip()]
        aliases = [str(value).strip().lower() for value in item.get("aliases", []) if str(value).strip()]
        tone = str(item.get("tone", "")).strip().lower()
        voice_traits = [str(value).strip() for value in item.get("voice_traits", []) if str(value).strip()]
        conversational_habits = [
            str(value).strip() for value in item.get("conversational_habits", []) if str(value).strip()
        ]
        taboo_patterns = [str(value).strip().lower() for value in item.get("taboo_patterns", []) if str(value).strip()]
        if not advisor_id or not name or not style or not portfolios or not aliases:
            continue
        advisors.append(
            AdvisorPersona(
                advisor_id=advisor_id,
                name=name,
                portfolios=portfolios,
                style=style,
                aliases=aliases,
                tone=tone,
                voice_traits=voice_traits,
                conversational_habits=conversational_habits,
                taboo_patterns=taboo_patterns,
            )
        )
    if not advisors:
        _advisor_debug_log(
            "advisor_roster_resolve",
            session.game_id,
            0.0,
            status="fallback",
            city_id=city_id,
            reason="normalized-roster-empty",
        )
        return list(DEFAULT_ADVISORS)
    return advisors[:MAX_ACTIVE_ADVISORS] if isinstance(MAX_ACTIVE_ADVISORS, int) and MAX_ACTIVE_ADVISORS > 0 else advisors


def _resolve_addressed_advisors(question: str, advisors: list[AdvisorPersona]) -> tuple[list[AdvisorPersona], str]:
    if not advisors:
        return [], "auto"
    mentions = _extract_mentions(question)
    if not mentions:
        return list(advisors), "auto"

    broadcast = {"all", "everyone", "everybody"}
    if any(token in broadcast for token in mentions):
        return list(advisors), "all"

    alias_map: dict[str, AdvisorPersona] = {}
    for advisor in advisors:
        for alias in advisor.aliases:
            normalized = _normalize_mention_alias(alias)
            if normalized and normalized not in alias_map:
                alias_map[normalized] = advisor

    selected: list[AdvisorPersona] = []
    seen_ids: set[str] = set()
    for token in mentions:
        advisor = alias_map.get(token)
        if advisor is None or advisor.advisor_id in seen_ids:
            continue
        seen_ids.add(advisor.advisor_id)
        selected.append(advisor)

    if not selected:
        return list(advisors), "auto"
    return selected, "mention"


def _detect_interaction_intent(question: str) -> str:
    text = " ".join(str(question).strip().lower().split())
    if not text:
        return "strategy"
    stripped = re.sub(r"@[a-z0-9_.-]+", "", text).strip()
    words = [token for token in re.findall(r"[a-z]+", stripped)]
    if not words:
        return "strategy"

    clarification_markers = (
        "did you understand",
        "did you get",
        "are you understanding",
        "are you following",
        "that is not what i asked",
        "thats not what i asked",
        "i asked you",
        "understand what i said",
    )
    if any(marker in stripped for marker in clarification_markers):
        return "clarification"

    greetings = {
        "hi",
        "hello",
        "hey",
        "yo",
        "hola",
        "namaste",
        "thanks",
        "thank",
        "morning",
        "evening",
    }
    if len(words) <= 8 and any(token in greetings for token in words):
        return "greeting"

    ideation_terms = {
        "list",
        "initiative",
        "initiatives",
        "ideas",
        "options",
        "suggest",
        "recommend",
        "proposal",
        "proposals",
    }
    if any(token in ideation_terms for token in words):
        return "ideation"

    if stripped.endswith("?") or words[0] in {"will", "would", "can", "could", "does", "did", "is", "are"}:
        return "direct_answer"

    policy_terms = {
        "policy",
        "plan",
        "budget",
        "risk",
        "jobs",
        "trust",
        "economy",
        "corruption",
        "services",
        "election",
        "implement",
        "strategy",
        "tradeoff",
        "impact",
    }
    if any(token in policy_terms for token in words):
        return "strategy"
    return "direct_answer"


def _interaction_mode_for_intent(intent: str) -> str:
    return "policy" if intent in {"strategy", "ideation"} else "casual"


def _brief_message_payload(message: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(message.get("id", "")),
        "role": str(message.get("role", "")),
        "content": " ".join(str(message.get("content", "")).split())[:260],
        "speaker_advisor_id": str(message.get("speaker_advisor_id", "")),
    }


def _memory_value_for_thread(
    advisor_session: AdvisorSession,
    thread_scope: str,
    option_id: str | None,
) -> tuple[str, str | None]:
    if thread_scope == "option" and option_id:
        return (
            str(advisor_session.option_memory_summary.get(option_id, "")),
            str(advisor_session.option_memory_anchor_message_id.get(option_id, "")).strip() or None,
        )
    return (
        str(advisor_session.global_memory_summary),
        advisor_session.global_memory_anchor_message_id,
    )


def _set_memory_value_for_thread(
    advisor_session: AdvisorSession,
    thread_scope: str,
    option_id: str | None,
    summary: str,
    anchor_message_id: str | None,
) -> None:
    if thread_scope == "option" and option_id:
        advisor_session.option_memory_summary[option_id] = summary
        advisor_session.option_memory_anchor_message_id[option_id] = anchor_message_id or ""
        return
    advisor_session.global_memory_summary = summary
    advisor_session.global_memory_anchor_message_id = anchor_message_id


def _refresh_thread_memory_unlocked(
    advisor_session: AdvisorSession,
    *,
    thread_scope: str,
    option_id: str | None,
    advisor_name_by_id: dict[str, str],
) -> None:
    thread = (
        list(advisor_session.option_threads.get(option_id or "", []))
        if thread_scope == "option"
        else list(advisor_session.global_thread)
    )
    if len(thread) <= ADVISOR_CONTEXT_RECENT_WINDOW:
        _set_memory_value_for_thread(advisor_session, thread_scope, option_id, "", None)
        return

    older = thread[:-ADVISOR_CONTEXT_RECENT_WINDOW]
    if not older:
        return

    current_summary, current_anchor = _memory_value_for_thread(advisor_session, thread_scope, option_id)
    next_anchor = older[-1].id
    if current_anchor == next_anchor and current_summary:
        return
    if len(thread) < ADVISOR_MEMORY_REFRESH_THRESHOLD and not current_summary:
        return

    transcript: list[dict[str, Any]] = []
    for message in older:
        row = message.to_dict()
        if row.get("role") == "advisor":
            speaker_id = str(row.get("speaker_advisor_id", "")).strip()
            if speaker_id:
                row["advisor_name"] = advisor_name_by_id.get(speaker_id, "Advisor")
        transcript.append(_brief_message_payload(row) | {"advisor_name": row.get("advisor_name", "")})

    summary = _advisory_chamber.summarize_conversation_memory(
        existing_summary=current_summary,
        transcript=transcript,
    )
    _set_memory_value_for_thread(
        advisor_session,
        thread_scope,
        option_id,
        summary,
        next_anchor,
    )


def _build_context_packet(
    advisor_session: AdvisorSession,
    *,
    thread_scope: str,
    option_id: str | None,
    history: list[dict[str, Any]],
    question: str,
    addressed_via: str,
    interaction_intent: str,
    sequence_index: int,
    sequence_total: int,
) -> dict[str, Any]:
    memory_summary, memory_anchor = _memory_value_for_thread(advisor_session, thread_scope, option_id)
    recent_window = [_brief_message_payload(message) for message in history[-ADVISOR_CONTEXT_RECENT_WINDOW:]]
    return {
        "memory_summary": memory_summary,
        "memory_anchor_message_id": memory_anchor,
        "recent_window": recent_window,
        "current_question": question,
        "addressed_via": addressed_via,
        "interaction_intent": interaction_intent,
        "response_sequence": {"index": sequence_index, "total": sequence_total},
    }


def _advisor_options_cache_key(turn_number: int, guidance: str | None) -> str:
    marker = str(guidance or "").strip()
    guidance_hash = hashlib.sha1(marker.encode("utf-8")).hexdigest()[:16] if marker else "none"
    return f"{turn_number}:{guidance_hash}"


def _cache_advisor_options(
    session: GameSession,
    cache_key: str,
    options: list[Any],
    source: str,
) -> None:
    session.advisor_options_cache[cache_key] = CachedAdvisorOptions(
        options=list(options),
        source=source,
        cached_at=time.time(),
    )


def _get_cached_advisor_options(session: GameSession, cache_key: str) -> CachedAdvisorOptions | None:
    cached = session.advisor_options_cache.get(cache_key)
    if cached is None:
        return None
    if (time.time() - cached.cached_at) > ADVISOR_OPTIONS_CACHE_TTL_SECONDS:
        session.advisor_options_cache.pop(cache_key, None)
        return None
    return cached


def _generate_advisor_options(
    session: GameSession,
    guidance: str | None = None,
) -> tuple[list[Any], str]:
    return session.turn_manager.mayor_advisor.generate_options_with_source(
        session.turn_manager.game_state,
        guidance=guidance,
    )


def _schedule_advisor_session_live_refresh(
    session: GameSession,
    turn_number: int,
    guidance: str | None,
) -> None:
    cache_key = _advisor_options_cache_key(turn_number, guidance)
    if cache_key in session.advisor_refresh_inflight:
        return
    session.advisor_refresh_inflight.add(cache_key)

    def _refresh_worker() -> None:
        try:
            options, source = _generate_advisor_options(session, guidance=guidance)
            with session.action_lock:
                _cache_advisor_options(session, cache_key, options, source)
                active_id = session.advisor_session_by_turn.get(turn_number)
                if not active_id:
                    return
                active = session.advisor_sessions.get(active_id)
                if active is None:
                    return
                if active.option_source != "fallback":
                    return
                active.options = list(options[:5])
                active.option_source = source
                active.session_status = "ready" if source == "live" else "error"
                active.ensure_option_threads()
                active.updated_at = time.time()
                _sync_mayor_option_cache(session, active.options)
        except Exception:
            with session.action_lock:
                active_id = session.advisor_session_by_turn.get(turn_number)
                if active_id:
                    active = session.advisor_sessions.get(active_id)
                    if active and active.option_source == "fallback":
                        active.session_status = "error"
                        active.updated_at = time.time()
        finally:
            with session.action_lock:
                session.advisor_refresh_inflight.discard(cache_key)

    Thread(target=_refresh_worker, daemon=True).start()


def _active_advisor_session_unlocked(session: GameSession) -> AdvisorSession:
    return _ensure_advisor_session_unlocked(session, force_refresh=False)


def _ensure_advisor_session_unlocked(
    session: GameSession,
    force_refresh: bool = False,
    guidance: str | None = None,
    prefer_fallback: bool = False,
    schedule_live_refresh: bool = False,
) -> AdvisorSession:
    turn_number = _planned_turn_number(session)
    existing_id = session.advisor_session_by_turn.get(turn_number)
    if existing_id and not force_refresh:
        existing = session.advisor_sessions.get(existing_id)
        if existing is not None:
            _sync_mayor_option_cache(session, existing.options)
            return existing

    cache_key = _advisor_options_cache_key(turn_number, guidance)
    cached = None if force_refresh else _get_cached_advisor_options(session, cache_key)
    if cached is not None:
        options = list(cached.options[:5])
        source = cached.source
    elif prefer_fallback:
        options = session.turn_manager.mayor_advisor.generate_fallback_options(guidance=guidance)[:5]
        source = "fallback"
        _cache_advisor_options(session, cache_key, options, source)
        if schedule_live_refresh:
            _schedule_advisor_session_live_refresh(session, turn_number, guidance)
    else:
        if guidance:
            options, source = _generate_advisor_options(session, guidance=guidance)
            options = list(options[:5])
        else:
            options = list(session.turn_manager.get_mayor_options()[:5])
            source = "live"
        _cache_advisor_options(session, cache_key, options, source)

    advisor_session = new_advisor_session(
        turn_number=turn_number,
        options=options,
        advisors=_resolve_city_advisors(session),
    )
    advisor_session.option_source = source
    advisor_session.session_status = "refining" if source == "fallback" else "ready"
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
    deprecated_fields = (
        "turns_to_election",
        "election_turn",
        "population_scale",
        "llm_panel_size",
        "llm_sampling_strategy",
        "llm_micro_batch_size",
        "max_parallel_llm_requests",
        "randomness_scale",
    )
    for field_name in deprecated_fields:
        if field_name in body:
            return None, (
                400,
                f"{field_name} is no longer supported in /v1/games. Use only: seed, turns, city_id, agent_count.",
            )

    seed = body.get("seed")

    turns, turns_err = _parse_bounded_int(
        body.get("turns", SETUP_DEFAULTS["turns"]),
        "turns",
        int(SETUP_LIMITS["turns"]["min"]),
        int(SETUP_LIMITS["turns"]["max"]),
    )
    if turns_err is not None:
        return None, (400, turns_err)
    assert turns is not None

    election_turn = turns

    city_id = _normalize_city_id(body.get("city_id", SETUP_DEFAULTS["city_id"]))
    if city_id not in CITY_NAMES_BY_ID:
        allowed = ", ".join(sorted(CITY_NAMES_BY_ID))
        return None, (400, f"city_id must be one of: {allowed}")

    agent_count, agent_count_err = _parse_bounded_int(
        body.get("agent_count", SETUP_DEFAULTS["agent_count"]),
        "agent_count",
        int(SETUP_LIMITS["agent_count"]["min"]),
        int(SETUP_LIMITS["agent_count"]["max"]),
    )
    if agent_count_err is not None:
        return None, (400, agent_count_err)
    assert agent_count is not None

    profile = city_profile_status(city_id)
    setup = {
        "api_version": "v1",
        "turns": turns,
        "city_id": city_id,
        "city_name": CITY_NAMES_BY_ID[city_id],
        "agent_count": agent_count,
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
            "turns": SETUP_DEFAULTS["turns"],
            "city_id": SETUP_DEFAULTS["city_id"],
            "agent_count": SETUP_DEFAULTS["agent_count"],
        },
        "limits": dict(SETUP_LIMITS),
    }


def _json_response(handler: BaseHTTPRequestHandler, data: dict, status: int = 200) -> None:
    body = json.dumps(data).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(body)


def _advisor_debug_log(endpoint: str, game_id: str, latency_ms: float, **fields: Any) -> None:
    suffix = " ".join(f"{key}={value}" for key, value in fields.items())
    line = (
        f"[advisor-debug] endpoint={endpoint} game_id={game_id} latency_ms={latency_ms:.2f}"
        + (f" {suffix}" if suffix else "")
    )
    print(line, flush=True)


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
                options = MayorAdvisor._sanitize_options(list(advisor_session.options))
                advisor_session.options = list(options)
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
            len(parts) == 8
            and parts[3] == "advisor"
            and parts[4] == "sessions"
            and parts[6] == "messages"
            and parts[7] == "stream"
        ):
            self._handle_v1_advisor_session_message_stream(parts[2], parts[5], body)
            return True

        if (
            len(parts) == 7
            and parts[3] == "advisor"
            and parts[4] == "sessions"
            and parts[6] == "revise"
        ):
            self._handle_v1_advisor_session_revise(parts[2], parts[5], body)
            return True

        if (
            len(parts) == 7
            and parts[3] == "advisor"
            and parts[4] == "sessions"
            and parts[6] == "generate-policies"
        ):
            self._handle_v1_advisor_session_generate_policies(parts[2], parts[5], body)
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
        with session.action_lock:
            _ensure_advisor_session_unlocked(
                session,
                force_refresh=False,
                prefer_fallback=True,
                schedule_live_refresh=True,
            )

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

        meta = profile.get("meta", {}) if isinstance(profile, dict) else {}
        if isinstance(meta, dict):
            raw_outlets = meta.get("media_outlets")
            if not isinstance(raw_outlets, list) or not raw_outlets:
                meta["media_outlets"] = list(DEFAULT_MEDIA_OUTLETS_BY_CITY.get(normalized, []))
                profile["meta"] = meta

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

        force_refresh = _parse_bool(body.get("force_refresh", False), default=False)
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
                options = MayorAdvisor._sanitize_options(list(advisor_session.options))
                advisor_session.options = list(options)
                advisor_session.updated_at = time.time()
                _sync_mayor_option_cache(session, advisor_session.options)
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

        started = time.time()
        force_refresh = _parse_bool(body.get("force_refresh", False), default=False)
        guidance = str(body.get("constraints", "")).strip() or None

        try:
            with session.action_lock:
                advisor_session = _ensure_advisor_session_unlocked(
                    session,
                    force_refresh=force_refresh,
                    guidance=guidance,
                    prefer_fallback=True,
                    schedule_live_refresh=True,
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
                "latency_ms": round((time.time() - started) * 1000, 2),
            },
            201 if force_refresh else 200,
        )
        _advisor_debug_log(
            "session_create",
            game_id,
            (time.time() - started) * 1000,
            status="ok",
            source=payload.get("option_source", "unknown"),
            session_status=payload.get("session_status", "unknown"),
        )

    def _handle_v1_advisor_session_get(self, game_id: str, advisor_session_id: str) -> None:
        started = time.time()
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
        _advisor_debug_log(
            "session_get",
            game_id,
            (time.time() - started) * 1000,
            status="ok",
            source=payload.get("option_source", "unknown"),
            session_status=payload.get("session_status", "unknown"),
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

        started = time.time()
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
                options = list(advisor_session.options)
                advisor_roster = list(advisor_session.advisors)
                mayor_msg = advisor_session.append_message(
                    role="user",
                    content=question,
                    thread_scope=thread_scope,
                    option_id=option_id,
                )
                history.append(mayor_msg.to_dict())
                payload = advisor_session.to_dict()
            addressed_advisors, addressed_via = _resolve_addressed_advisors(question, advisor_roster)
            interaction_intent = _detect_interaction_intent(question)
            interaction_mode = _interaction_mode_for_intent(interaction_intent)
            prior_advisor_messages: list[dict[str, str]] = []

            generated_summaries: list[str] = []
            structured_rows: list[dict[str, Any]] = []
            for idx, advisor in enumerate(addressed_advisors):
                context_packet = _build_context_packet(
                    advisor_session,
                    thread_scope=thread_scope,
                    option_id=option_id,
                    history=history,
                    question=question,
                    addressed_via=addressed_via,
                    interaction_intent=interaction_intent,
                    sequence_index=idx + 1,
                    sequence_total=len(addressed_advisors),
                )
                reply, similarity, attempts = self._build_advisor_stream_reply(
                    session=session,
                    advisor=advisor,
                    thread_scope=thread_scope,
                    option_id=option_id,
                    question=question,
                    history=history,
                    options=options,
                    prior_advisor_messages=prior_advisor_messages,
                    context_packet=context_packet,
                    interaction_intent=interaction_intent,
                    interaction_mode=interaction_mode,
                )
                summary = str(reply["summary"]).strip()
                structured = dict(reply["structured"] if isinstance(reply["structured"], dict) else {})
                structured["addressed_via"] = addressed_via
                structured["interaction_mode"] = interaction_mode
                structured["interaction_intent"] = interaction_intent

                with session.action_lock:
                    active_advisor_session = _active_advisor_session_unlocked(session)
                    if advisor_session_id != active_advisor_session.advisor_session_id:
                        _json_response(
                            self,
                            {
                                "api_version": "v1",
                                "game_id": game_id,
                                "error": "advisor session is stale for the current turn",
                                "provided_advisor_session_id": advisor_session_id,
                                "active_advisor_session_id": active_advisor_session.advisor_session_id,
                                "active_turn_number": active_advisor_session.turn_number,
                            },
                            409,
                        )
                        return
                    persisted = active_advisor_session.append_message(
                        role="advisor",
                        content=summary,
                        thread_scope=thread_scope,
                        option_id=option_id,
                        structured=structured,
                        speaker_advisor_id=advisor.advisor_id,
                    )
                    payload = active_advisor_session.to_dict()
                    history.append(persisted.to_dict())
                prior_advisor_messages.append(
                    {
                        "id": persisted.id,
                        "content": persisted.content,
                        "speaker_advisor_id": advisor.advisor_id,
                        "advisor_name": advisor.name,
                    }
                )
                generated_summaries.append(summary)
                structured_rows.append(structured)
                _advisor_debug_log(
                    "message_reply",
                    game_id,
                    (time.time() - started) * 1000,
                    advisor_id=advisor.advisor_id,
                    stance=structured.get("stance", "unknown"),
                    addressed_via=addressed_via,
                    interaction_mode=interaction_mode,
                    interaction_intent=interaction_intent,
                    similarity=f"{similarity:.3f}",
                    retries=max(0, attempts - 1),
                )

            with session.action_lock:
                active_advisor_session = _active_advisor_session_unlocked(session)
                if advisor_session_id != active_advisor_session.advisor_session_id:
                    _json_response(
                        self,
                        {
                            "api_version": "v1",
                            "game_id": game_id,
                            "error": "advisor session is stale for the current turn",
                            "provided_advisor_session_id": advisor_session_id,
                            "active_advisor_session_id": active_advisor_session.advisor_session_id,
                            "active_turn_number": active_advisor_session.turn_number,
                        },
                        409,
                    )
                    return
                advisor_name_by_id = {advisor.advisor_id: advisor.name for advisor in active_advisor_session.advisors}
                _refresh_thread_memory_unlocked(
                    active_advisor_session,
                    thread_scope=thread_scope,
                    option_id=option_id,
                    advisor_name_by_id=advisor_name_by_id,
                )
                payload = active_advisor_session.to_dict()

            lead_structured = structured_rows[0] if structured_rows else {}
            summary_text = ""
            if generated_summaries:
                summary_text = generated_summaries[0] if len(generated_summaries) == 1 else " | ".join(generated_summaries)
            responder_count = len(generated_summaries)
            answer = {
                "answer": {
                    "summary": summary_text[:360],
                    "drivers": lead_structured.get("drivers", []),
                    "assumptions": lead_structured.get("assumptions", []),
                    "tradeoffs": lead_structured.get("tradeoffs", []),
                    "risk": str(lead_structured.get("risk", "Chamber synthesis risk depends on execution discipline.")),
                    "confidence": float(lead_structured.get("confidence", 0.62)),
                },
                "cited_option_ids": [],
                "suggested_actions": [
                    "Generate policies to convert chamber deliberation into implementable options.",
                ],
            }
        except Exception as exc:
            _advisor_debug_log(
                "message",
                game_id,
                (time.time() - started) * 1000,
                status="error",
                detail=str(exc)[:120],
            )
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
                "latency_ms": round((time.time() - started) * 1000, 2),
                **answer,
            },
        )
        _advisor_debug_log(
            "message",
            game_id,
            (time.time() - started) * 1000,
            status="ok",
            source=payload.get("option_source", "unknown"),
            session_status=payload.get("session_status", "unknown"),
            responders_count=responder_count,
            addressed_via=addressed_via,
            interaction_mode=interaction_mode,
            interaction_intent=interaction_intent,
        )

    @staticmethod
    def _emit_sse(handler: BaseHTTPRequestHandler, payload: dict[str, Any]) -> None:
        msg = f"data: {json.dumps(payload)}\n\n"
        handler.wfile.write(msg.encode("utf-8"))
        handler.wfile.flush()

    @staticmethod
    def _iter_word_chunks(text: str, words_per_chunk: int = 2) -> list[str]:
        words = [w for w in str(text).strip().split() if w]
        if not words:
            return []
        chunks: list[str] = []
        for idx in range(0, len(words), max(1, words_per_chunk)):
            chunks.append(" ".join(words[idx : idx + max(1, words_per_chunk)]))
        return chunks

    def _build_advisor_stream_reply(
        self,
        *,
        session: GameSession,
        advisor: Any,
        thread_scope: str,
        option_id: str | None,
        question: str,
        history: list[dict[str, Any]],
        options: list[Any],
        prior_advisor_messages: list[dict[str, Any]],
        context_packet: dict[str, Any] | None = None,
        interaction_intent: str = "strategy",
        interaction_mode: str = "policy",
    ) -> tuple[dict[str, Any], float, int]:
        reply, similarity, attempts = _advisory_chamber.build_reply_with_retry(
            game_state=session.turn_manager.game_state,
            advisor=advisor,
            question=question,
            history=history,
            options=options,
            prior_advisor_messages=prior_advisor_messages,
            context_packet=context_packet,
            interaction_intent=interaction_intent,
            interaction_mode=interaction_mode,
        )
        structured = reply.structured if isinstance(reply.structured, dict) else {}
        summary = str(reply.summary or "").strip()
        if not summary:
            raise ChamberReplyError("advisor reply summary was empty")
        return {"summary": summary, "structured": structured}, similarity, attempts

    def _handle_v1_advisor_session_message_stream(
        self,
        game_id: str,
        advisor_session_id: str,
        body: dict,
    ) -> None:
        started = time.time()
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
            history = (
                [message.to_dict() for message in advisor_session.option_threads.get(option_id or "", [])]
                if thread_scope == "option"
                else [message.to_dict() for message in advisor_session.global_thread]
            )
            options = list(advisor_session.options)
            advisors = list(advisor_session.advisors)
            addressed_advisors, addressed_via = _resolve_addressed_advisors(question, advisors)
            interaction_intent = _detect_interaction_intent(question)
            interaction_mode = _interaction_mode_for_intent(interaction_intent)
            mayor_msg = advisor_session.append_message(
                role="user",
                content=question,
                thread_scope=thread_scope,
                option_id=option_id,
            )
            history.append(mayor_msg.to_dict())
            snapshot = advisor_session.to_dict()

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        try:
            self._emit_sse(
                self,
                {
                    "event_type": "session_snapshot",
                    "game_id": game_id,
                    "advisor_session_id": advisor_session_id,
                    "session": snapshot,
                    "timestamp": time.time(),
                },
            )
            self._emit_sse(
                self,
                {
                    "event_type": "mayor_message_accepted",
                    "game_id": game_id,
                    "advisor_session_id": advisor_session_id,
                    "message": mayor_msg.to_dict(),
                    "timestamp": time.time(),
                },
            )

            prior_advisor_messages: list[dict[str, str]] = []
            for idx, advisor in enumerate(addressed_advisors):
                context_packet = _build_context_packet(
                    advisor_session,
                    thread_scope=thread_scope,
                    option_id=option_id,
                    history=history,
                    question=question,
                    addressed_via=addressed_via,
                    interaction_intent=interaction_intent,
                    sequence_index=idx + 1,
                    sequence_total=len(addressed_advisors),
                )
                provisional_id = str(uuid.uuid4())
                self._emit_sse(
                    self,
                    {
                        "event_type": "advisor_message_start",
                        "game_id": game_id,
                        "advisor_session_id": advisor_session_id,
                        "message_id": provisional_id,
                        "speaker_advisor_id": advisor.advisor_id,
                        "done": False,
                        "timestamp": time.time(),
                    },
                )
                reply, similarity, attempts = self._build_advisor_stream_reply(
                    session=session,
                    advisor=advisor,
                    thread_scope=thread_scope,
                    option_id=option_id,
                    question=question,
                    history=history,
                    options=options,
                    prior_advisor_messages=prior_advisor_messages,
                    context_packet=context_packet,
                    interaction_intent=interaction_intent,
                    interaction_mode=interaction_mode,
                )
                summary = str(reply["summary"])
                structured = dict(reply["structured"] if isinstance(reply["structured"], dict) else {})
                structured["addressed_via"] = addressed_via
                structured["interaction_mode"] = interaction_mode
                structured["interaction_intent"] = interaction_intent
                for chunk in self._iter_word_chunks(summary, words_per_chunk=2):
                    self._emit_sse(
                        self,
                        {
                            "event_type": "advisor_message_delta",
                            "game_id": game_id,
                            "advisor_session_id": advisor_session_id,
                            "message_id": provisional_id,
                            "speaker_advisor_id": advisor.advisor_id,
                            "delta": f"{chunk} ",
                            "done": False,
                            "timestamp": time.time(),
                        },
                    )
                    time.sleep(0.04)

                with session.action_lock:
                    active_advisor_session = _active_advisor_session_unlocked(session)
                    if active_advisor_session.advisor_session_id != advisor_session_id:
                        self._emit_sse(
                            self,
                            {
                                "event_type": "error",
                                "game_id": game_id,
                                "advisor_session_id": advisor_session_id,
                                "message": "advisor session became stale during streaming",
                                "timestamp": time.time(),
                            },
                        )
                        return
                    persisted = active_advisor_session.append_message(
                        role="advisor",
                        content=summary,
                        thread_scope=thread_scope,
                        option_id=option_id,
                        structured=structured,
                        speaker_advisor_id=advisor.advisor_id,
                    )
                    snapshot = active_advisor_session.to_dict()
                    history.append(persisted.to_dict())
                    prior_advisor_messages.append(
                        {
                            "id": persisted.id,
                            "content": persisted.content,
                            "speaker_advisor_id": advisor.advisor_id,
                            "advisor_name": advisor.name,
                        }
                    )
                self._emit_sse(
                    self,
                    {
                        "event_type": "advisor_message_done",
                        "game_id": game_id,
                        "advisor_session_id": advisor_session_id,
                        "message_id": persisted.id,
                        "speaker_advisor_id": advisor.advisor_id,
                        "content": persisted.content,
                        "structured": persisted.structured,
                        "done": True,
                        "timestamp": time.time(),
                    },
                )
                self._emit_sse(
                    self,
                    {
                        "event_type": "session_snapshot",
                        "game_id": game_id,
                        "advisor_session_id": advisor_session_id,
                        "session": snapshot,
                        "timestamp": time.time(),
                    },
                )
                _advisor_debug_log(
                    "message_stream_reply",
                    game_id,
                    (time.time() - started) * 1000,
                    advisor_id=advisor.advisor_id,
                    stance=structured.get("stance", "unknown"),
                    addressed_via=addressed_via,
                    interaction_mode=interaction_mode,
                    interaction_intent=interaction_intent,
                    similarity=f"{similarity:.3f}",
                    retries=max(0, attempts - 1),
                )

            final_snapshot: dict[str, Any] | None = None
            with session.action_lock:
                active_advisor_session = _active_advisor_session_unlocked(session)
                if active_advisor_session.advisor_session_id == advisor_session_id:
                    advisor_name_by_id = {advisor.advisor_id: advisor.name for advisor in active_advisor_session.advisors}
                    _refresh_thread_memory_unlocked(
                        active_advisor_session,
                        thread_scope=thread_scope,
                        option_id=option_id,
                        advisor_name_by_id=advisor_name_by_id,
                    )
                    final_snapshot = active_advisor_session.to_dict()

            if final_snapshot is not None:
                self._emit_sse(
                    self,
                    {
                        "event_type": "session_snapshot",
                        "game_id": game_id,
                        "advisor_session_id": advisor_session_id,
                        "session": final_snapshot,
                        "timestamp": time.time(),
                    },
                )

            self._emit_sse(
                self,
                {
                    "event_type": "done",
                    "game_id": game_id,
                    "advisor_session_id": advisor_session_id,
                    "done": True,
                    "timestamp": time.time(),
                },
            )
            _advisor_debug_log(
                "message_stream",
                game_id,
                (time.time() - started) * 1000,
                status="ok",
                responders_count=len(addressed_advisors),
                addressed_via=addressed_via,
                interaction_mode=interaction_mode,
                interaction_intent=interaction_intent,
            )
        except Exception as exc:
            self._emit_sse(
                self,
                {
                    "event_type": "error",
                    "game_id": game_id,
                    "advisor_session_id": advisor_session_id,
                    "message": str(exc),
                    "timestamp": time.time(),
                },
            )
            _advisor_debug_log(
                "message_stream",
                game_id,
                (time.time() - started) * 1000,
                status="error",
                detail=str(exc)[:120],
            )

    def _handle_v1_advisor_session_revise(
        self,
        game_id: str,
        advisor_session_id: str,
        body: dict,
    ) -> None:
        started = time.time()
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
                    speaker_advisor_id=(
                        advisor_session.advisors[0].advisor_id if advisor_session.advisors else None
                    ),
                )
                advisor_session.updated_at = time.time()
                _sync_mayor_option_cache(session, advisor_session.options)
                payload = advisor_session.to_dict()
        except Exception as exc:
            _advisor_debug_log(
                "revise",
                game_id,
                (time.time() - started) * 1000,
                status="error",
                detail=str(exc)[:120],
            )
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

        sanitized_options = MayorAdvisor._sanitize_options(list(advisor_session.options))
        advisor_session.options = list(sanitized_options)
        _json_response(
            self,
            {
                "api_version": "v1",
                "game_id": game_id,
                "session": payload,
                "options": [option.to_dict() for option in sanitized_options],
                "diff_summary": diff,
            },
        )
        _advisor_debug_log(
            "revise",
            game_id,
            (time.time() - started) * 1000,
            status="ok",
            source=payload.get("option_source", "unknown"),
            session_status=payload.get("session_status", "unknown"),
            mode=mode,
        )

    def _handle_v1_advisor_session_generate_policies(
        self,
        game_id: str,
        advisor_session_id: str,
        body: dict,
    ) -> None:
        session = _get_session(game_id)
        if session is None:
            _json_response(self, {"error": f"Unknown game_id: {game_id}"}, 404)
            return

        raw_count = body.get("count", 3)
        try:
            requested_count = int(raw_count)
        except (TypeError, ValueError):
            _json_response(
                self,
                {
                    "api_version": "v1",
                    "game_id": game_id,
                    "error": "count must be an integer",
                },
                400,
            )
            return

        count = max(1, min(3, requested_count))
        constraints = str(body.get("constraints", "")).strip()

        started = time.time()
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

                transcript_messages = [
                    message
                    for message in advisor_session.global_thread[-16:]
                    if message.role in {"user", "advisor"} and message.content.strip()
                ]
                advisors = list(advisor_session.advisors)
                transcript = [message.to_dict() for message in transcript_messages]
                generated_from_message_ids = [message.id for message in transcript_messages]

            generated, summary = _advisory_chamber.generate_policies_from_deliberation(
                game_state=session.turn_manager.game_state,
                advisors=advisors,
                transcript=transcript,
                constraints=constraints,
                count=count,
            )
            generated = list(generated[:count])
            if len(generated) < count:
                raise ValueError("Advisor policy generation returned insufficient options")

            with session.action_lock:
                active_advisor_session = _active_advisor_session_unlocked(session)
                if active_advisor_session.advisor_session_id != advisor_session_id:
                    _json_response(
                        self,
                        {
                            "api_version": "v1",
                            "game_id": game_id,
                            "error": "advisor session is stale for the current turn",
                            "provided_advisor_session_id": advisor_session_id,
                            "active_advisor_session_id": active_advisor_session.advisor_session_id,
                            "active_turn_number": active_advisor_session.turn_number,
                        },
                        409,
                    )
                    return
                active_advisor_session.options = generated
                active_advisor_session.option_source = "live"
                active_advisor_session.session_status = "ready"
                active_advisor_session.ensure_option_threads()
                spokesperson = (
                    active_advisor_session.advisors[0].advisor_id if active_advisor_session.advisors else None
                )
                active_advisor_session.append_message(
                    role="advisor",
                    content=summary,
                    thread_scope="global",
                    option_id=None,
                    structured={
                        "summary": summary,
                        "drivers": [constraints] if constraints else ["Portfolio deliberation synthesis"],
                        "assumptions": ["Options remain executable within current city capacity."],
                        "tradeoffs": ["Explicit deliberation grounding can narrow variety but improve implementation fit."],
                        "risk": "Options may underperform if transcript assumptions are outdated by fast-moving crises.",
                        "confidence": 0.69,
                        "stance": "extend",
                        "portfolio_focus": "cross-portfolio synthesis",
                        "responds_to_message_ids": generated_from_message_ids[-3:],
                        "distinctive_risk": "Cross-portfolio execution coordination can fail without weekly checkpointing.",
                    },
                    speaker_advisor_id=spokesperson,
                )
                active_advisor_session.updated_at = time.time()
                _sync_mayor_option_cache(session, active_advisor_session.options)
                payload = active_advisor_session.to_dict()

        except ChamberPolicyUnavailableError as exc:
            _advisor_debug_log(
                "generate_policies",
                game_id,
                (time.time() - started) * 1000,
                status="unavailable",
                reason=str(exc)[:120],
                constraints=bool(constraints),
                transcript_messages=len(generated_from_message_ids) if "generated_from_message_ids" in locals() else 0,
            )
            _json_response(
                self,
                {
                    "api_version": "v1",
                    "game_id": game_id,
                    "error": str(exc),
                },
                503,
            )
            return
        except ChamberPolicyValidationError as exc:
            _advisor_debug_log(
                "generate_policies",
                game_id,
                (time.time() - started) * 1000,
                status="invalid",
                reason=str(exc)[:180],
                constraints=bool(constraints),
                transcript_messages=len(generated_from_message_ids) if "generated_from_message_ids" in locals() else 0,
            )
            _json_response(
                self,
                {
                    "api_version": "v1",
                    "game_id": game_id,
                    "error": "Generated policies failed quality checks",
                    "detail": exc.reasons[:8],
                },
                422,
            )
            return
        except Exception as exc:
            _advisor_debug_log(
                "generate_policies",
                game_id,
                (time.time() - started) * 1000,
                status="error",
                detail=str(exc)[:120],
                constraints=bool(constraints),
                transcript_messages=len(generated_from_message_ids) if "generated_from_message_ids" in locals() else 0,
            )
            _json_response(
                self,
                {
                    "api_version": "v1",
                    "game_id": game_id,
                    "error": "Advisor policy generation failed",
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
                "policies": [option.to_dict() for option in generated],
                "conclusion_summary": summary,
                "generated_from_message_ids": generated_from_message_ids,
                "latency_ms": round((time.time() - started) * 1000, 2),
            },
        )
        _advisor_debug_log(
            "generate_policies",
            game_id,
            (time.time() - started) * 1000,
            status="ok",
            source=payload.get("option_source", "unknown"),
            session_status=payload.get("session_status", "unknown"),
            policies=len(generated),
            constraints=bool(constraints),
            transcript_messages=len(generated_from_message_ids),
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

                if session.turn_running:
                    _json_response(
                        self,
                        {
                            "api_version": "v1",
                            "game_id": game_id,
                            "error": "A turn is already in progress",
                        },
                        409,
                    )
                    return

                _sync_mayor_option_cache(session, active_advisor_session.options)
                session.turn_running = True

                turn_policy_id = submission.policy_id
                turn_counter_frame_id = submission.counter_frame_id

                def _run_turn_background():
                    try:
                        for msg in session.turn_manager.stream_step(
                            turn_policy_id, counter_frame_id=turn_counter_frame_id
                        ):
                            _append_event(session, game_id, msg)
                    except Exception as bg_exc:
                        _append_event(
                            session, game_id, {"type": "error", "message": str(bg_exc)}
                        )
                    finally:
                        session.turn_running = False

                next_turn = session.turn_manager.game_state.turn_number + 1
                Thread(target=_run_turn_background, daemon=True).start()
                accepted = {
                    "api_version": "v1",
                    "game_id": game_id,
                    "status": "accepted",
                    "actor": submission.actor,
                    "turn_number": next_turn,
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

                done_seen = False
                for event in pending:
                    msg = f"data: {json.dumps(event)}\n\n"
                    self.wfile.write(msg.encode("utf-8"))
                    self.wfile.flush()
                    last_seen = int(event["event_id"])
                    if event.get("type") == "done":
                        done_seen = True

                if not follow:
                    break
                if done_seen:
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
    server = ThreadingHTTPServer(("0.0.0.0", port), GameHandler)
    print(f"City of Agents server running at http://localhost:{port}")
    print("Press Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")


if __name__ == "__main__":
    main()
