"""
VoiceFlow Marketing AI - Core Voice Engine
============================================
Combines BharatVoice AI + ZenVoice capabilities:
- Multi-dialect ASR (Tamil: Kongu, Chennai, Madurai, Tirunelveli)
- Emotion Detection (6 classes)
- Gen Z Slang Understanding
- Code-mixing support (Tamil-English, Hindi-English)
- Marketing Intent Classification
"""

import re
from dataclasses import dataclass
from enum import Enum
from typing import Any

import librosa
import numpy as np
import torch
import whisper
from transformers import pipeline


class Dialect(Enum):
    """Supported Tamil Dialects"""
    KONGU = "kongu"
    CHENNAI = "chennai"
    MADURAI = "madurai"
    TIRUNELVELI = "tirunelveli"
    HINDI_STANDARD = "hindi_standard"
    HINDI_BHOJPURI = "hindi_bhojpuri"
    UNKNOWN = "unknown"


class Emotion(Enum):
    """Emotion Categories"""
    HAPPY = "happy"
    SAD = "sad"
    ANGRY = "angry"
    FRUSTRATED = "frustrated"
    NEUTRAL = "neutral"
    EXCITED = "excited"


class MarketingIntent(Enum):
    """Marketing-specific intent classification"""
    PURCHASE = "purchase"
    INQUIRY = "inquiry"
    COMPLAINT = "complaint"
    SUPPORT = "support"
    FEEDBACK = "feedback"
    CANCEL = "cancel"
    UPSELL_OPPORTUNITY = "upsell_opportunity"
    CHURN_RISK = "churn_risk"


@dataclass
class VoiceAnalysisResult:
    """Complete voice analysis result"""
    # Transcription
    transcription: str
    language: str
    dialect: Dialect
    confidence: float

    # Emotion
    emotion: Emotion
    emotion_confidence: float
    emotion_scores: dict[str, float]

    # Gen Z & Slang
    gen_z_score: float
    slang_detected: list[dict[str, str]]
    code_mixing: dict[str, Any]

    # Marketing Intelligence
    intent: MarketingIntent
    intent_confidence: float
    lead_score: float
    sentiment: float  # -1 to 1

    # Keywords & Entities
    keywords: list[str]
    entities: dict[str, list[str]]

    # Metadata
    processing_time_ms: float
    audio_duration_s: float


