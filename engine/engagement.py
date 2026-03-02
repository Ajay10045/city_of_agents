"""Retention-oriented engagement signals layered on top of core simulation."""
from __future__ import annotations

import random
from typing import Any

from .models import (
    CabinetMoodSummary,
    CityParameters,
    CityPulseSignal,
    DecayCueSignal,
    GameState,
    IdentityTrajectory,
    MediaClimateSignal,
    MediaOutletState,
    MicroEvent,
    Minister,
    Policy,
    UISignals,
    WardReportEntry,
)


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


SECTOR_KEYS = [
    "jobs_and_commerce",
    "transit_and_roads",
    "water_power_sanitation",
    "hospitals_and_clinics",
    "schools_and_universities",
    "affordable_housing",
    "community_and_spaces",
    "police_and_emergency",
    "courts_and_legal",
    "air_quality_and_pollution",
]

THRESHOLD_NEAR_MISS = {
    "police_and_emergency": 30.0,
    "water_power_sanitation": 20.0,
    "admin_efficiency": 20.0,
    "media_freedom": 15.0,
    "air_quality_and_pollution": 15.0,
}


def classify_policy_risk_tone(policy: Policy) -> str:
    if policy.risk_tone:
        return policy.risk_tone
    total_target = sum(abs(v) for v in policy.target_effects.values())
    total_side = sum(abs(v) for v in policy.side_effects.values())
    if policy.portfolio == "Governance Reform" or policy.time_profile.get("turn_2", 0) > 0:
        return "structural"
    if total_target >= 10 and total_side >= 5:
        return "transformative"
    if total_side >= 4:
        return "high"
    return "low"


def compute_city_stability(
    params: CityParameters,
    active_events_count: int,
    decaying_count: int,
    previous_score: float,
) -> tuple[float, CityPulseSignal]:
    p = params.as_dict()
    low_count = sum(1 for k in SECTOR_KEYS if p.get(k, 50.0) < 40.0)
    governance = (params.admin_efficiency + params.anti_corruption + params.media_freedom) / 3.0
    weakest = min(p.get(k, 50.0) for k in SECTOR_KEYS)
    crisis_proximity = _clamp((25.0 - weakest) / 25.0, 0.0, 1.0) + min(active_events_count, 3) * 0.2
    instability = (
        low_count * 8.5
        + decaying_count * 3.2
        + crisis_proximity * 28.0
        + max(0.0, 55.0 - governance) * 0.65
    )
    score = _clamp(100.0 - instability)
    delta = score - previous_score
    if delta >= 2.0:
        trend = "cooling"
    elif delta <= -2.0:
        trend = "rising"
    else:
        trend = "steady"
    if score >= 66:
        band = "stable"
    elif score >= 40:
        band = "fragile"
    else:
        band = "stressed"
    intensity = _clamp((100.0 - score) + (8.0 if trend == "rising" else 0.0))
    return score, CityPulseSignal(band=band, trend=trend, intensity=intensity)


def compute_media_climate(
    outlets: list[MediaOutletState],
    active_events_count: int,
    interim_approval: float,
) -> MediaClimateSignal:
    if not outlets:
        return MediaClimateSignal()
    avg_sensationalism = sum(o.sensationalism for o in outlets) / len(outlets)
    opposition_pressure = sum(o.reach for o in outlets if o.lean == "opposition") / max(len(outlets), 1)
    pressure = _clamp(
        avg_sensationalism * 0.35
        + opposition_pressure * 0.25
        + max(0.0, 60.0 - interim_approval) * 0.8
        + min(active_events_count, 3) * 12.0
    )
    if pressure >= 58:
        return MediaClimateSignal(state="Frenzy", animation="shake", intensity=pressure)
    if pressure >= 34:
        return MediaClimateSignal(state="Scrutiny", animation="pulse", intensity=pressure)
    return MediaClimateSignal(state="Calm", animation="none", intensity=pressure)


def compute_decay_cues(params: CityParameters, anti_corruption_drop: float = 0.0) -> DecayCueSignal:
    return DecayCueSignal(
        smog_overlay=_clamp((45.0 - params.air_quality_and_pollution) * 2.0),
        infra_crack=_clamp((45.0 - params.transit_and_roads) * 2.0),
        desaturation=_clamp((40.0 - params.admin_efficiency) * 2.4),
        anticorruption_flicker=params.anti_corruption < 35.0 or anti_corruption_drop < -1.0,
    )


