from __future__ import annotations

import os
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterator

from core.city_profile import (
    CityProfileError,
    city_profile_status,
    load_city_profile,
    save_city_profile,
)
from llm.llm_client import LLMClient
from setup.profile_prompt import build_profile_generation_prompt
from setup.profile_validator import validate_generated_profile
from setup.retrieval_adapter import fetch_research_evidence


@dataclass(frozen=True)
class ProfileGenerationResponse:
    status: str
    city_id: str
    profile_version: str | None
    generated_at: str | None
    evidence_count: int
    cache_path: str | None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        body = {
            "status": self.status,
            "city_id": self.city_id,
            "profile_version": self.profile_version,
            "generated_at": self.generated_at,
            "evidence_count": self.evidence_count,
            "cache_path": self.cache_path,
        }
        if self.error:
            body["error"] = self.error
        return body


@contextmanager
def _temporary_env(overrides: dict[str, str | None]) -> Iterator[None]:
    original: dict[str, str | None] = {}
    for key, value in overrides.items():
        original[key] = os.environ.get(key)
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value
    try:
        yield
    finally:
        for key, old_value in original.items():
            if old_value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old_value


class CityProfileGenerator:
    def __init__(self) -> None:
        self.default_provider = os.environ.get("SETUP_LLM_PROVIDER", "anthropic").strip().lower()
        self.default_model = os.environ.get("SETUP_LLM_MODEL", "")
        self.default_research_mode = os.environ.get("SETUP_RESEARCH_MODE", "auto").strip().lower()

    @staticmethod
    def _city_name(city_id: str) -> str:
        return city_id.replace("_", " ").title()

    @staticmethod
    def _auto_version() -> str:
        return "v" + datetime.now(timezone.utc).strftime("%Y.%m.%d-%H%M%S")

    @staticmethod
    def _utc_now_iso() -> str:
        return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    def _setup_llm_call(
        self,
        system: str,
        user: str,
        provider: str,
        model: str,
    ) -> dict[str, Any]:
        env_override = {
            "LLM_PROVIDER": provider,
        }
        if model:
            env_override["LLM_MODEL"] = model

        with _temporary_env(env_override):
            client = LLMClient(model=model or None)
            return client.chat(system, user)

    def _compose_generated_payload(
        self,
        city_id: str,
        city_name: str,
        evidence: list[dict[str, str]],
        provider: str,
        model: str,
    ) -> dict[str, Any]:
        system, user = build_profile_generation_prompt(city_id=city_id, city_name=city_name, evidence=evidence)
        raw = self._setup_llm_call(system=system, user=user, provider=provider, model=model)
        normalized = validate_generated_profile(raw, city_id=city_id)

        meta = dict(normalized.get("meta", {}))
        meta["city_id"] = city_id
        meta["city_name"] = city_name
        meta["profile_version"] = str(meta.get("profile_version") or self._auto_version())
        meta["generated_at"] = str(meta.get("generated_at") or self._utc_now_iso())
        meta["generator_provider"] = str(meta.get("generator_provider") or provider)
        meta["generator_model"] = str(meta.get("generator_model") or model or "default")
        if evidence:
            meta["evidence_sources"] = evidence
        normalized["meta"] = meta
        return normalized

    def generate(
        self,
        city_id: str,
        force_refresh: bool = False,
        provider: str | None = None,
        model: str | None = None,
        research_mode: str | None = None,
    ) -> ProfileGenerationResponse:
        chosen_provider = (provider or self.default_provider or "anthropic").strip().lower()
        chosen_model = (model or self.default_model or "").strip()
        chosen_research_mode = (research_mode or self.default_research_mode or "auto").strip().lower()

        status = city_profile_status(city_id)
        if status.get("profile_ready") and not force_refresh:
            return ProfileGenerationResponse(
                status="cached",
                city_id=city_id,
                profile_version=status.get("profile_version"),
                generated_at=status.get("last_generated_at"),
                evidence_count=0,
                cache_path=status.get("source_path"),
                error=None,
            )

        city_name = self._city_name(city_id)
        evidence = fetch_research_evidence(
            city_id=city_id,
            research_mode=chosen_research_mode,
            max_items=6,
        )

        try:
            payload = self._compose_generated_payload(
                city_id=city_id,
                city_name=city_name,
                evidence=evidence,
                provider=chosen_provider,
                model=chosen_model,
            )
            primary_path, cache_path = save_city_profile(payload, city_id=city_id)
            meta = payload.get("meta", {})
            return ProfileGenerationResponse(
                status="generated",
                city_id=city_id,
                profile_version=str(meta.get("profile_version", "")) or None,
                generated_at=str(meta.get("generated_at", "")) or None,
                evidence_count=len(evidence),
                cache_path=str(cache_path),
                error=None,
            )
        except Exception as exc:
            fallback_status = city_profile_status(city_id)
            if fallback_status.get("profile_ready"):
                return ProfileGenerationResponse(
                    status="cached",
                    city_id=city_id,
                    profile_version=fallback_status.get("profile_version"),
                    generated_at=fallback_status.get("last_generated_at"),
                    evidence_count=len(evidence),
                    cache_path=fallback_status.get("source_path"),
                    error=f"Generation failed, using cached profile: {exc}",
                )

            return ProfileGenerationResponse(
                status="failed",
                city_id=city_id,
                profile_version=None,
                generated_at=None,
                evidence_count=len(evidence),
                cache_path=None,
                error=str(exc),
            )

    def get_profile(self, city_id: str) -> dict[str, Any]:
        bundle = load_city_profile(city_id)
        return bundle.payload

    def get_status(self, city_id: str) -> dict[str, Any]:
        return city_profile_status(city_id)


__all__ = ["CityProfileGenerator", "ProfileGenerationResponse", "CityProfileError"]
