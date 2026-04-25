"""
VoiceFlow TTS Configuration
Supports: Indic Parler-TTS, IndicF5, OpenVoice V2, XTTS-v2, Svara-TTS,
          AI4B FastPitch (HiFiGAN V1), Bhashini/IITM TTS
"""

from enum import Enum

from pydantic import BaseModel

# =============================================================================
# ENUMS
# =============================================================================

class TTSEngine(str, Enum):
    ELEVENLABS     = "elevenlabs"        # MOS 4.8 — Turbo v2.5, best English quality
    CARTESIA       = "cartesia"          # MOS 4.7 — Sonic-2, 80ms TTFA real-time
    SARVAM_TTS     = "sarvam_tts"        # MOS 4.4 — bulbul:v2, best API Indian TTS
    INDIC_PARLER   = "indic_parler"      # MOS 4.3 — self-hosted Indian, 12 emotions
    INDICF5        = "indicf5"           # MOS 4.6 — highest self-hosted Indian quality
    OPENVOICE_V2   = "openvoice_v2"
    XTTS_V2        = "xtts_v2"
    SVARA          = "svara"
    AI4B_FASTPITCH = "ai4b_fastpitch"   # FastPitch + HiFiGAN V1 (13 langs)
    BHASHINI       = "bhashini"          # Bhashini/IITM Dhruva API (22+ langs)


class EmotionType(str, Enum):
    # Indic Parler-TTS emotions (12 types)
    HAPPY = "happy"
    SAD = "sad"
    ANGRY = "angry"
    FEAR = "fear"
    SURPRISE = "surprise"
    DISGUST = "disgust"
    NEUTRAL = "neutral"
    COMMAND = "command"
    NEWS = "news"
    NARRATION = "narration"
    CONVERSATION = "conversation"
    PROPER_NOUN = "proper_noun"
    # Additional
    CALM = "calm"
    EXCITED = "excited"
    EMPATHETIC = "empathetic"


class Language(str, Enum):
    TAMIL = "ta"
    HINDI = "hi"
    TELUGU = "te"
    KANNADA = "kn"
    MALAYALAM = "ml"
    ENGLISH = "en"
    BENGALI = "bn"
    MARATHI = "mr"
    GUJARATI = "gu"
    PUNJABI = "pa"
    ODIA = "or"
    ASSAMESE = "as"


class TamilDialect(str, Enum):
    CHENNAI = "chennai"
    KONGU = "kongu"
    MADURAI = "madurai"
    TIRUNELVELI = "tirunelveli"
    STANDARD = "standard"


# =============================================================================
# ENGINE CONFIGURATIONS
# =============================================================================

