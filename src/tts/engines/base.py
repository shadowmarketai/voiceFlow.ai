"""
Base TTS Engine Interface
All TTS engines must implement this interface
"""

from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator
from typing import Any


class BaseTTSEngine(ABC):
    """Abstract base class for TTS engines"""

    def __init__(self, config: dict[str, Any]):
        self.config = config
        self.model = None
        self.is_loaded = False

    @abstractmethod
    async def load_model(self) -> bool:
        """Load the TTS model into memory"""
        pass

    @abstractmethod
    async def unload_model(self) -> bool:
        """Unload the model from memory"""
        pass

    @abstractmethod
    async def synthesize(
        self,
        text: str,
        language: str,
        emotion: str | None = None,
        voice_id: str | None = None,
        pace: float = 1.0,
        pitch: float = 1.0,
        **kwargs
    ) -> bytes:
        """Generate audio from text"""
        pass

    @abstractmethod
    async def synthesize_stream(
        self,
        text: str,
        language: str,
        emotion: str | None = None,
        voice_id: str | None = None,
        pace: float = 1.0,
        pitch: float = 1.0,
        **kwargs
    ) -> AsyncGenerator[bytes, None]:
        """Generate audio stream from text"""
        pass

    @abstractmethod
    async def clone_voice(
        self,
        reference_audio: bytes,
        voice_name: str,
        language: str
    ) -> str:
        """Clone a voice from reference audio, returns voice_id"""
        pass

    @abstractmethod
    def get_supported_languages(self) -> list:
        """Get list of supported languages"""
        pass

    @abstractmethod
    def get_supported_emotions(self) -> list:
        """Get list of supported emotions"""
        pass

    @property
    @abstractmethod
    def engine_name(self) -> str:
        """Return the engine name"""
        pass

    @property
    def latency_range(self) -> dict[str, int]:
        """Return expected latency range in ms"""
        return self.config.get("latency_ms", {"min": 200, "max": 500})

    @property
    def requires_gpu(self) -> bool:
        """Check if engine requires GPU"""
        return not self.config.get("cpu_capable", False)
