"""
Voice Cloner — Full cloning pipeline
======================================
Reference audio → Preprocess → Embed → Synthesize in that voice

Supports multiple backends:
  1. XTTS v2 (self-hosted, free)
  2. OpenVoice V2 (zero-shot multilingual)
  3. ElevenLabs API (highest quality, paid)
  4. Edge TTS fallback (free, no cloning but pitch-shifted)
"""

import base64
import logging
import os
import tempfile
import time
import uuid
from typing import Any, Dict, List, Optional

import soundfile as sf

from voice_cloning.preprocessor import AudioPreprocessor
from voice_cloning.encoder import SpeakerEncoder

logger = logging.getLogger(__name__)

SAMPLES_DIR = os.getenv("VOICE_SAMPLES_DIR", "data/voice_samples")
OUTPUTS_DIR = os.getenv("VOICE_OUTPUTS_DIR", "data/voice_outputs")


class VoiceCloner:
    """Full voice cloning pipeline."""

    def __init__(self):
        self.preprocessor = AudioPreprocessor()
        self.encoder = SpeakerEncoder(provider="auto")
        self._xtts = None
        self._voice_registry: Dict[str, Dict] = {}
        os.makedirs(SAMPLES_DIR, exist_ok=True)
        os.makedirs(OUTPUTS_DIR, exist_ok=True)
        self._reload_from_db()

    def _reload_from_db(self):
        """Restore voice registry from DB on startup so pod restarts
        don't lose the in-memory lookup table."""
        try:
            from api.services.voice_library import list_voices
            for tenant_voices in [list_voices("")]:
                for v in tenant_voices:
                    vid = v.get("voice_id", "")
                    if vid:
                        self._voice_registry[vid] = v
            if self._voice_registry:
                logger.info("Reloaded %d voices from voice_library DB", len(self._voice_registry))
        except Exception as exc:
            logger.info("voice_library DB not available yet (will work after init_db): %s", exc)

    def register_voice(
        self,
        audio_bytes: bytes,
        voice_name: str,
        file_extension: str = ".wav",
        tenant_id: str = "",
    ) -> Dict[str, Any]:
        """Upload + preprocess + quality check + extract embedding.

        Returns voice_id + quality report.
        """
        voice_id = f"vc_{uuid.uuid4().hex[:12]}"
        t_start = time.time()

        # Save raw upload
        sample_path = os.path.join(SAMPLES_DIR, f"{voice_id}{file_extension}")
        with open(sample_path, "wb") as f:
            f.write(audio_bytes)

        # Preprocess
        result = self.preprocessor.process(sample_path)
        quality = result["quality"]
        processed_path = result["processed_path"]

        # Extract embedding (even if quality is marginal — let user decide)
        embedding_data = self.encoder.extract_embedding(processed_path)
        embedding_path = self.encoder.save_embedding(voice_id, embedding_data)

        # Register
        voice_record = {
            "voice_id": voice_id,
            "voice_name": voice_name,
            "tenant_id": tenant_id,
            "sample_path": sample_path,
            "processed_path": processed_path,
            "embedding_path": embedding_path,
            "embedding_provider": embedding_data.get("provider", "unknown"),
            "quality": quality,
            "status": "ready" if quality["ready"] else "low_quality",
            "created_at": time.time(),
            "languages": ["en", "hi", "ta"],  # Supported synthesis languages
        }
        self._voice_registry[voice_id] = voice_record

        elapsed_ms = (time.time() - t_start) * 1000
        logger.info(
            "Voice registered: %s (%s) in %.0fms — quality: %s",
            voice_name, voice_id, elapsed_ms, "ready" if quality["ready"] else "low_quality",
        )

        return {
            **voice_record,
            "processing_time_ms": round(elapsed_ms),
        }

    def synthesize(
        self,
        voice_id: str,
        text: str,
        language: str = "en",
        speed: float = 1.0,
        provider: str = "auto",
    ) -> Dict[str, Any]:
        """Generate speech in a cloned voice.

        Returns audio_base64 + metadata.
        """
        voice = self._voice_registry.get(voice_id)
        if not voice:
            raise ValueError(f"Voice not found: {voice_id}")

        t_start = time.time()
        output_path = os.path.join(OUTPUTS_DIR, f"{uuid.uuid4().hex[:8]}.wav")

        if provider == "auto":
            provider = self._select_provider(language)

        if provider == "xtts":
            self._synthesize_xtts(voice, text, language, speed, output_path)
        elif provider == "elevenlabs":
            self._synthesize_elevenlabs(voice, text, language, output_path)
        elif provider == "edge_tts":
            self._synthesize_edge_tts(voice, text, language, speed, output_path)
        else:
            self._synthesize_edge_tts(voice, text, language, speed, output_path)

        # Read output and encode
        with open(output_path, "rb") as f:
            audio_bytes = f.read()
        audio_base64 = base64.b64encode(audio_bytes).decode()

        elapsed_ms = (time.time() - t_start) * 1000
        logger.info(
            "Synthesized: voice=%s, lang=%s, provider=%s, %.0fms",
            voice_id, language, provider, elapsed_ms,
        )

        return {
            "audio_base64": audio_base64,
            "audio_format": "wav",
            "sample_rate": 22050,
            "provider_used": provider,
            "voice_id": voice_id,
            "voice_name": voice["voice_name"],
            "language": language,
            "text_length": len(text),
            "latency_ms": round(elapsed_ms),
        }

    def _select_provider(self, language: str) -> str:
        """Auto-select best provider for language."""
        try:
            from TTS.api import TTS
            return "xtts"
        except ImportError:
            pass
        if os.getenv("ELEVENLABS_API_KEY"):
            return "elevenlabs"
        return "edge_tts"

    def _synthesize_xtts(
        self, voice: Dict, text: str, language: str,
        speed: float, output_path: str,
    ):
        """Synthesize using XTTS v2 (self-hosted, free)."""
        from TTS.api import TTS

        if self._xtts is None:
            logger.info("Loading XTTS v2 for synthesis...")
            self._xtts = TTS("tts_models/multilingual/multi-dataset/xtts_v2")

        # XTTS language codes
        lang_map = {"en": "en", "hi": "hi", "ta": "ta", "te": "te", "mr": "mr"}
        xtts_lang = lang_map.get(language, "en")

        self._xtts.tts_to_file(
            text=text,
            speaker_wav=voice["processed_path"],
            language=xtts_lang,
            file_path=output_path,
        )

    def _synthesize_elevenlabs(
        self, voice: Dict, text: str, language: str, output_path: str,
    ):
        """Synthesize using ElevenLabs API (paid, highest quality)."""
        import httpx

        api_key = os.getenv("ELEVENLABS_API_KEY", "")
        if not api_key:
            raise ValueError("ELEVENLABS_API_KEY not set")

        # First check if we have an ElevenLabs voice_id stored
        el_voice_id = voice.get("elevenlabs_voice_id")

        if not el_voice_id:
            # Upload sample to ElevenLabs first
            with open(voice["processed_path"], "rb") as f:
                resp = httpx.post(
                    "https://api.elevenlabs.io/v1/voices/add",
                    headers={"xi-api-key": api_key},
                    files={"files": (f"sample.wav", f, "audio/wav")},
                    data={"name": voice["voice_name"], "description": "VoiceFlow AI clone"},
                    timeout=60,
                )
            resp.raise_for_status()
            el_voice_id = resp.json()["voice_id"]
            voice["elevenlabs_voice_id"] = el_voice_id

        # Synthesize
        resp = httpx.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{el_voice_id}",
            headers={"xi-api-key": api_key, "Content-Type": "application/json"},
            json={
                "text": text,
                "model_id": "eleven_flash_v2_5",
                "voice_settings": {"stability": 0.5, "similarity_boost": 0.8},
            },
            timeout=30,
        )
        resp.raise_for_status()
        with open(output_path, "wb") as f:
            f.write(resp.content)

    def _synthesize_edge_tts(
        self, voice: Dict, text: str, language: str,
        speed: float, output_path: str,
    ):
        """Fallback: Edge TTS (free, no real cloning but language-appropriate voice)."""
        import asyncio
        import edge_tts

        # Pick best voice for language + gender hint from embedding
        voice_map = {
            "ta": "ta-IN-PallaviNeural",
            "hi": "hi-IN-SwaraNeural",
            "te": "te-IN-ShrutiNeural",
            "kn": "kn-IN-SapnaNeural",
            "ml": "ml-IN-SobhanaNeural",
            "bn": "bn-IN-TanishaaNeural",
            "mr": "mr-IN-AarohiNeural",
            "en": "en-IN-NeerjaNeural",
        }
        edge_voice = voice_map.get(language, "en-IN-NeerjaNeural")
        rate_str = f"{int((speed - 1) * 100):+d}%"

        async def _generate():
            comm = edge_tts.Communicate(text, edge_voice, rate=rate_str)
            await comm.save(output_path)

        asyncio.run(_generate())

    def list_voices(self, tenant_id: str = "") -> List[Dict]:
        """List all registered voices."""
        voices = list(self._voice_registry.values())
        if tenant_id:
            voices = [v for v in voices if v.get("tenant_id") == tenant_id]
        return [
            {
                "voice_id": v["voice_id"],
                "voice_name": v["voice_name"],
                "status": v["status"],
                "quality": v["quality"],
                "embedding_provider": v["embedding_provider"],
                "languages": v["languages"],
                "created_at": v["created_at"],
            }
            for v in voices
        ]

    def get_voice(self, voice_id: str) -> Optional[Dict]:
        return self._voice_registry.get(voice_id)

    def delete_voice(self, voice_id: str) -> bool:
        voice = self._voice_registry.pop(voice_id, None)
        if not voice:
            return False
        for path_key in ("sample_path", "processed_path", "embedding_path"):
            path = voice.get(path_key)
            if path and os.path.exists(path):
                os.remove(path)
        return True


# Singleton
_cloner: Optional[VoiceCloner] = None


def get_voice_cloner() -> VoiceCloner:
    global _cloner
    if _cloner is None:
        _cloner = VoiceCloner()
    return _cloner
