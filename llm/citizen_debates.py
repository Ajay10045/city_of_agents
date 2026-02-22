from __future__ import annotations

import os
from collections import defaultdict
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from llm.llm_client import LLMClient
from llm.dynamic_policy import DynamicPolicy, _clamp, _to_float

if TYPE_CHECKING:
    from agents.agent import Agent
    from core.game_state import GameState

_SYSTEM = """You are simulating a street-level conversation among citizens of a specific identity group in a city political simulation.

Given the group's profile, current mood, and what happened this turn, write a vivid, realistic 2-3 sentence summary of what people in this group are talking about — their frustrations, hopes, and reactions. Then output sentiment deltas reflecting how this turn's events shift their collective mood.

Return a JSON object with:
- "debate_summary": 2-3 sentence narrative of the group's internal conversation this turn. Be specific to their identity (religion, occupation, concerns). Use vivid language — what are they saying in tea shops, workplaces, campuses?
- "notable_quote": One short direct quote from a fictional member of this group (max 15 words). Make it feel authentic to their background.
- "alignment_delta": float -5 to +5 (negative = shifts toward opposition, positive = toward mayor)
- "happiness_delta": float -5 to +5
- "radicalization_delta": float -5 to +5 (positive = more radicalized/angry)
- "trust_delta": float -5 to +5 (trust in government)

Base the deltas on: how much the mayor's action helped/hurt this group, whether the opposition's move resonated, any active crises affecting them, and their current radicalization level."""

_STREET_SYSTEM = """You are generating realistic local street chatter for a city political simulation.

Return ONLY valid JSON with this shape:
{
  "chatter": [
    {
      "speaker": "short person name",
      "role": "city role",
      "group_name": "identity group name",
      "line": "one vivid sentence of what this person says in public",
      "sentiment": "supportive|skeptical|angry|hopeful|mixed",
      "heat": 0.0 to 1.0,
      "tags": ["jobs", "corruption"]
    }
  ]
}

Rules:
- Use local flavor and colloquial expressions suitable to the city.
- Keep each line <= 24 words.
- No slurs, hate speech, or explicit violence.
- Keep chatter grounded in this turn's policies/events.
- Prefer concrete daily concerns (rent, commute, safety, bills, jobs, air, services).
- Most speakers should be everyday residents (workers, students, commuters, shopkeepers); include at most one politician voice unless explicitly asked."""

_FIRST_NAMES = [
    "Aarav",
    "Sara",
    "Rohan",
    "Mina",
    "Kabir",
    "Aisha",
    "Leo",
    "Maya",
    "Kenji",
    "Rina",
    "Omar",
    "Nadia",
]
_LAST_INITIALS = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")


@dataclass
class DebateResult:
    group_id: str
    group_name: str
    debate_summary: str
    notable_quote: str
    alignment_delta: float
    happiness_delta: float
    radicalization_delta: float
    trust_delta: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "group_id": self.group_id,
            "group_name": self.group_name,
            "debate_summary": self.debate_summary,
            "notable_quote": self.notable_quote,
            "alignment_delta": self.alignment_delta,
            "happiness_delta": self.happiness_delta,
            "radicalization_delta": self.radicalization_delta,
            "trust_delta": self.trust_delta,
        }


@dataclass
class StreetChatterItem:
    speaker: str
    role: str
    group_name: str
    line: str
    sentiment: str
    heat: float
    tags: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "speaker": self.speaker,
            "role": self.role,
            "group_name": self.group_name,
            "line": self.line,
            "sentiment": self.sentiment,
            "heat": self.heat,
            "tags": list(self.tags),
        }


