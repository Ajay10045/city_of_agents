"""End-of-game scorecard and legacy titles.

Section 17 of v4 spec.
"""
from __future__ import annotations

from .models import Citizen, GameState, GovernanceScorecard


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def check_loss_conditions(state: GameState) -> str | None:
    """Section 17.1 — return reason if lost, else None."""
    p = state.city_params
    if p.admin_efficiency < 10:
        # check 3 consecutive turns
        recent = state.turn_history[-3:]
        if len(recent) == 3 and all(
            r.city_params_after.get("admin_efficiency", 100) < 10 for r in recent
        ):
            return "Governance Collapse: admin efficiency below 10 for 3 consecutive turns"

    below_15 = sum(
        1 for v in [
            p.police_and_emergency, p.water_power_sanitation, p.hospitals_and_clinics,
            p.jobs_and_commerce, p.air_quality_and_pollution, p.affordable_housing,
        ]
        if v < 15
    )
    if below_15 >= 3:
        return "City in Crisis: 3+ parameters below 15"

    if state.outstanding_debt >= state.city_profile.budget.max_debt and state.treasury < 0:
        return "Bankruptcy"

    recent_wb = []
    for r in state.turn_history[-3:]:
        avg = sum(c.wellbeing.score() for c in state.citizens) / max(len(state.citizens), 1)
        recent_wb.append(avg)
    if len(recent_wb) == 3 and all(w < 20 for w in recent_wb):
        return "Mass Despair"

    return None


def compute_scorecard(
    state: GameState,
    initial_gov_params: dict[str, float],
    total_scandals: int,
    total_defections: int,
    total_stolen: float,
    crises_triggered: int,
    escalations: int,
    resolutions: int,
) -> GovernanceScorecard:
    """Section 17.2."""
    citizens = state.citizens

    # Final approval (election formula)
    from .political import compute_election_approval
    final_approval = compute_election_approval(citizens)

    # Wellbeing equity
    scores = [c.wellbeing.score() for c in citizens]
    wb_equity = _clamp(100.0 - (max(scores) - min(scores))) if scores else 50.0

    # Institutional legacy
    p = state.city_params
    end_gov = p.admin_efficiency + p.anti_corruption + p.media_freedom
    start_gov = (initial_gov_params.get("admin_efficiency", 50)
                 + initial_gov_params.get("anti_corruption", 50)
                 + initial_gov_params.get("media_freedom", 50))
    institutional_legacy = _clamp(50 + (end_gov - start_gov) * 2 / 3)

    # Budget health
    st = state.city_profile.budget.starting_treasury
    budget_health = _clamp(
        (state.treasury / max(st, 1)) * 50
        + (1 - state.outstanding_debt / max(state.city_profile.budget.max_debt, 1)) * 50
    )

    # Crisis record
    crisis_record = _clamp(100 - crises_triggered * 5 - escalations * 10 + resolutions * 8)

    # Promise-delivery ratio
    all_scores = [r.execution_score for r in state.turn_history]
    promise_delivery = (sum(all_scores) / len(all_scores) * 100) if all_scores else 50.0

    # Cabinet integrity
    cabinet_integrity = _clamp(
        100 - (total_stolen / max(st, 1)) * 50
        - total_defections * 15
        - total_scandals * 10
    )

    final_score = _clamp(
        final_approval * 0.20
        + wb_equity * 0.15
        + institutional_legacy * 0.20
        + budget_health * 0.10
        + crisis_record * 0.10
        + promise_delivery * 0.10
        + cabinet_integrity * 0.15
    )

    # Legacy title
    if final_score >= 90:
        title = "The Reformer"
    elif final_score >= 70:
        title = "The Steady Hand"
    elif final_score >= 50:
        title = "The Survivor"
    elif final_score >= 30:
        title = "The Populist"
    else:
        title = "The Bureaucrat's Friend"

    return GovernanceScorecard(
        game_id=state.game_id,
        final_approval=final_approval,
        wellbeing_equity=wb_equity,
        institutional_legacy=institutional_legacy,
        budget_health=budget_health,
        crisis_record=crisis_record,
        promise_delivery=promise_delivery,
        cabinet_integrity=cabinet_integrity,
        final_score=final_score,
        legacy_title=title,
        summary=f"Mayor of {state.city_profile.city_name} — {title} — Score: {final_score:.1f}/100",
    )
