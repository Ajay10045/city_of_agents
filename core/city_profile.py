from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from agents.identity_group import IdentityGroup
from core.city_stats import CityStats, STAT_KEYS


ROOT = Path(__file__).resolve().parents[1]
CITY_PROFILE_DIR = ROOT / "config" / "cities"
CITY_PROFILE_CACHE_DIR = CITY_PROFILE_DIR / "cache"
REQUIRED_FRONTS = ("economy", "corruption", "safety", "services", "social_cohesion")


class CityProfileError(ValueError):
    pass


@dataclass(frozen=True)
class CityProfileMeta:
    city_id: str
    city_name: str
    profile_version: str
    generated_at: str
    generator_provider: str
    generator_model: str
    evidence_sources: list[dict[str, str]]


@dataclass(frozen=True)
class CityProfileBundle:
    payload: dict[str, Any]
    meta: CityProfileMeta
    source_path: Path


def profile_path_for_city(city_id: str) -> Path:
    return CITY_PROFILE_DIR / f"{city_id}.json"


def cache_dir_for_city(city_id: str) -> Path:
    return CITY_PROFILE_CACHE_DIR / city_id


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _normalize_portfolio_token(value: Any) -> str:
    token = re.sub(r"[^a-z0-9_]+", "_", str(value).strip().lower()).strip("_")
    return token


def _normalize_alias(value: Any) -> str:
    alias = str(value).strip().lower()
    if alias.startswith("@"):
        alias = alias[1:]
    alias = re.sub(r"\s+", " ", alias)
    return alias


def _normalize_phrase(value: Any) -> str:
    phrase = " ".join(str(value).strip().split())
    return phrase


def _synthesized_personality(portfolios: list[str]) -> dict[str, Any]:
    first = portfolios[0] if portfolios else ""
    if first in {"corruption", "law_and_order", "media", "governance_risk"}:
        return {
            "tone": "skeptical_guardrail",
            "voice_traits": [
                "flags downside risks early",
                "asks for accountability checkpoints",
                "focuses on credibility safeguards",
            ],
            "conversational_habits": [
                "states one clear risk",
                "offers one concrete mitigation",
            ],
            "taboo_patterns": ["as an ai", "i cannot help"],
        }
    if first in {"social_cohesion", "public_trust", "services"}:
        return {
            "tone": "grounded_empathic",
            "voice_traits": [
                "centers people impact",
                "bridges tensions calmly",
                "uses plain civic language",
            ],
            "conversational_habits": [
                "acknowledges concern before advice",
                "keeps suggestions practical",
            ],
            "taboo_patterns": ["as an ai", "i cannot help"],
        }
    return {
        "tone": "calm_analytical",
        "voice_traits": [
            "uses concrete metrics",
            "keeps delivery framing",
            "states tradeoffs crisply",
        ],
        "conversational_habits": [
            "opens with direct answer",
            "adds one measurable next step",
        ],
        "taboo_patterns": ["as an ai", "i cannot help"],
    }


def _clean_media_outlets(raw_outlets: Any) -> list[dict[str, Any]]:
    cleaned: list[dict[str, Any]] = []
    if not isinstance(raw_outlets, list):
        return cleaned
    for item in raw_outlets:
        if not isinstance(item, dict):
            continue
        outlet_id = str(item.get("id", "")).strip()
        name = str(item.get("name", "")).strip()
        if not outlet_id or not name:
            continue
        lean = str(item.get("lean", "neutral")).strip().lower() or "neutral"
        try:
            bias = float(item.get("bias", 0.0))
        except (TypeError, ValueError):
            bias = 0.0
        try:
            sensationalism = float(item.get("sensationalism", 50.0))
        except (TypeError, ValueError):
            sensationalism = 50.0
        try:
            trust = float(item.get("trust", 50.0))
        except (TypeError, ValueError):
            trust = 50.0
        cleaned.append(
            {
                "id": outlet_id,
                "name": name,
                "lean": lean,
                "bias": bias,
                "sensationalism": sensationalism,
                "trust": trust,
            }
        )
    return cleaned


