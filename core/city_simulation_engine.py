from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from llm.dynamic_policy import DynamicPolicy


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


_DEFAULT_UNIT_BY_TARGET: dict[str, str] = {
    "jobs_supported": "jobs",
    "infrastructure_km": "km",
    "service_nodes_upgraded": "sites",
    "audit_cycles": "audits",
    "safety_patrol_units": "patrols",
    "air_quality_interventions": "zones",
}


@dataclass
class DeliveryMetric:
    key: str
    label: str
    unit: str
    proposed: float
    delivered: float
    completion_ratio: float
    gap: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "unit": self.unit,
            "proposed": round(self.proposed, 3),
            "delivered": round(self.delivered, 3),
            "completion_ratio": round(self.completion_ratio, 4),
            "gap": round(self.gap, 3),
        }


@dataclass
class DeliverySimulationResult:
    execution_score: float
    competence_factor: float
    integrity_drag: float
    implementation_gap: float
    budget_required: float
    budget_spent: float
    stat_deltas: dict[str, float]
    sentiment_effects: list[dict[str, Any]]
    targets: list[DeliveryMetric]
    summary: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "execution_score": round(self.execution_score, 4),
            "competence_factor": round(self.competence_factor, 4),
            "integrity_drag": round(self.integrity_drag, 4),
            "implementation_gap": round(self.implementation_gap, 4),
            "budget_required": round(self.budget_required, 2),
            "budget_spent": round(self.budget_spent, 2),
            "stat_deltas": {key: round(value, 4) for key, value in self.stat_deltas.items()},
            "sentiment_effects": list(self.sentiment_effects),
            "targets": [metric.to_dict() for metric in self.targets],
            "summary": self.summary,
        }


