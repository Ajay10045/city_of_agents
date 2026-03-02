"""Wellbeing update — Impact Matrix × identity multipliers × diminishing returns.

Section 8 of v4 spec.
"""
from __future__ import annotations

from .models import Citizen, CityProfile, WellbeingState


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


# Section 8.1 — Impact Matrix (column sums = 1.0 each)
# Sparse representation: Each parameter strongly targets 1-2 wellbeing metrics rather than blending into all 4.
IMPACT_MATRIX: dict[str, dict[str, float]] = {
    "jobs_and_commerce":         {"wealth": 1.0},
    "transit_and_roads":         {"wealth": 0.5, "social": 0.5},
    "water_power_sanitation":    {"health": 0.5, "wealth": 0.5},
    "hospitals_and_clinics":     {"health": 1.0},
    "schools_and_universities":  {"wealth": 0.5, "social": 0.5},
    "affordable_housing":        {"wealth": 0.5, "social": 0.5},
    "community_and_spaces":      {"social": 1.0},
    "police_and_emergency":      {"safety": 1.0},
    "courts_and_legal":          {"safety": 0.8, "social": 0.2},
    "air_quality_and_pollution": {"health": 0.8, "social": 0.2},
}

# Section 8.2 — Income bracket multipliers [param → bracket → multiplier]
INCOME_MULTS: dict[str, dict[str, float]] = {
    "jobs_and_commerce":         {"poor": 1.4, "lower_mid": 1.2, "middle": 1.0, "upper_mid": 0.9, "rich": 0.7},
    "transit_and_roads":         {"poor": 1.2, "lower_mid": 1.1, "middle": 1.0, "upper_mid": 1.0, "rich": 1.0},
    "water_power_sanitation":    {"poor": 1.2, "lower_mid": 1.1, "middle": 1.0, "upper_mid": 1.0, "rich": 1.0},
    "hospitals_and_clinics":     {"poor": 1.3, "lower_mid": 1.1, "middle": 1.0, "upper_mid": 0.9, "rich": 0.8},
    "schools_and_universities":  {"poor": 1.2, "lower_mid": 1.1, "middle": 1.0, "upper_mid": 0.8, "rich": 0.7},
    "affordable_housing":        {"poor": 1.5, "lower_mid": 1.2, "middle": 1.0, "upper_mid": 0.7, "rich": 0.5},
    "community_and_spaces":      {"poor": 1.0, "lower_mid": 1.0, "middle": 1.0, "upper_mid": 1.0, "rich": 1.0},
    "police_and_emergency":      {"poor": 1.2, "lower_mid": 1.0, "middle": 1.0, "upper_mid": 0.9, "rich": 0.8},
    "courts_and_legal":          {"poor": 1.0, "lower_mid": 1.0, "middle": 1.0, "upper_mid": 1.0, "rich": 1.0},
    "air_quality_and_pollution":  {"poor": 1.0, "lower_mid": 1.0, "middle": 1.0, "upper_mid": 1.1, "rich": 1.2},
}

