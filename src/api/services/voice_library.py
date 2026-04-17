"""
Voice library CRUD — W10.

DB-backed persistence for cloned voices so they survive restarts.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import desc, select

from api.database import get_session_factory
from api.models.voice_library import VoiceCloneRecord

log = logging.getLogger(__name__)


def save_voice(
    voice_id: str,
    voice_name: str,
    tenant_id: str,
    provider: str = "elevenlabs",
    provider_voice_id: str | None = None,
    sample_path: str | None = None,
    embedding_path: str | None = None,
    language: str = "en",
    quality_snr_db: float | None = None,
    quality_duration_s: float | None = None,
    created_by: str | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    try:
        with get_session_factory()() as s:
            rec = VoiceCloneRecord(
                voice_id=voice_id,
                voice_name=voice_name,
                tenant_id=tenant_id,
                created_by=created_by,
                provider=provider,
                provider_voice_id=provider_voice_id,
                sample_path=sample_path,
                embedding_path=embedding_path,
                language=language,
                quality_snr_db=quality_snr_db,
                quality_duration_s=quality_duration_s,
                description=description,
            )
            s.add(rec)
            s.commit()
            return _to_dict(rec)
    except Exception as exc:
        log.warning("voice_library save failed: %s", exc)
        return {"voice_id": voice_id, "error": str(exc)}


def list_voices(tenant_id: str) -> list[dict[str, Any]]:
    try:
        with get_session_factory()() as s:
            rows = s.execute(
                select(VoiceCloneRecord)
                .where(VoiceCloneRecord.tenant_id == tenant_id, VoiceCloneRecord.is_active.is_(True))
                .order_by(desc(VoiceCloneRecord.ts))
            ).scalars().all()
            return [_to_dict(r) for r in rows]
    except Exception as exc:
        log.warning("voice_library list failed: %s", exc)
        return []


def get_voice(voice_id: str) -> dict[str, Any] | None:
    try:
        with get_session_factory()() as s:
            r = s.execute(
                select(VoiceCloneRecord).where(VoiceCloneRecord.voice_id == voice_id)
            ).scalar_one_or_none()
            return _to_dict(r) if r else None
    except Exception:
        return None


def delete_voice(voice_id: str, tenant_id: str) -> bool:
    try:
        with get_session_factory()() as s:
            r = s.execute(
                select(VoiceCloneRecord).where(
                    VoiceCloneRecord.voice_id == voice_id,
                    VoiceCloneRecord.tenant_id == tenant_id,
                )
            ).scalar_one_or_none()
            if not r:
                return False
            r.is_active = False
            s.commit()
            return True
    except Exception:
        return False


def _to_dict(r: VoiceCloneRecord) -> dict[str, Any]:
    return {
        "voice_id": r.voice_id,
        "voice_name": r.voice_name,
        "tenant_id": r.tenant_id,
        "provider": r.provider,
        "provider_voice_id": r.provider_voice_id,
        "language": r.language,
        "quality_snr_db": r.quality_snr_db,
        "quality_duration_s": r.quality_duration_s,
        "is_active": r.is_active,
        "created_at": r.ts.isoformat() + "Z" if r.ts else None,
        "description": r.description,
    }
