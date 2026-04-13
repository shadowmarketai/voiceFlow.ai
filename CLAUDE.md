# CLAUDE.md - VoiceFlow AI SaaS

> Rules Claude follows in every conversation for this project.

---

## Project Overview

VoiceFlow AI SaaS — a multi-tenant Voice AI platform with Indian language support, TTS engines, telephony (Twilio), billing (Razorpay), and a React dashboard.

---

## Tech Stack

- **Backend:** FastAPI + Python 3.11+ (async)
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS
- **Database:** PostgreSQL (asyncpg) + SQLAlchemy 2.0 + Alembic
- **Cache:** Redis
- **Auth:** JWT (PyJWT) + bcrypt
- **Voice/AI:** OpenAI Whisper, Deepgram, Edge-TTS, Anthropic, OpenAI, Groq
- **Indian Languages:** ai4bharat-transliteration, indic-nlp-library
- **Telephony:** Twilio
- **Payments:** Razorpay
- **Monitoring:** Prometheus + Sentry
- **UI:** Tailwind CSS + Lucide Icons + Recharts + React Three Fiber

---

## Project Structure

```
voice-flow/
├── src/
│   ├── api/
│   │   ├── server.py, config.py, database.py, startup.py
│   │   ├── models/          # SQLAlchemy models
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── routers/         # API routes (auth, voice, billing, tenants, etc.)
│   │   ├── services/        # Business logic
│   │   ├── middleware.py, permissions.py, dependencies.py
│   │   └── realtime.py      # WebSocket support
│   ├── voice_engine/        # Voice AI processing
│   ├── tts/                 # Text-to-Speech engines
│   ├── assistants/          # AI assistant logic
│   ├── billing/             # Razorpay billing service
│   ├── integrations/        # Third-party integrations
│   └── whitelabel/          # White-label support
├── frontend/
│   └── src/
│       ├── components/, pages/, hooks/, services/
│       ├── context/, contexts/, providers/
│       ├── modules/, layouts/, lib/, utils/, types/
├── migrations/              # Alembic migrations
├── tests/
├── data/, docs/, logs/, voices/
└── billing_service.py
```

---

## Code Standards

### Python
```python
# Type hints required
async def get_tenant(db: AsyncSession, tenant_id: int) -> Tenant:
    pass

# Async endpoints
@router.get("/voice/agents/{id}")
async def get_voice_agent(id: int, db: AsyncSession = Depends(get_db)):
    pass
```

### TypeScript
```typescript
// Interfaces required - NO any types
interface VoiceAgent { id: number; name: string; language: string; }

const fetchAgents = async (): Promise<VoiceAgent[]> => { ... };
```

---

## Forbidden

- `print()` -> use `logging`
- Plain passwords -> use bcrypt
- Hardcoded secrets -> use env vars
- `any` type in TypeScript
- `console.log` in production
- Inline styles -> use Tailwind classes
- Synchronous DB calls -> use async (asyncpg)

---

## Environment Variables

```env
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/voiceflow
REDIS_URL=redis://localhost:6379
SECRET_KEY=your-secret-key
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
RAZORPAY_KEY_ID=xxx
RAZORPAY_KEY_SECRET=xxx
OPENAI_API_KEY=xxx
ANTHROPIC_API_KEY=xxx
GROQ_API_KEY=xxx
DEEPGRAM_API_KEY=xxx
SENTRY_DSN=xxx
VITE_API_URL=http://localhost:8000
```

---

## Validation

```bash
# Backend
ruff check src/ && pytest tests/

# Frontend
cd frontend && npm run lint && npm run type-check

# Full
docker-compose build
```

---

## Shared Agent & Quality System

> This project uses the agent-skill-rule architecture from Shadow Market Template.
> All agents, skills, rules, and quality commands are loaded from the template.

### Template Location

```
/Users/maczo/work/code-projects/Shadow-market-Template-Private-main/shadow-market-Template-Private-main/
```

### Quality Commands (from template)

| Command | Purpose |
|---------|---------|
| `/plan` | Implementation planning |
| `/tdd` | TDD workflow — tests first, then implement |
| `/code-review` | Comprehensive code quality review |
| `/verify` | Full verification: build + lint + test + security |
| `/build-fix` | Auto-fix build errors |
| `/security-review` | OWASP vulnerability scan |
| `/e2e` | Generate E2E tests |
| `/learn` | Extract patterns for next session |

### Agents (from template)

| Agent | Role |
|-------|------|
| planner | Implementation planning |
| code-reviewer | Code quality review |
| python-reviewer | Python-specific review |
| typescript-reviewer | TypeScript-specific review |
| security-reviewer | OWASP vulnerability scanning |
| tdd-guide | TDD enforcement |
| build-error-resolver | Auto-fix build errors |
| devops-agent | Docker + CI/CD |
| database-agent | Models + migrations |
| backend-agent | API + auth |
| frontend-agent | UI + pages |

### Skills (from template)

| Skill | Purpose |
|-------|---------|
| `skills/tdd-workflow/` | TDD methodology |
| `skills/security-review/` | Security checklist |
| `skills/python-patterns/` | Python best practices |
| `skills/python-testing/` | Python test patterns |
| `skills/frontend-patterns/` | TypeScript/React patterns |
| `skills/api-design/` | API design patterns |
| `skills/coding-standards/` | Code review patterns |
| `skills/docker-patterns/` | Docker best practices |
| `skills/e2e-testing/` | E2E test patterns |

### Rules (from template)

Quality rules loaded from template `rules/`:
- `rules/common/` — Security, testing, coding style, code review, git workflow, performance
- `rules/python/` — Python coding style, patterns, security, testing, hooks
- `rules/typescript/` — TypeScript coding style, patterns, security, testing, hooks

---

## Workflow

```
Development:
  /plan              -> Design implementation approach
  Code               -> Write feature code

Quality:
  /verify            -> Build + lint + test + security check
  /code-review       -> Quality review
  /security-review   -> OWASP vulnerability scan
  /tdd               -> Add missing tests (80%+ coverage)
  /build-fix         -> Auto-fix any build errors
  /e2e               -> Generate E2E tests
  /learn             -> Extract patterns for next session
```
