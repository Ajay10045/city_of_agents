"""Event system — crises and opportunities.

Section 12 of v4 spec.
"""
from __future__ import annotations

import random

from .models import ActiveEvent, CityParameters


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


# ─── Debug Logger ─────────────────────────────────────────────────────────────
_RESET = "\033[0m"
_C = {"good": "\033[0;32m", "bad": "\033[0;31m", "info": "\033[0;37m", "calc": "\033[0;33m"}

def _log(tag: str, msg: str) -> None:
    print(f"{_C.get(tag, '')  }[{tag.upper():5s}] {msg}{_RESET}", flush=True)


# Threshold triggers (Section 12.1)
THRESHOLD_TRIGGERS: list[dict] = [
    {"condition": lambda p: p.police_and_emergency < 30,
     "name": "Crime Wave", "type": "crisis", "severity": 2,
     "effects": {"police_and_emergency": -2.0, "community_and_spaces": -2.0}, "portfolio": "Home Affairs"},
    {"condition": lambda p: p.water_power_sanitation < 20,
     "name": "Disease Outbreak", "type": "crisis", "severity": 3,
     "effects": {"hospitals_and_clinics": -4.0, "community_and_spaces": -2.0}, "portfolio": "Health & Education"},
    {"condition": lambda p: p.admin_efficiency < 20,
     "name": "Governance Paralysis", "type": "crisis", "severity": 2,
     "effects": {"admin_efficiency": -2.0, "jobs_and_commerce": -1.0}, "portfolio": "Governance Reform"},
    {"condition": lambda p: p.media_freedom < 15,
     "name": "International Press Backlash", "type": "crisis", "severity": 1,
     "effects": {"media_freedom": -1.0}, "portfolio": "Governance Reform"},
    {"condition": lambda p: p.air_quality_and_pollution < 15,
     "name": "Health Emergency — Air", "type": "crisis", "severity": 2,
     "effects": {"hospitals_and_clinics": -3.0, "schools_and_universities": -2.0}, "portfolio": "Environment"},
    # Opportunities
    {"condition": lambda p: p.jobs_and_commerce > 75 and p.schools_and_universities > 60,
     "name": "Tech Investment Wave", "type": "opportunity", "severity": 2,
     "effects": {"jobs_and_commerce": 4.0, "transit_and_roads": 2.0}, "portfolio": "Finance & Economy"},
    {"condition": lambda p: p.hospitals_and_clinics > 70 and p.water_power_sanitation > 65,
     "name": "WHO Health Recognition", "type": "opportunity", "severity": 2,
     "effects": {"hospitals_and_clinics": 2.0, "community_and_spaces": 1.0}, "portfolio": "Health & Education"},
]

