"""
AgentRuntimeConfig — loads agent settings from DB and normalizes into typed runtime config.

The DB stores agent config as a JSON blob (VoiceAgent.config).
Frontend writes camelCase keys. This module normalises everything.

Usage (sync — safe to call from WS handlers):
    cfg = AgentRuntimeConfig.load(agent_id, tenant_id)
    # cfg.system_prompt, cfg.llm_provider, cfg.voice_id, etc.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AgentRuntimeConfig:
    """Immutable, fully-resolved runtime config for one agent."""

    # Identity
    agent_id: str
    name: str
    language: str          # 2-letter ISO
    greeting: str

    # LLM
    system_prompt: str
    llm_provider: str      # "gemini" | "groq" | "anthropic" | "openai"
    llm_model: str | None  # None → smart routing picks
    temperature: float
    max_response_words: int

    # STT
    stt_provider: str      # "deepgram" | "sarvam" | "auto"

    # TTS
    tts_engine: str        # "cartesia" | "elevenlabs" | "sarvam" | "edge_tts"
    voice_id: str | None

    # Behavior
    silence_threshold_ms: int        # end-of-turn silence window
    interruption_sensitivity: str    # "low" | "medium" | "high"
    max_turns: int                   # 0 = unlimited

    # Raw blob for forward-compat
    extra: dict = field(default_factory=dict)

    # ── Factory: from DB row ───────────────────────────────────────────

    @classmethod
    def from_db_row(cls, row: dict[str, Any]) -> "AgentRuntimeConfig":
        cfg: dict[str, Any] = row.get("config") or {}
        name: str = row.get("name") or "AI Agent"
        lang: str = (
            (cfg.get("language") or row.get("language") or "en")
            .lower()[:2]
        )

        system_prompt: str = (
            cfg.get("systemPrompt")
            or cfg.get("system_prompt")
            or cfg.get("prompt")
            or cfg.get("agentPrompt")
            or f"You are {name}, a helpful AI voice assistant. "
               "Keep replies concise — under 60 words. "
               "Never repeat the same phrase twice in a row."
        )

        llm_provider: str = (
            cfg.get("llmProvider") or cfg.get("llm_provider") or "gemini"
        ).lower()

        tts_engine: str = (
            cfg.get("ttsEngine") or cfg.get("tts_engine") or cfg.get("ttsProvider") or "edge_tts"
        ).lower()

        voice_id: str | None = (
            cfg.get("voiceId") or cfg.get("voice_id") or cfg.get("voice") or None
        )

        return cls(
            agent_id=row.get("id", "unknown"),
            name=name,
            language=lang,
            greeting=(
                cfg.get("greeting")
                or cfg.get("welcomeMessage")
                or cfg.get("greetingMessage")
                or f"Hello! I'm {name}. How can I help you today?"
            ),
            system_prompt=system_prompt,
            llm_provider=llm_provider,
            llm_model=cfg.get("llmModel") or cfg.get("llm_model") or None,
            temperature=float(cfg.get("temperature") or 0.7),
            max_response_words=int(
                cfg.get("maxResponseLength")
                or cfg.get("maxWords")
                or cfg.get("responseLength")
                or 60
            ),
            stt_provider=(cfg.get("sttProvider") or cfg.get("stt_provider") or "auto").lower(),
            tts_engine=tts_engine,
            voice_id=voice_id,
            silence_threshold_ms=int(cfg.get("silenceThresholdMs") or 1500),
            interruption_sensitivity=(
                cfg.get("interruptionSensitivity") or "medium"
            ).lower(),
            max_turns=int(cfg.get("maxTurns") or 0),
            extra=cfg,
        )

    @classmethod
    def from_demo_dict(cls, agent_id: str, agent: dict[str, Any]) -> "AgentRuntimeConfig":
        return cls(
            agent_id=agent_id,
            name=agent.get("name", "AI Agent"),
            language=(agent.get("language") or "en")[:2].lower(),
            greeting=agent.get("greeting", "Hello! How can I help?"),
            system_prompt=agent.get(
                "system_prompt",
                "You are a helpful AI voice assistant. Keep replies under 60 words.",
            ),
            llm_provider="gemini",
            llm_model=None,
            temperature=0.7,
            max_response_words=60,
            stt_provider="auto",
            tts_engine="edge_tts",
            voice_id=agent.get("voice"),
            silence_threshold_ms=1500,
            interruption_sensitivity="medium",
            max_turns=0,
            extra=agent,
        )

    # ── Main loader ────────────────────────────────────────────────────

    @classmethod
    def load(cls, agent_id: str, tenant_id: str | None = None) -> "AgentRuntimeConfig":
        """Sync load: DB (tenant-scoped) → DB (any tenant) → DEMO_AGENTS → default."""

        # 1. Tenant-scoped DB lookup
        if tenant_id:
            try:
                from api.services.agents_store import get_agent
                row = get_agent(tenant_id, agent_id)
                if row:
                    logger.debug(
                        "AgentRuntimeConfig loaded from DB (tenant=%s agent=%s)",
                        tenant_id, agent_id,
                    )
                    return cls.from_db_row(row)
            except Exception as exc:
                logger.warning("DB load (tenant) failed for agent=%s: %s", agent_id, exc)

        # 2. DB lookup without tenant restriction
        try:
            from api.database import get_engine
            from api.models.voice_agent_db import VoiceAgent
            from api.services.agents_store import _ensure_tables
            from sqlalchemy import select

            _ensure_tables()
            eng = get_engine()
            t = VoiceAgent.__table__
            with eng.begin() as conn:
                row_raw = conn.execute(
                    select(t).where(t.c.id == agent_id)
                ).first()
            if row_raw:
                m = row_raw._mapping
                rdict: dict[str, Any] = {
                    "id": m["id"],
                    "name": m["name"],
                    "language": m["language"],
                    "config": m["config"] or {},
                }
                logger.debug("AgentRuntimeConfig loaded from DB (global) agent=%s", agent_id)
                return cls.from_db_row(rdict)
        except Exception as exc:
            logger.debug("DB global lookup failed for agent=%s: %s", agent_id, exc)

        # 3. DEMO_AGENTS fallback (late import to avoid circular refs)
        try:
            import importlib
            vc = importlib.import_module("api.routers.voice_conversation")
            demo_agents = getattr(vc, "DEMO_AGENTS", {})
            if agent_id in demo_agents:
                logger.debug("AgentRuntimeConfig using DEMO_AGENTS: %s", agent_id)
                return cls.from_demo_dict(agent_id, demo_agents[agent_id])
        except Exception as exc:
            logger.debug("DEMO_AGENTS fallback failed: %s", exc)

        # 4. Minimal safe default
        logger.warning(
            "Agent '%s' not found in DB or DEMO_AGENTS — using minimal defaults", agent_id
        )
        return cls(
            agent_id=agent_id,
            name="AI Assistant",
            language="en",
            greeting="Hello! How can I help you today?",
            system_prompt=(
                "You are a helpful AI voice assistant. "
                "Keep replies concise — under 60 words."
            ),
            llm_provider="gemini",
            llm_model=None,
            temperature=0.7,
            max_response_words=60,
            stt_provider="auto",
            tts_engine="edge_tts",
            voice_id=None,
            silence_threshold_ms=1500,
            interruption_sensitivity="medium",
            max_turns=0,
            extra={},
        )

    # ── Helpers ────────────────────────────────────────────────────────

    def to_agent_dict(self) -> dict[str, Any]:
        """Return a dict compatible with code that expects the old DEMO_AGENTS format."""
        return {
            "name": self.name,
            "greeting": self.greeting,
            "language": self.language,
            "voice": self.voice_id,
            "system_prompt": self.system_prompt,
            "avatar": self.extra.get(
                "avatar",
                f"https://api.dicebear.com/7.x/avataaars/svg?seed={self.name}",
            ),
            "theme": self.extra.get("theme", {"primary": "#6366f1", "bg": "#0f172a"}),
            "allowed_domains": self.extra.get("allowed_domains", ["*"]),
        }
