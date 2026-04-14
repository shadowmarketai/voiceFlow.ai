# Contributing to VoiceFlow AI

## Development Setup

```bash
# Backend
pip install -r requirements.txt
cd src && uvicorn api.server:app --reload --port 8001

# Frontend
cd frontend && npm install && npm run dev

# Tests
pytest tests/ -v
cd frontend && npm run lint && npm run type-check
```

## Code Standards

### Python
- Type hints required on all functions
- Use `logging` (never `print()`)
- Async endpoints with FastAPI
- bcrypt for passwords, env vars for secrets
- Follow ruff linting rules

### TypeScript / React
- No `any` types
- Interfaces for all data shapes
- No `console.log` in production
- Tailwind classes only (no inline styles)
- React Query for server state

## Git Workflow

1. Create feature branch from `main`
2. Make changes with clear commits
3. Run `make lint && make test` before pushing
4. Open PR with the template filled out
5. Get review approval
6. Squash merge to `main`

## Commit Messages

```
feat: add voice cloning API endpoint
fix: resolve WebRTC session cleanup
docs: update README with telephony setup
test: add VAD engine unit tests
refactor: extract telephony base class
```

## Testing

- Unit tests: `tests/test_*.py`
- Target: 80%+ coverage
- Mock external APIs (Twilio, Razorpay, etc.)
- Run: `pytest tests/ -v --cov=src`
