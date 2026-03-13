.PHONY: dev build-dev up down restart build logs ps clean frontend-shell backend-shell

# --- Development ---
# Start the full stack with hot reload
dev:
	docker compose -f docker-compose.dev.yml up -d

# Start the full stack and watch logs
dev-logs:
	docker compose -f docker-compose.dev.yml up -d && docker compose -f docker-compose.dev.yml logs -f

# Rebuild dev containers
build-dev:
	docker compose -f docker-compose.dev.yml build

# Stop dev stack
down-dev:
	docker compose -f docker-compose.dev.yml down

# --- Production (Simulated Local) ---
# Build/start the production containers
up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build

# --- Shared ---
logs:
	docker compose -f docker-compose.dev.yml logs -f || docker compose logs -f

ps:
	docker compose ps

clean:
	docker compose -f docker-compose.dev.yml down -v --rmi local --remove-orphans || true
	docker compose down -v --rmi local --remove-orphans || true
	rm -rf frontend/dist
	rm -rf backend/bin backend/obj

# Shell access (prefers dev stack if running)
frontend-shell:
	docker compose -f docker-compose.dev.yml exec frontend sh || docker compose exec frontend sh

backend-shell:
	docker compose -f docker-compose.dev.yml exec backend sh || docker compose exec backend sh