class GenZSlangDetector:
    """
    Detects and translates Gen Z slang across Indian languages
    """

    SLANG_DATABASE = {
        # Universal Gen Z
        "lit": {"meaning": "amazing/exciting", "emotion": "excited", "gen_z_score": 0.9},
        "fire": {"meaning": "excellent", "emotion": "happy", "gen_z_score": 0.85},
        "cap": {"meaning": "lie", "emotion": "neutral", "gen_z_score": 0.9},
        "no cap": {"meaning": "no lie/truth", "emotion": "neutral", "gen_z_score": 0.95},
        "lowkey": {"meaning": "secretly/somewhat", "emotion": "neutral", "gen_z_score": 0.8},
        "highkey": {"meaning": "openly/very much", "emotion": "neutral", "gen_z_score": 0.8},
        "slay": {"meaning": "did great", "emotion": "happy", "gen_z_score": 0.9},
        "bussin": {"meaning": "really good", "emotion": "excited", "gen_z_score": 0.95},
        "bet": {"meaning": "okay/agreed", "emotion": "neutral", "gen_z_score": 0.85},
        "vibe": {"meaning": "feeling/mood", "emotion": "neutral", "gen_z_score": 0.7},
        "vibe check": {"meaning": "mood assessment", "emotion": "neutral", "gen_z_score": 0.9},
        "cringe": {"meaning": "embarrassing", "emotion": "frustrated", "gen_z_score": 0.85},
        "sus": {"meaning": "suspicious", "emotion": "neutral", "gen_z_score": 0.9},
        "salty": {"meaning": "bitter/upset", "emotion": "angry", "gen_z_score": 0.8},
        "flex": {"meaning": "show off", "emotion": "excited", "gen_z_score": 0.75},
        "goat": {"meaning": "greatest of all time", "emotion": "happy", "gen_z_score": 0.85},
        "periodt": {"meaning": "end of discussion", "emotion": "neutral", "gen_z_score": 0.9},
        "fr fr": {"meaning": "for real for real", "emotion": "neutral", "gen_z_score": 0.95},
        "ong": {"meaning": "on god/seriously", "emotion": "neutral", "gen_z_score": 0.9},
        "rizz": {"meaning": "charm/charisma", "emotion": "happy", "gen_z_score": 0.95},
        "simp": {"meaning": "overly devoted", "emotion": "neutral", "gen_z_score": 0.85},
        "ghosting": {"meaning": "ignoring someone", "emotion": "sad", "gen_z_score": 0.8},
        "stan": {"meaning": "superfan", "emotion": "excited", "gen_z_score": 0.8},
        "hits different": {"meaning": "feels special", "emotion": "happy", "gen_z_score": 0.9},
        "main character": {"meaning": "protagonist energy", "emotion": "excited", "gen_z_score": 0.9},
        "understood the assignment": {"meaning": "did perfectly", "emotion": "happy", "gen_z_score": 0.9},
        "rent free": {"meaning": "constantly thinking about", "emotion": "neutral", "gen_z_score": 0.85},
        "ate that": {"meaning": "did great", "emotion": "happy", "gen_z_score": 0.9},
        "sending me": {"meaning": "making me laugh", "emotion": "happy", "gen_z_score": 0.85},

        # Hindi Gen Z
        "bhaukaal": {"meaning": "domination/power", "emotion": "excited", "gen_z_score": 0.85},
        "sahi hai": {"meaning": "it's good/okay", "emotion": "neutral", "gen_z_score": 0.6},
        "chill maar": {"meaning": "relax", "emotion": "neutral", "gen_z_score": 0.75},
        "solid": {"meaning": "great/strong", "emotion": "happy", "gen_z_score": 0.7},
        "scene hai": {"meaning": "there's something going on", "emotion": "neutral", "gen_z_score": 0.7},
        "timepass": {"meaning": "waste of time/casual", "emotion": "neutral", "gen_z_score": 0.6},
        "bindaas": {"meaning": "carefree", "emotion": "happy", "gen_z_score": 0.65},
        "jhol": {"meaning": "problem/issue", "emotion": "frustrated", "gen_z_score": 0.7},
        "pataka": {"meaning": "attractive person", "emotion": "excited", "gen_z_score": 0.75},

        # Tamil Gen Z
        "mass": {"meaning": "stylish/cool", "emotion": "excited", "gen_z_score": 0.8},
        "vera level": {"meaning": "next level", "emotion": "excited", "gen_z_score": 0.85},
        "semma": {"meaning": "super/awesome", "emotion": "happy", "gen_z_score": 0.75},
        "mokka": {"meaning": "boring/lame joke", "emotion": "frustrated", "gen_z_score": 0.7},
        "thara local": {"meaning": "super local/authentic", "emotion": "happy", "gen_z_score": 0.8},
        "adichu pudungura": {"meaning": "killing it", "emotion": "excited", "gen_z_score": 0.85},
        "vaangala": {"meaning": "didn't get it", "emotion": "neutral", "gen_z_score": 0.7},
        "too much": {"meaning": "over the top", "emotion": "frustrated", "gen_z_score": 0.65},
    }

    def detect(self, text: str) -> tuple[list[dict], float]:
        """
        Detect slang in text and return matches with Gen Z score
        """
        text_lower = text.lower()
        detected = []

        for slang, info in self.SLANG_DATABASE.items():
            if slang in text_lower:
                detected.append({
                    "word": slang,
                    "meaning": info["meaning"],
                    "emotion_hint": info["emotion"],
                    "gen_z_score": info["gen_z_score"]
                })

        # Calculate overall Gen Z score
        if detected:
            avg_score = sum(d["gen_z_score"] for d in detected) / len(detected)
            # Boost score based on number of slang words
            gen_z_score = min(1.0, avg_score * (1 + len(detected) * 0.1))
        else:
            gen_z_score = 0.0

        return detected, gen_z_score