def _infer_poor_group_signal(ward_report: list[WardReportEntry]) -> tuple[float, float]:
    poor_like = [
        e for e in ward_report
        if e.group_type == "income" and ("poor" in e.group_name.lower() or "lower_mid" in e.group_name.lower())
    ]
    if not poor_like:
        return 50.0, 0.0
    poor_approval = sum(e.approval for e in poor_like) / len(poor_like)
    poor_delta = sum(e.avg_wellbeing_delta for e in poor_like) / len(poor_like)
    return poor_approval, poor_delta


def update_election_risk_shadow(
    previous_shadow: float,
    params: CityParameters,
    ward_report: list[WardReportEntry],
) -> float:
    poor_approval, poor_delta = _infer_poor_group_signal(ward_report)
    governance_trust = (params.admin_efficiency + params.anti_corruption + params.media_freedom) / 3.0
    target = _clamp(
        44.0
        + max(0.0, 55.0 - poor_approval) * 0.50
        + max(0.0, -poor_delta) * 12.0
        + max(0.0, 50.0 - params.affordable_housing) * 0.28
        + max(0.0, 50.0 - params.jobs_and_commerce) * 0.22
        + max(0.0, 55.0 - governance_trust) * 0.30
    )
    alpha = 0.18
    return _clamp(previous_shadow * (1.0 - alpha) + target * alpha)


def projected_election_approval(interim_approval: float, election_risk_shadow: float) -> float:
    return _clamp(interim_approval - election_risk_shadow * 0.18)


def update_minister_tension_arc(
    minister: Minister,
    leakage_rate: float,
    execution_pressure: float,
    public_backlash: float,
    media_freedom: float,
    opposition_pressure: float,
    governance_strength: float,
    rng: random.Random,
) -> None:
    s = minister.state
    progress_delta = (
        leakage_rate * 55.0
        + execution_pressure * 1.0
        + public_backlash * 0.02
        + max(0.0, 60.0 - governance_strength) * 0.02
        + opposition_pressure * 0.015
    )
    s.corruption_progress = _clamp(s.corruption_progress + progress_delta, 0.0, 100.0)
    stage_thresholds = [24.0, 46.0, 70.0, 90.0]
    stage = 0
    for idx, th in enumerate(stage_thresholds, start=1):
        if s.corruption_progress >= th:
            stage = idx
    if stage > s.corruption_stage:
        s.corruption_stage = stage
    if s.corruption_stage >= 3 and media_freedom > 45 and rng.random() < 0.18:
        s.scandal_exposure = _clamp(s.scandal_exposure + 4.0)
    if leakage_rate > 0.12:
        s.scandal_exposure = _clamp(s.scandal_exposure + 2.0)
    mood_score = (
        s.scandal_exposure * 0.42
        + s.corruption_stage * 8.0
        + max(0.0, public_backlash) * 0.22
        + execution_pressure * 0.8
    )
    s.mood_intensity = _clamp(mood_score)
    if s.mood_intensity >= 82 or (s.corruption_stage >= 4 and s.scandal_exposure >= 70):
        s.mood_state = "exposed"
    elif s.mood_intensity >= 45:
        s.mood_state = "stressed"
    else:
        s.mood_state = "stable"
    s.mood_flicker = bool(s.mood_state == "exposed" and s.scandal_exposure >= 78 and rng.random() < 0.25)


def summarize_cabinet_mood(ministers: list[Minister]) -> CabinetMoodSummary:
    summary = CabinetMoodSummary()
    for m in ministers:
        mood = m.state.mood_state
        if mood == "exposed":
            summary.exposed += 1
        elif mood == "stressed":
            summary.stressed += 1
        else:
            summary.stable += 1
        if m.state.mood_flicker:
            summary.flicker_count += 1
    return summary


def detect_near_misses(
    params: CityParameters,
    election_projection: float,
    ministers: list[Minister],
) -> list[str]:
    messages: list[str] = []
    p = params.as_dict()
    for key, threshold in THRESHOLD_NEAR_MISS.items():
        val = p.get(key, 50.0)
        if threshold <= val <= threshold + 2.0:
            label = key.replace("_", " ")
            messages.append(f"City narrowly avoided {label} threshold breach.")
            break
    if 48.0 <= election_projection <= 52.0:
        messages.append("Election momentum is balanced on a razor's edge.")
    risky = [m for m in ministers if 70.0 <= m.state.scandal_exposure <= 90.0]
    if risky:
        messages.append(f"{risky[0].citizen.name} is one leak away from a scandal wave.")
    return messages


