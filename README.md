# VoiceFlow AI SaaS

> Multi-tenant Voice AI platform with Indian language support, 7 telephony providers, voice cloning, and a React dashboard.

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/shadowmarketai/voiceFlow.ai.git
cd voiceFlow.ai

# 2. Setup environment
cp .env.example .env
# Fill in API keys (Groq, ElevenLabs, Deepgram, etc.)

# 3. Start with Docker
docker-compose up -d

# 4. Or run locally
pip install -r requirements.txt
cd frontend && npm install && cd ..
make dev
```

**Frontend:** http://localhost:5174
**Backend API:** http://localhost:8001
**Swagger Docs:** http://localhost:8001/docs

---

## What You Get

- **Voice AI Pipeline:** Noise Reduction -> VAD -> STT (Whisper/Deepgram) -> LLM (Groq/Claude/GPT-4) -> TTS (5 Indic engines) -> EOS
- **7 Telephony Providers:** TeleCMI, Bolna, Vobiz, Exotel, Twilio, Vonage, SIP + WebRTC
- **Voice Cloning:** XTTS v2, OpenVoice, ElevenLabs with quality validation
- **42 Voice Library:** 8 TTS providers, 10 Indian languages
- **Agent Builder:** 5-tab config (Overview, Voice & AI, Behavior, Tools, Integrations)
- **9 Demo Agents:** Real Estate, Sales, Support in Tamil, Hindi, Bengali, Gujarati, Telugu, Kannada, Odia, Assamese, English
- **White-label Multi-tenancy:** Custom domains, branding, feature flags
- **Billing:** Razorpay (UPI + Cards), INR pricing
- **CRM:** Leads, deals, campaigns with dialect/emotion tracking

---

## Architecture

```
frontend/          React 18 + Vite + Tailwind CSS + TypeScript
src/
  api/             FastAPI server, routers, models, schemas, services
  voice_engine/    STT + emotion/intent + VAD + noise reduction + EOS
  voice_cloning/   Preprocessor, encoder, cloner (XTTS/ElevenLabs)
  tts/             5 TTS engines (Indic Parler, IndicF5, OpenVoice, XTTS, Svara)
  integrations/    Telephony (7 providers), WhatsApp
  billing/         Razorpay service
  whitelabel/      Multi-tenant config
  widget/          Embeddable voice widget
tests/             pytest (unit + integration)
migrations/        Alembic (async PostgreSQL)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI + Python 3.11+ (async) |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Database | PostgreSQL (asyncpg) + SQLAlchemy 2.0 + Alembic |
| Cache | Redis |
| Auth | JWT (PyJWT) + bcrypt |
| Voice/AI | Whisper, Deepgram, Groq, Claude, GPT-4 |
| TTS | Indic Parler, IndicF5, OpenVoice V2, XTTS v2, Svara, ElevenLabs, Edge TTS |
| Telephony | TeleCMI, Bolna, Vobiz, Exotel, Twilio, Vonage, SIP, WebRTC |
| Payments | Razorpay (UPI, Cards) |
| Monitoring | Prometheus + Sentry |

---

## Commands

```bash
make dev          # Start backend + frontend
make test         # Run pytest
make lint         # Lint Python + JS
make build        # Docker build
make up           # Docker compose up
make down         # Docker compose down
```

---

## Quality

```bash
/verify           # Full verification: build + lint + test + security
/code-review      # Code quality review
/security-review  # OWASP vulnerability scan
/tdd              # TDD workflow (80%+ coverage)
/build-fix        # Auto-fix build errors
```

---

## Environment Variables

See `.env.example` for the full list. Key variables:

```env
DATABASE_URL=postgresql+asyncpg://...
GROQ_API_KEY=gsk_...
ELEVENLABS_API_KEY=sk_...
DEEPGRAM_API_KEY=...
RAZORPAY_KEY_ID=rzp_...
TELECMI_API_KEY=...
```

---

## License

Proprietary - Shadow Market AI