PROFESSION_MULTS: dict[str, dict[str, float]] = {
    "jobs_and_commerce":         {"Informal Worker": 1.4, "Government Employee": 1.0, "Private Sector": 1.3, "Business Owner": 1.4, "Student": 1.0, "Unemployed": 1.6, "Retired": 1.0},
    "transit_and_roads":         {"Informal Worker": 1.3, "Government Employee": 1.0, "Private Sector": 1.1, "Business Owner": 1.3, "Student": 1.2, "Unemployed": 1.0, "Retired": 1.0},
    "water_power_sanitation":    {"Informal Worker": 1.0, "Government Employee": 1.0, "Private Sector": 1.0, "Business Owner": 1.3, "Student": 1.0, "Unemployed": 1.0, "Retired": 1.0},
    "hospitals_and_clinics":     {"Informal Worker": 1.0, "Government Employee": 1.2, "Private Sector": 1.0, "Business Owner": 1.0, "Student": 1.0, "Unemployed": 1.0, "Retired": 1.4},
    "schools_and_universities":  {"Informal Worker": 1.0, "Government Employee": 1.2, "Private Sector": 1.0, "Business Owner": 1.0, "Student": 1.5, "Unemployed": 1.0, "Retired": 1.0},
    "affordable_housing":        {"Informal Worker": 1.2, "Government Employee": 1.0, "Private Sector": 1.0, "Business Owner": 1.0, "Student": 1.0, "Unemployed": 1.3, "Retired": 1.0},
    "community_and_spaces":      {"Informal Worker": 1.0, "Government Employee": 1.0, "Private Sector": 1.0, "Business Owner": 1.0, "Student": 1.3, "Unemployed": 1.0, "Retired": 1.2},
    "police_and_emergency":      {"Informal Worker": 1.2, "Government Employee": 1.0, "Private Sector": 1.0, "Business Owner": 1.2, "Student": 1.0, "Unemployed": 1.0, "Retired": 1.2},
    "courts_and_legal":          {"Informal Worker": 1.0, "Government Employee": 1.2, "Private Sector": 1.2, "Business Owner": 1.3, "Student": 1.0, "Unemployed": 1.0, "Retired": 1.0},
    "air_quality_and_pollution":  {"Informal Worker": 1.0, "Government Employee": 1.0, "Private Sector": 1.0, "Business Owner": 1.0, "Student": 1.0, "Unemployed": 1.0, "Retired": 1.0},
}

LOCATION_MULTS: dict[str, dict[str, float]] = {
    "jobs_and_commerce":         {"Urban Core": 1.2, "Suburban": 1.0, "Peri-Urban": 1.0, "Rural": 0.8},
    "transit_and_roads":         {"Urban Core": 1.2, "Suburban": 1.3, "Peri-Urban": 1.3, "Rural": 1.4},
    "water_power_sanitation":    {"Urban Core": 1.0, "Suburban": 1.0, "Peri-Urban": 1.2, "Rural": 1.4},
    "hospitals_and_clinics":     {"Urban Core": 1.0, "Suburban": 1.0, "Peri-Urban": 1.2, "Rural": 1.3},
    "schools_and_universities":  {"Urban Core": 1.0, "Suburban": 1.2, "Peri-Urban": 1.0, "Rural": 1.2},
    "affordable_housing":        {"Urban Core": 1.3, "Suburban": 1.0, "Peri-Urban": 1.0, "Rural": 1.0},
    "community_and_spaces":      {"Urban Core": 1.2, "Suburban": 1.2, "Peri-Urban": 1.0, "Rural": 1.0},
    "police_and_emergency":      {"Urban Core": 1.2, "Suburban": 1.0, "Peri-Urban": 1.0, "Rural": 1.3},
    "courts_and_legal":          {"Urban Core": 1.0, "Suburban": 1.0, "Peri-Urban": 1.0, "Rural": 1.0},
    "air_quality_and_pollution":  {"Urban Core": 1.3, "Suburban": 1.0, "Peri-Urban": 1.0, "Rural": 1.0},
}


def _get_religion_mult(param: str, religion: str, profile: CityProfile) -> float:
    """Default template per Section 8.2; could be city-specific if LLM provides."""
    religions = [r.name for r in profile.demographics.religion_distribution]
    if not religions:
        return 1.0
    majority = religions[0]
    largest_minority = religions[1] if len(religions) > 1 else None

    minority_sensitive = {"affordable_housing": 1.3, "police_and_emergency": 1.3,
                          "courts_and_legal": 1.2, "community_and_spaces": 1.2,
                          "hospitals_and_clinics": 1.1, "schools_and_universities": 1.2,
                          "water_power_sanitation": 1.1}
    smaller_minority_sensitive = {"affordable_housing": 1.2, "police_and_emergency": 1.2,
                                   "courts_and_legal": 1.1, "community_and_spaces": 1.3,
                                   "hospitals_and_clinics": 1.1, "schools_and_universities": 1.1}

    if religion == majority:
        return 1.0
    if religion == largest_minority:
        return minority_sensitive.get(param, 1.0)
    return smaller_minority_sensitive.get(param, 1.0)