TTS_ENGINE_CONFIG = {
    TTSEngine.ELEVENLABS: {
        "model_id": "eleven_turbo_v2_5",
        "api_base": "https://api.elevenlabs.io/v1",
        "license": "Commercial API",
        "languages": [
            "en", "hi", "ta", "te", "kn", "ml", "bn", "mr", "gu", "pa",
            "es", "fr", "de", "it", "pt", "pl", "ar", "zh", "ja", "ko",
        ],
        "emotions": ["neutral", "happy", "sad", "angry", "excited", "empathetic"],
        "latency_ms": {"min": 200, "max": 400},
        "gpu_vram_gb": 0,
        "cpu_capable": True,
        "api_only": True,
        "streaming": True,
        "quality_mos": 4.8,
        "env_key": "ELEVENLABS_API_KEY",
        "best_for": ["english_premium", "customer_service", "sales", "voice_cloning"],
    },

    TTSEngine.CARTESIA: {
        "model_id": "sonic-2",
        "api_base": "https://api.cartesia.ai",
        "license": "Commercial API",
        "languages": ["en", "hi", "fr", "de", "es", "pt", "ja", "zh"],
        "emotions": ["neutral", "happy", "sad", "angry", "excited"],
        "latency_ms": {"min": 80, "max": 200},
        "gpu_vram_gb": 0,
        "cpu_capable": True,
        "api_only": True,
        "streaming": True,
        "quality_mos": 4.7,
        "env_key": "CARTESIA_API_KEY",
        "best_for": ["english_realtime", "low_latency", "phone_agents"],
    },

    TTSEngine.SARVAM_TTS: {
        "model_id": "bulbul:v2",
        "api_base": "https://api.sarvam.ai/text-to-speech",
        "license": "Commercial API",
        "languages": ["ta", "hi", "te", "kn", "ml", "bn", "mr", "gu", "pa", "or", "en"],
        "emotions": ["neutral"],
        "latency_ms": {"min": 150, "max": 350},
        "gpu_vram_gb": 0,
        "cpu_capable": True,
        "api_only": True,
        "streaming": False,
        "quality_mos": 4.4,
        "env_key": "SARVAM_API_KEY",
        "best_for": ["indian_languages", "conversational_hindi", "south_indian", "tanglish"],
        "speakers": {
            "ta-IN": "anushka",
            "hi-IN": "abhilash",
            "te-IN": "arya",
            "kn-IN": "priya",
            "ml-IN": "manisha",
            "bn-IN": "neha",
            "mr-IN": "kavya",
            "gu-IN": "ritu",
            "en-IN": "vidya",
        },
    },

    TTSEngine.INDIC_PARLER: {
        "model_id": "ai4bharat/indic-parler-tts",
        "huggingface_link": "ai4bharat/indic-parler-tts",
        "license": "Open Source",
        "languages": [
            "ta", "hi", "te", "kn", "ml", "en", "bn", "mr", "gu", "pa",
            "or", "as", "bodo", "dogri", "kashmiri", "konkani", "maithili",
            "manipuri", "nepali", "sanskrit", "sindhi"
        ],
        "emotions": [
            "happy", "sad", "angry", "fear", "surprise", "disgust",
            "neutral", "command", "news", "narration", "conversation", "proper_noun"
        ],
        "latency_ms": {"min": 200, "max": 500},
        "gpu_vram_gb": 4,
        "cpu_capable": True,
        "streaming": True,
        "min_audio_seconds": 10,
        "clone_speed_seconds": 10,
        "quality_mos": 4.3,
        "best_for": ["emotions", "indian_languages", "podcasts", "audiobooks"]
    },

    TTSEngine.INDICF5: {
        "model_id": "ai4bharat/IndicF5",
        "huggingface_link": "ai4bharat/IndicF5",
        "license": "Open Source",
        "languages": ["ta", "hi", "te", "kn", "ml", "bn", "mr", "gu", "pa", "or", "as"],
        "emotions": ["prosody_based"],  # Uses reference audio prosody
        "latency_ms": {"min": 150, "max": 300},
        "gpu_vram_gb": 6,
        "cpu_capable": True,
        "streaming": True,
        "min_audio_seconds": 5,
        "clone_speed_seconds": 5,
        "quality_mos": 4.6,
        "best_for": ["highest_quality", "education", "e_learning", "research"]
    },

    TTSEngine.OPENVOICE_V2: {
        "model_id": "myshell-ai/OpenVoiceV2",
        "huggingface_link": "myshell-ai/OpenVoiceV2",
        "license": "MIT",
        "languages": ["any"],  # Zero-shot any language
        "emotions": ["happy", "sad", "neutral", "excited", "custom"],
        "latency_ms": {"min": 100, "max": 250},
        "gpu_vram_gb": 4,
        "cpu_capable": True,
        "cpu_performance": "excellent",
        "streaming": True,
        "min_audio_seconds": 10,
        "clone_speed_seconds": 10,
        "quality_mos": 4.2,
        "best_for": ["real_time", "voice_agents", "commercial", "multilingual"]
    },

    TTSEngine.XTTS_V2: {
        "model_id": "coqui/XTTS-v2",
        "huggingface_link": "coqui/XTTS-v2",
        "license": "Coqui Public License",
        "languages": [
            "en", "es", "fr", "de", "it", "pt", "pl", "tr", "ru",
            "nl", "cs", "ar", "zh", "ja", "hu", "ko", "hi"
        ],
        "emotions": ["style_transfer"],  # Transfers emotion from reference
        "latency_ms": {"min": 150, "max": 400},
        "gpu_vram_gb": 6,
        "cpu_capable": False,
        "streaming": True,
        "min_audio_seconds": 6,
        "clone_speed_seconds": 6,
        "quality_mos": 4.3,
        "best_for": ["production", "customer_service", "cross_lingual"]
    },

    TTSEngine.SVARA: {
        "model_id": "canopy-ai/svara-tts",
        "huggingface_link": "community-release",
        "license": "Open Source",
        "languages": [
            "ta", "hi", "te", "kn", "ml", "en", "bn", "mr", "gu", "pa",
            "or", "as", "bodo", "nepali"
        ],
        "emotions": ["happy", "sad", "angry", "fear", "clear"],
        "latency_ms": {"min": 200, "max": 500},
        "gpu_vram_gb": 4,
        "cpu_capable": True,
        "streaming": True,
        "min_audio_seconds": 10,
        "clone_speed_seconds": 8,
        "quality_mos": 4.4,
        "model_sizes": ["150M", "400M", "1B", "3B"],
        "best_for": ["meditation", "wellness", "natural_rhythm", "edge_devices"]
    },

    TTSEngine.AI4B_FASTPITCH: {
        "model_id": "ai4bharat/indic-tts-coqui-dravidian-gpu--t4",
        "huggingface_link": "ai4bharat/indic-tts-coqui-dravidian-gpu--t4",
        "license": "Open Source (MIT / CC-BY-4.0)",
        "languages": [
            "ta", "te", "kn", "ml", "hi", "mr", "bn", "gu", "pa", "or", "as", "en", "sa"
        ],
        "emotions": ["neutral"],
        "latency_ms": {"min": 80, "max": 200},
        "gpu_vram_gb": 2,
        "cpu_capable": True,
        "streaming": True,
        "min_audio_seconds": 0,
        "clone_speed_seconds": 0,
        "quality_mos": 4.2,
        "architecture": "FastPitch + HiFiGAN V1",
        "api_fallback": "bhashini_dhruva",
        "best_for": ["telephony", "ivr", "low_latency", "api_free"]
    },

    TTSEngine.BHASHINI: {
        "model_id": "ai4bharat/indic-tts-coqui-dravidian-gpu--t4",
        "huggingface_link": "bhashini.gov.in/ulca",
        "license": "Government of India — Free for Indian entities",
        "languages": [
            "ta", "te", "kn", "ml", "hi", "mr", "bn", "gu", "pa", "or", "as",
            "en", "sa", "bodo", "dogri", "kashmiri", "konkani", "maithili",
            "manipuri", "nepali", "sindhi"
        ],
        "emotions": ["neutral"],
        "latency_ms": {"min": 100, "max": 300},
        "gpu_vram_gb": 0,
        "cpu_capable": True,
        "streaming": True,
        "min_audio_seconds": 0,
        "clone_speed_seconds": 0,
        "quality_mos": 4.1,
        "voices_per_language": {"male": 1, "female": 1},
        "requires_keys": ["BHASHINI_USER_ID", "BHASHINI_API_KEY"],
        "register_url": "https://bhashini.gov.in/ulca/user/register",
        "best_for": ["22plus_languages", "government_compliance", "zero_cost", "telephony"]
    },
}


