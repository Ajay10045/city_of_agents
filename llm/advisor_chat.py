from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

from llm.context_builder import build_city_context
from llm.dynamic_policy import DynamicPolicy
from llm.llm_client import LLMClient


@dataclass(frozen=True)
class AdvisorAnswer:
    answer: dict[str, Any]
    cited_option_ids: list[str]
    suggested_actions: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "answer": self.answer,
            "cited_option_ids": list(self.cited_option_ids),
            "suggested_actions": list(self.suggested_actions),
        }


class AdvisorChat:
    def __init__(self) -> None:
        model = os.environ.get("LLM_DEBATE_MODEL") or os.environ.get("LLM_MODEL", "gpt-4o")
        self._client: LLMClient | None
        key = os.environ.get("LLM_API_KEY") or os.environ.get("OPENAI_API_KEY") or os.environ.get("ANTHROPIC_API_KEY") or ""
        self._disable_live = key.startswith("test-")
        try:
            self._client = LLMClient(model=model)
        except Exception:
            self._client = None

    @staticmethod
    def _option_summary(options: list[DynamicPolicy]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for option in options:
            rows.append(
                {
                    "id": option.id,
                    "name": option.name,
                    "description": option.description,
                    "why_now": option.why_now,
                    "target_groups": option.target_groups,
                    "expected_stat_delta": option.expected_stat_delta,
                    "opposition_counter_risk": option.opposition_counter_risk,
                    "narrative_fronts_impacted": option.narrative_fronts_impacted,
                    "confidence": option.confidence,
                    "assumptions": option.assumptions,
                    "tradeoffs": option.tradeoffs,
                    "counter_narrative_risk": option.counter_narrative_risk,
                }
            )
        return rows

    def answer_question(
        self,
        game_state: Any,
        options: list[DynamicPolicy],
        thread_scope: str,
        option_id: str | None,
        question: str,
        history: list[dict[str, Any]] | None = None,
    ) -> AdvisorAnswer:
        selected = next((option for option in options if option.id == option_id), None)
        context = build_city_context(game_state)
        option_payload = self._option_summary(options)
        history_payload = history or []

        system = """You are a strategic political advisor assistant.

Provide structured explainability, not chain-of-thought.
Return ONLY a JSON object with keys:
- answer: {
    summary: string,
    drivers: string[],
    assumptions: string[],
    tradeoffs: string[],
    risk: string,
    confidence: number between 0 and 1
  }
- cited_option_ids: string[]
- suggested_actions: string[]
"""

        user_lines = [
            f"Thread scope: {thread_scope}",
            f"Option focus: {option_id or 'none'}",
            f"User question: {question}",
            "",
            "City context:",
            context,
            "",
            "Current options:",
            str(option_payload),
        ]
        if selected is not None:
            user_lines.extend(["", "Focused option:", str(selected.to_dict())])
        if history_payload:
            user_lines.extend(["", "Recent thread history:", str(history_payload[-8:])])

        user = "\n".join(user_lines)

        try:
            if self._client is None or self._disable_live:
                raise RuntimeError("advisor llm unavailable")
            raw = self._client.chat(system, user)
            answer_obj = raw.get("answer", {}) if isinstance(raw, dict) else {}
            if not isinstance(answer_obj, dict):
                answer_obj = {}

            summary = str(answer_obj.get("summary", "")).strip()
            if not summary:
                summary = "Based on current pressure fronts, this option is defensible with tradeoffs."

            drivers = [str(item) for item in answer_obj.get("drivers", []) if str(item).strip()][:5]
            assumptions = [str(item) for item in answer_obj.get("assumptions", []) if str(item).strip()][:5]
            tradeoffs = [str(item) for item in answer_obj.get("tradeoffs", []) if str(item).strip()][:5]
            risk = str(answer_obj.get("risk", "Counter-narrative risk exists if delivery falters."))[:260]
            try:
                confidence = float(answer_obj.get("confidence", 0.5))
            except (TypeError, ValueError):
                confidence = 0.5
            confidence = max(0.0, min(1.0, confidence))

            cited = [str(item) for item in raw.get("cited_option_ids", []) if str(item).strip()][:5]
            suggested = [str(item) for item in raw.get("suggested_actions", []) if str(item).strip()][:5]

            return AdvisorAnswer(
                answer={
                    "summary": summary,
                    "drivers": drivers,
                    "assumptions": assumptions,
                    "tradeoffs": tradeoffs,
                    "risk": risk,
                    "confidence": confidence,
                },
                cited_option_ids=cited,
                suggested_actions=suggested,
            )
        except Exception:
            fallback_summary = (
                f"{selected.name} is timed to address {', '.join(selected.narrative_fronts_impacted.keys()) or 'current pressure fronts'}"
                if selected
                else "The option set balances stabilization, narrative defense, and offensive recapture."
            )
            fallback_drivers = (
                [selected.why_now] if selected and selected.why_now else ["Current city pressure fronts are elevated."]
            )
            fallback_tradeoffs = selected.tradeoffs[:3] if selected else ["Execution capacity may dilute impact."]
            fallback_assumptions = selected.assumptions[:3] if selected else ["Policy implementation stays on schedule."]
            fallback_risk = (
                selected.counter_narrative_risk
                if selected and selected.counter_narrative_risk
                else "Opposition can reframe intent if outcomes lag in the next 1-2 turns."
            )
            return AdvisorAnswer(
                answer={
                    "summary": fallback_summary,
                    "drivers": fallback_drivers,
                    "assumptions": fallback_assumptions,
                    "tradeoffs": fallback_tradeoffs,
                    "risk": fallback_risk,
                    "confidence": selected.confidence if selected else 0.45,
                },
                cited_option_ids=[selected.id] if selected else [],
                suggested_actions=[
                    "Request a targeted revision if risk is unacceptable.",
                    "Rebalance toward corruption + jobs if opposition framing dominates.",
                ],
            )

    def revise_options(
        self,
        game_state: Any,
        current_options: list[DynamicPolicy],
        mayor_advisor: Any,
        mode: str,
        constraints: str,
        option_id: str | None,
    ) -> tuple[list[DynamicPolicy], dict[str, Any]]:
        normalized_mode = mode.strip().lower()
        guidance = constraints.strip()

        if normalized_mode not in {"single", "full"}:
            raise ValueError("mode must be 'single' or 'full'")

        if normalized_mode == "full":
            revised = mayor_advisor.generate_options(game_state, guidance=guidance or None)
            revised = list(revised[:5])
            if not revised:
                raise ValueError("Advisor failed to regenerate options")
            return revised, {
                "mode": "full",
                "message": "Regenerated full option set with applied constraints.",
                "changed_option_ids": [option.id for option in revised],
            }

        if not option_id:
            raise ValueError("option_id is required for single revise mode")

        target_index = None
        for idx, option in enumerate(current_options):
            if option.id == option_id:
                target_index = idx
                break
        if target_index is None:
            raise ValueError("option_id not found in current options")

        target = current_options[target_index]
        targeted_guidance = (
            "Revise one option only. Keep it politically realistic and specifically address this instruction: "
            f"{guidance or 'improve strategic fit to current opposition narrative.'}\n"
            f"Original option name: {target.name}\n"
            f"Original option rationale: {target.rationale}\n"
            f"Original why_now: {target.why_now}"
        )
        generated = mayor_advisor.generate_options(game_state, guidance=targeted_guidance)
        if not generated:
            raise ValueError("Advisor failed to revise option")

        replacement = generated[0]
        replacement.id = target.id

        updated = list(current_options)
        updated[target_index] = replacement

        return updated, {
            "mode": "single",
            "message": "Revised selected option with constraints.",
            "option_id": target.id,
            "before": {
                "name": target.name,
                "why_now": target.why_now,
                "opposition_counter_risk": target.opposition_counter_risk,
            },
            "after": {
                "name": replacement.name,
                "why_now": replacement.why_now,
                "opposition_counter_risk": replacement.opposition_counter_risk,
            },
        }
