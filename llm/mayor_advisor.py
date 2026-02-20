from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
import os
from typing import TYPE_CHECKING

from llm.llm_client import LLMClient
from llm.context_builder import build_city_context
from llm.dynamic_policy import DynamicPolicy

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
    def __init__(self) -> None:
        model = os.environ.get("LLM_MODEL", "gpt-4o")
        self._client: LLMClient | None
        try:
            self._client = LLMClient(model=model)
        except Exception:
            self._client = None
        key = os.environ.get("LLM_API_KEY") or os.environ.get("OPENAI_API_KEY") or os.environ.get("ANTHROPIC_API_KEY") or ""
        self._disable_live = key.startswith("test-")
        self._timeout_seconds = max(1.0, float(os.environ.get("MAYOR_ADVISOR_TIMEOUT_SECONDS", "6.0")))

    def _generate_live_options(self, user: str) -> list[DynamicPolicy]:
        if self._client is None or self._disable_live:
            return []
        data = self._client.chat(_SYSTEM, user)
        raw_policies = data.get("policies", [])
        parsed = [DynamicPolicy.from_llm(p, actor="mayor") for p in raw_policies[:5]]
        if len(parsed) >= 5:
            return parsed[:5]
        return []

    def generate_options(self, game_state: "GameState", guidance: str | None = None) -> list[DynamicPolicy]:
        context = build_city_context(game_state)
        user = f"City state:\n{context}\n\nGenerate 5 mayor policy options for this turn."
        if guidance:
            user += (
                "\n\nAdditional user constraints for this option set:\n"
                f"{guidance}\n"
                "Respect these constraints while still returning a balanced strategic set."
            )
        if self._client is not None and not self._disable_live:
            try:
                with ThreadPoolExecutor(max_workers=1) as executor:
                    future = executor.submit(self._generate_live_options, user)
                    generated = future.result(timeout=self._timeout_seconds)
                if generated:
                    return generated
            except FutureTimeoutError:
                pass
            except Exception:
                pass

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
        return [DynamicPolicy.from_llm(item, actor="mayor") for item in fallback]