def _clean_advisors(raw_advisors: Any) -> tuple[list[dict[str, Any]], str | None]:
    if raw_advisors is None:
        return [], None
    if not isinstance(raw_advisors, list):
        return [], "meta.advisors must be a list when provided"
    if not raw_advisors:
        return [], "meta.advisors cannot be empty when provided"

    cleaned: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for idx, item in enumerate(raw_advisors):
        if not isinstance(item, dict):
            return [], f"meta.advisors[{idx}] must be an object"
        advisor_id = _normalize_portfolio_token(item.get("advisor_id", ""))
        if not advisor_id:
            return [], f"meta.advisors[{idx}].advisor_id is required"
        if advisor_id in seen_ids:
            return [], f"meta.advisors advisor_id must be unique; duplicate: {advisor_id}"

        name = str(item.get("name", "")).strip()
        if not name:
            return [], f"meta.advisors[{idx}].name is required"

        raw_portfolios = item.get("portfolios")
        if not isinstance(raw_portfolios, list) or not raw_portfolios:
            return [], f"meta.advisors[{idx}].portfolios must be a non-empty list"
        portfolios: list[str] = []
        for portfolio in raw_portfolios:
            token = _normalize_portfolio_token(portfolio)
            if token and token not in portfolios:
                portfolios.append(token)
        if not portfolios:
            return [], f"meta.advisors[{idx}].portfolios must include at least one valid token"

        style = str(item.get("style", "")).strip()
        if not style:
            return [], f"meta.advisors[{idx}].style is required"

        raw_aliases = item.get("aliases")
        if not isinstance(raw_aliases, list) or not raw_aliases:
            return [], f"meta.advisors[{idx}].aliases must be a non-empty list"
        aliases: list[str] = []
        for alias in raw_aliases:
            normalized = _normalize_alias(alias)
            if normalized and normalized not in aliases:
                aliases.append(normalized)
        if not aliases:
            return [], f"meta.advisors[{idx}].aliases must include at least one valid alias"

        personality = _synthesized_personality(portfolios)
        tone = _normalize_portfolio_token(item.get("tone", personality["tone"]))
        if not tone:
            tone = str(personality["tone"])

        raw_voice_traits = item.get("voice_traits")
        voice_traits: list[str] = []
        if isinstance(raw_voice_traits, list):
            for trait in raw_voice_traits:
                normalized = _normalize_phrase(trait)
                if normalized and normalized not in voice_traits:
                    voice_traits.append(normalized)
        if not voice_traits:
            voice_traits = list(personality["voice_traits"])

        raw_habits = item.get("conversational_habits")
        conversational_habits: list[str] = []
        if isinstance(raw_habits, list):
            for habit in raw_habits:
                normalized = _normalize_phrase(habit)
                if normalized and normalized not in conversational_habits:
                    conversational_habits.append(normalized)
        if not conversational_habits:
            conversational_habits = list(personality["conversational_habits"])

        raw_taboo = item.get("taboo_patterns")
        taboo_patterns: list[str] = []
        if isinstance(raw_taboo, list):
            for pattern in raw_taboo:
                normalized = _normalize_phrase(pattern).lower()
                if normalized and normalized not in taboo_patterns:
                    taboo_patterns.append(normalized)
        if not taboo_patterns:
            taboo_patterns = list(personality["taboo_patterns"])

        seen_ids.add(advisor_id)
        cleaned.append(
            {
                "advisor_id": advisor_id,
                "name": name,
                "portfolios": portfolios,
                "style": style,
                "aliases": aliases,
                "tone": tone,
                "voice_traits": voice_traits[:5],
                "conversational_habits": conversational_habits[:5],
                "taboo_patterns": taboo_patterns[:6],
            }
        )

    return cleaned, None


def _ensure_meta(meta: dict[str, Any], city_id: str, city_name: str) -> dict[str, Any]:
    cleaned_sources: list[dict[str, str]] = []
    for item in meta.get("evidence_sources", []) if isinstance(meta.get("evidence_sources"), list) else []:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        url = str(item.get("url", "")).strip()
        snippet = str(item.get("snippet", "")).strip()
        if title or url or snippet:
            cleaned_sources.append({"title": title, "url": url, "snippet": snippet})

    normalized_meta = {
        "city_id": city_id,
        "city_name": city_name,
        "profile_version": str(meta.get("profile_version", f"v-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}")).strip(),
        "generated_at": str(meta.get("generated_at", _utc_now_iso())).strip(),
        "generator_provider": str(meta.get("generator_provider", "builtin")).strip(),
        "generator_model": str(meta.get("generator_model", "builtin-seed")).strip(),
        "evidence_sources": cleaned_sources,
    }
    outlets = _clean_media_outlets(meta.get("media_outlets"))
    if outlets:
        normalized_meta["media_outlets"] = outlets

    advisors, advisors_error = _clean_advisors(meta.get("advisors"))
    if advisors:
        normalized_meta["advisors"] = advisors
    if advisors_error:
        normalized_meta["advisors_validation_error"] = advisors_error
    return normalized_meta


