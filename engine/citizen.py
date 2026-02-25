"""Citizen generation from a CityProfile (Section 3 of v4 spec)."""
from __future__ import annotations

import random
import uuid

from .models import (
    Citizen,
    CitizenCapability,
    CitizenDemographics,
    CitizenPersonality,
    CityParameters,
    CityProfile,
    IncomeBracket,
    IdeologyEconomic,
    IdeologySocial,
    WellbeingState,
)


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def _sample_normal(mean: float, sigma: float, rng: random.Random) -> float:
    return _clamp(rng.gauss(mean, sigma))


def _income_bracket(percentile: float) -> IncomeBracket:
    if percentile < 25:
        return "poor"
    if percentile < 45:
        return "lower_mid"
    if percentile < 70:
        return "middle"
    if percentile < 90:
        return "upper_mid"
    return "rich"


def _weighted_choice(entries: list[dict], rng: random.Random) -> str:
    """Pick from a list of {name, percent} entries proportionally."""
    names = [e["name"] for e in entries]
    weights = [e["percent"] for e in entries]
    return rng.choices(names, weights=weights, k=1)[0]


def _sample_ideology_economic(dist: dict[str, float], rng: random.Random) -> IdeologyEconomic:
    keys = ["extreme_left", "left", "center", "right", "extreme_right"]
    weights = [dist.get(k, 0.0) for k in keys]
    return rng.choices(keys, weights=weights, k=1)[0]  # type: ignore[return-value]


def _sample_ideology_social(dist: dict[str, float], rng: random.Random) -> IdeologySocial:
    keys = ["liberal", "conservative"]
    weights = [dist.get(k, 50.0) for k in keys]
    return rng.choices(keys, weights=weights, k=1)[0]  # type: ignore[return-value]


def _personality_adjustments(demo: CitizenDemographics) -> dict[str, float]:
    adj: dict[str, float] = {}
    # Age adjustments
    if demo.age_group == "18-25":
        adj["risk_appetite"] = 8
        adj["authority_respect"] = -5
    elif demo.age_group == "65+":
        adj["risk_appetite"] = -10
        adj["authority_respect"] = 8
    # Profession adjustments
    if demo.profession == "Business Owner":
        adj["ambition"] = adj.get("ambition", 0) + 10
        adj["risk_appetite"] = adj.get("risk_appetite", 0) + 5
    elif demo.profession == "Government Employee":
        adj["authority_respect"] = adj.get("authority_respect", 0) + 8
        adj["conscientiousness"] = adj.get("conscientiousness", 0) + 5
    # Education
    if demo.education_level > 70:
        adj["corruption_tolerance"] = adj.get("corruption_tolerance", 0) - 10
        adj["integrity"] = adj.get("integrity", 0) + 5
    # Income
    if demo.income_bracket == "poor":
        adj["empathy"] = adj.get("empathy", 0) + 5
    return adj


def _ideology_personality_adjustments(
    ideology_economic: IdeologyEconomic,
    ideology_social: IdeologySocial,
) -> dict[str, float]:
    adj: dict[str, float] = {}
    econ_adjs = {
        "extreme_left": {"empathy": 8, "integrity": 5, "authority_respect": -8},
        "left": {"empathy": 4, "authority_respect": -3},
        "center": {},
        "right": {"ambition": 5, "authority_respect": 4},
        "extreme_right": {"corruption_tolerance": 6, "authority_respect": 6, "empathy": -6},
    }
    social_adjs = {
        "liberal": {"integrity": 3, "risk_appetite": 4, "authority_respect": -5},
        "conservative": {"conscientiousness": 4, "authority_respect": 6, "risk_appetite": -3},
    }
    for k, v in econ_adjs.get(ideology_economic, {}).items():
        adj[k] = adj.get(k, 0) + v
    for k, v in social_adjs.get(ideology_social, {}).items():
        adj[k] = adj.get(k, 0) + v
    return adj


def _build_personality(
    climate: object,
    demo: CitizenDemographics,
    rng: random.Random,
) -> CitizenPersonality:
    sigma = 15.0
    raw = {
        "integrity": _sample_normal(climate.integrity_mean, sigma, rng),
        "empathy": _sample_normal(climate.empathy_mean, sigma, rng),
        "risk_appetite": _sample_normal(climate.risk_appetite_mean, sigma, rng),
        "ambition": _sample_normal(climate.ambition_mean, sigma, rng),
        "conscientiousness": _sample_normal(climate.conscientiousness_mean, sigma, rng),
        "authority_respect": _sample_normal(climate.authority_respect_mean, sigma, rng),
        "corruption_tolerance": _sample_normal(climate.corruption_tolerance_mean, sigma, rng),
    }
    # demographic-driven adjustments
    for k, v in _personality_adjustments(demo).items():
        raw[k] = _clamp(raw.get(k, 50) + v)
    # ideology-driven adjustments
    for k, v in _ideology_personality_adjustments(demo.ideology_economic, demo.ideology_social).items():
        raw[k] = _clamp(raw.get(k, 50) + v)
    return CitizenPersonality(**raw)


def _build_capability(p: CitizenPersonality, education: float, rng: random.Random) -> CitizenCapability:
    def noise() -> float:
        return rng.gauss(0, 5)
    competence = _clamp(p.conscientiousness * 0.4 + education * 0.4 + rng.gauss(45, 15) * 0.2 + noise())
    managerial = _clamp(competence * 0.6 + p.conscientiousness * 0.4 + noise())
    strategic = _clamp(competence * 0.5 + education * 0.3 + p.ambition * 0.2 + noise())
    crisis = _clamp(competence * 0.4 + p.risk_appetite * 0.3 + p.conscientiousness * 0.3 + noise())
    bureaucratic = _clamp(p.authority_respect * 0.4 + competence * 0.3 + education * 0.3 + noise())
    return CitizenCapability(
        competence=competence,
        managerial_skill=managerial,
        strategic_thinking=strategic,
        crisis_handling=crisis,
        bureaucratic_navigation=bureaucratic,
    )