# Stochastic event pool
# city_types: list of geographic keyword substrings to match against city_profile.geographic_character
# (case-insensitive). Use ["all"] to match every city.
STOCHASTIC_CRISES = [
    {"name": "Monsoon Flooding",    "severity": 2, "effects": {"transit_and_roads": -3.0, "hospitals_and_clinics": -2.0},                                  "portfolio": "Infrastructure",     "city_types": ["coastal", "monsoon", "tropical", "delta", "river", "peninsula"]},
    {"name": "Factory Fire",        "severity": 1, "effects": {"air_quality_and_pollution": -4.0, "jobs_and_commerce": -2.0},                              "portfolio": "Environment",        "city_types": ["all"]},
    {"name": "Teachers Strike",     "severity": 1, "effects": {"schools_and_universities": -3.0},                                                          "portfolio": "Health & Education", "city_types": ["all"]},
    {"name": "Water Main Collapse", "severity": 2, "effects": {"water_power_sanitation": -5.0, "hospitals_and_clinics": -2.0},                            "portfolio": "Infrastructure",     "city_types": ["all"]},
    {"name": "Power Grid Failure",  "severity": 2, "effects": {"water_power_sanitation": -3.0, "jobs_and_commerce": -2.0},                                "portfolio": "Infrastructure",     "city_types": ["all"]},
    {"name": "Heat Wave",           "severity": 2, "effects": {"hospitals_and_clinics": -3.0, "water_power_sanitation": -2.0},                            "portfolio": "Health & Education", "city_types": ["arid", "desert", "continental", "landlocked"]},
    {"name": "Storm Surge Flooding","severity": 3, "effects": {"transit_and_roads": -4.0, "affordable_housing": -3.0},                                    "portfolio": "Infrastructure",     "city_types": ["coastal", "archipelago", "peninsula", "harbor", "bay", "gulf"]},
    {"name": "Earthquake Damage",   "severity": 3, "effects": {"transit_and_roads": -3.0, "water_power_sanitation": -3.0, "hospitals_and_clinics": -2.0}, "portfolio": "Infrastructure",     "city_types": ["seismic", "highland", "mountain", "hillside", "volcanic", "peninsula"]},
    {"name": "Tech Layoffs Wave",   "severity": 1, "effects": {"jobs_and_commerce": -4.0, "affordable_housing": -2.0},                                    "portfolio": "Finance & Economy",  "city_types": ["tech", "silicon", "startup", "innovation", "financial"]},
    {"name": "Port Strike",         "severity": 2, "effects": {"jobs_and_commerce": -3.0, "transit_and_roads": -2.0},                                     "portfolio": "Finance & Economy",  "city_types": ["coastal", "harbor", "port", "archipelago", "bay", "gulf"]},
    {"name": "Dust Storm",          "severity": 1, "effects": {"air_quality_and_pollution": -5.0, "community_and_spaces": -2.0},                          "portfolio": "Environment",        "city_types": ["desert", "arid", "plain", "landlocked"]},
    {"name": "River Bank Erosion",  "severity": 2, "effects": {"affordable_housing": -3.0, "transit_and_roads": -2.0},                                    "portfolio": "Infrastructure",     "city_types": ["river", "delta", "basin", "floodplain"]},
]

STOCHASTIC_OPPORTUNITIES = [
    {"name": "International Tourism Surge",   "effects": {"jobs_and_commerce": 3.0, "community_and_spaces": 2.0},      "portfolio": "Finance & Economy",   "city_types": ["all"]},
    {"name": "NGO Housing Grant",             "effects": {"affordable_housing": 4.0},                                  "portfolio": "Housing & Community", "city_types": ["all"]},
    {"name": "Federal Infrastructure Fund",  "effects": {"transit_and_roads": 3.0, "water_power_sanitation": 2.0},   "portfolio": "Infrastructure",      "city_types": ["all"]},
    {"name": "Maritime Trade Boom",           "effects": {"jobs_and_commerce": 4.0, "transit_and_roads": 2.0},        "portfolio": "Finance & Economy",   "city_types": ["coastal", "harbor", "port", "archipelago", "bay", "gulf", "peninsula"]},
    {"name": "Tech Investment Influx",        "effects": {"jobs_and_commerce": 5.0, "schools_and_universities": 2.0}, "portfolio": "Finance & Economy",   "city_types": ["tech", "silicon", "startup", "innovation", "financial", "coastal"]},
    {"name": "Ecotourism Recognition",        "effects": {"community_and_spaces": 3.0, "jobs_and_commerce": 2.0},    "portfolio": "Finance & Economy",   "city_types": ["highland", "mountain", "forest", "coastal", "tropical", "river"]},
    {"name": "Regional Agricultural Surplus", "effects": {"jobs_and_commerce": 3.0, "affordable_housing": 1.0},      "portfolio": "Finance & Economy",   "city_types": ["plain", "delta", "basin", "landlocked", "river", "agricultural"]},
]


def _matches_geography(city_types: list[str], geographic_character: str) -> bool:
    """Return True if geographic_character contains any keyword from city_types (case-insensitive)."""
    if "all" in city_types:
        return True
    gc_lower = geographic_character.lower()
    return any(kw in gc_lower for kw in city_types)

# Election-season pressure event (one-time, triggers when election is 2 turns away)
ELECTION_PRESSURE_EVENT_NAME = "Election Season Scrutiny"
_ELECTION_PRESSURE_SPEC = {
    "name": ELECTION_PRESSURE_EVENT_NAME,
    "type": "crisis",
    "severity": 1,
    "effects": {"media_freedom": -1.0, "admin_efficiency": -1.0},
    "portfolio": "Governance Reform",
}