# =============================================================================
# EMOTION TO TTS MAPPING
# =============================================================================

# Map detected customer emotion to appropriate AI response emotion
EMOTION_RESPONSE_MAPPING = {
    # Customer emotion → AI response config.
    # ElevenLabs/Cartesia are used for English agents; Sarvam TTS for Indian.
    # stability: ElevenLabs/Cartesia voice stability (0=expressive, 1=flat)
    # style: ElevenLabs style exaggeration (0=neutral, 1=max style)
    "angry": {
        "response_emotion": "empathetic",
        "engine": TTSEngine.ELEVENLABS,       # warmest, most human-sounding
        "tts_emotion": "empathetic",
        "pace": "slow",                        # slower = calmer, de-escalates
        "pitch": "low",
        "energy": "calm",
        "stability": 0.82,                     # more stable = more controlled
        "style": 0.05,                         # minimal style = professional calm
    },
    "frustrated": {
        "response_emotion": "empathetic",
        "engine": TTSEngine.ELEVENLABS,
        "tts_emotion": "empathetic",
        "pace": "slow",
        "pitch": "medium",
        "energy": "calm",
        "stability": 0.78,
        "style": 0.08,
    },
    "happy": {
        "response_emotion": "matching",
        "engine": TTSEngine.ELEVENLABS,
        "tts_emotion": "happy",
        "pace": "normal",
        "pitch": "high",
        "energy": "high",
        "stability": 0.58,
        "style": 0.28,
    },
    "excited": {
        "response_emotion": "enthusiastic",
        "engine": TTSEngine.ELEVENLABS,
        "tts_emotion": "excited",
        "pace": "fast",
        "pitch": "high",
        "energy": "high",
        "stability": 0.52,
        "style": 0.35,
    },
    "sad": {
        "response_emotion": "supportive",
        "engine": TTSEngine.ELEVENLABS,
        "tts_emotion": "sad",
        "pace": "slow",
        "pitch": "medium",
        "energy": "gentle",
        "stability": 0.80,
        "style": 0.06,
    },
    "confused": {
        "response_emotion": "clear",
        "engine": TTSEngine.CARTESIA,         # Cartesia: clearest articulation
        "tts_emotion": "neutral",
        "pace": "slow",
        "pitch": "medium",
        "energy": "clear",
        "stability": 0.75,
        "style": 0.10,
    },
    "neutral": {
        "response_emotion": "professional",
        "engine": TTSEngine.ELEVENLABS,
        "tts_emotion": "neutral",
        "pace": "normal",
        "pitch": "medium",
        "energy": "normal",
        "stability": 0.65,
        "style": 0.15,
    },
    "interested": {
        "response_emotion": "engaging",
        "engine": TTSEngine.ELEVENLABS,
        "tts_emotion": "happy",
        "pace": "normal",
        "pitch": "medium-high",
        "energy": "engaging",
        "stability": 0.60,
        "style": 0.22,
    },
    "fear": {
        "response_emotion": "reassuring",
        "engine": TTSEngine.ELEVENLABS,
        "tts_emotion": "empathetic",
        "pace": "slow",
        "pitch": "low",
        "energy": "soothing",
        "stability": 0.85,
        "style": 0.04,
    },
}


