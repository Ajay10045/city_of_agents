# City Profiles

City profiles are loaded from `config/cities/<city_id>.json` and validated by `core/city_profile.py`.

## Required top-level fields

- `meta`
  - `city_id`
  - `city_name`
  - `profile_version`
  - `generated_at`
  - `generator_provider`
  - `generator_model`
  - `evidence_sources` (list of `{title,url,snippet}`)
  - optional: `media_outlets` (list of `{id,name,lean,bias,sensationalism,trust}`)
  - optional: `advisors` (list of `{advisor_id,name,portfolios,style,aliases,tone?,voice_traits?,conversational_habits?,taboo_patterns?}`)
- `identity_groups` (compatible with `IdentityGroup.from_dict`)
- `role_distribution`
- `initial_city_stats`
- `issue_front_baseline`
  - required fronts: `economy`, `corruption`, `safety`, `services`, `social_cohesion`
- `starter_issues` (list of strings)

## Cache behavior

Generated profiles are persisted to both:

- `config/cities/<city_id>.json` (active profile)
- `config/cities/cache/<city_id>/<profile_version>.json` (historical cache)

At runtime, loader order is:

1. active profile
2. newest cached profile for the city

If no valid profile is found, game setup blocks with an actionable error.
