from __future__ import annotations

import json
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

    return {
        "city_id": city_id,
        "city_name": city_name,
        "profile_version": str(meta.get("profile_version", f"v-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}")).strip(),
        "generated_at": str(meta.get("generated_at", _utc_now_iso())).strip(),
        "generator_provider": str(meta.get("generator_provider", "builtin")).strip(),
        "generator_model": str(meta.get("generator_model", "builtin-seed")).strip(),
        "evidence_sources": cleaned_sources,
    }


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
