"""Budget & resource system — revenue, debt, decay.

Section 14 of v4 spec.
"""
from __future__ import annotations

from .models import CityParameters, MinorAction


def compute_tax_revenue(params: CityParameters, base_tax_revenue: float) -> float:
    """Section 14.1."""
    corruption_leakage = (100 - params.anti_corruption) / 100.0 * 0.15
    return base_tax_revenue * (params.jobs_and_commerce / 50.0) * (1 - corruption_leakage)


def process_interest_payment(outstanding_debt: float, interest_rate: float) -> float:
    """Returns interest payment amount (deducted from treasury before revenue)."""
    return outstanding_debt * interest_rate


def process_auto_repayment(treasury: float, outstanding_debt: float) -> tuple[float, float]:
    """Section 14.2 — auto-repay if treasury > 200."""
    if treasury > 200 and outstanding_debt > 0:
        repayment = min(treasury - 200, outstanding_debt * 0.25)
        return treasury - repayment, outstanding_debt - repayment
    return treasury, outstanding_debt


def apply_minor_action_budget(
    treasury: float,
    action: MinorAction,
    bonus_banking: float = 20.0,
) -> float:
    """Return treasury after applying minor action cost/bonus."""
    if action.type == "banking":
        treasury += bonus_banking
    else:
        treasury -= action.budget
    return treasury


def apply_maintenance_decay(
    params: CityParameters,
    targeted_this_turn: set[str],
    targeted_last_turn: set[str],
    admin_efficiency: float,
) -> CityParameters:
    """Decay disabled — returns params unchanged."""
    return params


def apply_corruption_consequences(
    params: CityParameters,
    budget_stolen: float,
    base_budget: float,
) -> CityParameters:
    """Section 7.4 — corruption degrades P11 and P12."""
    data = params.as_dict()
    ratio = budget_stolen / max(base_budget, 1.0)
    data["anti_corruption"] = max(0.0, data["anti_corruption"] - ratio * 3.0)
    data["admin_efficiency"] = max(0.0, data["admin_efficiency"] - ratio * 1.5)
    return CityParameters(**data)


def debt_political_effects(outstanding_debt: float, max_debt: float) -> dict:
    """Return flags for fiscal warning and fiscal crisis states."""
    ratio = outstanding_debt / max(max_debt, 1.0)
    return {
        "fiscal_warning": ratio > 0.50,
        "fiscal_crisis": ratio > 0.80,
        "revenue_penalty": 0.10 if ratio > 0.80 else 0.0,
        "admin_drain": 0.5 if ratio > 0.50 else 0.0,
        "loyalty_drain": -3.0 if ratio > 0.80 else 0.0,
    }
