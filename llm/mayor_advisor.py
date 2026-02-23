from __future__ import annotations

import os
import re
from queue import Empty, Queue
from threading import Thread
from typing import TYPE_CHECKING, Any

from llm.context_builder import build_city_context
from llm.dynamic_policy import DynamicPolicy
from llm.llm_client import LLMClient

if TYPE_CHECKING:
    from core.game_state import GameState

_SYSTEM = """You are a political advisor generating policy options for the Mayor of a city simulation.

Given the current city state, generate exactly 5 distinct, creative policy options the Mayor could take this turn.
Each policy must reflect the real political situation — some should address urgent problems, some opportunistic, some risky.

The city tracks 12 sub-metrics organized under 4 citizen pillars:
  WEALTH: treasury_balance, employment_rate, avg_wage
  HEALTH: hospital_capacity, pollution_levels (lower=better), food_supply
  SAFETY: police_coverage, recidivism_rate (lower=better), lighting_level
  SOCIAL: park_density, connectivity, media_access

Citizens have 4 main metrics (wealth, health, safety, social) driven by the city sub-metrics above.
The advisory council (bureaucracy) has traits: competency, integrity, skill — policies can affect these.

Return a JSON object with key "policies" containing a list of 5 policy objects. Each policy object must have:
- "name": short policy name (max 6 words)
- "description": 1 sentence explaining what the policy does in city terms
- "rationale": 1-2 sentences explaining why a mayor might choose this now given the city state
- "why_now": one concise paragraph linking this option to the city's current pressure points
- "budget_cost": estimated policy cost as a positive number (city currency units)
- "intent": one sentence stating what real-world measurable change this policy is trying to deliver
- "implementation_targets": array of 1-4 objects with:
  - "key": snake_case target id
  - "label": readable target name
  - "unit": jobs|km|sites|beds|patrols|zones|units
  - "proposed": positive number of promised units
  - "difficulty": 0.05 to 0.6 implementation difficulty
- "effects": object with city sub-metric changes. Keys from: treasury_balance, employment_rate, avg_wage, hospital_capacity, pollution_levels, food_supply, police_coverage, recidivism_rate, lighting_level, park_density, connectivity, media_access. Values: floats -10 to +10. Only include stats actually affected. Use realistic magnitudes — most effects ±1 to ±5. For pollution_levels and recidivism_rate, negative values mean improvement.
- "group_effects": list of group impact objects. Each has "match" (object with one key: "religion", "caste", or "language" and the group's value), and some of: "wealth" (-8 to 8), "health" (-8 to 8), "safety" (-8 to 8), "social" (-8 to 8). Only include groups actually affected.
- "bureaucracy_effects": object with optional keys "competency", "integrity", "skill" — small deltas (-0.05 to 0.05). Include only if the policy directly affects council capability (e.g., anti-corruption measures improve integrity, training improves skill).
- "campaign_strength": float 0.9 to 1.4 (how much this boosts mayor campaign)
- "media_effects": object with some of: "bias" (-5 to 5), "sensationalism" (-5 to 5), "trust" (-5 to 5)
- "target_groups": array of up to 3 group labels impacted most
- "expected_stat_delta": object mirroring top expected stat movements (use same sub-metric keys as effects)
- "opposition_counter_risk": float 0.0 to 1.0
- "narrative_fronts_impacted": object from fronts {economy, corruption, safety, services, social_cohesion} with -5 to +5 intensity
- "confidence": float 0.0 to 1.0
- "assumptions": array of up to 3 short assumptions
- "tradeoffs": array of up to 3 short tradeoffs
- "counter_narrative_risk": one sentence on likely opposition attack line

Make the 5 policies meaningfully different — cover different domains (economic, health, safety, social, governance). All effects must be internally consistent with the policy description."""