def maybe_trigger_election_pressure(
    existing_event_names: set[str],
    turns_to_election: int,
) -> list[ActiveEvent]:
    """Trigger the Election Season Scrutiny event once when turns_to_election <= 2."""
    import uuid
    if turns_to_election > 2:
        return []
    if ELECTION_PRESSURE_EVENT_NAME in existing_event_names:
        return []
    spec = _ELECTION_PRESSURE_SPEC
    ev = ActiveEvent(
        id=str(uuid.uuid4())[:8],
        name=spec["name"],
        type=spec["type"],  # type: ignore[arg-type]
        severity=spec["severity"],
        turns_remaining=3,
        escalation_chance=0.0,  # does not escalate — steady background pressure
        city_effects_per_turn=spec["effects"],
        portfolio=spec["portfolio"],
    )
    _log("bad", f"  ELECTION PRESSURE triggered: \"{spec['name']}\"  (turns_to_election={turns_to_election})")
    return [ev]


def apply_election_escalation_multiplier(
    events: list[ActiveEvent],
    turns_to_election: int,
) -> None:
    """During the election window (turns_to_election <= 2), boost crisis severity in-place.
    We raise the escalation_chance of active crises by 0.15 to simulate heightened scrutiny."""
    if turns_to_election > 2:
        return
    for ev in events:
        if ev.type == "crisis" and ev.name != ELECTION_PRESSURE_EVENT_NAME:
            ev.escalation_chance = min(1.0, ev.escalation_chance + 0.15)


def check_threshold_events(
    params: CityParameters,
    existing_event_names: set[str],
) -> list[ActiveEvent]:
    """Section 12.1 — deterministic triggers."""
    import uuid
    triggered = []
    p = params
    for trigger in THRESHOLD_TRIGGERS:
        if trigger["condition"](p) and trigger["name"] not in existing_event_names:
            ev = ActiveEvent(
                id=str(uuid.uuid4())[:8],
                name=trigger["name"],
                type=trigger["type"],  # type: ignore[arg-type]
                severity=trigger["severity"],
                turns_remaining=3,
                city_effects_per_turn=trigger["effects"],
                portfolio=trigger["portfolio"],
            )
            triggered.append(ev)
            tag = "bad" if trigger["type"] == "crisis" else "good"
            _log(tag, f"  THRESHOLD triggered: \"{trigger['name']}\"  sev={trigger['severity']}  portfolio={trigger['portfolio']}")
    if not triggered:
        _log("info", "  No threshold events triggered")
    return triggered


