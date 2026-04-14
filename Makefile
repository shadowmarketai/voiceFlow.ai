# VoiceFlow AI — Development Commands

.PHONY: dev test lint build up down clean

# ── Development ──────────────────────────────────────────
dev:
	@echo "Starting backend + frontend..."
	cd src && uvicorn api.server:app --reload --host 0.0.0.0 --port 8001 &
	cd frontend && npm run dev

backend:
	cd src && uvicorn api.server:app --reload --host 0.0.0.0 --port 8001

frontend:
	cd frontend && npm run dev

# ── Testing ──────────────────────────────────────────────
test:
	pytest tests/ -v --tb=short

test-cov:
	pytest tests/ -v --cov=src --cov-report=term-missing

test-frontend:
	cd frontend && npm run lint && npm run type-check

# ── Linting ──────────────────────────────────────────────
lint:
	ruff check src/ tests/ --fix
	cd frontend && npm run lint

lint-check:
	ruff check src/ tests/
	cd frontend && npm run lint

format:
	ruff format src/ tests/
	cd frontend && npx prettier --write "src/**/*.{js,jsx,ts,tsx}"

# ── Docker ───────────────────────────────────────────────
build:
	docker-compose build

up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f api

clean:
	docker-compose down -v --rmi local
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true

# ── Database ─────────────────────────────────────────────
migrate:
	alembic upgrade head

migrate-new:
	@read -p "Migration message: " msg; alembic revision --autogenerate -m "$$msg"

# ── Quality ──────────────────────────────────────────────
verify: lint test test-frontend
	@echo "All checks passed!"

security:
	pip-audit
	cd frontend && npm audit
