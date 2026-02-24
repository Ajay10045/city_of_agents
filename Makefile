.PHONY: install backend

install:
	uv sync

backend:
	uv run uvicorn api.main:app --reload --port 8000