def _ideology_wellbeing_modifier(
    param: str,
    ideology_economic: str,
    ideology_social: str,
    delta: float,
) -> float:
    """Section 3.7 — ideology modifier on satisfaction delta (applied to ΔW)."""
    welfare_params = {"hospitals_and_clinics", "schools_and_universities",
                      "affordable_housing", "community_and_spaces"}
    market_params = {"jobs_and_commerce", "courts_and_legal"}
    gov_params = {"anti_corruption", "media_freedom"}

    econ_modifier = 0.0
    if param in welfare_params:
        econ_modifier = {"extreme_left": 0.15, "left": 0.10, "center": 0.0,
                         "right": -0.08, "extreme_right": -0.12}.get(ideology_economic, 0.0)
    elif param in market_params:
        econ_modifier = {"extreme_left": -0.10, "left": -0.05, "center": 0.0,
                         "right": 0.10, "extreme_right": 0.08}.get(ideology_economic, 0.0)
    elif param in gov_params:
        econ_modifier = {"extreme_left": 0.12, "left": 0.08, "center": 0.0,
                         "right": -0.05, "extreme_right": -0.15}.get(ideology_economic, 0.0)

    return delta * (1.0 + econ_modifier)


def _apply_diminishing_returns(current: float, delta: float) -> float:
    """Apply gentler diminishing returns to prevent hard plateaus.
    Instead of multiplying by 0 as it approaches 100/0, it halves or gently scales it down.
    """
    if current > 80 and delta > 0:
        # e.g., at 90, scale is 0.5 + (10/40) = 0.75
        delta *= 0.5 + (100 - current) / 40.0
    elif current < 20 and delta < 0:
        # e.g., at 10, scale is 0.5 + (10/40) = 0.75
        delta *= 0.5 + current / 40.0
    return _clamp(current + delta)


def compute_citizen_wellbeing_delta(
    citizen: Citizen,
    param_deltas: dict[str, float],
    profile: CityProfile,
) -> dict[str, float]:
    """Compute per-dimension wellbeing delta for one citizen."""
    dims = {"health": 0.0, "wealth": 0.0, "safety": 0.0, "social": 0.0}

    for param, delta in param_deltas.items():
        if param not in IMPACT_MATRIX:
            continue
        weights = IMPACT_MATRIX[param]
        income_m = INCOME_MULTS.get(param, {}).get(citizen.demographics.income_bracket, 1.0)
        prof_m = PROFESSION_MULTS.get(param, {}).get(citizen.demographics.profession, 1.0)
        loc_m = LOCATION_MULTS.get(param, {}).get(citizen.demographics.location, 1.0)
        rel_m = _get_religion_mult(param, citizen.demographics.religion, profile)
        combined_mult = income_m * prof_m * loc_m * rel_m

        for dim, weight in weights.items():
            raw_delta = delta * weight * combined_mult
            # ideology modifier
            adjusted_delta = _ideology_wellbeing_modifier(
                param, citizen.demographics.ideology_economic,
                citizen.demographics.ideology_social, raw_delta,
            )
            dims[dim] += adjusted_delta

    return dims


def update_citizen_wellbeing(
    citizen: Citizen,
    param_deltas: dict[str, float],
    profile: CityProfile,
) -> WellbeingState:
    """Return new WellbeingState after applying deltas with diminishing returns."""
    deltas = compute_citizen_wellbeing_delta(citizen, param_deltas, profile)
    wb = citizen.wellbeing
    return WellbeingState(
        health=_apply_diminishing_returns(wb.health, deltas["health"]),
        wealth=_apply_diminishing_returns(wb.wealth, deltas["wealth"]),
        safety=_apply_diminishing_returns(wb.safety, deltas["safety"]),
        social=_apply_diminishing_returns(wb.social, deltas["social"]),
    )