class CitySimulationEngine:
    """Probabilistic policy delivery model using the 4-pillar stat system."""

    def _infer_targets(self, policy: DynamicPolicy) -> list[dict[str, Any]]:
        targets = list(policy.implementation_targets)
        if targets:
            return targets

        inferred: list[dict[str, Any]] = []
        effects = dict(policy.effects)
        description = f"{policy.name} {policy.description}".lower()

        if "job" in description or "employment" in description or "employment_rate" in effects:
            proposed_jobs = max(150.0, abs(float(effects.get("employment_rate", 1.5))) * 320.0)
            inferred.append(
                {
                    "key": "jobs_supported",
                    "label": "Jobs Supported",
                    "unit": "jobs",
                    "proposed": round(proposed_jobs, 1),
                    "difficulty": 0.20,
                }
            )
        if (
            "road" in description
            or "transit" in description
            or "infrastructure" in description
            or "connectivity" in effects
        ):
            proposed_km = max(2.0, abs(float(effects.get("connectivity", 1.2))) * 2.4)
            inferred.append(
                {
                    "key": "infrastructure_km",
                    "label": "Transport/Infrastructure Build",
                    "unit": "km",
                    "proposed": round(proposed_km, 2),
                    "difficulty": 0.30,
                }
            )
        if "audit" in description or "media_access" in effects or "bureaucracy" in description:
            proposed_audits = max(1.0, abs(float(effects.get("media_access", 1.0))) * 2.0)
            inferred.append(
                {
                    "key": "audit_cycles",
                    "label": "Procurement Audits Completed",
                    "unit": "audits",
                    "proposed": round(proposed_audits, 1),
                    "difficulty": 0.18,
                }
            )
        if "safety" in description or "police" in description or "police_coverage" in effects:
            patrols = max(2.0, abs(float(effects.get("police_coverage", 1.0))) * 1.8)
            inferred.append(
                {
                    "key": "safety_patrol_units",
                    "label": "Safety Patrol Deployments",
                    "unit": "patrols",
                    "proposed": round(patrols, 1),
                    "difficulty": 0.22,
                }
            )
        if "pollution_levels" in effects or "air" in description or "clean" in description:
            interventions = max(1.0, abs(float(effects.get("pollution_levels", 1.0))) * 1.6)
            inferred.append(
                {
                    "key": "air_quality_interventions",
                    "label": "Air Quality Interventions",
                    "unit": "zones",
                    "proposed": round(interventions, 1),
                    "difficulty": 0.24,
                }
            )

        if not inferred:
            default_units = max(2.0, abs(sum(float(value) for value in effects.values())) * 0.7)
            inferred.append(
                {
                    "key": "service_nodes_upgraded",
                    "label": "Service Delivery Milestones",
                    "unit": "sites",
                    "proposed": round(default_units, 1),
                    "difficulty": 0.21,
                }
            )

        return inferred

    def _budget_required(self, policy: DynamicPolicy, targets: list[dict[str, Any]]) -> float:
        budget_cost = float(policy.budget_cost or 0.0)
        if budget_cost > 0:
            return budget_cost
        cost_weights = {
            "jobs_supported": 900.0,
            "infrastructure_km": 450_000.0,
            "service_nodes_upgraded": 120_000.0,
            "audit_cycles": 45_000.0,
            "safety_patrol_units": 80_000.0,
            "air_quality_interventions": 160_000.0,
        }
        inferred = 0.0
        for target in targets:
            key = str(target.get("key", "")).strip().lower()
            proposed = max(0.0, float(target.get("proposed", 0.0) or 0.0))
            inferred += proposed * cost_weights.get(key, 60_000.0)
        return max(120_000.0, inferred)

    def simulate_delivery(self, game_state: Any, policy: DynamicPolicy) -> DeliverySimulationResult:
        stats = game_state.city_stats
        profile = dict(game_state.simulation_profile or {})
        rng = game_state.rng

        # --- Competence from bureaucracy traits ---
        bureaucracy = game_state.bureaucracy
        competence_factor = bureaucracy.execution_factor()

        # --- City pillar support & drag ---
        pillar_scores = stats.pillar_scores()
        city_pillar_support = _clamp(sum(pillar_scores.values()) / 400.0, 0.0, 1.0) * 0.20
        # Identify weak pillars as drag
        weak_pillar_values = [v for v in pillar_scores.values() if v < 40.0]
        city_drag = sum((40.0 - v) / 100.0 for v in weak_pillar_values) * 0.05

        # --- Execution score (balanced to allow over-delivery) ---
        variance = _clamp(float(profile.get("implementation_variance", 0.08)), 0.0, 0.2)
        stochastic_noise = rng.uniform(-variance, variance)
        execution_score = _clamp(
            0.55
            + competence_factor * 0.55
            + city_pillar_support
            - city_drag
            + stochastic_noise,
            0.12,
            1.15,
        )

        # --- Per-target delivery simulation ---
        targets_raw = self._infer_targets(policy)
        budget_required = self._budget_required(policy, targets_raw)
        metrics: list[DeliveryMetric] = []
        total_proposed = 0.0
        total_delivered = 0.0
        for row in targets_raw:
            key = str(row.get("key", "service_nodes_upgraded")).strip().lower() or "service_nodes_upgraded"
            label = str(row.get("label", key.replace("_", " ").title())).strip() or key.replace("_", " ").title()
            unit = str(row.get("unit", _DEFAULT_UNIT_BY_TARGET.get(key, "units"))).strip() or "units"
            proposed = max(0.0, float(row.get("proposed", 0.0) or 0.0))
            difficulty = _clamp(float(row.get("difficulty", 0.2) or 0.2), 0.05, 0.6)

            # Skill reduces effective difficulty
            effective_difficulty = max(0.02, difficulty - bureaucracy.skill * 0.15)
            completion_ratio = _clamp(
                execution_score - effective_difficulty + rng.uniform(-0.05, 0.07),
                0.05,
                1.15,
            )
            delivered = proposed * completion_ratio
            gap = max(0.0, proposed - delivered)

            metrics.append(
                DeliveryMetric(
                    key=key,
                    label=label,
                    unit=unit,
                    proposed=proposed,
                    delivered=delivered,
                    completion_ratio=completion_ratio,
                    gap=gap,
                )
            )
            total_proposed += proposed
            total_delivered += delivered

        # --- Aggregate delivery metrics ---
        completion_ratio_avg = _clamp(total_delivered / max(total_proposed, 1e-9), 0.0, 1.15)
        implementation_gap = _clamp(1.0 - completion_ratio_avg, 0.0, 1.0)
        leakage_factor = _clamp(
            (1.0 - bureaucracy.integrity) * implementation_gap * 0.62,
            0.0,
            0.7,
        )
        budget_spent = budget_required * _clamp(completion_ratio_avg + leakage_factor, 0.18, 1.22)

        # --- Stat deltas from policy effects ---
        effect_scale = _clamp(completion_ratio_avg * 0.9 + execution_score * 0.35, 0.0, 1.1)
        stat_deltas: dict[str, float] = {}
        for key, value in policy.effects.items():
            stat_deltas[str(key)] = float(value) * effect_scale

        # Good delivery boosts relevant sub-metrics slightly
        if completion_ratio_avg > 0.6:
            stat_deltas["media_access"] = stat_deltas.get("media_access", 0.0) + (completion_ratio_avg - 0.6) * 2.0
        if completion_ratio_avg < 0.4:
            stat_deltas["recidivism_rate"] = stat_deltas.get("recidivism_rate", 0.0) + (0.4 - completion_ratio_avg) * 1.5

        # --- Sentiment effects using 4-pillar citizen fields ---
        completion_avg = completion_ratio_avg
        sentiment_effects: list[dict[str, Any]] = [
            {
                "match": {},
                "wealth": _clamp((completion_avg - 0.45) * 3.0 - leakage_factor, -3.5, 3.5),
                "health": _clamp((completion_avg - 0.42) * 2.5, -3.0, 3.0),
                "safety": _clamp((completion_avg - 0.40) * 2.0, -2.5, 2.5),
                "social": _clamp((completion_avg - 0.45) * 2.8 - leakage_factor * 0.5, -3.5, 3.5),
            }
        ]

        # --- Over-delivery bonuses ---
        summary = (
            f"{policy.name}: delivered {completion_ratio_avg*100:.1f}% of announced targets; "
            f"implementation gap {implementation_gap*100:.1f}%, leakage risk {leakage_factor*100:.1f}%."
        )
        if completion_ratio_avg > 0.85:
            over_delivery_bonus = (completion_ratio_avg - 0.85) * 1.5
            for effect in sentiment_effects:
                for pillar in ("wealth", "health", "safety", "social"):
                    if pillar in effect:
                        effect[pillar] = _clamp(effect[pillar] + over_delivery_bonus, -4.0, 5.0)
            summary += " Exceeded expectations \u2014 citizen confidence boosted."

        # --- Integrity drag from bureaucracy ---
        integrity_drag = _clamp((1.0 - bureaucracy.integrity) * 0.3 + city_drag, 0.0, 1.0)

        return DeliverySimulationResult(
            execution_score=execution_score,
            competence_factor=competence_factor,
            integrity_drag=integrity_drag,
            implementation_gap=implementation_gap,
            budget_required=budget_required,
            budget_spent=budget_spent,
            stat_deltas=stat_deltas,
            sentiment_effects=sentiment_effects,
            targets=metrics,
            summary=summary,
        )
