"""Media engine — narratives, scandal checks, drift.

Section 10 of v4 spec.
"""
from __future__ import annotations

import random

from .models import MediaOutletProfile, MediaOutletState, Minister


def init_media_outlets(profiles: list[MediaOutletProfile]) -> list[MediaOutletState]:
    return [
        MediaOutletState(
            name=o.name,
            lean=o.lean,
            bias_intensity=o.bias_intensity,
            sensationalism=o.sensationalism,
            trust_rating=o.trust_rating,
            reach=o.reach,
            initial_trust=o.trust_rating,
            initial_reach=o.reach,
        )
        for o in profiles
    ]


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def compute_narrative_envelope(
    outlet: MediaOutletState,
    actual_performance: float,  # 0–100
    crisis_active: bool,
    crisis_impact: float,
    policy_impact: float,
) -> dict:
    """Section 10.2."""
    lean_sign = {"mayor": 1, "opposition": -1, "neutral": 0}
    bias_sign = lean_sign.get(outlet.lean, 0)
    perceived = actual_performance + (outlet.bias_intensity / 100.0) * bias_sign * 8.0
    perceived = _clamp(perceived, 0.0, 100.0)

    if crisis_active:
        drama = crisis_impact * (1.0 + outlet.sensationalism / 100.0)
    else:
        drama = policy_impact * (1.0 - outlet.sensationalism / 300.0)

    return {
        "outlet": outlet.name,
        "lean": outlet.lean,
        "perceived_performance": perceived,
        "drama": drama,
        "trust_rating": outlet.trust_rating,
        "reach": outlet.reach,
    }


def check_scandal_break(
    minister: Minister,
    outlets: list[MediaOutletState],
    opposition_pressure: float,
    media_freedom: float,
    rng: random.Random,
) -> bool:
    """Section 10.4 — returns True if scandal breaks this turn."""
    if minister.state.scandal_exposure <= 20:
        return False
    has_investigative = any(
        o.trust_rating > 50 and o.lean != "mayor" for o in outlets
    )
    inv_factor = 1.0 if has_investigative else 0.3
    prob = (
        minister.state.scandal_exposure / 100.0
        * media_freedom / 100.0
        * inv_factor
        * (1.0 + opposition_pressure * 0.30)
    )
    return rng.random() < prob


def apply_media_drift(
    outlets: list[MediaOutletState],
    interim_approval: float,
    delta_p13: float,
    rng: random.Random,
) -> list[MediaOutletState]:
    """Section 10.6 — modifies outlets in-place and returns them."""
    for o in outlets:
        # Trust erosion when biased in a free press
        if delta_p13 > 0 and o.bias_intensity > 60:  # using p13 as proxy for free press
            o.trust_rating = _clamp(o.trust_rating - 0.5)
        if o.bias_intensity < 40:
            o.trust_rating = _clamp(o.trust_rating + 0.3, hi=o.initial_trust + 10)

        # Lean drift based on popularity
        if interim_approval > 70 and o.lean == "neutral" and rng.random() < 0.10:
            o.lean = "mayor"
        if interim_approval < 30 and o.lean == "neutral" and rng.random() < 0.10:
            o.lean = "opposition"

        # Suppression from media freedom drop
        if delta_p13 < -5:
            if o.lean == "opposition":
                o.reach = max(10.0, o.reach - 5)
            elif o.lean == "mayor":
                o.reach = min(o.initial_reach + 15, o.reach + 3)

        # Recovery when media freedom rises
        if delta_p13 > 3:
            if o.reach < o.initial_reach:
                o.reach = min(o.initial_reach, o.reach + 1.0)
            elif o.reach > o.initial_reach:
                o.reach = max(o.initial_reach, o.reach - 1.0)

    return outlets