class DialectDetector:
    """
    Detects Tamil and Hindi dialects from text patterns
    """

    DIALECT_MARKERS = {
        Dialect.KONGU: {
            "patterns": ["le", "la", "ppa", "ma", "nnu", "nga", "kku"],
            "words": ["yenna", "paru", "poda", "vaa", "aathula"],
            "weight": 1.0
        },
        Dialect.CHENNAI: {
            "patterns": ["da", "di", "pa", "ma", "nu", "la"],
            "words": ["machan", "macha", "dei", "podaa", "illa"],
            "weight": 1.0
        },
        Dialect.MADURAI: {
            "patterns": ["le", "ya", "aana", "thaan", "ulla"],
            "words": ["enna", "seri", "poga", "vaanga", "sollu"],
            "weight": 1.0
        },
        Dialect.TIRUNELVELI: {
            "patterns": ["nga", "gal", "kum", "thaan"],
            "words": ["pogalaam", "vaangalaam", "sollunga"],
            "weight": 1.0
        },
        Dialect.HINDI_STANDARD: {
            "patterns": ["hai", "hain", "tha", "thi", "kar"],
            "words": ["kya", "acha", "theek", "haan", "nahi"],
            "weight": 1.0
        }
    }

    def detect(self, text: str) -> tuple[Dialect, float]:
        """
        Detect dialect from text
        """
        text_lower = text.lower()
        scores = {}

        for dialect, markers in self.DIALECT_MARKERS.items():
            score = 0
            for pattern in markers["patterns"]:
                if pattern in text_lower:
                    score += 1
            for word in markers["words"]:
                if word in text_lower:
                    score += 2
            scores[dialect] = score * markers["weight"]

        if max(scores.values()) > 0:
            best_dialect = max(scores, key=scores.get)
            confidence = scores[best_dialect] / (sum(scores.values()) + 1)
            return best_dialect, min(confidence, 1.0)

        return Dialect.UNKNOWN, 0.0


class CodeMixingAnalyzer:
    """
    Analyzes code-mixing patterns in multilingual text
    """

    # Common romanized Tamil words (Tanglish)
    TAMIL_ROMANIZED = {
        "machan", "machaan", "da", "di", "pa", "ma", "anna", "akka",
        "thala", "semma", "sema", "podu", "podra", "romba", "nalla",
        "sollu", "vaa", "vaanga", "panna", "pannu", "pannunga",
        "enna", "epdi", "enga", "yaar", "yen", "illa", "aama",
        "thaan", "thaanda", "maapla", "kanna", "dei", "otha",
        "paaru", "seri", "inniku", "naaliku", "vaada", "poda",
        "kozhi", "kozha", "sapdu", "thanni", "kaasu", "kadai",
        "velai", "veetla", "veetu", "theriyum", "therila",
        "vanakkam", "nandri", "paravala", "super", "mass",
    }

    # Common romanized Hindi words (Hinglish)
    HINDI_ROMANIZED = {
        "yaar", "bhai", "dost", "accha", "theek", "kya",
        "kaise", "kab", "kahan", "kyun", "haan", "nahi",
        "bahut", "bohot", "achha", "bura", "chalo", "chal",
        "dekho", "dekh", "suno", "suniye", "bolo", "batao",
        "karo", "karna", "lena", "dena", "jana", "aana",
        "matlab", "pakka", "sach", "jhooth",
        "paisa", "kitna", "khareedna", "lelo", "abhi",
    }

    def analyze(self, text: str) -> dict[str, Any]:
        """
        Analyze code-mixing in text.
        Detects both native-script and romanized (Tanglish/Hinglish) mixing.
        """
        words = text.split()

        # Simple language detection per word
        english_pattern = re.compile(r'^[a-zA-Z]+$')
        tamil_pattern = re.compile(r'[\u0B80-\u0BFF]')
        hindi_pattern = re.compile(r'[\u0900-\u097F]')

        languages = {"english": 0, "tamil": 0, "hindi": 0, "mixed": 0}

        for word in words:
            word_lower = word.lower()
            if tamil_pattern.search(word):
                languages["tamil"] += 1
            elif hindi_pattern.search(word):
                languages["hindi"] += 1
            elif word_lower in self.TAMIL_ROMANIZED:
                languages["tamil"] += 1
            elif word_lower in self.HINDI_ROMANIZED:
                languages["hindi"] += 1
            elif english_pattern.match(word):
                languages["english"] += 1
            else:
                languages["mixed"] += 1

        total = len(words)
        if total == 0:
            return {"is_code_mixed": False, "languages": {}, "mixing_ratio": 0.0}

        # Calculate ratios
        ratios = {k: v / total for k, v in languages.items() if v > 0}

        # Determine if code-mixed
        non_zero_langs = sum(1 for v in languages.values() if v > 0)
        is_code_mixed = non_zero_langs > 1

        # Calculate mixing ratio (0 = single language, 1 = perfectly mixed)
        if non_zero_langs <= 1:
            mixing_ratio = 0.0
        else:
            max_ratio = max(ratios.values())
            mixing_ratio = 1 - max_ratio

        return {
            "is_code_mixed": is_code_mixed,
            "languages": ratios,
            "mixing_ratio": mixing_ratio,
            "dominant_language": max(ratios, key=ratios.get) if ratios else None
        }