def _compute_initial_wellbeing(
    params: CityParameters,
    demo: CitizenDemographics,
    rng: random.Random,
) -> WellbeingState:
    p = params
    # Base formulas from Section 3.4
    def noise() -> float:
        return rng.gauss(0, 3)
    health_base = (p.hospitals_and_clinics * 0.50 + p.water_power_sanitation * 0.20
                   + p.air_quality_and_pollution * 0.10 + p.affordable_housing * 0.10
                   + p.transit_and_roads * 0.10)
    wealth_base = (p.jobs_and_commerce * 0.80 + p.schools_and_universities * 0.10
                   + p.affordable_housing * 0.10)
    safety_base = (p.police_and_emergency * 0.40 + p.courts_and_legal * 0.20
                   + p.affordable_housing * 0.20 + p.transit_and_roads * 0.10
                   + p.water_power_sanitation * 0.10)
    social_base = (p.community_and_spaces * 0.40 + p.schools_and_universities * 0.20
                   + p.hospitals_and_clinics * 0.10 + p.transit_and_roads * 0.10
                   + p.courts_and_legal * 0.10 + p.affordable_housing * 0.10)

    # Income bracket sensitivity (simplified)
    income_mult = {"poor": 1.05, "lower_mid": 1.02, "middle": 1.0, "upper_mid": 0.95, "rich": 0.90}
    m = income_mult.get(demo.income_bracket, 1.0)

    return WellbeingState(
        health=_clamp(health_base * m / 100 * 100 + noise()),
        wealth=_clamp(wealth_base * m / 100 * 100 + noise()),
        safety=_clamp(safety_base * m / 100 * 100 + noise()),
        social=_clamp(social_base * m / 100 * 100 + noise()),
    )


def _compute_initial_alignment(wellbeing: WellbeingState, personality: CitizenPersonality, rng: random.Random) -> float:
    score = wellbeing.score()
    raw = (score - 40) * 1.2 + (personality.authority_respect - 50) * 0.3 + rng.uniform(-10, 10)
    return max(-50.0, min(50.0, raw))


def generate_citizens(
    profile: CityProfile,
    names: list[str],
    rng: random.Random,
) -> list[Citizen]:
    """Generate all citizens from the city profile."""
    n = profile.game_config.agent_count
    demo_cfg = profile.demographics
    climate = profile.personality_climate
    params = profile.city_parameters

    citizens: list[Citizen] = []
    for i in range(n):
        name = names[i] if i < len(names) else f"Citizen-{i+1}"

        # --- demographics ---
        age_brackets = demo_cfg.age_distribution.get("brackets", [])
        age_group = rng.choices(
            [b.label for b in age_brackets],
            weights=[b.percent for b in age_brackets],
            k=1,
        )[0] if age_brackets else "26-35"

        income_pct = _clamp(rng.gauss(demo_cfg.income_distribution.mean, demo_cfg.income_distribution.spread))
        religion = _weighted_choice([r.model_dump() for r in demo_cfg.religion_distribution], rng)
        profession = _weighted_choice([p.model_dump() for p in demo_cfg.profession_distribution], rng)
        education = _clamp(rng.gauss(demo_cfg.education_distribution.mean, demo_cfg.education_distribution.spread))
        location = _weighted_choice([loc.model_dump() for loc in demo_cfg.location_distribution], rng)
        ideology_e = _sample_ideology_economic(demo_cfg.ideology_economic_distribution, rng)
        ideology_s = _sample_ideology_social(demo_cfg.ideology_social_distribution, rng)

        demo = CitizenDemographics(
            age_group=age_group,
            income_percentile=income_pct,
            income_bracket=_income_bracket(income_pct),
            religion=religion,
            profession=profession,
            education_level=education,
            location=location,
            ideology_economic=ideology_e,
            ideology_social=ideology_s,
        )

        personality = _build_personality(climate, demo, rng)
        capability = _build_capability(personality, education, rng)
        wellbeing = _compute_initial_wellbeing(params, demo, rng)
        alignment = _compute_initial_alignment(wellbeing, personality, rng)

        citizens.append(Citizen(
            id=str(uuid.uuid4())[:8],
            name=name,
            demographics=demo,
            personality=personality,
            capability=capability,
            wellbeing=wellbeing,
            mayor_alignment=alignment,
            population_weight=1.0 / n,  # normalized below
        ))

    # Normalize population weights
    total = sum(c.population_weight for c in citizens)
    for c in citizens:
        c.population_weight = c.population_weight / total

    return citizens


def select_minister_candidates(
    citizens: list[Citizen],
    cabinet_size: int,
    rng: random.Random,
) -> list[Citizen]:
    """Return a pool of 3× minister_count candidates ordered by leadership score (descending)."""
    def score(c: Citizen) -> float:
        return c.capability.competence * 0.5 + c.personality.ambition * 0.3 + c.capability.strategic_thinking * 0.2

    pool_size = min(len(citizens), cabinet_size * 3)
    candidates = sorted(citizens, key=score, reverse=True)[:pool_size]
    rng.shuffle(candidates)
    return candidates


def select_opposition_leader(
    citizens: list[Citizen],
    minister_ids: set[str],
    rng: random.Random,
) -> Citizen:
    """Highest (ambition×0.7 + competence×0.3) citizen not in cabinet."""
    def score(c: Citizen) -> float:
        return c.personality.ambition * 0.7 + c.capability.competence * 0.3

    available = [c for c in citizens if c.id not in minister_ids]
    return max(available, key=score)