class CitizenDebates:
    def __init__(self) -> None:
        model = os.environ.get("LLM_DEBATE_MODEL", "gpt-4o-mini")
        key = (
            os.environ.get("LLM_API_KEY")
            or os.environ.get("OPENAI_API_KEY")
            or os.environ.get("ANTHROPIC_API_KEY")
            or ""
        )
        self._disable_live = key.startswith("test-")
        self._client: LLMClient | None
        try:
            self._client = LLMClient(model=model)
        except Exception:
            self._client = None

    @staticmethod
    def _normalize_sentiment(value: Any) -> str:
        raw = str(value or "").strip().lower()
        if raw in {"supportive", "pro-mayor", "positive"}:
            return "supportive"
        if raw in {"skeptical", "cautious", "uncertain"}:
            return "skeptical"
        if raw in {"angry", "hostile", "furious"}:
            return "angry"
        if raw in {"hopeful", "optimistic"}:
            return "hopeful"
        if raw in {"mixed", "split", "divided"}:
            return "mixed"
        return "mixed"

    @staticmethod
    def _city_flavor(city_id: str) -> str:
        flavors = {
            "new_delhi": "Use Delhi street rhythm with mild Hindi-English code-switching (for example yaar, bhai, didi, mohalla) where natural.",
            "new_york": "Use New York street cadence (for example block, subway, borough, rent) without caricature.",
            "london": "Use London civic street tone (for example high street, council, tube, mates) without caricature.",
            "tokyo": "Use Tokyo urban practical tone (for example ward office, station crowding, utility bills) with light Japanese references where natural.",
            "dubai": "Use Dubai urban mix tone (for example district, commute corridor, service fee, expat-local mix) with light Arabic colloquial hints where natural.",
        }
        return flavors.get(city_id, "Use local, grounded city colloquial tone.")

    def _sample_panel_agents(self, game_state: "GameState", panel_size: int) -> list["Agent"]:
        if not game_state.agents:
            return []
        rng = game_state.rng
        panel_size = max(1, min(panel_size, len(game_state.agents)))
        strategy = str(game_state.simulation_profile.get("llm_sampling_strategy", "stratified")).lower()

        if strategy in {"none", "uniform"}:
            return rng.sample(game_state.agents, panel_size)

        by_group: dict[str, list["Agent"]] = defaultdict(list)
        for agent in game_state.agents:
            by_group[agent.group_id].append(agent)

        sampled: list["Agent"] = []
        group_keys = list(by_group.keys())
        remaining = panel_size
        for idx, group_id in enumerate(group_keys):
            bucket = by_group[group_id]
            if not bucket:
                continue
            slots_left = len(group_keys) - idx
            quota = max(1, int(round(panel_size * (len(bucket) / len(game_state.agents)))))
            quota = min(quota, len(bucket), remaining - max(0, slots_left - 1))
            if quota <= 0:
                continue
            sampled.extend(rng.sample(bucket, quota))
            remaining -= quota
            if remaining <= 0:
                break

        if remaining > 0:
            used_ids = {agent.id for agent in sampled}
            leftovers = [agent for agent in game_state.agents if agent.id not in used_ids]
            if leftovers:
                sampled.extend(rng.sample(leftovers, min(remaining, len(leftovers))))

        if len(sampled) < panel_size:
            used_ids = {agent.id for agent in sampled}
            leftovers = [agent for agent in game_state.agents if agent.id not in used_ids]
            if leftovers:
                sampled.extend(rng.sample(leftovers, min(panel_size - len(sampled), len(leftovers))))
        return sampled[:panel_size]

    def _pick_speakers(
        self, panel_agents: list["Agent"], game_state: "GameState", limit: int
    ) -> list["Agent"]:
        if not panel_agents:
            return []
        rng = game_state.rng
        scored = sorted(
            panel_agents,
            key=lambda agent: (
                agent.influence * 0.35
                + abs(agent.alignment) * 0.18
                + agent.radicalization * 0.2
                + agent.happiness * 0.08
                + rng.uniform(-8.0, 8.0)
            ),
            reverse=True,
        )
        by_role: dict[str, list["Agent"]] = defaultdict(list)
        for agent in scored:
            by_role[agent.role].append(agent)

        political_roles = {"politician", "party_worker", "councilor", "minister"}
        non_political_roles = [
            role
            for role in by_role
            if role.strip().replace(" ", "_").lower() not in political_roles
        ]

        selected: list["Agent"] = []
        selected_ids: set[int] = set()
        max_political = max(1, limit // 5)
        political_count = 0

        # First pass: cover as many non-political roles as possible.
        for role in sorted(non_political_roles, key=lambda r: len(by_role[r]), reverse=True):
            for candidate in by_role[role]:
                if candidate.id in selected_ids:
                    continue
                selected.append(candidate)
                selected_ids.add(candidate.id)
                break
            if len(selected) >= limit:
                return selected[:limit]

        # Second pass: fill from high-signal non-political speakers.
        for candidate in scored:
            if len(selected) >= limit:
                break
            role_key = candidate.role.strip().replace(" ", "_").lower()
            if role_key in political_roles:
                continue
            if candidate.id in selected_ids:
                continue
            selected.append(candidate)
            selected_ids.add(candidate.id)

        # Third pass: add limited political voices for realism.
        for candidate in scored:
            if len(selected) >= limit:
                break
            role_key = candidate.role.strip().replace(" ", "_").lower()
            if role_key not in political_roles:
                continue
            if candidate.id in selected_ids or political_count >= max_political:
                continue
            selected.append(candidate)
            selected_ids.add(candidate.id)
            political_count += 1

        # Final fill if still short.
        if len(selected) < limit:
            for candidate in scored:
                if len(selected) >= limit:
                    break
                if candidate.id in selected_ids:
                    continue
                selected.append(candidate)
                selected_ids.add(candidate.id)

        return selected[:limit]

    def _speaker_name(self, agent: "Agent", game_state: "GameState") -> str:
        rng = game_state.rng
        base = _FIRST_NAMES[agent.id % len(_FIRST_NAMES)]
        if rng.random() < 0.42:
            base = rng.choice(_FIRST_NAMES)
        suffix = _LAST_INITIALS[(agent.id + game_state.turn_number) % len(_LAST_INITIALS)]
        return f"{base} {suffix}."

    def _fallback_street_chatter(
        self,
        game_state: "GameState",
        speakers: list["Agent"],
        mayor_action: DynamicPolicy,
        opp_action: DynamicPolicy,
        triggered_events: list[str],
    ) -> list[StreetChatterItem]:
        city_id = str(game_state.simulation_profile.get("city_id", "")).lower()
        token_by_city = {
            "new_delhi": "yaar",
            "new_york": "man",
            "london": "mate",
            "tokyo": "honestly",
            "dubai": "habibi",
        }
        local_token = token_by_city.get(city_id, "honestly")
        stats = game_state.city_stats
        pressure = "costs" if stats.economy < 45 else "jobs" if stats.employment < 45 else "services"
        event_focus = triggered_events[0] if triggered_events else "no new crisis"
        delivery_summary = str(getattr(mayor_action, "delivery_summary", "")).strip()
        implementation_gap = float(getattr(mayor_action, "implementation_gap", 0.0) or 0.0)

        chatter: list[StreetChatterItem] = []
        for idx, agent in enumerate(speakers):
            group = game_state.identity_groups.get(agent.group_id)
            group_name = group.name if group else agent.group_id
            speaker = self._speaker_name(agent, game_state)
            if agent.alignment >= 20 or (agent.happiness >= 58 and agent.trust_in_government >= 50):
                line = (
                    f"{local_token}, {mayor_action.name} finally looks practical; if they deliver on {pressure}, people here will back it."
                )
                sentiment = "hopeful"
            elif agent.radicalization >= 65 or agent.alignment <= -35:
                line = (
                    f"{local_token}, {opp_action.name} is catching fire on my street because folks think City Hall keeps missing basic {pressure} fixes."
                )
                sentiment = "angry"
            elif idx % 2 == 0:
                line = (
                    f"{local_token}, {mayor_action.name} sounds promising, but on my lane we still feel {pressure} pain and {event_focus} is what everyone is discussing."
                )
                sentiment = "skeptical"
            else:
                line = (
                    f"{local_token}, {opp_action.name} is trending in tea stalls, but people in my block want proof, not slogans, before switching sides."
                )
                sentiment = "mixed"
            if delivery_summary and implementation_gap > 0.28 and sentiment in {"skeptical", "mixed", "angry"}:
                line = (
                    f"{line.rstrip('.')} People keep mentioning the delivery gap: "
                    f"{delivery_summary[:90]}."
                )
            heat = _clamp(0.45 + abs(agent.alignment) / 240.0 + agent.radicalization / 300.0, 0.15, 1.0)
            chatter.append(
                StreetChatterItem(
                    speaker=speaker,
                    role=agent.role,
                    group_name=group_name,
                    line=line[:220],
                    sentiment=sentiment,
                    heat=round(heat, 3),
                    tags=["street", pressure, "trust", "narrative"],
                )
            )
        return self._ensure_sentiment_mix(chatter, game_state)

    @staticmethod
    def _ensure_sentiment_mix(
        chatter: list[StreetChatterItem],
        game_state: "GameState",
    ) -> list[StreetChatterItem]:
        if len(chatter) < 2:
            return chatter

        stats = game_state.city_stats
        extreme_state = (
            stats.social_tension >= 78
            or stats.public_trust <= 26
            or stats.economy <= 28
            or stats.law_and_order <= 28
        )
        if extreme_state:
            return chatter

        positive = {"supportive", "hopeful"}
        has_positive = any(item.sentiment in positive for item in chatter)
        has_non_positive = any(item.sentiment not in positive for item in chatter)

        if not has_positive:
            candidate = max(chatter, key=lambda item: (item.heat, len(item.tags)))
            candidate.sentiment = "hopeful"
            candidate.line = (
                candidate.line.rstrip(".")
                + "; still, people think this can improve if delivery stays consistent."
            )[:220]

        if not has_non_positive:
            candidate = min(chatter, key=lambda item: (item.heat, len(item.tags)))
            candidate.sentiment = "skeptical"
            candidate.line = (
                candidate.line.rstrip(".")
                + "; others in the neighborhood are cautious and want proof next turn."
            )[:220]

        return chatter

    def generate_street_chatter(
        self,
        game_state: "GameState",
        mayor_action: DynamicPolicy,
        opp_action: DynamicPolicy,
        triggered_events: list[str],
        limit: int = 8,
    ) -> list[StreetChatterItem]:
        if not game_state.agents:
            return []

        limit = max(3, min(14, int(limit)))
        is_v1_session = str(game_state.simulation_profile.get("api_version", "")).strip().lower() == "v1"
        if is_v1_session:
            panel_agents = list(game_state.agents)
        else:
            configured_panel_size = int(max(0, game_state.simulation_profile.get("llm_panel_size", 0)))
            panel_size = configured_panel_size or min(120, len(game_state.agents))
            panel_agents = self._sample_panel_agents(game_state, panel_size)
        speakers = self._pick_speakers(panel_agents, game_state, limit)
        if not speakers:
            return []

        city_name = str(game_state.simulation_profile.get("city_name", "the city"))
        city_id = str(game_state.simulation_profile.get("city_id", "")).lower()
        event_str = ", ".join(triggered_events[:3]) if triggered_events else "none"
        stats = game_state.city_stats

        speaker_lines = []
        for index, agent in enumerate(speakers, start=1):
            group = game_state.identity_groups.get(agent.group_id)
            group_name = group.name if group else agent.group_id
            speaker_name = self._speaker_name(agent, game_state)
            speaker_lines.append(
                (
                    f"{index}. speaker={speaker_name}; role={agent.role}; group={group_name}; "
                    f"identity={agent.identity.caste}/{agent.identity.religion}/{agent.identity.language}; "
                    f"happiness={agent.happiness:.0f}; radicalization={agent.radicalization:.0f}; "
                    f"alignment={agent.alignment:+.0f}; trust={agent.trust_in_government:.0f}"
                )
            )

        user = (
            f"City: {city_name}\n"
            f"{self._city_flavor(city_id)}\n"
            f"Turn: {game_state.turn_number}\n"
            f"Mayor action: {mayor_action.name} — {mayor_action.description}\n"
            f"Implementation summary: {getattr(mayor_action, 'delivery_summary', '') or 'No delivery summary yet.'}\n"
            f"Opposition action: {opp_action.name} — {opp_action.description}\n"
            f"Triggered events: {event_str}\n"
            f"City stats snapshot: economy={stats.economy:.0f}, employment={stats.employment:.0f}, "
            f"law_and_order={stats.law_and_order:.0f}, corruption={stats.corruption:.0f}, "
            f"social_tension={stats.social_tension:.0f}, public_trust={stats.public_trust:.0f}\n"
            f"Generate exactly {len(speakers)} chatter lines for these sampled panel citizens:\n"
            + "\n".join(speaker_lines)
        )

        if self._client is not None and not self._disable_live:
            try:
                data = self._client.chat(_STREET_SYSTEM, user)
                rows = data.get("chatter", []) if isinstance(data, dict) else []
                if isinstance(rows, list):
                    normalized: list[StreetChatterItem] = []
                    for row in rows[: len(speakers)]:
                        if not isinstance(row, dict):
                            continue
                        line = str(row.get("line", "")).strip().replace("\n", " ")
                        if not line:
                            continue
                        raw_tags = row.get("tags", [])
                        tags: list[str]
                        if isinstance(raw_tags, list):
                            tags = [
                                str(tag).strip().lower().replace("#", "")
                                for tag in raw_tags
                                if str(tag).strip()
                            ][:5]
                        else:
                            tags = []
                        if not tags:
                            tags = ["street", "sentiment"]
                        normalized.append(
                            StreetChatterItem(
                                speaker=str(row.get("speaker", "Citizen"))[:64],
                                role=str(row.get("role", "Resident"))[:32],
                                group_name=str(row.get("group_name", "Citywide"))[:64],
                                line=line[:220],
                                sentiment=self._normalize_sentiment(row.get("sentiment")),
                                heat=round(_clamp(_to_float(row.get("heat"), 0.5) or 0.5, 0.0, 1.0), 3),
                                tags=tags,
                            )
                        )
                    if normalized:
                        return self._ensure_sentiment_mix(normalized, game_state)
            except Exception:
                pass

        return self._fallback_street_chatter(
            game_state=game_state,
            speakers=speakers,
            mayor_action=mayor_action,
            opp_action=opp_action,
            triggered_events=triggered_events,
        )

    def run_debates(
        self,
        game_state: "GameState",
        mayor_action: DynamicPolicy,
        opp_action: DynamicPolicy,
        triggered_events: list[str],
    ) -> list[DebateResult]:
        return list(self.stream_debates(game_state, mayor_action, opp_action, triggered_events))

    def stream_debates(
        self,
        game_state: "GameState",
        mayor_action: DynamicPolicy,
        opp_action: DynamicPolicy,
        triggered_events: list[str],
    ):
        """Generator: yields one DebateResult per group as each LLM call returns."""
        from agents.agent_engine import AgentEngine
        group_metrics = AgentEngine.group_metrics(game_state.agents)
        for gid, info in game_state.identity_groups.items():
            m = group_metrics.get(gid, {})
            yield self._run_single_debate(gid, info, m, mayor_action, opp_action, triggered_events, game_state)

    def _run_single_debate(
        self,
        gid: str,
        info: Any,
        metrics: dict,
        mayor_action: DynamicPolicy,
        opp_action: DynamicPolicy,
        triggered_events: list[str],
        game_state: "GameState",
    ) -> DebateResult:
        align = metrics.get("alignment", 0)
        lean = "Mayor-leaning" if align > 10 else "Opposition-leaning" if align < -10 else "neutral"
        event_str = ", ".join(triggered_events) if triggered_events else "none"

        user = (
            f"Group: {info.name}\n"
            f"Identity: {info.caste} ({info.religion}, speaks {info.language})\n"
            f"Population: {info.population_percent*100:.0f}% of city\n"
            f"Current mood: Happiness {metrics.get('happiness', 50):.0f}/100, "
            f"Radicalization {metrics.get('radicalization', 30):.0f}/100, "
            f"Alignment {align:+.0f} ({lean})\n"
            f"Grievance score: {info.grievance_score:.2f}/1.0\n\n"
            f"This turn:\n"
            f"  Mayor played: '{mayor_action.name}' — {mayor_action.description}\n"
            f"  Delivery summary: {getattr(mayor_action, 'delivery_summary', '') or 'No implementation gap recorded.'}\n"
            f"  Opposition played: '{opp_action.name}' — {opp_action.description}\n"
            f"  Events triggered: {event_str}\n"
            f"  City corruption: {game_state.city_stats.corruption:.0f}, "
            f"Social tension: {game_state.city_stats.social_tension:.0f}, "
            f"Economy: {game_state.city_stats.economy:.0f}\n\n"
            f"Simulate this group's conversation and sentiment shift."
        )

        if self._client is not None and not self._disable_live:
            try:
                data = self._client.chat(_SYSTEM, user)
                return DebateResult(
                    group_id=gid,
                    group_name=info.name,
                    debate_summary=str(data.get("debate_summary", ""))[:500],
                    notable_quote=str(data.get("notable_quote", ""))[:120],
                    alignment_delta=_clamp(_to_float(data.get("alignment_delta"), 0.0) or 0.0, -5, 5),
                    happiness_delta=_clamp(_to_float(data.get("happiness_delta"), 0.0) or 0.0, -5, 5),
                    radicalization_delta=_clamp(_to_float(data.get("radicalization_delta"), 0.0) or 0.0, -5, 5),
                    trust_delta=_clamp(_to_float(data.get("trust_delta"), 0.0) or 0.0, -5, 5),
                )
            except Exception:
                pass

        align_delta = -0.4 if opp_action.campaign_strength >= mayor_action.campaign_strength else 0.3
        happiness_delta = 0.2 if metrics.get("happiness", 50) < 45 else -0.1
        radical_delta = 0.35 if metrics.get("radicalization", 30) > 50 else -0.15
        trust_delta = -0.25 if game_state.city_stats.corruption > 55 else 0.15

        delivery_summary = str(getattr(mayor_action, "delivery_summary", "")).strip()
        summary = (
            f"{info.name} residents weigh {mayor_action.name} against {opp_action.name}, "
            "with conversations centered on delivery credibility and daily pressure."
        )
        if delivery_summary:
            summary = f"{summary} {delivery_summary}"
        quote = "Show us results, not speeches."

        return DebateResult(
            group_id=gid,
            group_name=info.name,
            debate_summary=summary[:500],
            notable_quote=quote,
            alignment_delta=_clamp(align_delta, -5, 5),
            happiness_delta=_clamp(happiness_delta, -5, 5),
            radicalization_delta=_clamp(radical_delta, -5, 5),
            trust_delta=_clamp(trust_delta, -5, 5),
        )