class MarketingIntentClassifier:
    """
    Classifies marketing intent from voice transcription
    """

    INTENT_KEYWORDS = {
        MarketingIntent.PURCHASE: [
            "buy", "purchase", "order", "want", "khareedna", "lena",
            "vaanga", "edukkanum", "price", "cost", "kitna"
        ],
        MarketingIntent.INQUIRY: [
            "what", "how", "when", "where", "details", "information",
            "kya", "kaise", "kab", "enna", "epdi", "enga"
        ],
        MarketingIntent.COMPLAINT: [
            "problem", "issue", "not working", "broken", "defect",
            "complaint", "dikkat", "problem", "prachani", "velai agala"
        ],
        MarketingIntent.SUPPORT: [
            "help", "support", "assist", "guide", "madad", "help",
            "udavi", "support"
        ],
        MarketingIntent.FEEDBACK: [
            "feedback", "suggestion", "review", "opinion",
            "raay", "feedback", "karuthtu"
        ],
        MarketingIntent.CANCEL: [
            "cancel", "refund", "return", "stop", "unsubscribe",
            "cancel", "vapas", "return", "cancel pannu"
        ]
    }

    def classify(self, text: str, emotion: Emotion) -> tuple[MarketingIntent, float, float]:
        """
        Classify marketing intent and calculate lead score
        Returns: (intent, confidence, lead_score)
        """
        text_lower = text.lower()
        scores = {}

        for intent, keywords in self.INTENT_KEYWORDS.items():
            score = sum(1 for kw in keywords if kw in text_lower)
            scores[intent] = score

        # Determine intent
        if max(scores.values()) > 0:
            intent = max(scores, key=scores.get)
            confidence = min(scores[intent] / 3, 1.0)
        else:
            intent = MarketingIntent.INQUIRY
            confidence = 0.3

        # Calculate lead score (0-100)
        lead_score = self._calculate_lead_score(intent, emotion, confidence)

        # Check for churn risk
        if intent == MarketingIntent.CANCEL or emotion in [Emotion.ANGRY, Emotion.FRUSTRATED]:
            if confidence > 0.5:
                intent = MarketingIntent.CHURN_RISK

        # Check for upsell opportunity — only when inquiry (not direct purchase)
        # with positive emotion suggests existing customer exploring more
        if intent == MarketingIntent.INQUIRY and emotion in [Emotion.HAPPY, Emotion.EXCITED]:
            if scores.get(MarketingIntent.PURCHASE, 0) > 0 and confidence > 0.6:
                intent = MarketingIntent.UPSELL_OPPORTUNITY

        return intent, confidence, lead_score

    def _calculate_lead_score(self, intent: MarketingIntent, emotion: Emotion, confidence: float) -> float:
        """Calculate lead score based on intent and emotion"""
        base_scores = {
            MarketingIntent.PURCHASE: 90,
            MarketingIntent.UPSELL_OPPORTUNITY: 95,
            MarketingIntent.INQUIRY: 60,
            MarketingIntent.FEEDBACK: 50,
            MarketingIntent.SUPPORT: 40,
            MarketingIntent.COMPLAINT: 30,
            MarketingIntent.CANCEL: 10,
            MarketingIntent.CHURN_RISK: 5
        }

        emotion_modifiers = {
            Emotion.EXCITED: 1.2,
            Emotion.HAPPY: 1.1,
            Emotion.NEUTRAL: 1.0,
            Emotion.SAD: 0.9,
            Emotion.FRUSTRATED: 0.7,
            Emotion.ANGRY: 0.5
        }

        base = base_scores.get(intent, 50)
        modifier = emotion_modifiers.get(emotion, 1.0)

        return min(100, base * modifier * confidence)


