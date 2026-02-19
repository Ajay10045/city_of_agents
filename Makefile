.PHONY: install dev backend frontend

install:
	uv sync
	cd ui && npm install

backend:
	uv run uvicorn api.main:app --reload --port 8000

frontend:
	cd ui && npm run dev

dev:
	make -j2 backend frontend
