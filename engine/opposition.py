"""Opposition engine — attacks, counter-frames, credibility evolution.

Section 11 of v4 spec.
"""
from __future__ import annotations

import random

from .models import Citizen, CityParameters, MediaOutletState


# Impact Matrix row sums (for PublicSalience weights)
PARAM_SALIENCE: dict[str, float] = {
    "jobs_and_commerce": 0.85,
    "transit_and_roads": 0.30,
    "water_power_sanitation": 0.35,
    "hospitals_and_clinics": 0.50,
    "schools_and_universities": 0.25,
    "affordable_housing": 0.45,
    "community_and_spaces": 0.35,
    "police_and_emergency": 0.40,
    "courts_and_legal": 0.30,
    "air_quality_and_pollution": 0.25,
    "admin_efficiency": 0.0,
    "anti_corruption": 0.0,
    "media_freedom": 0.0,
}

ATTACK_STRATEGIES = [
    "Delivery Failure",
    "Corruption Accusation",
    "Identity Mobilization",
    "Crisis Blame",
    "Fiscal Mismanagement",
    "Populist Promise",
]


def pick_attack_strategy(
    leader: Citizen,
    params_before: dict[str, float],
    params_after: dict[str, float],
    execution_score: float,
    scandal_broke: bool,
    active_crisis: bool,
    outstanding_debt: float,
    max_debt: float,
    turns_to_election: int,
) -> str:
    """Section 11.2 — pick the attack strategy with highest expected impact."""
    # Check fast conditions first
    if scandal_broke:
        return "Corruption Accusation"
    if active_crisis:
        return "Crisis Blame"
    if outstanding_debt > max_debt * 0.5:
        return "Fiscal Mismanagement"
    if turns_to_election <= 3:
        return "Populist Promise"

    # Vulnerability scoring
    best_score = -1.0
    best_strategy = "Delivery Failure"
    for param, current_val in params_after.items():
        prev_val = params_before.get(param, current_val)
        salience = PARAM_SALIENCE.get(param, 0.0)
        recent_decline = max(1.0, 1.0 + (prev_val - current_val) * 0.2)
        vuln = max(0, 60 - current_val) * recent_decline * salience
        if vuln > best_score:
            best_score = vuln

    if execution_score < 0.50:
        return "Delivery Failure"

    # low-competence leaders pick randomly
    if leader.capability.competence < 40:
        return random.choice(ATTACK_STRATEGIES[:3])

    return best_strategy


def compute_opposition_effectiveness(
    leader: Citizen,
    strategy: str,
    execution_score: float,
    outlets: list[MediaOutletState],
    avg_wellbeing: float,
    attack_credibility: float,
    credibility_score: float,
) -> float:
    """Section 11.3."""
    media_amp = sum(o.reach * o.trust_rating for o in outlets if o.lean == "opposition")
    total_media = sum(o.reach * o.trust_rating for o in outlets)
    media_factor = media_amp / max(total_media, 1.0)
    frustration = max(0.0, (60 - avg_wellbeing) / 100.0)

    raw = (
        leader.capability.competence / 100.0 * 0.30
        + attack_credibility * 0.30
        + media_factor * 0.25
        + frustration * 0.15
    )
    # Scale by opposition credibility
    scaled = raw * (credibility_score / 50.0)
    return max(0.0, min(1.0, scaled))


COUNTER_FRAME_BASE: dict[str, float] = {
    "Delivery Receipts": 0.60,
    "Empathy + Relief": 0.55,
    "Accountability Pivot": 0.70,
    "Attack the Attacker": 0.50,
    "Populist Counter": 0.65,
}


def counter_effectiveness(
    strategy: str,
    execution_score: float,
    avg_wellbeing_of_target: float,
    anti_corruption: float,
    media_freedom: float,
    opp_integrity: float,
    turns_since_last_populist: int,
    outlets: list[MediaOutletState],
) -> float:
    """Section 11.4."""
    base = COUNTER_FRAME_BASE.get(strategy, 0.50)
    context_map = {
        "Delivery Receipts": min(1.5, execution_score * 1.5),
        "Empathy + Relief": 1.0 + (60 - avg_wellbeing_of_target) / 100.0,
        "Accountability Pivot": 1.0 + (anti_corruption / 100.0) * 0.5,
        "Attack the Attacker": (100 - opp_integrity) / 100.0 * media_freedom / 100.0,
        "Populist Counter": max(0.3, 1.2 - turns_since_last_populist * 0.15),
    }
    context = context_map.get(strategy, 1.0)
    mayor_media = sum(o.reach * o.trust_rating for o in outlets if o.lean == "mayor")
    total_media = sum(o.reach * o.trust_rating for o in outlets)
    media_amp = mayor_media / max(total_media, 1.0)
    return max(0.0, min(1.0, base * context * max(0.5, media_amp)))


def update_opposition_credibility(
    current: float,
    attack_landed: bool,
    attack_fabricated: bool,
    media_freedom: float,
    attack_credibility: float,
    attack_relevant: bool,
) -> float:
    """Section 11.5."""
    delta = 0.0
    if attack_landed and not attack_fabricated:
        delta += 3.0
    if attack_fabricated and media_freedom > 60 and attack_credibility < 0.4:
        delta -= 5.0
    if not attack_relevant:
        delta -= 2.0
    return max(0.0, min(100.0, current + delta))


def opposition_alignment_push(
    net_impact: float,
    engagement: float,
) -> float:
    """Per-citizen alignment push from opposition (negative)."""
    return net_impact * engagement * -2.0