class VoiceFlowEngine:
    """
    Main Voice AI Engine - combines all capabilities
    """

    def __init__(self, model_size: str = "base", device: str = None):
        """
        Initialize the engine
        
        Args:
            model_size: Whisper model size ("tiny", "base", "small", "medium")
            device: Device to use ("cuda", "cpu", or None for auto)
        """
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")

        # Initialize Whisper for ASR
        print(f"Loading Whisper {model_size} model...")
        self.whisper_model = whisper.load_model(model_size, device=self.device)

        # Initialize emotion classifier (optional - large model, may fail on low disk)
        self.emotion_classifier = None
        try:
            print("Loading emotion classifier...")
            self.emotion_classifier = pipeline(
                "audio-classification",
                model="ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition",
                device=0 if self.device == "cuda" else -1
            )
        except Exception as e:
            print(f"Emotion classifier unavailable (will use text-based fallback): {e}")

        # Initialize helper modules
        self.slang_detector = GenZSlangDetector()
        self.dialect_detector = DialectDetector()
        self.code_mixer = CodeMixingAnalyzer()
        self.intent_classifier = MarketingIntentClassifier()

        print("VoiceFlow Engine initialized!")

    def process_audio(
        self,
        audio_path: str = None,
        audio_array: np.ndarray = None,
        sample_rate: int = 16000,
        language: str = None
    ) -> VoiceAnalysisResult:
        """
        Process audio and return complete analysis
        
        Args:
            audio_path: Path to audio file
            audio_array: NumPy array of audio data
            sample_rate: Sample rate if using audio_array
            language: Force specific language (None for auto-detect)
        """
        import time
        start_time = time.time()

        # Load audio if path provided
        if audio_path:
            audio_array, sample_rate = librosa.load(audio_path, sr=16000)

        audio_duration = len(audio_array) / sample_rate

        # Step 1: Transcription with Whisper
        transcription_result = self.whisper_model.transcribe(
            audio_array,
            language=language,
            task="transcribe"
        )

        transcription = transcription_result["text"].strip()
        detected_language = transcription_result.get("language", "en")

        # Step 2: Emotion Detection
        emotion, emotion_confidence, emotion_scores = self._detect_emotion(audio_array)

        # Step 3: Dialect Detection
        dialect, dialect_confidence = self.dialect_detector.detect(transcription)

        # Step 4: Gen Z Slang Detection
        slang_detected, gen_z_score = self.slang_detector.detect(transcription)

        # Step 5: Code-mixing Analysis
        code_mixing = self.code_mixer.analyze(transcription)

        # Step 6: Marketing Intent Classification
        intent, intent_confidence, lead_score = self.intent_classifier.classify(
            transcription, emotion
        )

        # Step 7: Extract keywords and entities
        keywords = self._extract_keywords(transcription)
        entities = self._extract_entities(transcription)

        # Step 8: Calculate sentiment
        sentiment = self._calculate_sentiment(emotion, emotion_scores)

        processing_time = (time.time() - start_time) * 1000

        return VoiceAnalysisResult(
            transcription=transcription,
            language=detected_language,
            dialect=dialect,
            confidence=dialect_confidence,
            emotion=emotion,
            emotion_confidence=emotion_confidence,
            emotion_scores=emotion_scores,
            gen_z_score=gen_z_score,
            slang_detected=slang_detected,
            code_mixing=code_mixing,
            intent=intent,
            intent_confidence=intent_confidence,
            lead_score=lead_score,
            sentiment=sentiment,
            keywords=keywords,
            entities=entities,
            processing_time_ms=processing_time,
            audio_duration_s=audio_duration
        )

    def _detect_emotion(self, audio_array: np.ndarray) -> tuple[Emotion, float, dict]:
        """Detect emotion from audio (falls back to neutral if classifier unavailable)"""
        if self.emotion_classifier is None:
            return Emotion.NEUTRAL, 0.5, {"neutral": 0.5}

        try:
            # Save temp file for emotion classifier
            import tempfile

            import soundfile as sf

            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                sf.write(f.name, audio_array, 16000)
                results = self.emotion_classifier(f.name)

            # Map to our emotion enum
            emotion_map = {
                "happy": Emotion.HAPPY,
                "sad": Emotion.SAD,
                "angry": Emotion.ANGRY,
                "neutral": Emotion.NEUTRAL,
                "fearful": Emotion.FRUSTRATED,
                "disgust": Emotion.FRUSTRATED,
                "surprised": Emotion.EXCITED
            }

            scores = {r["label"]: r["score"] for r in results}
            top_emotion = results[0]["label"]

            return (
                emotion_map.get(top_emotion, Emotion.NEUTRAL),
                results[0]["score"],
                scores
            )
        except Exception as e:
            print(f"Emotion detection failed: {e}")
            return Emotion.NEUTRAL, 0.5, {"neutral": 0.5}

    def _extract_keywords(self, text: str) -> list[str]:
        """Extract keywords from transcription"""
        # Simple keyword extraction
        stop_words = {"the", "a", "an", "is", "are", "was", "were", "i", "you", "we", "they",
                      "it", "this", "that", "and", "or", "but", "in", "on", "at", "to", "for"}

        words = re.findall(r'\b\w+\b', text.lower())
        keywords = [w for w in words if w not in stop_words and len(w) > 2]

        # Return top 10 unique keywords
        seen = set()
        unique_keywords = []
        for kw in keywords:
            if kw not in seen:
                seen.add(kw)
                unique_keywords.append(kw)

        return unique_keywords[:10]

    def _extract_entities(self, text: str) -> dict[str, list[str]]:
        """Extract named entities"""
        entities = {
            "products": [],
            "numbers": [],
            "dates": []
        }

        # Extract numbers
        entities["numbers"] = re.findall(r'\b\d+(?:\.\d+)?\b', text)

        return entities

    def _calculate_sentiment(self, emotion: Emotion, scores: dict) -> float:
        """Calculate sentiment score from -1 to 1"""
        sentiment_weights = {
            Emotion.HAPPY: 0.8,
            Emotion.EXCITED: 1.0,
            Emotion.NEUTRAL: 0.0,
            Emotion.SAD: -0.5,
            Emotion.FRUSTRATED: -0.7,
            Emotion.ANGRY: -1.0
        }

        return sentiment_weights.get(emotion, 0.0)


