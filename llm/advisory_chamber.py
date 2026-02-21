from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from llm.context_builder import build_city_context
from llm.dynamic_policy import DynamicPolicy
from llm.llm_client import LLMClient
from llm.mayor_advisor import MayorAdvisor

if TYPE_CHECKING:
    from core.advisor_session import AdvisorPersona


@dataclass(frozen=True)
class ChamberReply:
    summary: str
    structured: dict[str, Any]


class ChamberReplyError(RuntimeError):
    pass


class ChamberPolicyUnavailableError(RuntimeError):
    pass


class ChamberPolicyValidationError(RuntimeError):
    def __init__(self, reasons: list[str]) -> None:
        self.reasons = [str(reason).strip() for reason in reasons if str(reason).strip()]
        summary = "; ".join(self.reasons[:4]) if self.reasons else "policy validation failed"
        super().__init__(summary)


class AdvisoryChamber:
    def __init__(self) -> None:
        model = os.environ.get("LLM_DEBATE_MODEL") or os.environ.get("LLM_MODEL", "gpt-4o")
        self._client: LLMClient | None
        key = (
            os.environ.get("LLM_API_KEY")
            or os.environ.get("OPENAI_API_KEY")
            or os.environ.get("ANTHROPIC_API_KEY")
            or ""
        )
        self._disable_live = key.startswith("test-")
        try:
            self._client = LLMClient(model=model)
        except Exception:
            self._client = None
        self._similarity_threshold = 0.74
        self._placeholder_names = {
            "unknown policy",
            "policy option",
            "n/a",
            "na",
            "tbd",
            "placeholder policy",
            "unnamed policy",
        }
        self._generic_description_markers = (
            "targeted intervention to stabilize key city pressures this turn",
            "chosen for near-term impact under current city pressures",
        )

    def live_available(self) -> bool:
        return self._client is not None and not self._disable_live

    @staticmethod
    def _tokenize(text: str) -> set[str]:
        return set(re.findall(r"[a-z0-9]+", str(text).lower()))

    @classmethod
    def _lexical_similarity(cls, left: str, right: str) -> float:
        left_tokens = cls._tokenize(left)
        right_tokens = cls._tokenize(right)
        if not left_tokens or not right_tokens:
            return 0.0
        union = left_tokens | right_tokens
        if not union:
            return 0.0
        return len(left_tokens & right_tokens) / len(union)

    @staticmethod
    def _safe_line(value: str, limit: int = 220) -> str:
        return " ".join(str(value).split()).strip()[:limit]

    @staticmethod
    def _tokens(text: str) -> set[str]:
        return {token for token in re.findall(r"[a-z][a-z0-9_]{2,}", str(text).lower())}

    @staticmethod
    def _compact(text: str) -> str:
        return " ".join(str(text).split()).strip()

    @staticmethod
    def _human_text(text: str) -> str:
        lowered = str(text).strip().lower()
        return lowered not in {"agree", "challenge", "extend"}

    def _grounding_tokens(self, constraints: str, transcript: list[dict[str, Any]]) -> set[str]:
        blocked = {
            "this",
            "that",
            "with",
            "from",
            "while",
            "what",
            "where",
            "when",
            "which",
            "there",
            "their",
            "would",
            "should",
            "could",
            "about",
            "into",
            "over",
            "under",
            "must",
            "turn",
            "city",
            "advisor",
            "mayor",
            "policy",
            "policies",
        }
        tokens = self._tokens(constraints)
        for item in transcript[-10:]:
            role = str(item.get("role", "")).strip().lower()
            if role not in {"user", "advisor"}:
                continue
            tokens.update(self._tokens(str(item.get("content", ""))))
        return {token for token in tokens if token not in blocked and len(token) >= 4}

    def _validate_policy_batch(
        self,
        policies: list[DynamicPolicy],
        *,
        constraints: str,
        transcript: list[dict[str, Any]],
    ) -> None:
        reasons: list[str] = []
        grounding = self._grounding_tokens(constraints, transcript)
        for idx, policy in enumerate(policies, start=1):
            name = self._compact(policy.name)
            if len(name) < 6 or name.lower() in self._placeholder_names:
                reasons.append(f"policy {idx}: invalid name")

            description = self._compact(policy.description)
            if len(description) < 24:
                reasons.append(f"policy {idx}: description too short")
            desc_lower = description.lower()
            if any(marker in desc_lower for marker in self._generic_description_markers):
                reasons.append(f"policy {idx}: generic description")

            why_now = self._compact(policy.why_now or policy.rationale)
            rationale = self._compact(policy.rationale)
            if len(why_now) < 24:
                reasons.append(f"policy {idx}: why_now too short")
            if len(rationale) < 20:
                reasons.append(f"policy {idx}: rationale too short")
            text_blob = f"{description} {why_now} {rationale}".lower()
            if grounding and not any(token in text_blob for token in grounding):
                reasons.append(f"policy {idx}: missing transcript/constraint grounding")

            trace = policy.deliberation_trace if isinstance(policy.deliberation_trace, dict) else {}
            mayor_direction_used = self._compact(trace.get("mayor_direction_used", ""))
            if len(mayor_direction_used) < 12 or not self._human_text(mayor_direction_used):
                reasons.append(f"policy {idx}: invalid mayor_direction_used")

            raw_inputs = trace.get("advisor_inputs_used", [])
            if not isinstance(raw_inputs, list) or len(raw_inputs) == 0:
                reasons.append(f"policy {idx}: missing advisor_inputs_used")
                continue
            valid_input_found = False
            for item in raw_inputs:
                if not isinstance(item, dict):
                    continue
                advisor_id = self._compact(item.get("advisor_id", ""))
                portfolio = self._compact(item.get("portfolio", ""))
                point = self._compact(item.get("point", ""))
                if advisor_id and portfolio and len(point) >= 14:
                    valid_input_found = True
                    break
            if not valid_input_found:
                reasons.append(f"policy {idx}: invalid advisor input rows")
        if reasons:
            raise ChamberPolicyValidationError(reasons)

    @staticmethod
    def _option_rows(options: list[DynamicPolicy]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for option in options:
            rows.append(
                {
                    "id": option.id,
                    "name": option.name,
                    "why_now": option.why_now,
                    "effects": option.effects,
                    "target_groups": option.target_groups,
                }
            )
        return rows

    @staticmethod
    def _fallback_reply(
        advisor: "AdvisorPersona",
        question: str,
        prior_advisor_messages: list[dict[str, Any]],
    ) -> ChamberReply:
        stance = "extend"
        references: list[str] = []
        prior_name = "previous advisor"
        if prior_advisor_messages:
            stance = "challenge" if advisor.advisor_id == "governance_risk" else "extend"
            references = [str(prior_advisor_messages[-1].get("id", "")).strip()]
            prior_name = str(prior_advisor_messages[-1].get("advisor_name", "previous advisor")).strip()

        portfolio_focus = advisor.portfolios[0] if advisor.portfolios else "public_trust"
        if references and prior_name:
            summary = (
                f"I {stance} {prior_name}'s point, but from the {portfolio_focus} lens we need a measurable "
                f"risk trigger and weekly checkpoint before committing to this direction."
            )
        else:
            summary = (
                f"From the {portfolio_focus} lens, start with a measurable pilot tied to the mayor's direction, "
                f"and define one hard metric to evaluate delivery risk next turn."
            )

        structured = {
            "summary": AdvisoryChamber._safe_line(summary, 320),
            "drivers": [
                AdvisoryChamber._safe_line(f"Mayor question: {question}", 180),
                AdvisoryChamber._safe_line(f"Portfolio priority: {portfolio_focus}", 180),
            ],
            "assumptions": [
                "Implementation bandwidth is limited this turn.",
            ],
            "tradeoffs": [
                "Tighter controls can reduce short-term speed.",
            ],
            "risk": "Opposition can attack if delivery milestones are vague.",
            "confidence": 0.61,
            "stance": stance,
            "portfolio_focus": portfolio_focus,
            "responds_to_message_ids": [item for item in references if item],
            "distinctive_risk": f"Primary {portfolio_focus} risk if execution slips.",
        }
        return ChamberReply(summary=structured["summary"], structured=structured)

    @staticmethod
    def _validate_reply(
        payload: dict[str, Any],
        advisor: "AdvisorPersona",
        prior_ids: list[str],
    ) -> tuple[dict[str, Any], str]:
        stance = str(payload.get("stance", "")).strip().lower()
        if stance not in {"agree", "challenge", "extend"}:
            raise ChamberReplyError("Missing or invalid stance")

        portfolio_focus = str(payload.get("portfolio_focus", "")).strip().lower()
        advisor_portfolios = [str(item).strip().lower() for item in advisor.portfolios]
        if not portfolio_focus:
            raise ChamberReplyError("Missing portfolio_focus")
        if advisor_portfolios and portfolio_focus not in advisor_portfolios:
            raise ChamberReplyError("portfolio_focus not aligned to advisor portfolios")

        response_text = " ".join(str(payload.get("response_text", "")).split()).strip()
        if len(response_text) < 24:
            raise ChamberReplyError("response_text too short")

        references_raw = payload.get("references_to_prior", [])
        if not isinstance(references_raw, list):
            references_raw = []
        references = [
            str(item).strip() for item in references_raw if str(item).strip()
        ]
        if prior_ids and not references:
            raise ChamberReplyError("references_to_prior required for non-first advisor")

        valid_refs = [message_id for message_id in references if message_id in set(prior_ids)]
        if prior_ids and not valid_refs:
            raise ChamberReplyError("references_to_prior did not match earlier advisor messages")

        distinctive_risk = " ".join(str(payload.get("distinctive_risk", "")).split()).strip()
        if not distinctive_risk:
            raise ChamberReplyError("distinctive_risk is required")

        normalized = {
            "summary": response_text[:320],
            "drivers": [f"Portfolio focus: {portfolio_focus}", f"Distinctive risk: {distinctive_risk[:160]}"],
            "assumptions": ["Advisor recommendation depends on execution capacity and inter-agency delivery."],
            "tradeoffs": ["Prioritizing this portfolio can defer gains on competing fronts."],
            "risk": distinctive_risk[:260],
            "confidence": 0.64,
            "stance": stance,
            "portfolio_focus": portfolio_focus,
            "responds_to_message_ids": valid_refs,
            "distinctive_risk": distinctive_risk[:220],
        }
        return normalized, normalized["summary"]

    def build_reply(
        self,
        *,
        game_state: Any,
        advisor: "AdvisorPersona",
        question: str,
        history: list[dict[str, Any]],
        options: list[DynamicPolicy],
        prior_advisor_messages: list[dict[str, Any]],
        contrast_mode: bool = False,
    ) -> ChamberReply:
        if not self.live_available():
            return self._fallback_reply(advisor, question, prior_advisor_messages)

        prior_ids = [str(item.get("id", "")).strip() for item in prior_advisor_messages if str(item.get("id", "")).strip()]
        prior_texts = [str(item.get("content", "")).strip() for item in prior_advisor_messages if str(item.get("content", "")).strip()]

        system = (
            "You are one advisor in a multi-advisor mayoral chamber. "
            "You must produce a differentiated response from your portfolio lens and explicitly react to earlier advisors.\n\n"
            "Return JSON only with keys: stance, portfolio_focus, response_text, references_to_prior, distinctive_risk.\n"
            "Rules:\n"
            "- stance: one of agree|challenge|extend.\n"
            "- portfolio_focus: must be one of your portfolios exactly.\n"
            "- response_text: 35-70 words, concrete and policy-relevant.\n"
            "- references_to_prior: list of prior advisor message IDs you respond to (required if any prior advisors exist).\n"
            "- distinctive_risk: one concrete risk from your portfolio.\n"
            "- Do not restate prior points verbatim.\n"
            "- Add at least one portfolio-specific metric or risk threshold.\n"
        )

        user_lines = [
            f"Advisor name: {advisor.name}",
            f"Advisor style: {advisor.style}",
            f"Advisor portfolios: {', '.join(advisor.portfolios)}",
            f"Mayor question: {question}",
            "City context:",
            build_city_context(game_state),
            "Current option set:",
            str(self._option_rows(options)),
            "Recent chamber history:",
            str(history[-10:]),
            "Prior advisor messages in this sequence:",
            str(
                [
                    {
                        "id": item.get("id"),
                        "advisor_name": item.get("advisor_name"),
                        "content": item.get("content"),
                    }
                    for item in prior_advisor_messages
                ]
            ),
        ]
        if contrast_mode:
            user_lines.append(
                "Contrast mode: your reply was too similar. Explicitly disagree or add a non-overlapping risk/metric."
            )

        payload = self._client.chat(system, "\n".join(user_lines))
        normalized, summary = self._validate_reply(payload if isinstance(payload, dict) else {}, advisor, prior_ids)

        if prior_texts and any(
            self._lexical_similarity(summary, prev) >= self._similarity_threshold
            for prev in prior_texts
        ):
            raise ChamberReplyError("advisor reply too similar to prior responses")

        return ChamberReply(summary=summary, structured=normalized)

    def build_reply_with_retry(
        self,
        *,
        game_state: Any,
        advisor: "AdvisorPersona",
        question: str,
        history: list[dict[str, Any]],
        options: list[DynamicPolicy],
        prior_advisor_messages: list[dict[str, Any]],
    ) -> tuple[ChamberReply, float, int]:
        attempts = 0
        last_error: Exception | None = None
        for contrast_mode in (False, True):
            attempts += 1
            try:
                reply = self.build_reply(
                    game_state=game_state,
                    advisor=advisor,
                    question=question,
                    history=history,
                    options=options,
                    prior_advisor_messages=prior_advisor_messages,
                    contrast_mode=contrast_mode,
                )
                similarity = 0.0
                if prior_advisor_messages:
                    similarity = max(
                        self._lexical_similarity(reply.summary, str(item.get("content", "")))
                        for item in prior_advisor_messages
                    )
                return reply, similarity, attempts
            except Exception as exc:
                last_error = exc
                if not self.live_available():
                    break
        raise ChamberReplyError(f"advisor chamber reply generation failed: {last_error}")

    @staticmethod
    def _ensure_policy_trace(
        policy: DynamicPolicy,
        *,
        constraints: str,
        transcript: list[dict[str, Any]],
        advisor_meta: dict[str, dict[str, Any]],
    ) -> None:
        trace = dict(policy.deliberation_trace or {})
        mayor_direction_used = str(trace.get("mayor_direction_used", "")).strip() or constraints.strip()
        if not mayor_direction_used:
            mayor_lines = [
                str(item.get("content", "")).strip()
                for item in transcript
                if str(item.get("role", "")).strip() == "user" and str(item.get("content", "")).strip()
            ]
            mayor_direction_used = mayor_lines[-1] if mayor_lines else "Balance delivery speed with public trust and backlash control."
        trace["mayor_direction_used"] = mayor_direction_used[:220]

        raw_inputs = trace.get("advisor_inputs_used", [])
        advisor_inputs: list[dict[str, str]] = []
        if isinstance(raw_inputs, list):
            for item in raw_inputs:
                if not isinstance(item, dict):
                    continue
                advisor_id = str(item.get("advisor_id", "")).strip()
                portfolio = str(item.get("portfolio", "")).strip()
                point = str(item.get("point", "")).strip()
                if advisor_id and portfolio and point:
                    advisor_name = str(item.get("advisor_name", "")).strip()
                    if not advisor_name:
                        advisor_name = str(
                            (advisor_meta.get(advisor_id, {}) or {}).get("name", "")
                        ).strip()
                    advisor_inputs.append(
                        {
                            "advisor_id": advisor_id[:80],
                            "advisor_name": advisor_name[:80] if advisor_name else "",
                            "portfolio": portfolio[:80],
                            "point": point[:180],
                        }
                    )

        if not advisor_inputs:
            advisor_messages = [
                item
                for item in transcript
                if str(item.get("role", "")).strip() == "advisor"
                and str(item.get("speaker_advisor_id", "")).strip()
                and str(item.get("content", "")).strip()
            ]
            for item in advisor_messages[-2:]:
                advisor_id = str(item.get("speaker_advisor_id", "")).strip()
                advisor_info = advisor_meta.get(advisor_id, {}) if advisor_id else {}
                portfolios = list(advisor_info.get("portfolios", [])) if isinstance(advisor_info, dict) else []
                advisor_name = str(advisor_info.get("name", "")).strip() if isinstance(advisor_info, dict) else ""
                advisor_inputs.append(
                    {
                        "advisor_id": advisor_id,
                        "advisor_name": advisor_name[:80] if advisor_name else "",
                        "portfolio": portfolios[0] if portfolios else "public_trust",
                        "point": " ".join(str(item.get("content", "")).split())[:180],
                    }
                )

        trace["advisor_inputs_used"] = advisor_inputs[:3]
        disagreement_resolved = str(trace.get("disagreement_resolved", "")).strip()
        if disagreement_resolved:
            trace["disagreement_resolved"] = disagreement_resolved[:220]

        for item in trace.get("advisor_inputs_used", []):
            if not isinstance(item, dict):
                continue
            advisor_id = str(item.get("advisor_id", "")).strip()
            if advisor_id and not str(item.get("advisor_name", "")).strip():
                advisor_name = str((advisor_meta.get(advisor_id, {}) or {}).get("name", "")).strip()
                if advisor_name:
                    item["advisor_name"] = advisor_name[:80]

        policy.deliberation_trace = trace

    def generate_policies_from_deliberation(
        self,
        *,
        game_state: Any,
        advisors: list["AdvisorPersona"],
        transcript: list[dict[str, Any]],
        constraints: str,
        count: int,
    ) -> tuple[list[DynamicPolicy], str]:
        if not self.live_available():
            raise ChamberPolicyUnavailableError("Policy generation requires live advisor model availability.")

        advisor_meta = {
            advisor.advisor_id: {
                "name": advisor.name,
                "portfolios": list(advisor.portfolios),
            }
            for advisor in advisors
        }
        transcript_window = transcript[-14:]

        def _render_system(repair_mode: bool = False) -> str:
            base = (
                "You are synthesizing final mayor policy options from an advisor chamber transcript.\n"
                "Return JSON only with keys: conclusion_summary, policies.\n"
                f"policies must be an array of exactly {count} objects.\n"
                "Each policy object must include the standard policy fields plus deliberation_trace with:\n"
                "- mayor_direction_used (string)\n"
                "- advisor_inputs_used (array of {advisor_id, advisor_name, portfolio, point})\n"
                "- disagreement_resolved (optional string).\n"
                "Policies must be materially different and explicitly grounded in transcript tensions/tradeoffs.\n"
                "Never include internal prompt text in policy fields."
            )
            if repair_mode:
                base += (
                    "\n\nValidation retry mode requirements:\n"
                    "- Do not use placeholder names.\n"
                    "- Each policy must have concrete, city-specific description and why_now.\n"
                    "- mayor_direction_used must be a real mayor directive sentence.\n"
                    "- advisor_inputs_used must include concrete advisor points.\n"
                )
            return base

        user_lines = [
            "City context:",
            build_city_context(game_state),
            "Advisor roster:",
            str([advisor.to_dict() for advisor in advisors]),
            "Mayor explicit constraints:",
            constraints or "(none provided)",
            "Recent chamber transcript:",
            str(transcript_window),
        ]

        validation_reasons: list[str] = []
        for attempt_idx in range(2):
            repair_mode = attempt_idx == 1
            attempt_lines = list(user_lines)
            if repair_mode and validation_reasons:
                attempt_lines.extend(
                    [
                        "Previous output failed validation for reasons:",
                        str(validation_reasons[:8]),
                        "Regenerate fully corrected policies.",
                    ]
                )
            payload = self._client.chat(_render_system(repair_mode=repair_mode), "\n".join(attempt_lines))
            if not isinstance(payload, dict):
                raise ChamberReplyError("Invalid policy synthesis payload")
            raw_policies = payload.get("policies", [])
            if not isinstance(raw_policies, list) or len(raw_policies) < count:
                raise ChamberReplyError("Policy synthesis returned insufficient policies")

            policies = [DynamicPolicy.from_llm(item, actor="mayor") for item in raw_policies[:count]]
            policies = MayorAdvisor._sanitize_options(policies)
            for policy in policies:
                self._ensure_policy_trace(
                    policy,
                    constraints=constraints,
                    transcript=transcript_window,
                    advisor_meta=advisor_meta,
                )
            try:
                self._validate_policy_batch(
                    policies,
                    constraints=constraints,
                    transcript=transcript_window,
                )
                summary = " ".join(str(payload.get("conclusion_summary", "")).split()).strip()
                if not summary:
                    summary = "Council converged on a three-policy bundle balancing delivery, trust, and risk control."
                return policies, summary[:320]
            except ChamberPolicyValidationError as exc:
                validation_reasons = list(exc.reasons)
                if attempt_idx == 1:
                    raise

        raise ChamberPolicyValidationError(validation_reasons)