# =============================================================================
# USE CASE ENGINE SELECTION
# =============================================================================

USE_CASE_ENGINE_MAPPING = {
    "sales_bot": {
        "primary": TTSEngine.ELEVENLABS,
        "fallback": TTSEngine.SARVAM_TTS,
        "default_emotion": "happy",
        "reason": "ElevenLabs: most engaging, warm voice for sales conversion",
    },
    "support_bot": {
        "primary": TTSEngine.ELEVENLABS,
        "fallback": TTSEngine.SARVAM_TTS,
        "default_emotion": "empathetic",
        "reason": "ElevenLabs: human empathy expression, best for support trust",
    },
    "lead_qualifier": {
        "primary": TTSEngine.CARTESIA,
        "fallback": TTSEngine.ELEVENLABS,
        "default_emotion": "neutral",
        "reason": "Cartesia: 80ms TTFA — fast qualification, professional tone",
    },
    "survey_caller": {
        "primary": TTSEngine.CARTESIA,
        "fallback": TTSEngine.SARVAM_TTS,
        "default_emotion": "neutral",
        "reason": "Cartesia: fast, clear, neutral — ideal for data collection",
    },
    "appointment_setter": {
        "primary": TTSEngine.ELEVENLABS,
        "fallback": TTSEngine.CARTESIA,
        "default_emotion": "neutral",
        "reason": "ElevenLabs: trustworthy voice for confirmed bookings",
    },
    "ivr_voice": {
        "primary": TTSEngine.CARTESIA,
        "fallback": TTSEngine.AI4B_FASTPITCH,
        "default_emotion": "neutral",
        "reason": "Cartesia: 80ms TTFA — best for IVR real-time response",
    },
    "real_time_agent": {
        "primary": TTSEngine.CARTESIA,
        "fallback": TTSEngine.ELEVENLABS,
        "default_emotion": "neutral",
        "reason": "Cartesia Sonic-2: lowest latency (80ms) for real-time phone",
    },
    "indic_telephony": {
        "primary": TTSEngine.SARVAM_TTS,
        "fallback": TTSEngine.BHASHINI,
        "default_emotion": "neutral",
        "reason": "Sarvam TTS: best Indian language quality API, 10 languages",
    },
    "indic_sales": {
        "primary": TTSEngine.SARVAM_TTS,
        "fallback": TTSEngine.INDIC_PARLER,
        "default_emotion": "neutral",
        "reason": "Sarvam TTS: natural Indian language voice for sales context",
    },
    "audiobook": {
        "primary": TTSEngine.ELEVENLABS,
        "fallback": TTSEngine.INDIC_PARLER,
        "default_emotion": "narration",
        "reason": "ElevenLabs: best emotional range and naturalness for narration",
    },
    "meditation": {
        "primary": TTSEngine.SVARA,
        "fallback": TTSEngine.ELEVENLABS,
        "default_emotion": "calm",
        "reason": "Svara: natural rhythm, calming prosody designed for wellness",
    },
    "news_broadcast": {
        "primary": TTSEngine.ELEVENLABS,
        "fallback": TTSEngine.INDIC_PARLER,
        "default_emotion": "news",
        "reason": "ElevenLabs: clear professional diction, broadcast quality",
    },
}