class MayorAdvisor:
    _BLOCKED_PROMPT_MARKERS = [
        "generate exactly",
        "advisor council roster",
        "recent chamber discussion",
        "explicit mayor constraints",
        "priority constraint:",
        "revised guidance:",
        "policy generation brief",
    ]
    _PLACEHOLDER_POLICY_NAMES = {
        "unknown policy",
        "policy option",
        "n/a",
        "na",
        "tbd",
        "placeholder policy",
        "unnamed policy",
    }
    _GENERIC_TITLE_TOKENS = {
        "strategic",
        "action",
        "plan",
        "policy",
        "option",
        "initiative",
        "program",
        "project",
        "proposal",
        "unknown",
        "unnamed",
        "general",
        "city",
    }

    def __init__(self) -> None:
        model = os.environ.get("LLM_MODEL", "gpt-4o")
        self._client: LLMClient | None
        try:
            self._client = LLMClient(model=model)
        except Exception:
            self._client = None
        key = (
            os.environ.get("LLM_API_KEY")
            or os.environ.get("OPENAI_API_KEY")
            or os.environ.get("ANTHROPIC_API_KEY")
            or ""
        )
        self._disable_live = key.startswith("test-")
        self._timeout_seconds = max(
            1.0,
            float(os.environ.get("MAYOR_ADVISOR_TIMEOUT_SECONDS", "6.0")),
        )

    @staticmethod
    def _normalize_text(value: str | None) -> str:
        return str(value or "").strip().lower()

    @classmethod
    def _detect_focus(cls, guidance: str | None) -> str:
        text = cls._normalize_text(guidance)
        if not text:
            return "general"
        if any(
            token in text
            for token in ("fuel", "petrol", "diesel", "energy shortage", "power cut", "blackout")
        ):
            return "fuel"
        if any(token in text for token in ("job", "employment", "unemployment", "layoff", "wages")):
            return "jobs"
        if any(token in text for token in ("corruption", "bribe", "kickback", "audit", "scam", "procurement")):
            return "corruption"
        if any(token in text for token in ("trust", "credibility", "confidence", "legitimacy")):
            return "trust"
        if any(token in text for token in ("safety", "crime", "security", "law and order", "violence")):
            return "safety"
        return "general"

    @staticmethod
    def _shift_effect(base: dict[str, float], stat: str, delta: float) -> dict[str, float]:
        out = dict(base)
        out[stat] = round(float(out.get(stat, 0.0)) + delta, 2)
        return out

    @staticmethod
    def _default_targets_for_focus(focus: str) -> list[dict[str, Any]]:
        if focus == "jobs":
            return [
                {"key": "jobs_supported", "label": "Jobs Supported", "unit": "jobs", "proposed": 1200, "difficulty": 0.2},
                {"key": "service_nodes_upgraded", "label": "Service Nodes Upgraded", "unit": "sites", "proposed": 14, "difficulty": 0.22},
            ]
        if focus == "fuel":
            return [
                {"key": "service_nodes_upgraded", "label": "Fuel Distribution Nodes", "unit": "sites", "proposed": 18, "difficulty": 0.24},
                {"key": "infrastructure_km", "label": "Priority Corridor Reliability", "unit": "km", "proposed": 38, "difficulty": 0.28},
            ]
        if focus == "corruption":
            return [
                {"key": "audit_cycles", "label": "Procurement Audits", "unit": "audits", "proposed": 6, "difficulty": 0.18},
                {"key": "service_nodes_upgraded", "label": "Contract Transparency Dashboards", "unit": "sites", "proposed": 8, "difficulty": 0.16},
            ]
        if focus == "safety":
            return [
                {"key": "safety_patrol_units", "label": "Safety Patrol Deployments", "unit": "patrols", "proposed": 10, "difficulty": 0.22},
                {"key": "service_nodes_upgraded", "label": "Grievance Response Nodes", "unit": "sites", "proposed": 12, "difficulty": 0.20},
            ]
        if focus == "trust":
            return [
                {"key": "service_nodes_upgraded", "label": "Public Dashboard Releases", "unit": "sites", "proposed": 10, "difficulty": 0.16},
                {"key": "audit_cycles", "label": "Independent Audit Reviews", "unit": "audits", "proposed": 4, "difficulty": 0.17},
            ]
        return [
            {"key": "service_nodes_upgraded", "label": "Service Delivery Milestones", "unit": "sites", "proposed": 9, "difficulty": 0.2},
        ]

    def _attach_execution_blueprint(self, item: dict[str, Any], focus: str) -> dict[str, Any]:
        data = dict(item)
        if "budget_cost" not in data:
            scale = 0.0
            effects = data.get("effects", {})
            if isinstance(effects, dict):
                scale = sum(abs(float(value)) for value in effects.values() if isinstance(value, (int, float)))
            data["budget_cost"] = round(max(180_000.0, 120_000.0 + scale * 85_000.0), 2)
        if not str(data.get("intent", "")).strip():
            data["intent"] = (
                f"Deliver measurable {focus if focus != 'general' else 'city'} improvements this turn with trackable outcomes."
            )
        if not isinstance(data.get("implementation_targets"), list) or not data.get("implementation_targets"):
            data["implementation_targets"] = self._default_targets_for_focus(focus)
        return data

    def _focus_option_payload(self, focus: str) -> dict[str, Any]:
        if focus == "fuel":
            return {
                "name": "Fuel Supply Stabilization Mission",
                "description": "Create emergency fuel depots, monitored ration windows, and guaranteed transit fuel reserves on critical routes.",
                "rationale": "Fuel continuity lowers panic pricing and commuter anger while showing executive control over a visible crisis.",
                "why_now": "Fuel shortage pressure is dominating daily life and commuters need immediate reliability.",
                "effects": {
                    "treasury_balance": -1.8,
                    "connectivity": 1.7,
                    "pollution_levels": -1.2,
                    "avg_wage": 1.4,
                },
                "campaign_strength": 1.11,
                "target_groups": ["Commuters", "Informal Workers", "Small Businesses"],
                "expected_stat_delta": {"connectivity": 1.5, "pollution_levels": -1.0, "avg_wage": 1.2},
                "opposition_counter_risk": 0.56,
                "narrative_fronts_impacted": {"services": 3.2, "economy": 2.4},
                "confidence": 0.66,
                "assumptions": [
                    "Fuel procurement contracts can be executed quickly",
                    "Distribution points are monitored for leakage",
                ],
                "tradeoffs": [
                    "Requires fiscal buffer and anti-hoarding enforcement",
                    "Environmental gains can slow if diesel dependence rises",
                ],
                "counter_narrative_risk": "Opposition may call this ration optics if black-market prices remain high.",
            }
        if focus == "jobs":
            return {
                "name": "Rapid Jobs Recovery Grid",
                "description": "Launch a 90-day ward jobs accelerator tied to local maintenance, logistics, and service-delivery contracts.",
                "rationale": "Visible wage support calms anti-incumbent pressure faster than abstract macro messaging.",
                "why_now": "Employment anxiety is central and immediate wage visibility can reset momentum.",
                "effects": {"employment_rate": 3.4, "avg_wage": 1.6, "park_density": 0.5},
                "campaign_strength": 1.1,
                "target_groups": ["Workers", "Youth", "Peri-Urban Households"],
                "expected_stat_delta": {"employment_rate": 3.0, "avg_wage": 1.4},
                "opposition_counter_risk": 0.58,
                "narrative_fronts_impacted": {"economy": 3.1, "social_cohesion": 1.6},
                "confidence": 0.64,
                "assumptions": ["Contracting pipeline can absorb temporary labor quickly"],
                "tradeoffs": ["Budget strain if revenue recovery lags"],
                "counter_narrative_risk": "Opposition may frame this as pre-election hiring theatre.",
            }
        if focus == "corruption":
            return {
                "name": "Integrity Strike Unit",
                "description": "Open fast-track anti-corruption investigations with public milestone tracking for top-risk departments.",
                "rationale": "Narrative control returns when enforcement is visible and time-bound.",
                "why_now": "Corruption framing is overpowering governance credibility, and visible enforcement can reset trust.",
                "effects": {"police_coverage": 1.2, "media_access": 0.8},
                "bureaucracy_effects": {"integrity": 0.05, "competency": 0.02},
                "campaign_strength": 1.09,
                "target_groups": ["Middle Class", "Civic Networks", "Small Traders"],
                "expected_stat_delta": {"police_coverage": 1.0, "media_access": 0.7},
                "opposition_counter_risk": 0.49,
                "narrative_fronts_impacted": {"corruption": 3.5, "public_trust": 1.7},
                "confidence": 0.68,
                "assumptions": ["Investigative agencies maintain procedural independence"],
                "tradeoffs": ["Short-term administrative slowdown while audits run"],
                "counter_narrative_risk": "Opposition may call this selective prosecution.",
            }
        if focus == "trust":
            return {
                "name": "Public Trust Rebuild Compact",
                "description": "Publish weekly delivery scorecards, grievance closure SLAs, and third-party verification.",
                "rationale": "Trust rebounds when promises become measurable and public.",
                "why_now": "Confidence in governance is fragile and measurable accountability can rebuild trust quickly.",
                "effects": {"media_access": 1.8, "connectivity": 0.6},
                "bureaucracy_effects": {"integrity": 0.03, "competency": 0.02},
                "campaign_strength": 1.07,
                "target_groups": ["Undecided Voters", "Civic Groups", "Students"],
                "expected_stat_delta": {"media_access": 1.5, "connectivity": 0.5},
                "opposition_counter_risk": 0.52,
                "narrative_fronts_impacted": {"public_trust": 3.0, "social_cohesion": 1.1},
                "confidence": 0.62,
                "assumptions": ["Departments can report clean weekly metrics"],
                "tradeoffs": ["Exposes missed targets in the short term"],
                "counter_narrative_risk": "Opposition may call this dashboard governance without structural reform.",
            }
        if focus == "safety":
            return {
                "name": "Civic Safety Surge",
                "description": "Deploy hotspot patrols with community safety councils and rapid-response evidence triage teams.",
                "rationale": "Visible safety gains can reset fear-driven narrative collapse.",
                "why_now": "Public insecurity is the top concern and visible safety delivery is needed this turn.",
                "effects": {"police_coverage": 3.1, "recidivism_rate": -1.5, "lighting_level": 1.2},
                "campaign_strength": 1.08,
                "target_groups": ["Women Commuters", "Peri-Urban Residents"],
                "expected_stat_delta": {"police_coverage": 2.7, "recidivism_rate": -1.3},
                "opposition_counter_risk": 0.53,
                "narrative_fronts_impacted": {"safety": 3.1, "social_cohesion": 1.0},
                "confidence": 0.63,
                "assumptions": ["Force deployment remains disciplined and transparent"],
                "tradeoffs": ["Operational overtime costs increase"],
                "counter_narrative_risk": "Opposition may frame this as selective ward optics.",
            }
        return {
            "name": "Targeted Stabilization Package",
            "description": "Prioritize a focused recovery bundle tied to the city's most urgent pressure fronts.",
            "rationale": "Narrowing policy bandwidth improves execution under high narrative pressure.",
            "why_now": "Urgent pressure fronts are converging, so a focused stabilization bundle is timely now.",
            "effects": {"treasury_balance": 1.5, "employment_rate": 1.1, "park_density": 0.8},
            "campaign_strength": 1.05,
            "target_groups": ["Undecided Voters", "Working Households"],
            "expected_stat_delta": {"treasury_balance": 1.3, "employment_rate": 1.0},
            "opposition_counter_risk": 0.57,
            "narrative_fronts_impacted": {"services": 1.4, "economy": 1.2},
            "confidence": 0.58,
            "assumptions": ["Execution bottlenecks are actively managed"],
            "tradeoffs": ["Less diversification across issue fronts this turn"],
            "counter_narrative_risk": "Opposition may frame this as tactical short-termism.",
        }

    def _build_fallback_payload(self, guidance: str | None = None) -> list[dict[str, Any]]:
        focus = self._detect_focus(guidance)
        instruction = str(guidance or "").strip()
        fallback = [
            {
                "name": "Emergency Employment Drive",
                "description": "Launch a short-term public works program focused on high-unemployment wards.",
                "rationale": "Stabilizes jobs pressure and signals visible action before discontent escalates.",
                "why_now": "Employment stress is amplifying anti-incumbent sentiment; rapid hiring can reset momentum.",
                "effects": {"employment_rate": 3.2, "avg_wage": 1.4, "treasury_balance": -1.0},
                "campaign_strength": 1.08,
                "target_groups": ["Workers", "Youth"],
                "expected_stat_delta": {"employment_rate": 3.0, "avg_wage": 1.2},
                "opposition_counter_risk": 0.62,
                "narrative_fronts_impacted": {"economy": 2.5, "social_cohesion": 1.4},
                "confidence": 0.62,
                "assumptions": ["Program disbursement is timely"],
                "tradeoffs": ["Budget pressure may rise"],
                "counter_narrative_risk": "Opposition may frame this as election-season patronage.",
            },
            {
                "name": "Procurement Transparency Portal",
                "description": "Publish all major contracts with milestone and payment tracking.",
                "rationale": "Directly attacks corruption perception and protects credibility.",
                "why_now": "Trust erosion is strongest around procurement opacity; transparency can blunt scandals.",
                "effects": {"media_access": 1.8, "connectivity": 0.8},
                "bureaucracy_effects": {"integrity": 0.05, "competency": 0.02},
                "campaign_strength": 1.06,
                "target_groups": ["Middle Class", "Journalists"],
                "expected_stat_delta": {"media_access": 1.5, "connectivity": 0.7},
                "opposition_counter_risk": 0.48,
                "narrative_fronts_impacted": {"corruption": 3.0, "public_trust": 2.2},
                "confidence": 0.69,
                "assumptions": ["Data quality is clean"],
                "tradeoffs": ["Exposes legacy contract weaknesses"],
                "counter_narrative_risk": "Opposition can claim this is symbolic without prosecutions.",
            },
            {
                "name": "Neighborhood Safety Pact",
                "description": "Deploy community policing and rapid grievance hotlines in high-friction districts.",
                "rationale": "Creates visible safety response without purely punitive optics.",
                "why_now": "Local insecurity is feeding opposition framing on weak governance.",
                "effects": {"police_coverage": 2.4, "recidivism_rate": -1.7, "lighting_level": 1.2},
                "campaign_strength": 1.04,
                "target_groups": ["Peri-urban Residents"],
                "expected_stat_delta": {"police_coverage": 2.0, "recidivism_rate": -1.5},
                "opposition_counter_risk": 0.54,
                "narrative_fronts_impacted": {"safety": 2.6, "social_cohesion": 1.2},
                "confidence": 0.58,
                "assumptions": ["Police-community coordination holds"],
                "tradeoffs": ["Requires sustained field staffing"],
                "counter_narrative_risk": "Opposition may frame this as temporary optics before elections.",
            },
            {
                "name": "Clean Air Transit Push",
                "description": "Subsidize electric buses and prioritize pollution hotspots for route expansion.",
                "rationale": "Combines service improvement with health and environment benefits.",
                "why_now": "Environmental stress and commuting pain are converging into daily voter frustration.",
                "effects": {"pollution_levels": -3.0, "connectivity": 1.5, "avg_wage": 0.8},
                "campaign_strength": 1.03,
                "target_groups": ["Students", "Commuters"],
                "expected_stat_delta": {"pollution_levels": -2.8, "connectivity": 1.4},
                "opposition_counter_risk": 0.57,
                "narrative_fronts_impacted": {"services": 2.0, "economy": 1.2},
                "confidence": 0.55,
                "assumptions": ["Supply chain for vehicles is stable"],
                "tradeoffs": ["Capital cost spikes in early turns"],
                "counter_narrative_risk": "Opposition may call this greenwashing if rollout is slow.",
            },
            {
                "name": "Citizen Audit Councils",
                "description": "Create ward-level councils that score service delivery and publish monthly audits.",
                "rationale": "Invites participatory oversight and reframes legitimacy around accountability.",
                "why_now": "Governance credibility is fragile; participatory oversight can rebalance narrative control.",
                "effects": {"media_access": 2.2, "park_density": 0.6},
                "bureaucracy_effects": {"integrity": 0.04, "competency": 0.01},
                "campaign_strength": 1.02,
                "target_groups": ["Civic Groups", "Students"],
                "expected_stat_delta": {"media_access": 2.0, "park_density": 0.5},
                "opposition_counter_risk": 0.51,
                "narrative_fronts_impacted": {"public_trust": 2.8, "corruption": 1.3},
                "confidence": 0.57,
                "assumptions": ["Councils remain politically plural"],
                "tradeoffs": ["Can slow executive decision cycles"],
                "counter_narrative_risk": "Opposition may call this bureaucratic theater.",
            },
        ]

        if not instruction:
            return [self._attach_execution_blueprint(item, focus) for item in fallback]

        fallback[0] = self._focus_option_payload(focus)
        for index in range(1, len(fallback)):
            item = fallback[index]
            if focus == "fuel":
                item["effects"] = self._shift_effect(item.get("effects", {}), "connectivity", 0.6)
                item["effects"] = self._shift_effect(item.get("effects", {}), "pollution_levels", -0.5)
            elif focus == "jobs":
                item["effects"] = self._shift_effect(item.get("effects", {}), "employment_rate", 0.7)
                item["effects"] = self._shift_effect(item.get("effects", {}), "avg_wage", 0.4)
            elif focus == "corruption":
                item["effects"] = self._shift_effect(item.get("effects", {}), "media_access", 0.5)
                item.setdefault("bureaucracy_effects", {})["integrity"] = 0.03
            elif focus == "trust":
                item["effects"] = self._shift_effect(item.get("effects", {}), "media_access", 0.8)
            elif focus == "safety":
                item["effects"] = self._shift_effect(item.get("effects", {}), "police_coverage", 0.8)
                item["effects"] = self._shift_effect(item.get("effects", {}), "recidivism_rate", -0.4)

        return [self._attach_execution_blueprint(item, focus) for item in fallback]

    def _generate_live_options(self, user: str) -> list[DynamicPolicy]:
        if self._client is None or self._disable_live:
            return []
        data = self._client.chat(_SYSTEM, user)
        raw_policies = data.get("policies", [])
        parsed = [DynamicPolicy.from_llm(p, actor="mayor") for p in raw_policies[:5]]
        if len(parsed) >= 5:
            return parsed[:5]
        return []

    def _generate_live_options_with_timeout(self, user: str) -> list[DynamicPolicy]:
        result_q: Queue[list[DynamicPolicy] | Exception] = Queue(maxsize=1)

        def _runner() -> None:
            try:
                result_q.put(self._generate_live_options(user))
            except Exception as exc:
                result_q.put(exc)

        worker = Thread(target=_runner, daemon=True)
        worker.start()
        try:
            result = result_q.get(timeout=self._timeout_seconds)
        except Empty:
            return []
        if isinstance(result, Exception):
            return []
        return result

    @classmethod
    def _sanitize_text(
        cls,
        value: str | None,
        *,
        fallback: str,
        max_len: int,
        guard_placeholders: bool = False,
    ) -> str:
        text = str(value or "").strip()
        lower = text.lower()
        for marker in cls._BLOCKED_PROMPT_MARKERS:
            idx = lower.find(marker)
            if idx >= 0:
                text = text[:idx].strip(" .:-")
                lower = text.lower()
        text = " ".join(text.split()).strip()
        if guard_placeholders and text.lower() in cls._PLACEHOLDER_POLICY_NAMES:
            text = ""
        if not text:
            text = fallback
        return text[:max_len]

    @staticmethod
    def _normalized_name(name: str | None) -> str:
        return re.sub(r"[^a-z0-9]+", "", str(name or "").lower())

    @classmethod
    def _is_weak_policy_name(cls, name: str | None) -> bool:
        text = " ".join(str(name or "").split()).strip()
        if not text:
            return True
        normalized = cls._normalized_name(text)
        if not normalized:
            return True
        placeholder_norms = {
            cls._normalized_name(item) for item in cls._PLACEHOLDER_POLICY_NAMES
        }
        placeholder_norms.update(
            {
                "unknownpolicy",
                "policyoption",
                "unknownpolicyoption",
                "napolicy",
                "tbdpolicy",
            }
        )
        if normalized in placeholder_norms:
            return True
        tokens = [token for token in re.findall(r"[a-z0-9]+", text.lower()) if token]
        meaningful = [token for token in tokens if token not in cls._GENERIC_TITLE_TOKENS and len(token) >= 3]
        if len(meaningful) >= 2:
            return False
        if len(tokens) <= 3 and all(token in cls._GENERIC_TITLE_TOKENS for token in tokens):
            return True
        return len(meaningful) == 0

    @staticmethod
    def _infer_policy_domain(intent: str, effects: dict[str, float]) -> str:
        text = str(intent or "").lower()
        if "job" in text or "employment" in text:
            return "Jobs"
        if "trust" in text:
            return "Trust"
        if "corruption" in text or "integrity" in text or "audit" in text:
            return "Integrity"
        if "safety" in text or "crime" in text or "law" in text:
            return "Safety"
        if "infrastructure" in text or "transport" in text or "service" in text:
            return "Infrastructure"
        if "environment" in text or "air" in text:
            return "Environment"
        if "cohesion" in text or "tension" in text:
            return "Cohesion"
        if float(effects.get("employment_rate", 0.0)) != 0 or float(effects.get("avg_wage", 0.0)) != 0:
            return "Jobs"
        if float(effects.get("media_access", 0.0)) != 0:
            return "Trust"
        if float(effects.get("police_coverage", 0.0)) != 0 or float(effects.get("recidivism_rate", 0.0)) != 0:
            return "Safety"
        if float(effects.get("connectivity", 0.0)) != 0 or float(effects.get("lighting_level", 0.0)) != 0:
            return "Infrastructure"
        if float(effects.get("pollution_levels", 0.0)) != 0:
            return "Environment"
        if float(effects.get("hospital_capacity", 0.0)) != 0 or float(effects.get("food_supply", 0.0)) != 0:
            return "Health"
        return "City"

    @classmethod
    def _derive_repaired_title(cls, option: DynamicPolicy) -> str:
        target_label = ""
        if option.implementation_targets:
            target_label = str(option.implementation_targets[0].get("label", "")).strip()
        if not target_label:
            target_label = str(option.name or "").strip()
        target_label = " ".join(target_label.split())
        if target_label:
            target_label = re.sub(r"[^A-Za-z0-9 ]+", " ", target_label).strip()
            target_tokens = [token for token in target_label.split() if token][:3]
            target_label = " ".join(target_tokens)

        domain = cls._infer_policy_domain(option.intent, option.effects)
        if target_label:
            label_norm = target_label.lower()
            if domain.lower() in label_norm:
                return f"{target_label} Delivery Plan"
            return f"{target_label} {domain} Delivery Plan"
        return f"{domain} Delivery Plan"

    @classmethod
    def _sanitize_options(cls, options: list[DynamicPolicy]) -> list[DynamicPolicy]:
        for option in options:
            candidate_name = cls._sanitize_text(
                option.name,
                fallback="",
                max_len=120,
                guard_placeholders=True,
            )
            if cls._is_weak_policy_name(candidate_name):
                candidate_name = cls._derive_repaired_title(option)
            if cls._is_weak_policy_name(candidate_name):
                candidate_name = "Strategic Action Plan"
            option.name = candidate_name[:120]
            option.description = cls._sanitize_text(
                option.description,
                fallback="Targeted intervention to stabilize key city pressures this turn.",
                max_len=220,
            )
            option.rationale = cls._sanitize_text(
                option.rationale,
                fallback="Chosen for near-term impact under current city pressures.",
                max_len=400,
            )
            option.why_now = cls._sanitize_text(
                option.why_now,
                fallback=option.rationale,
                max_len=400,
            )
        return options

    def _enforce_guidance_marker(
        self, options: list[DynamicPolicy], guidance: str | None
    ) -> list[DynamicPolicy]:
        # Keep constraints in generation prompt only; never append prompt text into output fields.
        return options

    def generate_fallback_options(self, guidance: str | None = None) -> list[DynamicPolicy]:
        fallback = self._build_fallback_payload(guidance)
        options = [DynamicPolicy.from_llm(item, actor="mayor") for item in fallback]
        return self._sanitize_options(options)

    def generate_options_with_source(
        self, game_state: "GameState", guidance: str | None = None
    ) -> tuple[list[DynamicPolicy], str]:
        context = build_city_context(game_state)
        user = f"City state:\n{context}\n\nGenerate 5 mayor policy options for this turn."
        if guidance:
            user += (
                "\n\nAdditional user constraints for this option set:\n"
                f"{guidance}\n"
                "Respect these constraints while still returning a balanced strategic set.\n"
                "Mandatory: at least 3 of 5 options must explicitly reflect these constraints in why_now."
            )
        if self._client is not None and not self._disable_live:
            generated = self._generate_live_options_with_timeout(user)
            if generated:
                clean = self._enforce_guidance_marker(generated, guidance)
                return self._sanitize_options(clean), "live"

        return self.generate_fallback_options(guidance), "fallback"

    def generate_options(self, game_state: "GameState", guidance: str | None = None) -> list[DynamicPolicy]:
        options, _ = self.generate_options_with_source(game_state, guidance=guidance)
        return options