def update_identity_trajectory(
    traj: IdentityTrajectory,
    policy: Policy,
    minor_action_type: str,
    active_events_count: int,
    execution_score: float,
) -> str:
    traj.turns_recorded += 1
    targets = set(policy.target_effects.keys()) | set(policy.side_effects.keys())
    if minor_action_type == "governance_upkeep" or policy.portfolio == "Governance Reform":
        traj.governance_investment += 1.0
    if {"affordable_housing", "jobs_and_commerce"} & targets:
        traj.housing_jobs_focus += 1.0
    if minor_action_type == "press_conference" or "media_freedom" in targets:
        traj.press_usage += 1.0
    if active_events_count > 0 and execution_score >= 0.55:
        traj.crisis_management += 1.0
    if policy.time_profile.get("turn_0", 1.0) >= 0.85 and policy.budget_cost <= 150.0:
        traj.populist_quick_wins += 0.8
    turns = max(1, traj.turns_recorded)
    gov = traj.governance_investment / turns
    build = traj.housing_jobs_focus / turns
    press = traj.press_usage / turns
    crisis = traj.crisis_management / turns
    pop = traj.populist_quick_wins / turns
    if gov >= 0.42 and press >= 0.24:
        traj.archetype = "Reformer"
    elif pop >= 0.45:
        traj.archetype = "Populist"
    elif build >= 0.45:
        traj.archetype = "Builder"
    elif gov >= 0.38:
        traj.archetype = "Technocrat"
    elif crisis >= 0.35:
        traj.archetype = "Survivor"
    else:
        traj.archetype = "Survivor"
    return traj.archetype


def split_delayed_deltas(
    all_deltas: dict[str, float],
    time_profile: dict[str, float],
    current_turn: int,
    pending_deltas: dict[int, dict[str, float]],
) -> tuple[dict[str, float], list[str]]:
    profile = time_profile or {"turn_0": 1.0}
    immediate = {k: v * profile.get("turn_0", 1.0) for k, v in all_deltas.items()}
    queued_teasers: list[str] = []
    for key, frac in profile.items():
        if key == "turn_0":
            continue
        try:
            turn_offset = int(key.replace("turn_", ""))
        except ValueError:
            continue
        apply_turn = current_turn + turn_offset
        carry = pending_deltas.setdefault(apply_turn, {})
        for param, val in all_deltas.items():
            carry[param] = carry.get(param, 0.0) + val * frac
            queued_teasers.append(f"{param.replace('_', ' ')} repercussions expected by turn {apply_turn}.")
    return immediate, queued_teasers


MICRO_EVENT_POOL: list[dict[str, Any]] = [
    {
        "key": "minister_dispute",
        "title": "Cabinet Friction",
        "narrative": "A ministerial disagreement leaked into public view and slowed coordination.",
        "delta": {"admin_efficiency": -0.7, "media_freedom": -0.3},
    },
    {
        "key": "viral_clip",
        "title": "Citizen Viral Clip",
        "narrative": "A citizen video about daily life went viral and shifted conversation overnight.",
        "delta": {"community_and_spaces": 0.5, "media_freedom": 0.2},
    },
    {
        "key": "bureaucratic_slowdown",
        "title": "Bureaucratic Slowdown",
        "narrative": "File clearances lagged this week, muting visible policy delivery.",
        "delta": {"admin_efficiency": -0.8},
    },
    {
        "key": "international_praise",
        "title": "International Praise",
        "narrative": "An external institution publicly praised city governance priorities.",
        "delta": {"jobs_and_commerce": 0.4, "community_and_spaces": 0.3},
    },
]


def maybe_generate_micro_events(
    state: GameState,
    rng: random.Random,
) -> list[MicroEvent]:
    turns_since = state.current_turn - state.last_micro_event_turn
    if turns_since < 2:
        return []
    if turns_since == 2:
        should_fire = True
    elif turns_since == 3:
        should_fire = True
    else:
        should_fire = rng.random() < 0.45
    if not should_fire:
        return []
    spec = rng.choice(MICRO_EVENT_POOL)
    state.last_micro_event_turn = state.current_turn
    return [MicroEvent(**spec)]


def build_ui_signals(
    pulse: CityPulseSignal,
    media_climate: MediaClimateSignal,
    election_shadow: float,
    cabinet_mood: CabinetMoodSummary,
    archetype: str,
    decay_cues: DecayCueSignal,
) -> UISignals:
    return UISignals(
        city_pulse=pulse,
        media_climate=media_climate,
        election_shadow_intensity=_clamp(election_shadow),
        cabinet_mood=cabinet_mood,
        identity_archetype=archetype,
        decay_cues=decay_cues,
    )
