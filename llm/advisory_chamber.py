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
        self._generic_title_tokens = {
            "strategic",
            "action",
            "plan",
            "policy",
            "option",
            "initiative",
            "program",
            "project",
            "proposal",
            "city",
            "general",
            "unknown",
            "unnamed",
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
    def _normalize_name(text: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", str(text).lower())

    def _is_weak_title(self, name: str, policy: DynamicPolicy) -> bool:
        compact = self._compact(name)
        if len(compact) < 6:
            return True

        normalized = self._normalize_name(compact)
        placeholder_norms = {self._normalize_name(item) for item in self._placeholder_names}
        placeholder_norms.update(
            {"unknownpolicy", "policyoption", "unknownpolicyoption", "napolicy", "tbdpolicy"}
        )
        if normalized in placeholder_norms:
            return True

        tokens = [token for token in re.findall(r"[a-z0-9]+", compact.lower()) if token]
        meaningful = [token for token in tokens if token not in self._generic_title_tokens and len(token) >= 3]
        if len(tokens) <= 3 and all(token in self._generic_title_tokens for token in tokens):
            has_supporting_context = bool(
                str(getattr(policy, "intent", "")).strip()
                and list(getattr(policy, "implementation_targets", []))
            )
            return not has_supporting_context
        return len(meaningful) < 2

    @staticmethod
    def _human_text(text: str) -> str:
        lowered = str(text).strip().lower()
        return lowered not in {"agree", "challenge", "extend"}

    @staticmethod
    def _tone_token(value: str) -> str:
        return re.sub(r"[^a-z0-9_]+", "_", str(value).strip().lower()).strip("_")

    @staticmethod
    def _looks_like_list_request(text: str) -> bool:
        lowered = str(text).lower()
        return any(token in lowered for token in ("list", "initiative", "ideas", "options", "suggest"))

    def _fallback_memory_summary(self, existing_summary: str, transcript: list[dict[str, Any]]) -> str:
        mayor_points = [
            self._safe_line(str(item.get("content", "")), 160)
            for item in transcript
            if str(item.get("role", "")).strip() == "user" and str(item.get("content", "")).strip()
        ]
        advisor_points = []
        for item in transcript:
            if str(item.get("role", "")).strip() != "advisor":
                continue
            content = self._safe_line(str(item.get("content", "")), 140)
            if not content:
                continue
            advisor_name = str(item.get("advisor_name", "")).strip() or str(item.get("speaker_advisor_id", "advisor")).strip()
            advisor_points.append(f"{advisor_name}: {content}")
        open_questions = [
            self._safe_line(str(item.get("content", "")), 140)
            for item in transcript
            if str(item.get("role", "")).strip() == "user" and "?" in str(item.get("content", ""))
        ]
        chunks: list[str] = []
        if existing_summary:
            chunks.append(self._safe_line(existing_summary, 220))
        if mayor_points:
            chunks.append(f"Mayor priorities: {' | '.join(mayor_points[-3:])}")
        if advisor_points:
            chunks.append(f"Council points: {' | '.join(advisor_points[-3:])}")
        if open_questions:
            chunks.append(f"Open questions: {' | '.join(open_questions[-2:])}")
        if not chunks:
            return ""
        return self._safe_line(" ; ".join(chunks), 700)

    def summarize_conversation_memory(
        self,
        *,
        existing_summary: str,
        transcript: list[dict[str, Any]],
    ) -> str:
        if not transcript:
            return self._safe_line(existing_summary, 700)
        fallback = self._fallback_memory_summary(existing_summary, transcript)
        if not self.live_available():
            return fallback
        try:
            system = (
                "Summarize mayor-advisor discussion memory for future turns.\n"
                "Return JSON with key: summary.\n"
                "Capture mayor directives, advisor disagreements, decisions, open questions, and commitments.\n"
                "Keep concise and factual (max 150 words)."
            )
            payload = self._client.chat(
                system,
                "\n".join(
                    [
                        f"Existing summary: {existing_summary or '(none)'}",
                        "Transcript:",
                        str(transcript[-24:]),
                    ]
                ),
            )
            if isinstance(payload, dict):
                summary = self._safe_line(str(payload.get("summary", "")), 700)
                if summary:
                    return summary
        except Exception:
            pass
        return fallback

    def _tone_conflict(self, advisor: "AdvisorPersona", text: str, interaction_intent: str) -> bool:
        normalized = str(text).strip()
        lowered = normalized.lower()
        taboo = [str(item).strip().lower() for item in getattr(advisor, "taboo_patterns", []) if str(item).strip()]
        if any(pattern and pattern in lowered for pattern in taboo):
            return True

        tone = self._tone_token(getattr(advisor, "tone", ""))
        if tone.startswith("skeptical") and interaction_intent in {"strategy", "ideation"}:
            if "!" in normalized and not any(token in lowered for token in ("risk", "mitigation", "guardrail", "caution")):
                return True
        if tone.startswith("grounded_empathic") and interaction_intent in {"strategy", "direct_answer"}:
            if "people" not in lowered and "community" not in lowered and "trust" not in lowered:
                if len(normalized.split()) > 22 and "?" not in normalized:
                    return True
        return False

    @staticmethod
    def _first_phrase(text: str, words: int = 6) -> str:
        tokens = [token for token in str(text).lower().split() if token]
        return " ".join(tokens[:words])

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
            if self._is_weak_title(name, policy):
                reasons.append(f"policy {idx}: weak title")

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
        context_packet: dict[str, Any] | None = None,
        interaction_intent: str = "strategy",
        interaction_mode: str = "policy",
    ) -> ChamberReply:
        portfolio_focus = advisor.portfolios[0] if advisor.portfolios else "public_trust"
        context_refs = [
            str(item.get("id", "")).strip()
            for item in (context_packet or {}).get("recent_window", [])
            if str(item.get("id", "")).strip()
        ]
        if interaction_intent == "greeting":
            summary = f"Hi Mayor, {advisor.name} here. Ready when you want to discuss {portfolio_focus.replace('_', ' ')}."
            structured = {
                "summary": AdvisoryChamber._safe_line(summary, 320),
                "drivers": [AdvisoryChamber._safe_line(f"Mayor message: {question}", 180)],
                "assumptions": ["Greeting exchange; no policy recommendation requested yet."],
                "tradeoffs": [],
                "risk": "No immediate policy risk identified in this quick exchange.",
                "confidence": 0.58,
                "stance": "extend",
                "portfolio_focus": portfolio_focus,
                "responds_to_message_ids": [],
                "distinctive_risk": "No immediate portfolio risk raised yet.",
                "context_refs": context_refs[-2:],
            }
            return ChamberReply(summary=structured["summary"], structured=structured)

        if interaction_intent == "clarification":
            summary = (
                f"Yes, I understood. You asked about {portfolio_focus.replace('_', ' ')} impact; "
                "I’ll answer directly and keep it concise."
            )
        elif interaction_intent == "direct_answer":
            summary = (
                f"Yes, this can affect {portfolio_focus.replace('_', ' ')}. "
                "If we publish weekly outcomes, trust impact is more likely to be positive."
            )
        elif interaction_intent == "ideation" and AdvisoryChamber._looks_like_list_request(question):
            summary = (
                f"Three quick initiatives from the {portfolio_focus.replace('_', ' ')} lens: "
                "1) weekly dashboard, 2) pilot in high-friction wards, 3) public grievance SLA."
            )
        elif interaction_mode == "casual":
            summary = (
                f"Happy to help. From the {portfolio_focus.replace('_', ' ')} lens, "
                "I can give a quick direct answer first and details only if you want."
            )
        else:
            stance = "extend"
            references: list[str] = []
            prior_name = "previous advisor"
            if prior_advisor_messages:
                stance = "challenge" if advisor.advisor_id == "governance_risk" else "extend"
                references = [str(prior_advisor_messages[-1].get("id", "")).strip()]
                prior_name = str(prior_advisor_messages[-1].get("advisor_name", "previous advisor")).strip()

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
                "context_refs": context_refs[-3:],
            }
            return ChamberReply(summary=structured["summary"], structured=structured)

        structured = {
            "summary": AdvisoryChamber._safe_line(summary, 320),
            "drivers": [
                AdvisoryChamber._safe_line(f"Mayor question: {question}", 180),
                AdvisoryChamber._safe_line(f"Portfolio priority: {portfolio_focus}", 180),
            ],
            "assumptions": ["Direct conversational answer requested before deep policy detail."],
            "tradeoffs": ["Short answers can omit implementation nuances."],
            "risk": "Overly broad promises can backfire if next steps stay vague.",
            "confidence": 0.59,
            "stance": "extend",
            "portfolio_focus": portfolio_focus,
            "responds_to_message_ids": [],
            "distinctive_risk": f"Primary {portfolio_focus} risk if follow-through is unclear.",
            "context_refs": context_refs[-2:],
        }
        return ChamberReply(summary=structured["summary"], structured=structured)

    @staticmethod
    def _validate_reply(
        payload: dict[str, Any],
        advisor: "AdvisorPersona",
        prior_ids: list[str],
        allowed_context_ids: list[str] | None = None,
        interaction_intent: str = "strategy",
        interaction_mode: str = "policy",
    ) -> tuple[dict[str, Any], str]:
        stance = str(payload.get("stance", "")).strip().lower()
        if interaction_mode == "policy" and stance not in {"agree", "challenge", "extend"}:
            raise ChamberReplyError("Missing or invalid stance")
        if stance not in {"agree", "challenge", "extend"}:
            stance = "extend"

        portfolio_focus = str(payload.get("portfolio_focus", "")).strip().lower()
        advisor_portfolios = [str(item).strip().lower() for item in advisor.portfolios]
        if interaction_mode == "policy" and not portfolio_focus:
            raise ChamberReplyError("Missing portfolio_focus")
        if not portfolio_focus and advisor_portfolios:
            portfolio_focus = advisor_portfolios[0]
        if interaction_mode == "policy" and advisor_portfolios and portfolio_focus not in advisor_portfolios:
            raise ChamberReplyError("portfolio_focus not aligned to advisor portfolios")
        if advisor_portfolios and portfolio_focus not in advisor_portfolios:
            portfolio_focus = advisor_portfolios[0]
        if not portfolio_focus:
            portfolio_focus = "public_trust"

        response_text = " ".join(str(payload.get("response_text", "")).split()).strip()
        min_chars = 24 if interaction_mode == "policy" else 10
        if len(response_text) < min_chars:
            raise ChamberReplyError("response_text too short")

        references_raw = payload.get("references_to_prior", [])
        if not isinstance(references_raw, list):
            references_raw = []
        references = [
            str(item).strip() for item in references_raw if str(item).strip()
        ]
        if interaction_mode == "policy" and prior_ids and not references:
            raise ChamberReplyError("references_to_prior required for non-first advisor")

        valid_refs = [message_id for message_id in references if message_id in set(prior_ids)]
        if interaction_mode == "policy" and prior_ids and not valid_refs:
            raise ChamberReplyError("references_to_prior did not match earlier advisor messages")

        raw_context_refs = payload.get("context_refs", [])
        if not isinstance(raw_context_refs, list):
            raw_context_refs = []
        context_candidates = [str(item).strip() for item in raw_context_refs if str(item).strip()]
        allowed_set = set(allowed_context_ids or [])
        context_refs = [item for item in context_candidates if not allowed_set or item in allowed_set]
        if not context_refs and valid_refs:
            context_refs = list(valid_refs)

        distinctive_risk = " ".join(str(payload.get("distinctive_risk", "")).split()).strip()
        if interaction_mode == "policy" and not distinctive_risk:
            raise ChamberReplyError("distinctive_risk is required")
        if not distinctive_risk:
            distinctive_risk = "No immediate portfolio risk raised."

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
            "interaction_intent": interaction_intent,
            "context_refs": context_refs[:4],
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
        repair_hint: str | None = None,
        context_packet: dict[str, Any] | None = None,
        interaction_intent: str = "strategy",
        interaction_mode: str = "policy",
    ) -> ChamberReply:
        if not self.live_available():
            return self._fallback_reply(
                advisor,
                question,
                prior_advisor_messages,
                context_packet=context_packet,
                interaction_intent=interaction_intent,
                interaction_mode=interaction_mode,
            )

        prior_ids = [str(item.get("id", "")).strip() for item in prior_advisor_messages if str(item.get("id", "")).strip()]
        prior_texts = [str(item.get("content", "")).strip() for item in prior_advisor_messages if str(item.get("content", "")).strip()]
        recent_window = (
            list(context_packet.get("recent_window", []))
            if isinstance(context_packet, dict) and isinstance(context_packet.get("recent_window"), list)
            else history[-10:]
        )
        memory_summary = (
            self._safe_line(str(context_packet.get("memory_summary", "")), 700)
            if isinstance(context_packet, dict)
            else ""
        )
        allowed_context_ids = [
            str(item.get("id", "")).strip()
            for item in recent_window
            if isinstance(item, dict) and str(item.get("id", "")).strip()
        ]
        response_sequence = (
            dict(context_packet.get("response_sequence", {}))
            if isinstance(context_packet, dict) and isinstance(context_packet.get("response_sequence"), dict)
            else {}
        )
        tone = str(getattr(advisor, "tone", "")).strip()
        voice_traits = [str(item).strip() for item in getattr(advisor, "voice_traits", []) if str(item).strip()]
        conversational_habits = [
            str(item).strip() for item in getattr(advisor, "conversational_habits", []) if str(item).strip()
        ]
        taboo_patterns = [str(item).strip() for item in getattr(advisor, "taboo_patterns", []) if str(item).strip()]

        if interaction_intent == "greeting":
            intent_rules = [
                "- response_text: 8-22 words, friendly and natural.",
                "- No unsolicited policy suggestions.",
            ]
        elif interaction_intent == "clarification":
            intent_rules = [
                "- First sentence must acknowledge understanding and paraphrase briefly.",
                "- Keep concise and avoid policy dump unless explicitly requested.",
            ]
        elif interaction_intent == "direct_answer":
            intent_rules = [
                "- First sentence must answer directly (yes/no/depends + why).",
                "- Optional second sentence with one concrete follow-up.",
            ]
        elif interaction_intent == "ideation":
            intent_rules = [
                "- Provide concise ideas; keep each point concrete.",
                "- Avoid repeating earlier advisor wording.",
            ]
        else:
            intent_rules = [
                "- Provide strategic reasoning with one concrete metric or threshold.",
                "- Explicitly react to prior advisor points when available.",
            ]

        if interaction_mode == "casual":
            system = (
                "You are one advisor in a multi-advisor mayoral chamber. "
                "This is a casual exchange, so respond naturally and briefly without unsolicited policy blabber.\n\n"
                "Return JSON only with keys: stance, portfolio_focus, response_text, references_to_prior, distinctive_risk, context_refs.\n"
                "Rules:\n"
                "- response_text: 12-35 words, conversational and human.\n"
                "- If the mayor did not ask for policy specifics, do not push detailed policy prescriptions.\n"
                "- references_to_prior is optional.\n"
                "- context_refs may include message IDs from recent context if you reference prior discussion.\n"
            )
        else:
            system = (
                "You are one advisor in a multi-advisor mayoral chamber. "
                "You must produce a differentiated response from your portfolio lens and explicitly react to earlier advisors.\n\n"
                "Return JSON only with keys: stance, portfolio_focus, response_text, references_to_prior, distinctive_risk, context_refs.\n"
                "Rules:\n"
                "- stance: one of agree|challenge|extend.\n"
                "- portfolio_focus: must be one of your portfolios exactly.\n"
                "- response_text: 35-70 words, concrete and policy-relevant.\n"
                "- references_to_prior: list of prior advisor message IDs you respond to (required if any prior advisors exist).\n"
                "- distinctive_risk: one concrete risk from your portfolio.\n"
                "- context_refs: list of message IDs from recent context that you are using.\n"
                "- Do not restate prior points verbatim.\n"
                "- Add at least one portfolio-specific metric or risk threshold.\n"
            )

        user_lines = [
            f"Advisor name: {advisor.name}",
            f"Advisor style: {advisor.style}",
            f"Advisor portfolios: {', '.join(advisor.portfolios)}",
            f"Advisor tone: {tone or 'neutral'}",
            f"Advisor voice traits: {voice_traits}",
            f"Advisor conversational habits: {conversational_habits}",
            f"Advisor taboo patterns: {taboo_patterns}",
            f"Mayor question: {question}",
            f"Interaction intent: {interaction_intent}",
            f"Intent-specific rules: {intent_rules}",
            "City context:",
            build_city_context(game_state),
            "Current option set:",
            str(self._option_rows(options)),
            "Rolling memory summary (older dialogue):",
            memory_summary or "(none yet)",
            "Recent chamber history:",
            str(recent_window),
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
            f"Response sequence metadata: {response_sequence}",
        ]
        if contrast_mode:
            user_lines.append(
                "Contrast mode: your reply was too similar. Explicitly disagree or add a non-overlapping risk/metric."
            )
        if repair_hint:
            user_lines.append(
                f"Correction directive from validator: {repair_hint}. Keep your advisor voice and fix only that issue."
            )

        payload = self._client.chat(system, "\n".join(user_lines))
        normalized, summary = self._validate_reply(
            payload if isinstance(payload, dict) else {},
            advisor,
            prior_ids,
            allowed_context_ids=allowed_context_ids,
            interaction_intent=interaction_intent,
            interaction_mode=interaction_mode,
        )

        similarity_threshold = self._similarity_threshold if interaction_mode == "policy" else 0.68
        phrase_collision = any(
            self._first_phrase(summary) == self._first_phrase(prev)
            for prev in prior_texts
            if str(prev).strip()
        )
        if prior_texts and (
            any(self._lexical_similarity(summary, prev) >= similarity_threshold for prev in prior_texts) or phrase_collision
        ):
            raise ChamberReplyError("advisor reply too similar to prior responses")
        if self._tone_conflict(advisor, summary, interaction_intent):
            raise ChamberReplyError("advisor tone drifted from persona profile")

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
        context_packet: dict[str, Any] | None = None,
        interaction_intent: str = "strategy",
        interaction_mode: str = "policy",
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
                    repair_hint=str(last_error) if (contrast_mode and last_error is not None) else None,
                    context_packet=context_packet,
                    interaction_intent=interaction_intent,
                    interaction_mode=interaction_mode,
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
                "Each policy object must include the standard policy fields plus budget_cost, intent, implementation_targets, and deliberation_trace with:\n"
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
