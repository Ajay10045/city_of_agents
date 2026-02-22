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
    """Probabilistic policy delivery model used by the v1 turn loop."""

    def _infer_targets(self, policy: DynamicPolicy) -> list[dict[str, Any]]:
        targets = list(policy.implementation_targets)
        if targets:
            return targets

        inferred: list[dict[str, Any]] = []
        effects = dict(policy.effects)
        description = f"{policy.name} {policy.description}".lower()

        if "job" in description or "employment" in description or "employment" in effects:
            proposed_jobs = max(150.0, abs(float(effects.get("employment", 1.5))) * 320.0)
            inferred.append(
                {
                    "key": "jobs_supported",
                    "label": "Jobs Supported",
                    "unit": "jobs",
                    "proposed": round(proposed_jobs, 1),
                    "difficulty": 0.20,
                }
            )
        if "road" in description or "transit" in description or "infrastructure" in description or "infrastructure" in effects:
            proposed_km = max(2.0, abs(float(effects.get("infrastructure", 1.2))) * 2.4)
            inferred.append(
                {
                    "key": "infrastructure_km",
                    "label": "Transport/Infrastructure Build",
                    "unit": "km",
                    "proposed": round(proposed_km, 2),
                    "difficulty": 0.30,
                }
            )
        if "corruption" in description or "audit" in description or "corruption" in effects:
            proposed_audits = max(1.0, abs(float(effects.get("corruption", 1.0))) * 2.0)
            inferred.append(
                {
                    "key": "audit_cycles",
                    "label": "Procurement Audits Completed",
                    "unit": "audits",
                    "proposed": round(proposed_audits, 1),
                    "difficulty": 0.18,
                }
            )
        if "safety" in description or "law and order" in description or "law_and_order" in effects:
            patrols = max(2.0, abs(float(effects.get("law_and_order", 1.0))) * 1.8)
            inferred.append(
                {
                    "key": "safety_patrol_units",
                    "label": "Safety Patrol Deployments",
                    "unit": "patrols",
                    "proposed": round(patrols, 1),
                    "difficulty": 0.22,
                }
            )
        if "environment" in effects or "air" in description or "clean" in description:
            interventions = max(1.0, abs(float(effects.get("environment", 1.0))) * 1.6)
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

        mayor_competence = _clamp(float(profile.get("mayor_competence", 0.58)), 0.2, 0.95)
        council_competence = _clamp(float(profile.get("council_competence", 0.62)), 0.2, 0.95)
        competence_factor = mayor_competence * 0.55 + council_competence * 0.45

        corruption_drag = _clamp((float(stats.corruption) - 35.0) / 65.0, 0.0, 1.0) * 0.38
        tension_drag = _clamp((float(stats.social_tension) - 45.0) / 55.0, 0.0, 1.0) * 0.16
        infra_support = _clamp(float(stats.infrastructure) / 100.0, 0.0, 1.0) * 0.14
        trust_support = _clamp(float(stats.public_trust) / 100.0, 0.0, 1.0) * 0.12
        economy_support = _clamp(float(stats.economy) / 100.0, 0.0, 1.0) * 0.10

        variance = _clamp(float(profile.get("implementation_variance", 0.08)), 0.0, 0.2)
        stochastic_noise = rng.uniform(-variance, variance)
        execution_score = _clamp(
            0.48
            + competence_factor * 0.45
            + infra_support
            + trust_support
            + economy_support
            - corruption_drag
            - tension_drag
            + stochastic_noise,
            0.12,
            1.08,
        )

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

            completion_ratio = _clamp(
                execution_score - difficulty + rng.uniform(-0.05, 0.07),
                0.05,
                1.10,
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

        completion_ratio_avg = _clamp(total_delivered / max(total_proposed, 1e-9), 0.0, 1.15)
        implementation_gap = _clamp(1.0 - completion_ratio_avg, 0.0, 1.0)
        leakage_factor = _clamp(
            (float(stats.corruption) / 100.0) * implementation_gap * 0.62,
            0.0,
            0.7,
        )
        budget_spent = budget_required * _clamp(completion_ratio_avg + leakage_factor, 0.18, 1.22)

        effect_scale = _clamp(completion_ratio_avg * 0.9 + execution_score * 0.35, 0.0, 1.1)
        stat_deltas: dict[str, float] = {}
        for key, value in policy.effects.items():
            stat_deltas[str(key)] = float(value) * effect_scale

        gap_penalty = implementation_gap * 3.4
        stat_deltas["public_trust"] = float(stat_deltas.get("public_trust", 0.0)) - (
            gap_penalty * (0.62 + float(stats.corruption) / 210.0)
        )
        stat_deltas["social_tension"] = float(stat_deltas.get("social_tension", 0.0)) + gap_penalty * 0.56
        stat_deltas["corruption"] = float(stat_deltas.get("corruption", 0.0)) + leakage_factor * 2.6
        stat_deltas["infrastructure"] = float(stat_deltas.get("infrastructure", 0.0)) + (
            (execution_score - 0.5) * 1.0
        )
        stat_deltas["employment"] = float(stat_deltas.get("employment", 0.0)) + (
            (completion_ratio_avg - 0.5) * 1.5
        )

        sentiment_effects: list[dict[str, Any]] = [
            {
                "match": {},
                "happiness": _clamp((completion_ratio_avg - 0.55) * 3.0 - leakage_factor, -3.5, 3.5),
                "alignment": _clamp((completion_ratio_avg - 0.52) * 4.4 - implementation_gap * 1.4, -4.5, 4.5),
                "radicalization": _clamp(implementation_gap * 2.6 + leakage_factor * 1.5 - 0.8, -3.0, 3.8),
                "trust_in_government": _clamp(
                    (completion_ratio_avg - 0.5) * 3.8 - leakage_factor * 2.0,
                    -4.0,
                    4.0,
                ),
            }
        ]

        summary = (
            f"{policy.name}: delivered {completion_ratio_avg*100:.1f}% of announced targets; "
            f"implementation gap {implementation_gap*100:.1f}%, leakage risk {leakage_factor*100:.1f}%."
        )
        return DeliverySimulationResult(
            execution_score=execution_score,
            competence_factor=competence_factor,
            integrity_drag=corruption_drag + tension_drag,
            implementation_gap=implementation_gap,
            budget_required=budget_required,
            budget_spent=budget_spent,
            stat_deltas=stat_deltas,
            sentiment_effects=sentiment_effects,
            targets=metrics,
            summary=summary,
        )
