.PHONY: install dev backend frontend

install:
	uv venv --python 3.13
	source .venv/bin/activate && uv pip install -r requirements.txt
	cd ui && npm install

backend:
	source .venv/bin/activate && uvicorn api.main:app --reload --port 8000

frontend:
	cd ui && npm run dev

dev:
	make -j2 backend frontend