# Convenience function for quick processing
def process_voice(audio_path: str, language: str = None) -> VoiceAnalysisResult:
    """
    Quick function to process a voice file
    """
    engine = VoiceFlowEngine(model_size="base")
    return engine.process_audio(audio_path=audio_path, language=language)


if __name__ == "__main__":
    # Test the engine
    print("VoiceFlow Marketing AI - Voice Engine Test")
    print("=" * 50)

    # Create engine
    engine = VoiceFlowEngine(model_size="tiny")

    # Test slang detection
    test_texts = [
        "Bro that product is totally lit fr fr, no cap it's bussin!",
        "Yaar ye product ekdum solid hai, vibe hi alag hai",
        "Machan semma product da, vera level quality",
        "I want to buy this product, what's the price?",
        "This is not working, I want a refund immediately!"
    ]

    print("\nSlang Detection Tests:")
    for text in test_texts:
        slang, score = engine.slang_detector.detect(text)
        dialect, _ = engine.dialect_detector.detect(text)
        code_mix = engine.code_mixer.analyze(text)
        intent, conf, lead = engine.intent_classifier.classify(text, Emotion.NEUTRAL)

        print(f"\nText: {text[:50]}...")
        print(f"  Gen Z Score: {score:.2f}")
        print(f"  Slang: {[s['word'] for s in slang]}")
        print(f"  Dialect: {dialect.value}")
        print(f"  Code-mixed: {code_mix['is_code_mixed']}")
        print(f"  Intent: {intent.value} (Lead Score: {lead:.0f})")