# =============================================================================
# LANGUAGE QUALITY MATRIX
# =============================================================================

LANGUAGE_ENGINE_QUALITY = {
    # Language: {engine: quality_score (1-5)}
    # ElevenLabs/Cartesia are now top tier for English.
    # Sarvam TTS is primary for Indian languages (API, no GPU, MOS 4.4).
    "en": {  # English — ElevenLabs primary, Cartesia for real-time
        TTSEngine.ELEVENLABS:     6,   # MOS 4.8 — best overall
        TTSEngine.CARTESIA:       5,   # MOS 4.7 — best latency
        TTSEngine.SARVAM_TTS:     4,   # MOS 4.4 — Indian-accented English
        TTSEngine.INDIC_PARLER:   4,
        TTSEngine.XTTS_V2:        4,
        TTSEngine.OPENVOICE_V2:   4,
        TTSEngine.AI4B_FASTPITCH: 3,
        TTSEngine.BHASHINI:       3,
        TTSEngine.INDICF5:        3,
    },
    "ta": {  # Tamil — Sarvam TTS primary (API), IndicF5 for self-hosted
        TTSEngine.SARVAM_TTS:     6,   # MOS 4.4 — API, no GPU, best for real-time
        TTSEngine.INDICF5:        5,   # MOS 4.6 — self-hosted, best quality
        TTSEngine.INDIC_PARLER:   5,   # MOS 4.3 — 12 emotions
        TTSEngine.SVARA:          4,
        TTSEngine.AI4B_FASTPITCH: 4,
        TTSEngine.BHASHINI:       4,
        TTSEngine.OPENVOICE_V2:   3,
        TTSEngine.XTTS_V2:        2,
    },
    "hi": {  # Hindi — Sarvam TTS primary
        TTSEngine.SARVAM_TTS:     6,
        TTSEngine.INDICF5:        5,
        TTSEngine.INDIC_PARLER:   5,
        TTSEngine.SVARA:          5,
        TTSEngine.XTTS_V2:        4,
        TTSEngine.AI4B_FASTPITCH: 4,
        TTSEngine.BHASHINI:       4,
        TTSEngine.OPENVOICE_V2:   4,
    },
    "te": {  # Telugu
        TTSEngine.SARVAM_TTS:     6,
        TTSEngine.INDICF5:        5,
        TTSEngine.INDIC_PARLER:   5,
        TTSEngine.SVARA:          4,
        TTSEngine.AI4B_FASTPITCH: 4,
        TTSEngine.BHASHINI:       4,
        TTSEngine.OPENVOICE_V2:   3,
        TTSEngine.XTTS_V2:        2,
    },
    "kn": {  # Kannada
        TTSEngine.SARVAM_TTS:     6,
        TTSEngine.INDICF5:        5,
        TTSEngine.INDIC_PARLER:   5,
        TTSEngine.SVARA:          4,
        TTSEngine.AI4B_FASTPITCH: 4,
        TTSEngine.BHASHINI:       4,
        TTSEngine.OPENVOICE_V2:   3,
        TTSEngine.XTTS_V2:        2,
    },
    "ml": {  # Malayalam
        TTSEngine.SARVAM_TTS:     6,
        TTSEngine.INDICF5:        5,
        TTSEngine.INDIC_PARLER:   5,
        TTSEngine.SVARA:          4,
        TTSEngine.AI4B_FASTPITCH: 4,
        TTSEngine.BHASHINI:       4,
        TTSEngine.OPENVOICE_V2:   3,
        TTSEngine.XTTS_V2:        2,
    },
    # Other Indian languages — Sarvam TTS primary where supported
    "bn": {
        TTSEngine.SARVAM_TTS: 6, TTSEngine.INDICF5: 5, TTSEngine.INDIC_PARLER: 5,
        TTSEngine.AI4B_FASTPITCH: 4, TTSEngine.BHASHINI: 4,
    },
    "mr": {
        TTSEngine.SARVAM_TTS: 6, TTSEngine.INDICF5: 5, TTSEngine.INDIC_PARLER: 5,
        TTSEngine.AI4B_FASTPITCH: 4, TTSEngine.BHASHINI: 4,
    },
    "gu": {
        TTSEngine.SARVAM_TTS: 6, TTSEngine.INDICF5: 5, TTSEngine.INDIC_PARLER: 5,
        TTSEngine.AI4B_FASTPITCH: 4, TTSEngine.BHASHINI: 4,
    },
    "pa": {
        TTSEngine.SARVAM_TTS: 6, TTSEngine.INDICF5: 5, TTSEngine.INDIC_PARLER: 5,
        TTSEngine.AI4B_FASTPITCH: 4, TTSEngine.BHASHINI: 4,
    },
    "or": {
        TTSEngine.SARVAM_TTS: 6, TTSEngine.INDICF5: 5, TTSEngine.INDIC_PARLER: 5,
        TTSEngine.AI4B_FASTPITCH: 4, TTSEngine.BHASHINI: 4,
    },
    "as": {
        TTSEngine.INDICF5: 5, TTSEngine.INDIC_PARLER: 5,
        TTSEngine.AI4B_FASTPITCH: 4, TTSEngine.BHASHINI: 4,
    },
    # 22nd-language — Bhashini only
    "bodo":     {TTSEngine.BHASHINI: 4},
    "dogri":    {TTSEngine.BHASHINI: 4},
    "kashmiri": {TTSEngine.BHASHINI: 4},
    "konkani":  {TTSEngine.BHASHINI: 4},
    "maithili": {TTSEngine.BHASHINI: 4},
    "manipuri": {TTSEngine.BHASHINI: 4},
    "nepali":   {TTSEngine.BHASHINI: 4, TTSEngine.SVARA: 4},
    "sindhi":   {TTSEngine.BHASHINI: 4},
    "sa":       {TTSEngine.BHASHINI: 4, TTSEngine.AI4B_FASTPITCH: 3},
}