def check_stochastic_events(
    params: CityParameters,
    active_count: int,
    rng: random.Random,
    geographic_character: str = "",
) -> list[ActiveEvent]:
    """Section 12.2 — stochastic events, filtered by city geography."""
    import uuid

    # Filter pools to those that match the city's geographic character
    crisis_pool = [s for s in STOCHASTIC_CRISES if _matches_geography(s["city_types"], geographic_character)]
    opp_pool    = [s for s in STOCHASTIC_OPPORTUNITIES if _matches_geography(s["city_types"], geographic_character)]
    # Always ensure at least the "all" events remain (fallback safety)
    if not crisis_pool:
        crisis_pool = [s for s in STOCHASTIC_CRISES if "all" in s["city_types"]]
    if not opp_pool:
        opp_pool = [s for s in STOCHASTIC_OPPORTUNITIES if "all" in s["city_types"]]

    _log("info", f"  Geography pool: {len(crisis_pool)} crises, {len(opp_pool)} opps "
                 f"matching \"{geographic_character[:40]}\"")

    avg = sum([
        params.jobs_and_commerce, params.transit_and_roads,
        params.water_power_sanitation, params.hospitals_and_clinics,
        params.schools_and_universities, params.affordable_housing,
        params.community_and_spaces, params.police_and_emergency,
        params.courts_and_legal, params.air_quality_and_pollution,
    ]) / 10.0

    crisis_chance = 0.15 + max(0, 60 - avg) / 200.0 + active_count * 0.05 - params.admin_efficiency / 400.0
    opp_chance = 0.05 + max(0, avg - 55) / 300.0 + params.admin_efficiency / 500.0 - active_count * 0.03
    _log("calc", f"  Stochastic: avg_params={avg:.1f}, active={active_count}  "
                 f"→  crisis_chance={crisis_chance:.3f}, opp_chance={opp_chance:.3f}")

    new_events = []

    crisis_roll = rng.random()
    if crisis_roll < crisis_chance:
        spec = rng.choice(crisis_pool)
        duration = rng.randint(2, 4)
        new_events.append(ActiveEvent(
            id=str(uuid.uuid4())[:8],
            name=spec["name"],
            type="crisis",
            severity=spec["severity"],
            turns_remaining=duration,
            escalation_chance=0.25,
            city_effects_per_turn=spec["effects"],
            portfolio=spec["portfolio"],
        ))
        _log("bad",  f"  STOCHASTIC crisis: \"{spec['name']}\"  (roll={crisis_roll:.3f} < {crisis_chance:.3f}), {duration} turns")
    else:
        _log("info", f"  No stochastic crisis  (roll={crisis_roll:.3f} ≥ {crisis_chance:.3f})")

    opp_roll = rng.random()
    if opp_roll < opp_chance:
        spec = rng.choice(opp_pool)
        new_events.append(ActiveEvent(
            id=str(uuid.uuid4())[:8],
            name=spec["name"],
            type="opportunity",
            severity=2,
            turns_remaining=2,
            city_effects_per_turn=spec["effects"],
            portfolio=spec["portfolio"],
        ))
        _log("good", f"  STOCHASTIC opportunity: \"{spec['name']}\"  (roll={opp_roll:.3f} < {opp_chance:.3f})")
    else:
        _log("info", f"  No stochastic opportunity  (roll={opp_roll:.3f} ≥ {opp_chance:.3f})")

    return new_events


def step_events(
    events: list[ActiveEvent],
    rng: random.Random,
) -> tuple[list[ActiveEvent], dict[str, float]]:
    """Tick all active events: apply effects, escalate, expire. Returns (remaining, turn_deltas)."""
    remaining = []
    combined_deltas: dict[str, float] = {}

    for ev in events:
        # apply this turn's effects
        for param, delta in ev.city_effects_per_turn.items():
            scaled = delta * (1 + ev.escalation_level * 0.3)
            combined_deltas[param] = combined_deltas.get(param, 0.0) + scaled

        ev.turns_remaining -= 1

        # escalation check
        escalated = False
        if ev.turns_remaining > 0 and rng.random() < ev.escalation_chance:
            ev.escalation_level = min(ev.escalation_level + 1, 2)
            escalated = True

        if ev.turns_remaining > 0:
            remaining.append(ev)
            status = f"ESCALATED (level {ev.escalation_level})" if escalated else f"{ev.turns_remaining} turns left"
            tag = "bad" if ev.type == "crisis" else "good"
            _log(tag,  f"  \"{ev.name}\" — {status}")
        else:
            _log("good", f"  \"{ev.name}\" — RESOLVED")

    return remaining, combined_deltas


def update_communal_tension(
    tension: float,
    baseline: float,
    festival_boost: float,
    delta_community: float,
    delta_police: float,
    minority_police_sensitive: bool,
    crisis_communal: bool,
    crisis_severity: int,
    opposition_identity_mobilized: bool,
    opposition_effectiveness: float,
) -> float:
    """Section 12.5."""
    # drift toward baseline
    tension += (baseline - tension) * 0.05
    # festival boost
    tension += festival_boost
    # policy impacts
    if delta_community > 0:
        tension -= delta_community * 0.8
    if delta_police > 0 and minority_police_sensitive:
        tension += delta_police * 0.3
    # crisis cascade
    if crisis_communal:
        tension += crisis_severity * 3.0
    # opposition identity mobilization
    if opposition_identity_mobilized:
        tension += opposition_effectiveness * 5.0
    return _clamp(tension)