def validate_city_profile_payload(payload: dict[str, Any], expected_city_id: str | None = None) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise CityProfileError("City profile must be a JSON object")

    raw_meta = payload.get("meta", {})
    if not isinstance(raw_meta, dict):
        raise CityProfileError("City profile meta must be an object")

    city_id = str(raw_meta.get("city_id", expected_city_id or "")).strip().lower()
    if not city_id:
        raise CityProfileError("City profile meta.city_id is required")
    if expected_city_id and city_id != expected_city_id:
        raise CityProfileError(
            f"City profile city_id mismatch: expected {expected_city_id!r}, got {city_id!r}"
        )

    city_name = str(raw_meta.get("city_name", city_id.replace("_", " ").title())).strip()
    meta = _ensure_meta(raw_meta, city_id=city_id, city_name=city_name)

    raw_groups = payload.get("identity_groups", [])
    if not isinstance(raw_groups, list) or not raw_groups:
        raise CityProfileError("City profile identity_groups must be a non-empty list")
    groups = [IdentityGroup.from_dict(item) for item in raw_groups]

    raw_role_dist = payload.get("role_distribution", {})
    if not isinstance(raw_role_dist, dict) or not raw_role_dist:
        raise CityProfileError("City profile role_distribution must be a non-empty object")
    role_distribution = {str(role): float(weight) for role, weight in raw_role_dist.items()}
    if sum(max(0.0, weight) for weight in role_distribution.values()) <= 0:
        raise CityProfileError("City profile role_distribution weights must sum to > 0")

    raw_stats = payload.get("initial_city_stats", {})
    if not isinstance(raw_stats, dict):
        raise CityProfileError("City profile initial_city_stats must be an object")
    stats_payload = {key: float(raw_stats.get(key, getattr(CityStats(), key))) for key in STAT_KEYS}
    _ = CityStats(**stats_payload)

    raw_fronts = payload.get("issue_front_baseline", {})
    if not isinstance(raw_fronts, dict):
        raise CityProfileError("City profile issue_front_baseline must be an object")
    issue_front_baseline: dict[str, float] = {}
    for front in REQUIRED_FRONTS:
        if front not in raw_fronts:
            raise CityProfileError(f"City profile issue_front_baseline missing required front: {front}")
        issue_front_baseline[front] = float(raw_fronts[front])

    raw_starter_issues = payload.get("starter_issues", [])
    if not isinstance(raw_starter_issues, list):
        raise CityProfileError("City profile starter_issues must be a list")
    starter_issues = [str(item).strip() for item in raw_starter_issues if str(item).strip()]

    return {
        "meta": meta,
        "identity_groups": [group.__dict__ for group in groups],
        "role_distribution": role_distribution,
        "initial_city_stats": stats_payload,
        "issue_front_baseline": issue_front_baseline,
        "starter_issues": starter_issues,
    }


def _iter_candidates(city_id: str) -> list[Path]:
    primary = profile_path_for_city(city_id)
    candidates = [primary]
    cache_dir = cache_dir_for_city(city_id)
    if cache_dir.exists():
        cache_files = sorted(
            cache_dir.glob("*.json"),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        candidates.extend(cache_files)
    return candidates


def load_city_profile(city_id: str) -> CityProfileBundle:
    errors: list[str] = []
    for candidate in _iter_candidates(city_id):
        if not candidate.exists():
            continue
        try:
            payload = json.loads(candidate.read_text(encoding="utf-8"))
            normalized = validate_city_profile_payload(payload, expected_city_id=city_id)
            meta_payload = normalized["meta"]
            meta = CityProfileMeta(
                city_id=str(meta_payload["city_id"]),
                city_name=str(meta_payload["city_name"]),
                profile_version=str(meta_payload["profile_version"]),
                generated_at=str(meta_payload["generated_at"]),
                generator_provider=str(meta_payload["generator_provider"]),
                generator_model=str(meta_payload["generator_model"]),
                evidence_sources=[
                    {
                        "title": str(item.get("title", "")),
                        "url": str(item.get("url", "")),
                        "snippet": str(item.get("snippet", "")),
                    }
                    for item in meta_payload.get("evidence_sources", [])
                ],
            )
            return CityProfileBundle(payload=normalized, meta=meta, source_path=candidate)
        except Exception as exc:
            errors.append(f"{candidate.name}: {exc}")

    msg = f"No valid city profile found for {city_id!r}."
    if errors:
        msg += " Checked candidates with errors: " + "; ".join(errors)
    raise CityProfileError(msg)


def save_city_profile(payload: dict[str, Any], city_id: str) -> tuple[Path, Path]:
    normalized = validate_city_profile_payload(payload, expected_city_id=city_id)
    CITY_PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    cache_dir = cache_dir_for_city(city_id)
    cache_dir.mkdir(parents=True, exist_ok=True)

    meta = normalized["meta"]
    profile_version = str(meta["profile_version"]).replace("/", "_")
    primary_path = profile_path_for_city(city_id)
    cache_path = cache_dir / f"{profile_version}.json"
    body = json.dumps(normalized, indent=2)
    primary_path.write_text(body + "\n", encoding="utf-8")
    cache_path.write_text(body + "\n", encoding="utf-8")
    return primary_path, cache_path


def city_profile_status(city_id: str) -> dict[str, Any]:
    try:
        bundle = load_city_profile(city_id)
        return {
            "city_id": city_id,
            "profile_ready": True,
            "profile_version": bundle.meta.profile_version,
            "last_generated_at": bundle.meta.generated_at,
            "source_path": str(bundle.source_path),
            "last_error": None,
        }
    except Exception as exc:
        return {
            "city_id": city_id,
            "profile_ready": False,
            "profile_version": None,
            "last_generated_at": None,
            "source_path": None,
            "last_error": str(exc),
        }