# =============================================================================
# TAMIL DIALECT VOICES
# =============================================================================

TAMIL_DIALECT_CONFIG = {
    TamilDialect.CHENNAI: {
        "description": "Chennai/North Tamil Nadu accent",
        "characteristics": "Urban, slightly faster pace, modern vocabulary",
        "pitch_modifier": 1.0,
        "pace_modifier": 1.05,
        "sample_phrases": ["வணக்கம்", "என்ன விஷயம்?"]
    },
    TamilDialect.KONGU: {
        "description": "Western Tamil Nadu (Coimbatore, Erode) accent",
        "characteristics": "Distinctive intonation, unique vocabulary",
        "pitch_modifier": 0.95,
        "pace_modifier": 1.0,
        "sample_phrases": ["வாங்க", "என்னாச்சு?"]
    },
    TamilDialect.MADURAI: {
        "description": "Madurai/Central Tamil Nadu accent",
        "characteristics": "Traditional, expressive, slightly slower",
        "pitch_modifier": 1.05,
        "pace_modifier": 0.95,
        "sample_phrases": ["வாங்கோ", "சொல்லுங்க"]
    },
    TamilDialect.TIRUNELVELI: {
        "description": "Southern Tamil Nadu accent",
        "characteristics": "Unique rhythm, distinct pronunciation",
        "pitch_modifier": 1.0,
        "pace_modifier": 0.9,
        "sample_phrases": ["வாருங்கோ", "என்னங்க?"]
    },
    TamilDialect.STANDARD: {
        "description": "Standard/Literary Tamil",
        "characteristics": "Neutral, broadcast-style",
        "pitch_modifier": 1.0,
        "pace_modifier": 1.0,
        "sample_phrases": ["வணக்கம்", "நலமா?"]
    }
}


