"""
VoiceFlow TTS Configuration
Supports: Indic Parler-TTS, IndicF5, OpenVoice V2, XTTS-v2, Svara-TTS
"""

from enum import Enum
from typing import Dict, List, Optional
from pydantic import BaseModel

# =============================================================================
# ENUMS
# =============================================================================

class TTSEngine(str, Enum):
    INDIC_PARLER = "indic_parler"
    INDICF5 = "indicf5"
    OPENVOICE_V2 = "openvoice_v2"
    XTTS_V2 = "xtts_v2"
    SVARA = "svara"


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
    }
}


# =============================================================================
# EMOTION TO TTS MAPPING
# =============================================================================

# Map detected customer emotion to appropriate AI response emotion
EMOTION_RESPONSE_MAPPING = {
    # Customer emotion -> AI response config
    "angry": {
        "response_emotion": "calm",
        "engine": TTSEngine.INDIC_PARLER,
        "tts_emotion": "neutral",
        "pace": "slow",
        "pitch": "low",
        "energy": "calm"
    },
    "frustrated": {
        "response_emotion": "empathetic",
        "engine": TTSEngine.INDIC_PARLER,
        "tts_emotion": "neutral",
        "pace": "slow",
        "pitch": "medium",
        "energy": "calm"
    },
    "happy": {
        "response_emotion": "matching",
        "engine": TTSEngine.INDIC_PARLER,
        "tts_emotion": "happy",
        "pace": "energetic",
        "pitch": "high",
        "energy": "high"
    },
    "excited": {
        "response_emotion": "enthusiastic",
        "engine": TTSEngine.INDIC_PARLER,
        "tts_emotion": "happy",
        "pace": "fast",
        "pitch": "high",
        "energy": "high"
    },
    "sad": {
        "response_emotion": "supportive",
        "engine": TTSEngine.INDIC_PARLER,
        "tts_emotion": "neutral",
        "pace": "slow",
        "pitch": "medium",
        "energy": "gentle"
    },
    "confused": {
        "response_emotion": "clear",
        "engine": TTSEngine.INDICF5,  # Highest intelligibility
        "tts_emotion": "narration",
        "pace": "slow",
        "pitch": "medium",
        "energy": "clear"
    },
    "neutral": {
        "response_emotion": "professional",
        "engine": TTSEngine.INDICF5,
        "tts_emotion": "neutral",
        "pace": "normal",
        "pitch": "medium",
        "energy": "normal"
    },
    "interested": {
        "response_emotion": "engaging",
        "engine": TTSEngine.INDIC_PARLER,
        "tts_emotion": "conversation",
        "pace": "normal",
        "pitch": "medium-high",
        "energy": "engaging"
    },
    "fear": {
        "response_emotion": "reassuring",
        "engine": TTSEngine.INDIC_PARLER,
        "tts_emotion": "calm",
        "pace": "slow",
        "pitch": "low",
        "energy": "soothing"
    }
}


# =============================================================================
# USE CASE ENGINE SELECTION
# =============================================================================

USE_CASE_ENGINE_MAPPING = {
    "sales_bot": {
        "primary": TTSEngine.INDIC_PARLER,
        "fallback": TTSEngine.OPENVOICE_V2,
        "default_emotion": "conversation",
        "reason": "Conversation + Happy emotion modes for engaging sales"
    },
    "support_bot": {
        "primary": TTSEngine.XTTS_V2,
        "fallback": TTSEngine.INDIC_PARLER,
        "default_emotion": "neutral",
        "reason": "Production stable, emotion transfer for empathy"
    },
    "lead_qualifier": {
        "primary": TTSEngine.OPENVOICE_V2,
        "fallback": TTSEngine.INDICF5,
        "default_emotion": "professional",
        "reason": "Fast response, professional tone"
    },
    "survey_caller": {
        "primary": TTSEngine.INDICF5,
        "fallback": TTSEngine.INDIC_PARLER,
        "default_emotion": "neutral",
        "reason": "Neutral, clear narration"
    },
    "appointment_setter": {
        "primary": TTSEngine.INDIC_PARLER,
        "fallback": TTSEngine.OPENVOICE_V2,
        "default_emotion": "command",
        "reason": "Command mode for clear instructions"
    },
    "ivr_voice": {
        "primary": TTSEngine.INDICF5,
        "fallback": TTSEngine.INDIC_PARLER,
        "default_emotion": "news",
        "reason": "Highest intelligibility (4.7/5.0 MOS)"
    },
    "real_time_agent": {
        "primary": TTSEngine.OPENVOICE_V2,
        "fallback": TTSEngine.INDICF5,
        "default_emotion": "neutral",
        "reason": "Ultra-low latency (<150ms)"
    },
    "audiobook": {
        "primary": TTSEngine.INDIC_PARLER,
        "fallback": TTSEngine.SVARA,
        "default_emotion": "narration",
        "reason": "Rich emotional expression"
    },
    "meditation": {
        "primary": TTSEngine.SVARA,
        "fallback": TTSEngine.INDICF5,
        "default_emotion": "calm",
        "reason": "Natural rhythm, calming prosody"
    },
    "news_broadcast": {
        "primary": TTSEngine.INDIC_PARLER,
        "fallback": TTSEngine.INDICF5,
        "default_emotion": "news",
        "reason": "News emotion mode, clear diction"
    }
}


