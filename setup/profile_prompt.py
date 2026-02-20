from __future__ import annotations

import json

REQUIRED_FRONTS = ["economy", "corruption", "safety", "services", "social_cohesion"]


def build_profile_generation_prompt(
    city_id: str,
    city_name: str,
    evidence: list[dict[str, str]],
) -> tuple[str, str]:
    system = """You generate realistic city simulation setup profiles.

Return ONLY one valid JSON object and do not include markdown.
The object must match this schema:
{
  "meta": {
    "city_id": "...",
    "city_name": "...",
    "profile_version": "vYYYY.MM.DD-HHMM",
    "generated_at": "ISO8601 UTC",
    "generator_provider": "...",
    "generator_model": "...",
    "evidence_sources": [{"title":"...","url":"...","snippet":"..."}]
  },
  "identity_groups": [
    {
      "id": "snake_case",
      "name": "string",
      "religion": "string",
      "caste": "string",
      "language": "string",
      "population_percent": 0.0-1.0,
      "economic_modifier": 0.7-1.3,
      "education_modifier": 0.7-1.3,
      "grievance_score": 0.0-1.0,
      "radicalization_base_rate": 0.0-0.2,
      "issue_sensitivity": {
        "economy": 0.6-1.5,
        "employment": 0.6-1.5,
        "law_and_order": 0.6-1.5,
        "infrastructure": 0.6-1.5,
        "environment": 0.6-1.5,
        "corruption": 0.6-1.5,
        "social_tension": 0.6-1.5,
        "media_freedom": 0.6-1.5,
        "public_trust": 0.6-1.5
      }
    }
  ],
  "role_distribution": {
    "Worker": 0.0-1.0,
    "BusinessOwner": 0.0-1.0,
    "Politician": 0.0-1.0,
    "Journalist": 0.0-1.0,
    "Student": 0.0-1.0
  },
  "initial_city_stats": {
    "economy": 0-100,
    "employment": 0-100,
    "law_and_order": 0-100,
    "infrastructure": 0-100,
    "environment": 0-100,
    "corruption": 0-100,
    "social_tension": 0-100,
    "media_freedom": 0-100,
    "public_trust": 0-100
  },
  "issue_front_baseline": {
    "economy": 0-100,
    "corruption": 0-100,
    "safety": 0-100,
    "services": 0-100,
    "social_cohesion": 0-100
  },
  "starter_issues": ["3 to 6 issue statements"]
}

Rules:
- City-specific realism only.
- No placeholder factions like River Union / Merchant Bloc / Campus Front.
- Population percents and role distribution must each sum to ~1.0.
- Keep values plausible and internally consistent.
"""

    user = (
        f"Generate a profile for city_id={city_id}, city_name={city_name}.\n"
        f"Required fronts: {', '.join(REQUIRED_FRONTS)}\n\n"
        f"Evidence bundle:\n{json.dumps(evidence, indent=2)}\n\n"
        "Use the evidence and realistic domain priors to produce the profile now."
    )
    return system, user
