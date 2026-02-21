from __future__ import annotations

import os
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

Return a JSON object with key "policies" containing a list of 5 policy objects. Each policy object must have:
- "name": short policy name (max 6 words)
- "description": 1 sentence explaining what the policy does in city terms
- "rationale": 1-2 sentences explaining why a mayor might choose this now given the city state
- "why_now": one concise paragraph linking this option to the city's current pressure points
- "effects": object with city stat changes. Keys from: economy, employment, law_and_order, infrastructure, environment, corruption, social_tension, media_freedom, public_trust. Values: floats -10 to +10. Only include stats actually affected. Use realistic magnitudes — most effects ±1 to ±5.
- "group_effects": list of group impact objects. Each has "match" (object with one key: "religion", "caste", or "language" and the group's value), and some of: "happiness" (-8 to 8), "alignment" (-8 to 8), "radicalization" (-8 to 8). Only include groups actually affected.
- "campaign_strength": float 0.9 to 1.4 (how much this boosts mayor campaign)
- "media_effects": object with some of: "bias" (-5 to 5), "sensationalism" (-5 to 5), "trust" (-5 to 5)
- "target_groups": array of up to 3 group labels impacted most
- "expected_stat_delta": object mirroring top expected stat movements
- "opposition_counter_risk": float 0.0 to 1.0
- "narrative_fronts_impacted": object from fronts {economy, corruption, safety, services, social_cohesion, public_trust} with -5 to +5 intensity
- "confidence": float 0.0 to 1.0
- "assumptions": array of up to 3 short assumptions
- "tradeoffs": array of up to 3 short tradeoffs
- "counter_narrative_risk": one sentence on likely opposition attack line

Make the 5 policies meaningfully different — cover different domains (economic, social, law enforcement, environmental, political). All effects must be internally consistent with the policy description."""


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

    def _focus_option_payload(self, focus: str) -> dict[str, Any]:
        if focus == "fuel":
            return {
                "name": "Fuel Supply Stabilization Mission",
                "description": "Create emergency fuel depots, monitored ration windows, and guaranteed transit fuel reserves on critical routes.",
                "rationale": "Fuel continuity lowers panic pricing and commuter anger while showing executive control over a visible crisis.",
                "why_now": "Fuel shortage pressure is dominating daily life and commuters need immediate reliability.",
                "effects": {
                    "economy": 2.3,
                    "infrastructure": 1.7,
                    "social_tension": -2.6,
                    "public_trust": 1.4,
                    "environment": -0.6,
                },
                "campaign_strength": 1.11,
                "target_groups": ["Commuters", "Informal Workers", "Small Businesses"],
                "expected_stat_delta": {"economy": 2.0, "social_tension": -2.4, "public_trust": 1.2},
                "opposition_counter_risk": 0.56,
                "narrative_fronts_impacted": {"services": 3.2, "economy": 2.4, "public_trust": 1.5},
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
                "effects": {"employment": 3.4, "economy": 1.6, "social_tension": -1.8, "public_trust": 1.1},
                "campaign_strength": 1.1,
                "target_groups": ["Workers", "Youth", "Peri-Urban Households"],
                "expected_stat_delta": {"employment": 3.0, "social_tension": -1.7},
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
                "effects": {"corruption": -4.1, "public_trust": 1.8, "law_and_order": 0.9},
                "campaign_strength": 1.09,
                "target_groups": ["Middle Class", "Civic Networks", "Small Traders"],
                "expected_stat_delta": {"corruption": -3.8, "public_trust": 1.6},
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
                "effects": {"public_trust": 2.8, "social_tension": -1.2, "media_freedom": 0.6, "corruption": -1.0},
                "campaign_strength": 1.07,
                "target_groups": ["Undecided Voters", "Civic Groups", "Students"],
                "expected_stat_delta": {"public_trust": 2.4, "social_tension": -1.0},
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
                "effects": {"law_and_order": 3.1, "social_tension": -1.5, "public_trust": 0.9},
                "campaign_strength": 1.08,
                "target_groups": ["Women Commuters", "Peri-Urban Residents"],
                "expected_stat_delta": {"law_and_order": 2.7, "social_tension": -1.3},
                "opposition_counter_risk": 0.53,
                "narrative_fronts_impacted": {"safety": 3.1, "social_cohesion": 1.0},
                "confidence": 0.63,
                "assumptions": ["Force deployment remains disciplined and transparent"],
                "tradeoffs": ["Operational overtime costs increase"],
                "counter_narrative_risk": "Opposition may frame this as selective ward optics.",
            }
        return {
            "name": "Targeted Stabilization Package",
            "description": "Prioritize a focused recovery bundle tied to the city’s most urgent pressure fronts.",
            "rationale": "Narrowing policy bandwidth improves execution under high narrative pressure.",
            "why_now": "Urgent pressure fronts are converging, so a focused stabilization bundle is timely now.",
            "effects": {"economy": 1.5, "public_trust": 1.1, "social_tension": -1.2},
            "campaign_strength": 1.05,
            "target_groups": ["Undecided Voters", "Working Households"],
            "expected_stat_delta": {"economy": 1.3, "social_tension": -1.0},
            "opposition_counter_risk": 0.57,
            "narrative_fronts_impacted": {"services": 1.4, "public_trust": 1.3, "economy": 1.2},
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
                "effects": {"employment": 3.2, "social_tension": -2.0, "public_trust": 1.0},
                "campaign_strength": 1.08,
                "target_groups": ["Workers", "Youth"],
                "expected_stat_delta": {"employment": 3.0, "social_tension": -2.0},
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
                "effects": {"corruption": -3.5, "public_trust": 2.2, "media_freedom": 0.8},
                "campaign_strength": 1.06,
                "target_groups": ["Middle Class", "Journalists"],
                "expected_stat_delta": {"corruption": -3.0, "public_trust": 2.0},
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
                "why_now": "Social tension and local insecurity are feeding opposition framing on weak governance.",
                "effects": {"law_and_order": 2.4, "social_tension": -1.7, "public_trust": 0.9},
                "campaign_strength": 1.04,
                "target_groups": ["Peri-urban Residents"],
                "expected_stat_delta": {"law_and_order": 2.0, "social_tension": -1.5},
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
                "effects": {"environment": 3.0, "infrastructure": 1.5, "economy": 0.8},
                "campaign_strength": 1.03,
                "target_groups": ["Students", "Commuters"],
                "expected_stat_delta": {"environment": 2.8, "infrastructure": 1.4},
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
                "why_now": "Public trust is fragile; participatory oversight can rebalance narrative control.",
                "effects": {"public_trust": 2.7, "corruption": -1.8, "social_tension": -0.8},
                "campaign_strength": 1.02,
                "target_groups": ["Civic Groups", "Students"],
                "expected_stat_delta": {"public_trust": 2.4, "corruption": -1.6},
                "opposition_counter_risk": 0.51,
                "narrative_fronts_impacted": {"public_trust": 2.8, "corruption": 1.3},
                "confidence": 0.57,
                "assumptions": ["Councils remain politically plural"],
                "tradeoffs": ["Can slow executive decision cycles"],
                "counter_narrative_risk": "Opposition may call this bureaucratic theater.",
            },
        ]

        if not instruction:
            return fallback

        fallback[0] = self._focus_option_payload(focus)
        for index in range(1, len(fallback)):
            item = fallback[index]
            if focus == "fuel":
                item["effects"] = self._shift_effect(item.get("effects", {}), "infrastructure", 0.6)
                item["effects"] = self._shift_effect(item.get("effects", {}), "social_tension", -0.5)
            elif focus == "jobs":
                item["effects"] = self._shift_effect(item.get("effects", {}), "employment", 0.7)
                item["effects"] = self._shift_effect(item.get("effects", {}), "economy", 0.4)
            elif focus == "corruption":
                item["effects"] = self._shift_effect(item.get("effects", {}), "corruption", -0.9)
                item["effects"] = self._shift_effect(item.get("effects", {}), "public_trust", 0.5)
            elif focus == "trust":
                item["effects"] = self._shift_effect(item.get("effects", {}), "public_trust", 0.8)
            elif focus == "safety":
                item["effects"] = self._shift_effect(item.get("effects", {}), "law_and_order", 0.8)
                item["effects"] = self._shift_effect(item.get("effects", {}), "social_tension", -0.4)

        return fallback

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

    @classmethod
    def _sanitize_options(cls, options: list[DynamicPolicy]) -> list[DynamicPolicy]:
        for option in options:
            option.name = cls._sanitize_text(
                option.name,
                fallback="Strategic Action Plan",
                max_len=120,
                guard_placeholders=True,
            )
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
