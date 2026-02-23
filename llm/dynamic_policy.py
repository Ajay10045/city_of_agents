from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _to_float(value: Any, default: float | None = None) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


VALID_STATS = {
    "treasury_balance", "employment_rate", "avg_wage",
    "hospital_capacity", "pollution_levels", "food_supply",
    "police_coverage", "recidivism_rate", "lighting_level",
    "park_density", "connectivity", "media_access",
}

VALID_MEDIA = {"bias", "sensationalism", "trust"}

VALID_GROUP_FIELDS = {"wealth", "health", "safety", "social"}

VALID_BUREAUCRACY_FIELDS = {"competency", "integrity", "skill"}

VALID_MATCH_KEYS = {"religion", "caste", "language"}


@dataclass
class DynamicPolicy:
    id: str
    name: str
    description: str
    effects: dict[str, float]
    group_effects: list[dict[str, Any]]
    campaign_strength: float
    media_effects: dict[str, float]
    rationale: str
    actor: str = "mayor"
    why_now: str = ""
    target_groups: list[str] = field(default_factory=list)
    expected_stat_delta: dict[str, float] = field(default_factory=dict)
    opposition_counter_risk: float = 0.5
    narrative_fronts_impacted: dict[str, float] = field(default_factory=dict)
    confidence: float = 0.5
    assumptions: list[str] = field(default_factory=list)
    tradeoffs: list[str] = field(default_factory=list)
    counter_narrative_risk: str = ""
    deliberation_trace: dict[str, Any] = field(default_factory=dict)
    budget_cost: float = 0.0
    intent: str = ""
    implementation_targets: list[dict[str, Any]] = field(default_factory=list)
    delivered_outcomes: list[dict[str, Any]] = field(default_factory=list)
    implementation_gap: float = 0.0
    delivery_summary: str = ""
    bureaucracy_effects: dict[str, float] = field(default_factory=dict)

    @staticmethod
    def _infer_implementation_targets(
        name: str,
        description: str,
        effects: dict[str, float],
    ) -> list[dict[str, Any]]:
        lowered = f"{name} {description}".lower()
        targets: list[dict[str, Any]] = []
        if "job" in lowered or "employment" in lowered or "employment_rate" in effects:
            targets.append(
                {
                    "key": "jobs_supported",
                    "label": "Jobs Supported",
                    "unit": "jobs",
                    "proposed": max(150.0, abs(float(effects.get("employment_rate", 1.5))) * 320.0),
                    "difficulty": 0.20,
                }
            )
        if "road" in lowered or "infrastructure" in lowered or "transit" in lowered or "connectivity" in effects:
            targets.append(
                {
                    "key": "infrastructure_km",
                    "label": "Transport/Infrastructure Build",
                    "unit": "km",
                    "proposed": max(2.0, abs(float(effects.get("connectivity", 1.2))) * 2.4),
                    "difficulty": 0.30,
                }
            )
        if "hospital" in lowered or "health" in lowered or "hospital_capacity" in effects:
            targets.append(
                {
                    "key": "hospital_beds",
                    "label": "Hospital Beds Added",
                    "unit": "beds",
                    "proposed": max(50.0, abs(float(effects.get("hospital_capacity", 1.0))) * 100.0),
                    "difficulty": 0.25,
                }
            )
        if "safety" in lowered or "police" in lowered or "police_coverage" in effects:
            targets.append(
                {
                    "key": "patrol_units",
                    "label": "Safety Patrol Units Deployed",
                    "unit": "patrols",
                    "proposed": max(2.0, abs(float(effects.get("police_coverage", 1.0))) * 3.0),
                    "difficulty": 0.22,
                }
            )
        if not targets:
            proposed = max(2.0, abs(sum(float(value) for value in effects.values())) * 0.7)
            targets.append(
                {
                    "key": "service_nodes_upgraded",
                    "label": "Service Delivery Milestones",
                    "unit": "sites",
                    "proposed": proposed,
                    "difficulty": 0.21,
                }
            )
        return targets[:4]

    @classmethod
    def from_llm(cls, data: dict, actor: str = "mayor") -> "DynamicPolicy":
        """Parse and validate LLM-returned dict into a DynamicPolicy."""
        effects: dict[str, float] = {}
        raw_effects = data.get("effects", {})
        if isinstance(raw_effects, dict):
            for k, v in raw_effects.items():
                if k not in VALID_STATS:
                    continue
                numeric = _to_float(v)
                if numeric is None:
                    continue
                effects[k] = _clamp(numeric, -10.0, 10.0)

        raw_ge = data.get("group_effects", [])
        group_effects: list[dict[str, Any]] = []
        for ge in raw_ge if isinstance(raw_ge, list) else []:
            if not isinstance(ge, dict):
                continue
            raw_match = ge.get("match", {})
            if not isinstance(raw_match, dict):
                raw_match = {}
            match = {k: str(v) for k, v in raw_match.items() if k in VALID_MATCH_KEYS}
            clean: dict[str, Any] = {"match": match}
            for field_name in VALID_GROUP_FIELDS:
                if field_name in ge:
                    numeric = _to_float(ge[field_name])
                    if numeric is not None:
                        clean[field_name] = _clamp(numeric, -8.0, 8.0)
            group_effects.append(clean)

        media_effects: dict[str, float] = {}
        raw_media = data.get("media_effects", {})
        if isinstance(raw_media, dict):
            for k, v in raw_media.items():
                if k not in VALID_MEDIA:
                    continue
                numeric = _to_float(v)
                if numeric is None:
                    continue
                media_effects[k] = _clamp(numeric, -10.0, 10.0)

        campaign_strength = _clamp(_to_float(data.get("campaign_strength"), 1.0) or 1.0, 0.8, 1.5)
        expected_stat_delta: dict[str, float] = {}
        raw_expected = data.get("expected_stat_delta", {})
        if isinstance(raw_expected, dict):
            for key, raw_value in raw_expected.items():
                if key not in VALID_STATS:
                    continue
                numeric = _to_float(raw_value)
                if numeric is None:
                    continue
                expected_stat_delta[key] = _clamp(numeric, -10.0, 10.0)

        target_groups: list[str] = []
        raw_targets = data.get("target_groups", [])
        if isinstance(raw_targets, list):
            target_groups = [str(item)[:80] for item in raw_targets if str(item).strip()]

        narrative_fronts_impacted: dict[str, float] = {}
        raw_fronts = data.get("narrative_fronts_impacted", {})
        if isinstance(raw_fronts, dict):
            for key, raw_value in raw_fronts.items():
                numeric = _to_float(raw_value)
                if numeric is None:
                    continue
                narrative_fronts_impacted[str(key)[:60]] = _clamp(numeric, -10.0, 10.0)

        assumptions: list[str] = []
        raw_assumptions = data.get("assumptions", [])
        if isinstance(raw_assumptions, list):
            assumptions = [str(item)[:180] for item in raw_assumptions if str(item).strip()]

        tradeoffs: list[str] = []
        raw_tradeoffs = data.get("tradeoffs", [])
        if isinstance(raw_tradeoffs, list):
            tradeoffs = [str(item)[:180] for item in raw_tradeoffs if str(item).strip()]

        opposition_counter_risk = _clamp(
            _to_float(data.get("opposition_counter_risk"), 0.5) or 0.5,
            0.0,
            1.0,
        )
        confidence = _clamp(_to_float(data.get("confidence"), 0.5) or 0.5, 0.0, 1.0)

        deliberation_trace: dict[str, Any] = {}
        raw_trace = data.get("deliberation_trace", {})
        if isinstance(raw_trace, dict):
            mayor_direction_used = str(raw_trace.get("mayor_direction_used", "")).strip()
            if mayor_direction_used:
                deliberation_trace["mayor_direction_used"] = mayor_direction_used[:220]
            advisor_inputs_used: list[dict[str, str]] = []
            raw_inputs = raw_trace.get("advisor_inputs_used", [])
            if isinstance(raw_inputs, list):
                for item in raw_inputs:
                    if not isinstance(item, dict):
                        continue
                    advisor_id = str(item.get("advisor_id", "")).strip()
                    advisor_name = str(item.get("advisor_name", "")).strip()
                    portfolio = str(item.get("portfolio", "")).strip()
                    point = str(item.get("point", "")).strip()
                    if not (advisor_id and portfolio and point):
                        continue
                    row = {
                        "advisor_id": advisor_id[:80],
                        "portfolio": portfolio[:80],
                        "point": point[:180],
                    }
                    if advisor_name:
                        row["advisor_name"] = advisor_name[:80]
                    advisor_inputs_used.append(row)
            if advisor_inputs_used:
                deliberation_trace["advisor_inputs_used"] = advisor_inputs_used[:4]
            disagreement_resolved = str(raw_trace.get("disagreement_resolved", "")).strip()
            if disagreement_resolved:
                deliberation_trace["disagreement_resolved"] = disagreement_resolved[:220]

        implementation_targets: list[dict[str, Any]] = []
        raw_targets = data.get("implementation_targets", [])
        if isinstance(raw_targets, list):
            for item in raw_targets:
                if not isinstance(item, dict):
                    continue
                key = str(item.get("key", "")).strip().lower()
                label = str(item.get("label", "")).strip()
                unit = str(item.get("unit", "")).strip()
                proposed = _to_float(item.get("proposed"))
                if not key or proposed is None or proposed <= 0:
                    continue
                implementation_targets.append(
                    {
                        "key": key[:64],
                        "label": (label or key.replace("_", " ").title())[:96],
                        "unit": (unit or "units")[:32],
                        "proposed": _clamp(proposed, 0.1, 1_000_000_000.0),
                        "difficulty": _clamp(_to_float(item.get("difficulty"), 0.2) or 0.2, 0.05, 0.6),
                    }
                )

        bureaucracy_effects: dict[str, float] = {}
        raw_be = data.get("bureaucracy_effects", {})
        if isinstance(raw_be, dict):
            for k, v in raw_be.items():
                if k not in VALID_BUREAUCRACY_FIELDS:
                    continue
                numeric = _to_float(v)
                if numeric is not None:
                    bureaucracy_effects[k] = _clamp(numeric, -0.1, 0.1)

        name = str(data.get("name", "Unknown Policy"))[:80]
        description = str(data.get("description", ""))[:300]
        if not implementation_targets:
            implementation_targets = cls._infer_implementation_targets(name, description, effects)

        return cls(
            id=str(uuid.uuid4()),
            name=name,
            description=description,
            rationale=str(data.get("rationale", ""))[:400],
            effects=effects,
            group_effects=group_effects,
            campaign_strength=campaign_strength,
            media_effects=media_effects,
            actor=actor,
            why_now=str(data.get("why_now", data.get("rationale", "")))[:400],
            target_groups=target_groups,
            expected_stat_delta=expected_stat_delta,
            opposition_counter_risk=opposition_counter_risk,
            narrative_fronts_impacted=narrative_fronts_impacted,
            confidence=confidence,
            assumptions=assumptions,
            tradeoffs=tradeoffs,
            counter_narrative_risk=str(data.get("counter_narrative_risk", ""))[:280],
            deliberation_trace=deliberation_trace,
            budget_cost=max(0.0, _to_float(data.get("budget_cost"), 0.0) or 0.0),
            intent=str(data.get("intent", "")).strip()[:220],
            implementation_targets=implementation_targets[:4],
            delivered_outcomes=[],
            implementation_gap=_clamp(_to_float(data.get("implementation_gap"), 0.0) or 0.0, 0.0, 1.0),
            delivery_summary=str(data.get("delivery_summary", "")).strip()[:260],
            bureaucracy_effects=bureaucracy_effects,
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "rationale": self.rationale,
            "effects": self.effects,
            "group_effects": self.group_effects,
            "campaign_strength": self.campaign_strength,
            "media_effects": self.media_effects,
            "actor": self.actor,
            "why_now": self.why_now,
            "target_groups": list(self.target_groups),
            "expected_stat_delta": dict(self.expected_stat_delta),
            "opposition_counter_risk": self.opposition_counter_risk,
            "narrative_fronts_impacted": dict(self.narrative_fronts_impacted),
            "confidence": self.confidence,
            "assumptions": list(self.assumptions),
            "tradeoffs": list(self.tradeoffs),
            "counter_narrative_risk": self.counter_narrative_risk,
            "deliberation_trace": dict(self.deliberation_trace),
            "budget_cost": self.budget_cost,
            "intent": self.intent,
            "implementation_targets": [dict(item) for item in self.implementation_targets],
            "delivered_outcomes": [dict(item) for item in self.delivered_outcomes],
            "implementation_gap": self.implementation_gap,
            "delivery_summary": self.delivery_summary,
            "bureaucracy_effects": dict(self.bureaucracy_effects),
        }