# =============================================================================
# PYDANTIC MODELS
# =============================================================================

class VoiceConfig(BaseModel):
    """Configuration for a custom voice"""
    voice_id: str
    name: str
    language: Language
    dialect: TamilDialect | None = None
    engine: TTSEngine
    reference_audio_path: str | None = None
    clone_audio_duration: float | None = None
    created_at: str | None = None


class TTSRequest(BaseModel):
    """Request for TTS generation"""
    text: str
    language: Language = Language.TAMIL
    dialect: TamilDialect | None = None
    emotion: EmotionType | None = EmotionType.NEUTRAL
    engine: TTSEngine | None = None
    voice_id: str | None = None
    use_case: str | None = None
    detected_customer_emotion: str | None = None
    pace: float | None = 1.0  # 0.5 to 2.0
    pitch: float | None = 1.0  # 0.5 to 2.0
    energy: str | None = "normal"
    streaming: bool = False
    output_format: str = "wav"  # wav, mp3
    sample_rate: int = 22050


class TTSResponse(BaseModel):
    """Response from TTS generation"""
    audio_url: str | None = None
    audio_base64: str | None = None
    duration_seconds: float
    engine_used: TTSEngine
    emotion_used: str
    latency_ms: float
    sample_rate: int
    format: str


class VoiceCloneRequest(BaseModel):
    """Request to clone a voice"""
    name: str
    language: Language
    dialect: TamilDialect | None = None
    reference_audio_base64: str | None = None
    reference_audio_url: str | None = None
    engine: TTSEngine = TTSEngine.OPENVOICE_V2


class VoiceCloneResponse(BaseModel):
    """Response from voice cloning"""
    voice_id: str
    name: str
    status: str  # processing, ready, failed
    engine: TTSEngine
    estimated_ready_seconds: int | None = None
