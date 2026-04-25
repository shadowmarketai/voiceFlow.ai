# INITIAL.md — VoiceFlow AI SaaS

> Multi-tenant Voice AI platform with Indian language support, deployed at https://voice.shadowmarket.ai

---

## PRODUCT

### Name
VoiceFlow AI

### Description
VoiceFlow AI is a production multi-tenant Voice AI SaaS platform that lets businesses deploy AI voice agents for inbound/outbound calls in Indian languages (Tamil, Hindi, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi) and English. Agents use a real-time pipeline: STT (Sarvam/Deepgram/Groq Whisper) → LLM (Gemini 2.5 Pro / Groq LLaMA / Anthropic / OpenAI) → TTS (ElevenLabs/Cartesia/Edge-TTS). The platform includes a full CRM (leads, contacts, deals), campaign management, call recordings, analytics, billing (Razorpay + wallet), telephony (Twilio), white-label agency support, and a React dashboard.

### Target Users
- **Business owners** who want AI agents answering calls in Indian languages
- **Agencies** who resell the platform to their clients (white-label)
- **Super admins** who manage the overall platform, tenants, and billing

### Type
- [x] SaaS (Multi-tenant, Software as a Service)

---

## TECH STACK

| Layer | Choice |
|-------|--------|
| Backend | FastAPI + Python 3.11+ async |
| Frontend | React 18 + Vite + JSX + Tailwind CSS |
| Database | PostgreSQL (asyncpg) + SQLAlchemy 2.0 + Alembic |
| Cache | Redis |
| Auth | JWT (PyJWT) + bcrypt |
| STT | Sarvam AI (Indic), Deepgram (en/hi streaming), Groq Whisper |
| LLM | Gemini 2.5 Pro, Groq LLaMA, Anthropic Claude, OpenAI GPT |
| TTS | ElevenLabs, Cartesia, Edge-TTS (fallback) |
| Telephony | Twilio |
| Payments | Razorpay + internal wallet |
| Monitoring | Prometheus + Sentry |
| Deploy | Docker + Coolify (https://voice.shadowmarket.ai) |

---

## ROLES

| Role | Access |
|------|--------|
| **Super Admin** | Full platform control: tenants, pricing, feature flags, support tickets, cross-tenant users |
| **Agency Owner** | Manages sub-clients, reseller billing, agency wallet |
| **Tenant Owner** | Full access to agents, CRM, campaigns, recordings, analytics, billing |
| **Tenant User** | Limited access based on permissions |

---

## CURRENT STATUS

The core product is built and deployed. Known issues being fixed:

1. **LLM fallback cascade** — Gemini fails silently, bypasses Groq fallback → stub response. FIXED in `api_providers.py`
2. **Testing playground stale closure** — `sendToLLM` didn't include `conversation` in deps → no history sent → same stub response every turn. FIXED in `Testing.jsx`
3. **Recordings page** — wasn't loading actual audio blobs. FIXED.
4. **Call logs page** — wasn't parsing string transcripts or showing language/sentiment columns. FIXED.
5. **Voice engine tuning** — interruption sensitivity, EOS silence thresholds, filler timing. FIXED.

---

## MODULES TO COMPLETE / VERIFY

### Backend (FastAPI — `src/`)
- `src/api/routers/` — 36 routers; verify all return correct shapes
- `src/voice_engine/` — voice pipeline (smart_turn, emotion_engine, filler_engine, adaptive_chunker, orchestrator)
- `src/api/services/` — CRM, billing, analytics, campaigns
- Missing: comprehensive pytest test suite (currently 0 tests)

### Frontend (React — `frontend/src/`)
- `modules/voice-ai/pages/` — 29 pages; verify all wire to real API endpoints
- `modules/admin/` — 12 pages; super admin functions
- Missing: TypeScript (all JSX, no .tsx)
- Missing: frontend unit tests
- Known gaps: some pages may show placeholder/mock data instead of live API

### Quality Gates Required
- Backend: `ruff check src/ && pytest tests/`
- Frontend: `cd frontend && npm run build && npm run lint`
- Security: OWASP scan via `/security-review`
- E2E: Playwright tests for critical journeys

---

## KEY API ENDPOINTS

```
POST /api/v1/voice/text-stream     — SSE streaming LLM+TTS for Testing page
GET  /api/v1/llm/health            — Diagnose which LLM providers are working
GET  /api/v1/call-logs             — Paginated call log list
GET  /api/v1/agent/recordings      — Recordings list
GET  /api/v1/agent/recordings/{id}/audio — Audio blob (auth required)
POST /api/v1/voice-agents          — Create/update agents
GET  /api/v1/analytics/dashboard   — Dashboard metrics
POST /api/v1/crm/leads             — CRM lead creation
```

---

## ENVIRONMENT VARIABLES (Coolify)

```env
DATABASE_URL=postgresql+asyncpg://...
REDIS_URL=redis://...
SECRET_KEY=...
GOOGLE_API_KEY=...       # Gemini 2.5 Pro
GROQ_API_KEY=...         # Groq LLaMA (fallback)
ANTHROPIC_API_KEY=...    # Claude (fallback)
SARVAM_API_KEY=...       # Indic STT
DEEPGRAM_API_KEY=...     # English/Hindi streaming STT
ELEVENLABS_API_KEY=...   # TTS
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
SENTRY_DSN=...
```

---

## DEPLOYMENT

- **Platform:** Coolify
- **App UUID:** kskco0kg4coo40gkg84kws0s
- **URL:** https://voice.shadowmarket.ai
- **Trigger:** push to `main` branch → auto-deploy
