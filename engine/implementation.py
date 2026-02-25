"""Implementation Engine — Filter A (minister) × Filter B (city) → actual impact.

Section 6 of v4 spec.
"""
from __future__ import annotations

import random
from dataclasses import dataclass

from .models import CityParameters, Minister, Policy


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


# ─── Debug Logger ─────────────────────────────────────────────────────────────
_RESET = "\033[0m"
_C = {"calc": "\033[0;33m", "good": "\033[0;32m", "bad": "\033[0;31m", "info": "\033[0;37m"}

def _log(tag: str, msg: str) -> None:
    print(f"{_C.get(tag, '')  }[{tag.upper():5s}] {msg}{_RESET}", flush=True)


# Portfolios → their param keys (for portfolio scope validation / penalties)
PORTFOLIO_PARAMS: dict[str, list[str]] = {
    "Finance & Economy": ["jobs_and_commerce"],
    "Infrastructure": ["transit_and_roads", "water_power_sanitation"],
    "Health & Education": ["hospitals_and_clinics", "schools_and_universities"],
    "Housing & Community": ["affordable_housing", "community_and_spaces"],
    "Home Affairs": ["police_and_emergency", "courts_and_legal"],
    "Environment": ["air_quality_and_pollution"],
    "Governance Reform": ["admin_efficiency", "anti_corruption", "media_freedom"],
}


def minister_exec_score(minister: Minister, active_crisis_in_portfolio: bool = False) -> float:
    """Section 6.1 — 0.0–1.0."""
    c = minister.citizen.capability
    score = (
        c.competence * 0.35
        + c.managerial_skill * 0.30
        + minister.citizen.personality.conscientiousness * 0.20
        + c.bureaucratic_navigation * 0.15
    ) / 100.0

    if active_crisis_in_portfolio:
        bonus = c.crisis_handling / 100.0 * 0.10
        score = min(score + bonus, 1.0)

    # Dual portfolio penalty
    total_portfolios = 1 + len(minister.extra_portfolios)
    if total_portfolios == 2:
        score *= 0.85
    elif total_portfolios >= 3:
        score *= 0.75

    return _clamp(score)


def city_filter_score(params: CityParameters) -> float:
    """Section 6.2 — 0.0–1.0."""
    p = params
    institutional_base = (
        p.courts_and_legal * 0.40
        + p.schools_and_universities * 0.35
        + p.police_and_emergency * 0.25
    ) / 100.0 * 100.0

    score = (
        p.admin_efficiency * 0.40
        + p.anti_corruption * 0.30
        + institutional_base * 0.30
    ) / 100.0
    return _clamp(score)


@dataclass
class CorruptionResult:
    intent: float
    window: float
    leakage_rate: float
    budget_stolen: float


def compute_corruption(
    minister: Minister,
    params: CityParameters,
    policy_budget: float,
    max_budget: float,
) -> CorruptionResult:
    """Section 7."""
    intent = (100 - minister.citizen.personality.integrity) / 100.0 * 0.40
    p = params
    window = (
        (100 - p.police_and_emergency) * 0.20
        + (100 - p.courts_and_legal) * 0.20
        + (100 - p.admin_efficiency) * 0.15
        + (100 - p.anti_corruption) * 0.25
        + (100 - p.media_freedom) * 0.20
    ) / 100.0
    budget_factor = min(1.0, policy_budget / max(max_budget, 1.0))
    leakage_rate = intent * window * budget_factor
    budget_stolen = policy_budget * leakage_rate * 0.15
    return CorruptionResult(intent=intent, window=window, leakage_rate=leakage_rate, budget_stolen=budget_stolen)


@dataclass
class ImplementationResult:
    execution_score: float
    actual_deltas: dict[str, float]      # target effects scaled by execution
    side_effect_deltas: dict[str, float] # full negative, scaled positive
    corruption: CorruptionResult
    delivery_details: list[dict]         # per-target: proposed, delivered, ratio


def run_implementation(
    policy: Policy,
    minister: Minister,
    params: CityParameters,
    max_budget: float,
    rng: random.Random,
    active_crisis_in_portfolio: bool = False,
) -> ImplementationResult:
    """Section 6.3–6.6."""
    m_score = minister_exec_score(minister, active_crisis_in_portfolio)
    c = minister.citizen.capability
    p_pers = minister.citizen.personality
    total_portfolios = 1 + len(minister.extra_portfolios)
    penalty_str = f"  ×{0.85 if total_portfolios == 2 else 0.75 if total_portfolios >= 3 else 1.0:.2f} portfolio penalty" if total_portfolios > 1 else ""
    crisis_str = "  +crisis_handling bonus" if active_crisis_in_portfolio else ""
    _log("calc", f"  Minister score: {m_score:.3f}  "
                 f"(comp×0.35={c.competence * 0.35:.1f} + mgr×0.30={c.managerial_skill * 0.30:.1f} + "
                 f"consc×0.20={p_pers.conscientiousness * 0.20:.1f} + bur×0.15={c.bureaucratic_navigation * 0.15:.1f}){penalty_str}{crisis_str}")

    c_score = city_filter_score(params)
    pp = params
    inst = (pp.courts_and_legal * 0.40 + pp.schools_and_universities * 0.35 + pp.police_and_emergency * 0.25) / 100.0 * 100.0
    _log("calc", f"  City filter score: {c_score:.3f}  "
                 f"(admin×0.40={pp.admin_efficiency * 0.40:.1f} + anti_corr×0.30={pp.anti_corruption * 0.30:.1f} + inst×0.30={inst * 0.30:.1f})")

    raw = m_score * 0.55 + c_score * 0.45
    noise = rng.uniform(-0.05, 0.05)
    exec_score = _clamp(raw + noise, lo=0.10, hi=0.95)
    _log("calc", f"  Raw: 0.55×{m_score:.3f} + 0.45×{c_score:.3f} = {raw:.3f}  |  noise: {noise:+.3f}  →  exec_score: {exec_score:.3f}")

    # Section 6.4 — actual deltas
    actual_deltas: dict[str, float] = {}
    for param, intended in policy.target_effects.items():
        if intended > 0:
            actual_deltas[param] = intended * exec_score
        else:
            actual_deltas[param] = intended  # full damage

    # Section 6.7 — side effects
    side_effect_deltas: dict[str, float] = {}
    for param, delta in policy.side_effects.items():
        if delta < 0:
            side_effect_deltas[param] = delta
        else:
            side_effect_deltas[param] = delta * exec_score

    # Section 6.6 — completion targets
    delivery_details = []
    for t in policy.targets:
        raw_ratio = exec_score - t.difficulty + rng.uniform(-0.05, 0.07)
        ratio = max(0.05, min(1.10, raw_ratio))  # v4 fix: floor at 0.05
        delivered = t.proposed * ratio
        delivery_details.append({
            "key": t.key,
            "label": t.label,
            "unit": t.unit,
            "proposed": t.proposed,
            "delivered": delivered,
            "completion_ratio": ratio,
        })

    corruption = compute_corruption(minister, params, policy.budget_cost, max_budget)
    _log("bad" if corruption.budget_stolen > 0 else "info",
         f"  Corruption: intent={corruption.intent:.3f}, window={corruption.window:.3f}, "
         f"leakage={corruption.leakage_rate:.4f}  →  ₹{corruption.budget_stolen:.1f} Cr stolen")

    return ImplementationResult(
        execution_score=exec_score,
        actual_deltas=actual_deltas,
        side_effect_deltas=side_effect_deltas,
        corruption=corruption,
        delivery_details=delivery_details,
    )
