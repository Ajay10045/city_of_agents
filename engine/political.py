"""Political feedback — alignment, approval, polling.

Section 9 of v4 spec.
"""
from __future__ import annotations

from .models import Citizen, MediaOutletState, WellbeingState


def _clamp(v: float, lo: float = -100.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def wellbeing_satisfaction_delta(
    citizen: Citizen,
    new_wellbeing: WellbeingState,
) -> float:
    """Section 9.1 — SatisfactionDelta with loss aversion and personality modifier."""
    prev_score = citizen.wellbeing.score()
    new_score = new_wellbeing.score()
    delta_wb = new_score - prev_score

    p = citizen.personality
    personality_mod = (
        (p.authority_respect - 50) * 0.015
        + (p.risk_appetite - 50) * 0.008
        - (p.integrity - 50) * 0.012
        + (p.corruption_tolerance - 50) * 0.005
    )
    sat_delta = delta_wb + personality_mod
    # loss aversion
    if sat_delta < 0:
        sat_delta *= 1.5
    return sat_delta


def political_engagement(citizen: Citizen, media_freedom: float) -> float:
    """Section 9.2 — 0.0–1.0."""
    urban_factor_map = {"Urban Core": 80, "Suburban": 60, "Peri-Urban": 40, "Rural": 25}
    age_factor_map = {"36-50": 70, "51-65": 70, "26-35": 55, "65+": 50, "18-25": 40}
    urban_f = urban_factor_map.get(citizen.demographics.location, 50)
    age_f = age_factor_map.get(citizen.demographics.age_group, 50)
    ambition_boost = 70 if citizen.personality.ambition > 60 else 40

    raw = (
        citizen.demographics.education_level * 0.30
        + citizen.demographics.income_percentile * 0.15
        + urban_f * 0.15
        + age_f * 0.10
        + media_freedom * 0.20
        + ambition_boost * 0.10
    ) / 100.0
    return max(0.0, min(1.0, raw))


def _media_push(
    citizen: Citizen,
    outlets: list[MediaOutletState],
    media_freedom: float,
) -> float:
    """Compute media alignment push for one citizen (Section 9.3)."""
    # citizen media influence
    location_access = {"Urban Core": 1.0, "Suburban": 0.85, "Peri-Urban": 0.70, "Rural": 0.55}
    loc_acc = location_access.get(citizen.demographics.location, 0.80)
    media_exposure = (media_freedom / 100.0) * loc_acc * (0.5 + citizen.demographics.education_level / 200.0)
    critical_thinking = citizen.demographics.education_level / 150.0
    media_influence = max(0.05, min(0.80, media_exposure * (1 - critical_thinking)))

    # weighted bias from outlets
    total_weight = sum(o.reach * o.trust_rating for o in outlets)
    if total_weight == 0:
        return 0.0

    lean_sign = {"mayor": 1, "opposition": -1, "neutral": 0}
    weighted_bias = sum(
        (o.bias_intensity / 100.0) * lean_sign.get(o.lean, 0) * o.reach * o.trust_rating
        for o in outlets
    ) / total_weight

    return weighted_bias * media_influence * 0.50


def update_mayor_alignment(
    citizen: Citizen,
    new_wellbeing: WellbeingState,
    outlets: list[MediaOutletState],
    media_freedom: float,
    opposition_push: float = 0.0,
) -> float:
    """Section 9.3 — sticky alignment update, max ±1.2/turn."""
    sat_delta = wellbeing_satisfaction_delta(citizen, new_wellbeing)
    engagement = political_engagement(citizen, media_freedom)
    raw_shift = sat_delta * engagement * 2.0
    media_p = _media_push(citizen, outlets, media_freedom)
    total_drift = _clamp(raw_shift + media_p + opposition_push, lo=-8.0, hi=8.0)
    new_alignment = citizen.mayor_alignment + total_drift * 0.15
    return _clamp(new_alignment, lo=-100.0, hi=100.0)


def compute_interim_approval(citizens: list[Citizen], media_freedom: float) -> float:
    """Section 9.4 — approval from active citizens (engagement > 0.30)."""
    threshold = 0.30
    numerator = 0.0
    denominator = 0.0
    for c in citizens:
        eng = political_engagement(c, media_freedom)
        if eng <= threshold:
            continue
        approval_val = (c.mayor_alignment + 100) / 200.0
        numerator += approval_val * eng * c.population_weight
        denominator += eng * c.population_weight
    if denominator == 0:
        # Fallback: simple population-weighted mean alignment (avoids hardcoded 50%)
        total_weight = sum(c.population_weight for c in citizens)
        if total_weight == 0:
            return 50.0
        weighted_align = sum(((c.mayor_alignment + 100) / 200.0) * c.population_weight for c in citizens)
        return (weighted_align / total_weight) * 100.0
    return (numerator / denominator) * 100.0


def compute_election_approval(citizens: list[Citizen]) -> float:
    """Section 9.6 — full population approval for election day."""
    numerator = sum(((c.mayor_alignment + 100) / 200.0) * c.population_weight for c in citizens)
    denominator = sum(c.population_weight for c in citizens)
    if denominator == 0:
        return 50.0
    return (numerator / denominator) * 100.0
