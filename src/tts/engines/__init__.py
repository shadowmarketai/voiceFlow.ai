# TTS Engines
from tts.engines.base import BaseTTSEngine
from tts.engines.indic_parler import IndicParlerTTSEngine
from tts.engines.indicf5 import IndicF5Engine
from tts.engines.openvoice import OpenVoiceV2Engine
from tts.engines.svara import SvaraTTSEngine
from tts.engines.xtts import XTTSv2Engine

__all__ = [
    "BaseTTSEngine",
    "IndicParlerTTSEngine",
    "OpenVoiceV2Engine",
    "XTTSv2Engine",
    "IndicF5Engine",
    "SvaraTTSEngine",
]
