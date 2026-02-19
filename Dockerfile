# syntax=docker/dockerfile:1

FROM node:20-alpine AS ui-builder
WORKDIR /ui

COPY city_of_agents_ui/package*.json ./
RUN npm ci

COPY city_of_agents_ui/ ./
RUN npm run build

FROM python:3.11-slim AS runtime
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN pip install --no-cache-dir "openai>=1.0.0" "anthropic>=0.34.0"

COPY . .
COPY --from=ui-builder /ui/dist /app/city_of_agents_ui/dist

EXPOSE 8000

CMD ["python", "server.py"]
