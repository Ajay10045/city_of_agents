"""Smoke tests for the v2 engine modules."""
from __future__ import annotations

import random

from engine.models import CityParameters, CityProfile


def test_city_parameters_apply_delta():
    params = CityParameters()
    updated = params.apply_delta({"jobs_and_commerce": 5.0, "transit_and_roads": -3.0})
    assert updated.jobs_and_commerce == params.jobs_and_commerce + 5.0
    assert updated.transit_and_roads == params.transit_and_roads - 3.0
    # Unchanged params stay the same
    assert updated.hospitals_and_clinics == params.hospitals_and_clinics


def test_city_parameters_clamp():
    params = CityParameters(jobs_and_commerce=98)
    updated = params.apply_delta({"jobs_and_commerce": 10.0})
    assert updated.jobs_and_commerce <= 100.0


def test_city_parameters_default_values():
    params = CityParameters()
    # All params should have reasonable defaults (typically 50)
    for field in CityParameters.model_fields:
        val = getattr(params, field)
        assert 0 <= val <= 100, f"{field} out of range: {val}"