# =============================================================================
# LANGUAGE QUALITY MATRIX
# =============================================================================

LANGUAGE_ENGINE_QUALITY = {
    # Language: {engine: quality_score}
    "ta": {  # Tamil
        TTSEngine.INDICF5: 5,
        TTSEngine.INDIC_PARLER: 5,
        TTSEngine.SVARA: 5,
        TTSEngine.OPENVOICE_V2: 4,
        TTSEngine.XTTS_V2: 2  # Needs fine-tuning
    },
    "hi": {  # Hindi
        TTSEngine.INDICF5: 5,
        TTSEngine.INDIC_PARLER: 5,
        TTSEngine.SVARA: 5,
        TTSEngine.XTTS_V2: 5,
        TTSEngine.OPENVOICE_V2: 4
    },
    "te": {  # Telugu
        TTSEngine.INDICF5: 5,
        TTSEngine.INDIC_PARLER: 5,
        TTSEngine.SVARA: 5,
        TTSEngine.OPENVOICE_V2: 4,
        TTSEngine.XTTS_V2: 2
    },
    "kn": {  # Kannada
        TTSEngine.INDICF5: 5,
        TTSEngine.INDIC_PARLER: 5,
        TTSEngine.SVARA: 5,
        TTSEngine.OPENVOICE_V2: 4,
        TTSEngine.XTTS_V2: 2
    },
    "ml": {  # Malayalam
        TTSEngine.INDICF5: 5,
        TTSEngine.INDIC_PARLER: 5,
        TTSEngine.SVARA: 5,
        TTSEngine.OPENVOICE_V2: 4,
        TTSEngine.XTTS_V2: 2
    },
    "en": {  # English
        TTSEngine.XTTS_V2: 5,
        TTSEngine.OPENVOICE_V2: 5,
        TTSEngine.INDIC_PARLER: 4,  # Indian accent
        TTSEngine.INDICF5: 3,
        TTSEngine.SVARA: 4
    }
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
    dialect: Optional[TamilDialect] = None
    engine: TTSEngine
    reference_audio_path: Optional[str] = None
    clone_audio_duration: Optional[float] = None
    created_at: Optional[str] = None
    
    
class TTSRequest(BaseModel):
    """Request for TTS generation"""
    text: str
    language: Language = Language.TAMIL
    dialect: Optional[TamilDialect] = None
    emotion: Optional[EmotionType] = EmotionType.NEUTRAL
    engine: Optional[TTSEngine] = None
    voice_id: Optional[str] = None
    use_case: Optional[str] = None
    detected_customer_emotion: Optional[str] = None
    pace: Optional[float] = 1.0  # 0.5 to 2.0
    pitch: Optional[float] = 1.0  # 0.5 to 2.0
    energy: Optional[str] = "normal"
    streaming: bool = False
    output_format: str = "wav"  # wav, mp3
    sample_rate: int = 22050


class TTSResponse(BaseModel):
    """Response from TTS generation"""
    audio_url: Optional[str] = None
    audio_base64: Optional[str] = None
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
    dialect: Optional[TamilDialect] = None
    reference_audio_base64: Optional[str] = None
    reference_audio_url: Optional[str] = None
    engine: TTSEngine = TTSEngine.OPENVOICE_V2


class VoiceCloneResponse(BaseModel):
    """Response from voice cloning"""
    voice_id: str
    name: str
    status: str  # processing, ready, failed
    engine: TTSEngine
    estimated_ready_seconds: Optional[int] = None
