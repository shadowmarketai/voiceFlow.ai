"""
VoiceFlow Marketing AI - AI Assistant Management
=================================================
Create and manage AI voice assistants like ZenVoice

Features:
- Assistant creation with custom personalities
- Multi-language support (Tamil, Hindi, English)
- LLM provider selection (Claude, GPT, Groq)
- Voice customization
- Knowledge base integration
- Call handling configuration
"""

from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum
import os
import json
import secrets


class LLMProvider(Enum):
    """Supported LLM providers"""
    ANTHROPIC = "anthropic"        # Claude - Best quality
    OPENAI = "openai"              # GPT-4
    GROQ = "groq"                  # Fast & cheap
    CUSTOM = "custom"              # Custom endpoint


class VoiceProvider(Enum):
    """Text-to-Speech providers"""
    VOICEFLOW_NATIVE = "voiceflow_native"  # Built-in Indic Parler + OpenVoice (no API key needed)
    ELEVENLABS = "elevenlabs"              # Best quality (API key required)
    PLAYHT = "playht"                      # Good alternative
    AZURE = "azure"                        # Microsoft
    GOOGLE = "google"                      # Google Cloud TTS
    DEEPGRAM = "deepgram"                  # Fast


class STTProvider(Enum):
    """Speech-to-Text providers"""
    DEEPGRAM = "deepgram"          # Best for real-time
    WHISPER = "whisper"            # OpenAI
    GOOGLE = "google"              # Google Cloud
    AZURE = "azure"                # Microsoft


class AssistantLanguage(Enum):
    """Supported languages"""
    ENGLISH = "en"
    HINDI = "hi"
    TAMIL = "ta"
    TELUGU = "te"
    KANNADA = "kn"
    MALAYALAM = "ml"
    MARATHI = "mr"
    BENGALI = "bn"
    GUJARATI = "gu"
    ARABIC = "ar"


@dataclass
class VoiceSettings:
    """Voice configuration"""
    provider: VoiceProvider = VoiceProvider.VOICEFLOW_NATIVE  # Default: built-in TTS (no API key needed)
    voice_id: str = ""
    voice_name: str = "Rachel"
    
    # Voice parameters
    stability: float = 0.5
    similarity_boost: float = 0.75
    speed: float = 1.0
    pitch: float = 0.0
    
    # Language
    language: AssistantLanguage = AssistantLanguage.ENGLISH
    
    # Custom voice cloning
    custom_voice_url: Optional[str] = None


@dataclass
class LLMSettings:
    """LLM configuration"""
    provider: LLMProvider = LLMProvider.ANTHROPIC
    model: str = "claude-3-sonnet-20240229"
    
    # Parameters
    temperature: float = 0.7
    max_tokens: int = 500
    
    # System prompt
    system_prompt: str = ""
    
    # Custom endpoint (for self-hosted models)
    custom_endpoint: Optional[str] = None
    custom_api_key: Optional[str] = None


@dataclass
class CallSettings:
    """Call handling configuration"""
    # Greeting
    greeting_message: str = "Hello! How can I help you today?"
    greeting_delay_ms: int = 500
    
    # Silence handling
    silence_timeout_seconds: int = 5
    max_silence_count: int = 3
    silence_message: str = "Are you still there?"
    
    # Call duration
    max_call_duration_seconds: int = 600  # 10 minutes
    warning_before_end_seconds: int = 60
    
    # Transfer
    enable_transfer: bool = True
    transfer_number: Optional[str] = None
    transfer_keywords: List[str] = field(default_factory=lambda: ["speak to agent", "human", "transfer"])
    
    # Recording
    record_calls: bool = True
    
    # End call
    end_call_keywords: List[str] = field(default_factory=lambda: ["goodbye", "bye", "end call"])
    end_call_message: str = "Thank you for calling. Goodbye!"
    
    # Voicemail
    enable_voicemail: bool = True
    voicemail_after_rings: int = 5


@dataclass
class KnowledgeBase:
    """Knowledge base for assistant"""
    id: str
    name: str
    description: str
    
    # Content
    documents: List[Dict[str, str]] = field(default_factory=list)  # [{title, content}]
    urls: List[str] = field(default_factory=list)
    faqs: List[Dict[str, str]] = field(default_factory=list)  # [{question, answer}]
    
    # Embedding
    embedding_model: str = "text-embedding-3-small"
    vector_store: str = "pinecone"  # pinecone, weaviate, qdrant
    
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)


@dataclass
class Assistant:
    """AI Voice Assistant"""
    id: str
    tenant_id: str
    name: str
    description: str
    
    # Settings
    voice: VoiceSettings = field(default_factory=VoiceSettings)
    llm: LLMSettings = field(default_factory=LLMSettings)
    call: CallSettings = field(default_factory=CallSettings)
    
    # Knowledge base
    knowledge_base_id: Optional[str] = None
    
    # Phone number
    phone_number_id: Optional[str] = None
    
    # Personality
    personality: str = "professional"  # professional, friendly, formal, casual
    industry: str = "general"  # real_estate, healthcare, ecommerce, support
    
    # Templates
    prompt_template: str = ""
    
    # Status
    is_active: bool = True
    is_published: bool = False
    
    # Stats
    total_calls: int = 0
    avg_call_duration: float = 0
    successful_calls: int = 0
    
    # Timestamps
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)


class AssistantTemplates:
    """Pre-built assistant templates for different industries"""
    
    TEMPLATES = {
        "real_estate": {
            "name": "Real Estate Agent",
            "description": "AI assistant for real estate inquiries",
            "personality": "professional",
            "industry": "real_estate",
            "system_prompt": """You are a professional real estate assistant. You help with:
- Property inquiries and availability
- Scheduling property viewings
- Answering questions about neighborhoods
- Collecting lead information

Always be helpful, professional, and knowledgeable about real estate.
When you collect a lead, ask for: Name, Phone, Email, Property Interest, Budget Range.

Respond in a conversational manner suitable for phone calls.
Keep responses concise (under 50 words when possible).""",
            "greeting": "Hello! Thank you for calling. I'm your real estate assistant. How can I help you find your perfect property today?",
            "faqs": [
                {"question": "What are the available properties?", "answer": "We have a variety of properties including apartments, villas, and plots. What type of property are you looking for?"},
                {"question": "Can I schedule a viewing?", "answer": "Of course! I can help schedule a property viewing. What day and time works best for you?"},
            ]
        },
        "healthcare": {
            "name": "Healthcare Assistant",
            "description": "AI assistant for healthcare appointments",
            "personality": "friendly",
            "industry": "healthcare",
            "system_prompt": """You are a friendly healthcare assistant. You help with:
- Scheduling doctor appointments
- Answering general health inquiries
- Providing clinic information
- Collecting patient information

Be empathetic, professional, and reassuring.
Never provide medical diagnoses or treatment advice.
Always recommend consulting a doctor for medical concerns.

Keep responses concise for phone conversations.""",
            "greeting": "Hello! Welcome to the healthcare line. I'm here to assist you with appointments and general inquiries. How can I help you today?",
            "faqs": [
                {"question": "How do I book an appointment?", "answer": "I can help you book an appointment. Which department would you like to visit, and what dates work for you?"},
            ]
        },
        "ecommerce": {
            "name": "E-commerce Support",
            "description": "AI assistant for e-commerce customer support",
            "personality": "friendly",
            "industry": "ecommerce",
            "system_prompt": """You are a helpful e-commerce customer support assistant. You help with:
- Order status inquiries
- Product information
- Returns and refunds
- Shipping questions
- General shopping assistance

Be friendly, efficient, and solution-oriented.
Ask for order ID when discussing specific orders.

Keep responses concise for phone conversations.""",
            "greeting": "Hello! Thanks for calling our customer support. I'm here to help with your orders and any questions. How can I assist you today?",
            "faqs": [
                {"question": "Where is my order?", "answer": "I can help track your order. Could you please provide your order number?"},
                {"question": "Can I return this?", "answer": "Yes, we have a 30-day return policy. Would you like me to help start a return?"},
            ]
        },
        "loan_collection": {
            "name": "Loan Collection Agent",
            "description": "AI assistant for loan payment reminders",
            "personality": "professional",
            "industry": "finance",
            "system_prompt": """You are a professional loan collection assistant. You help with:
- Payment reminders
- Payment arrangement discussions
- Account status inquiries
- Payment method information

Be firm but respectful. Follow compliance guidelines.
Do not threaten or harass. Offer payment solutions.

Keep responses concise for phone conversations.""",
            "greeting": "Hello, this is a reminder call regarding your account. I'm here to discuss payment options and help you resolve any outstanding balance. How can I assist you?",
            "faqs": [
                {"question": "What is my balance?", "answer": "I can help you with your account balance. Can you please verify your account number?"},
            ]
        },
        "appointment_booking": {
            "name": "Appointment Scheduler",
            "description": "General purpose appointment booking assistant",
            "personality": "friendly",
            "industry": "general",
            "system_prompt": """You are an efficient appointment scheduling assistant. You help with:
- Booking new appointments
- Rescheduling existing appointments
- Cancelling appointments
- Providing availability information

Be friendly and efficient. Confirm all details before finalizing.
Ask for: Name, Phone, Preferred Date/Time, Reason for Visit.

Keep responses concise for phone conversations.""",
            "greeting": "Hello! I'm your scheduling assistant. I can help you book, reschedule, or cancel appointments. What would you like to do today?",
            "faqs": []
        }
    }
    
    @classmethod
    def get_template(cls, template_id: str) -> Optional[Dict]:
        """Get template by ID"""
        return cls.TEMPLATES.get(template_id)
    
    @classmethod
    def list_templates(cls) -> List[Dict]:
        """List all available templates"""
        return [
            {
                "id": key,
                "name": template["name"],
                "description": template["description"],
                "industry": template["industry"]
            }
            for key, template in cls.TEMPLATES.items()
        ]


class AssistantService:
    """
    Assistant management service
    """
    
    # Available voices by provider
    VOICES = {
        VoiceProvider.ELEVENLABS: [
            {"id": "21m00Tcm4TlvDq8ikWAM", "name": "Rachel", "gender": "female", "accent": "american"},
            {"id": "AZnzlk1XvdvUeBnXmlld", "name": "Domi", "gender": "female", "accent": "american"},
            {"id": "EXAVITQu4vr4xnSDxMaL", "name": "Bella", "gender": "female", "accent": "american"},
            {"id": "ErXwobaYiN019PkySvjV", "name": "Antoni", "gender": "male", "accent": "american"},
            {"id": "MF3mGyEYCl7XYWbV9V6O", "name": "Elli", "gender": "female", "accent": "american"},
            {"id": "TxGEqnHWrfWFTfGW9XjX", "name": "Josh", "gender": "male", "accent": "american"},
            {"id": "VR6AewLTigWG4xSOukaG", "name": "Arnold", "gender": "male", "accent": "american"},
            {"id": "pNInz6obpgDQGcFmaJgB", "name": "Adam", "gender": "male", "accent": "american"},
            {"id": "yoZ06aMxZJJ28mfd3POQ", "name": "Sam", "gender": "male", "accent": "american"},
        ],
        VoiceProvider.PLAYHT: [
            {"id": "s3://playht/voices/rachel", "name": "Rachel", "gender": "female", "accent": "american"},
            {"id": "s3://playht/voices/davis", "name": "Davis", "gender": "male", "accent": "american"},
        ],
        VoiceProvider.GOOGLE: [
            {"id": "en-IN-Standard-A", "name": "Indian English Female", "gender": "female", "accent": "indian"},
            {"id": "en-IN-Standard-B", "name": "Indian English Male", "gender": "male", "accent": "indian"},
            {"id": "hi-IN-Standard-A", "name": "Hindi Female", "gender": "female", "accent": "indian"},
            {"id": "hi-IN-Standard-B", "name": "Hindi Male", "gender": "male", "accent": "indian"},
            {"id": "ta-IN-Standard-A", "name": "Tamil Female", "gender": "female", "accent": "indian"},
            {"id": "ta-IN-Standard-B", "name": "Tamil Male", "gender": "male", "accent": "indian"},
        ]
    }
    
    # LLM Models
    LLM_MODELS = {
        LLMProvider.ANTHROPIC: [
            {"id": "claude-3-opus-20240229", "name": "Claude 3 Opus", "quality": "highest", "speed": "slow"},
            {"id": "claude-3-sonnet-20240229", "name": "Claude 3 Sonnet", "quality": "high", "speed": "medium"},
            {"id": "claude-3-haiku-20240307", "name": "Claude 3 Haiku", "quality": "good", "speed": "fast"},
        ],
        LLMProvider.OPENAI: [
            {"id": "gpt-4-turbo", "name": "GPT-4 Turbo", "quality": "highest", "speed": "medium"},
            {"id": "gpt-4", "name": "GPT-4", "quality": "high", "speed": "slow"},
            {"id": "gpt-3.5-turbo", "name": "GPT-3.5 Turbo", "quality": "good", "speed": "fast"},
        ],
        LLMProvider.GROQ: [
            {"id": "llama-3.1-70b-versatile", "name": "Llama 3.1 70B", "quality": "high", "speed": "very_fast"},
            {"id": "llama-3.1-8b-instant", "name": "Llama 3.1 8B", "quality": "good", "speed": "instant"},
            {"id": "mixtral-8x7b-32768", "name": "Mixtral 8x7B", "quality": "good", "speed": "fast"},
        ]
    }
    
    def __init__(self, db=None):
        self.db = db
        self._assistants: Dict[str, Assistant] = {}
        self._knowledge_bases: Dict[str, KnowledgeBase] = {}
    
    def create_assistant(
        self,
        tenant_id: str,
        name: str,
        description: str = "",
        template_id: str = None,
        **kwargs
    ) -> Assistant:
        """
        Create a new AI assistant
        """
        assistant_id = secrets.token_urlsafe(16)
        
        # Start with template if provided
        if template_id:
            template = AssistantTemplates.get_template(template_id)
            if template:
                kwargs.setdefault("personality", template["personality"])
                kwargs.setdefault("industry", template["industry"])
                
                # Apply template settings
                if "llm" not in kwargs:
                    kwargs["llm"] = LLMSettings(
                        system_prompt=template["system_prompt"]
                    )
                
                if "call" not in kwargs:
                    kwargs["call"] = CallSettings(
                        greeting_message=template["greeting"]
                    )
        
        assistant = Assistant(
            id=assistant_id,
            tenant_id=tenant_id,
            name=name,
            description=description,
            voice=kwargs.get("voice", VoiceSettings()),
            llm=kwargs.get("llm", LLMSettings()),
            call=kwargs.get("call", CallSettings()),
            personality=kwargs.get("personality", "professional"),
            industry=kwargs.get("industry", "general")
        )
        
        self._assistants[assistant_id] = assistant
        
        return assistant
    
    def create_from_template(
        self,
        tenant_id: str,
        template_id: str,
        name: str = None
    ) -> Assistant:
        """
        Create assistant from template
        """
        template = AssistantTemplates.get_template(template_id)
        if not template:
            raise ValueError(f"Template not found: {template_id}")
        
        return self.create_assistant(
            tenant_id=tenant_id,
            name=name or template["name"],
            description=template["description"],
            template_id=template_id
        )
    
    def update_assistant(
        self,
        assistant_id: str,
        updates: Dict[str, Any]
    ) -> Assistant:
        """
        Update assistant settings
        """
        assistant = self._assistants.get(assistant_id)
        if not assistant:
            raise ValueError("Assistant not found")
        
        # Update basic fields
        for field in ["name", "description", "personality", "industry", "is_active"]:
            if field in updates:
                setattr(assistant, field, updates[field])
        
        # Update nested settings
        if "voice" in updates:
            for key, value in updates["voice"].items():
                setattr(assistant.voice, key, value)
        
        if "llm" in updates:
            for key, value in updates["llm"].items():
                setattr(assistant.llm, key, value)
        
        if "call" in updates:
            for key, value in updates["call"].items():
                setattr(assistant.call, key, value)
        
        assistant.updated_at = datetime.now()
        
        return assistant
    
    def get_assistant(self, assistant_id: str) -> Optional[Assistant]:
        """Get assistant by ID"""
        return self._assistants.get(assistant_id)
    
    def list_assistants(self, tenant_id: str) -> List[Assistant]:
        """List all assistants for tenant"""
        return [
            a for a in self._assistants.values()
            if a.tenant_id == tenant_id
        ]
    
    def delete_assistant(self, assistant_id: str) -> bool:
        """Delete assistant"""
        if assistant_id in self._assistants:
            del self._assistants[assistant_id]
            return True
        return False
    
    def assign_phone_number(
        self,
        assistant_id: str,
        phone_number_id: str
    ) -> Assistant:
        """Assign phone number to assistant"""
        assistant = self._assistants.get(assistant_id)
        if not assistant:
            raise ValueError("Assistant not found")
        
        assistant.phone_number_id = phone_number_id
        assistant.updated_at = datetime.now()
        
        return assistant
    
    def create_knowledge_base(
        self,
        tenant_id: str,
        name: str,
        description: str = "",
        documents: List[Dict] = None,
        faqs: List[Dict] = None
    ) -> KnowledgeBase:
        """Create knowledge base for assistant"""
        kb_id = secrets.token_urlsafe(16)
        
        kb = KnowledgeBase(
            id=kb_id,
            name=name,
            description=description,
            documents=documents or [],
            faqs=faqs or []
        )
        
        self._knowledge_bases[kb_id] = kb
        
        return kb
    
    def attach_knowledge_base(
        self,
        assistant_id: str,
        knowledge_base_id: str
    ) -> Assistant:
        """Attach knowledge base to assistant"""
        assistant = self._assistants.get(assistant_id)
        if not assistant:
            raise ValueError("Assistant not found")
        
        if knowledge_base_id not in self._knowledge_bases:
            raise ValueError("Knowledge base not found")
        
        assistant.knowledge_base_id = knowledge_base_id
        assistant.updated_at = datetime.now()
        
        return assistant
    
    def get_available_voices(
        self,
        provider: VoiceProvider = None,
        language: AssistantLanguage = None
    ) -> List[Dict]:
        """Get available voices"""
        if provider:
            voices = self.VOICES.get(provider, [])
        else:
            voices = []
            for p_voices in self.VOICES.values():
                voices.extend(p_voices)
        
        # Filter by language/accent if specified
        if language:
            # Map language to accent
            accent_map = {
                AssistantLanguage.ENGLISH: ["american", "british", "indian"],
                AssistantLanguage.HINDI: ["indian"],
                AssistantLanguage.TAMIL: ["indian"],
            }
            accents = accent_map.get(language, [])
            if accents:
                voices = [v for v in voices if v.get("accent") in accents]
        
        return voices
    
    def get_available_models(
        self,
        provider: LLMProvider = None
    ) -> List[Dict]:
        """Get available LLM models"""
        if provider:
            return self.LLM_MODELS.get(provider, [])
        
        all_models = []
        for p, models in self.LLM_MODELS.items():
            for m in models:
                all_models.append({**m, "provider": p.value})
        return all_models
    
    def generate_system_prompt(
        self,
        assistant: Assistant
    ) -> str:
        """
        Generate complete system prompt for assistant
        """
        base_prompt = assistant.llm.system_prompt or ""
        
        # Add personality traits
        personality_traits = {
            "professional": "Be professional, knowledgeable, and efficient.",
            "friendly": "Be warm, friendly, and approachable.",
            "formal": "Be formal, respectful, and precise.",
            "casual": "Be casual, relaxed, and conversational."
        }
        
        personality = personality_traits.get(assistant.personality, "")
        
        # Add industry context
        industry_context = {
            "real_estate": "You are helping with real estate inquiries.",
            "healthcare": "You are helping with healthcare appointments.",
            "ecommerce": "You are helping with e-commerce support.",
            "finance": "You are helping with financial services.",
            "general": "You are a general-purpose assistant."
        }
        
        industry = industry_context.get(assistant.industry, "")
        
        # Add knowledge base context
        kb_context = ""
        if assistant.knowledge_base_id:
            kb = self._knowledge_bases.get(assistant.knowledge_base_id)
            if kb and kb.faqs:
                kb_context = "\n\nFAQ Reference:\n"
                for faq in kb.faqs[:10]:  # Limit to 10 FAQs
                    kb_context += f"Q: {faq['question']}\nA: {faq['answer']}\n\n"
        
        # Combine all parts
        full_prompt = f"""
{base_prompt}

{personality}
{industry}

Voice Call Guidelines:
- Keep responses concise (under 50 words when possible)
- Use natural, conversational language
- Avoid using special characters or formatting
- If you don't understand, politely ask for clarification
- Collect relevant information when appropriate

{kb_context}
""".strip()
        
        return full_prompt
    
    def record_call(
        self,
        assistant_id: str,
        duration_seconds: int,
        successful: bool
    ) -> None:
        """Record call statistics"""
        assistant = self._assistants.get(assistant_id)
        if not assistant:
            return
        
        assistant.total_calls += 1
        if successful:
            assistant.successful_calls += 1
        
        # Update average duration
        total_duration = assistant.avg_call_duration * (assistant.total_calls - 1)
        assistant.avg_call_duration = (total_duration + duration_seconds) / assistant.total_calls


# ============================================
# FastAPI Router
# ============================================

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

assistant_router = APIRouter(prefix="/api/v1/assistants", tags=["Assistants"])

# Initialize service
assistant_service = AssistantService()


class CreateAssistantRequest(BaseModel):
    name: str
    description: str = ""
    template_id: str = None
    personality: str = "professional"
    industry: str = "general"


class UpdateAssistantRequest(BaseModel):
    name: str = None
    description: str = None
    personality: str = None
    industry: str = None
    is_active: bool = None
    voice: Dict = None
    llm: Dict = None
    call: Dict = None


@assistant_router.get("/templates")
async def list_templates():
    """List available assistant templates"""
    return {"templates": AssistantTemplates.list_templates()}


@assistant_router.get("/voices")
async def list_voices(provider: str = None, language: str = None):
    """List available voices"""
    p = VoiceProvider(provider) if provider else None
    l = AssistantLanguage(language) if language else None
    
    return {"voices": assistant_service.get_available_voices(p, l)}


@assistant_router.get("/models")
async def list_models(provider: str = None):
    """List available LLM models"""
    p = LLMProvider(provider) if provider else None
    
    return {"models": assistant_service.get_available_models(p)}


@assistant_router.post("")
async def create_assistant(
    request: CreateAssistantRequest,
    tenant_id: str = "demo_tenant"
):
    """Create new assistant"""
    assistant = assistant_service.create_assistant(
        tenant_id=tenant_id,
        name=request.name,
        description=request.description,
        template_id=request.template_id,
        personality=request.personality,
        industry=request.industry
    )
    
    return {
        "assistant_id": assistant.id,
        "name": assistant.name,
        "status": "created"
    }


@assistant_router.get("")
async def list_assistants(tenant_id: str = "demo_tenant"):
    """List all assistants"""
    assistants = assistant_service.list_assistants(tenant_id)
    
    return {
        "assistants": [
            {
                "id": a.id,
                "name": a.name,
                "description": a.description,
                "personality": a.personality,
                "industry": a.industry,
                "is_active": a.is_active,
                "total_calls": a.total_calls,
                "phone_number_id": a.phone_number_id
            }
            for a in assistants
        ]
    }


@assistant_router.get("/{assistant_id}")
async def get_assistant(assistant_id: str):
    """Get assistant details"""
    assistant = assistant_service.get_assistant(assistant_id)
    
    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")
    
    return {
        "id": assistant.id,
        "name": assistant.name,
        "description": assistant.description,
        "personality": assistant.personality,
        "industry": assistant.industry,
        "is_active": assistant.is_active,
        "voice": {
            "provider": assistant.voice.provider.value,
            "voice_id": assistant.voice.voice_id,
            "voice_name": assistant.voice.voice_name,
            "language": assistant.voice.language.value
        },
        "llm": {
            "provider": assistant.llm.provider.value,
            "model": assistant.llm.model,
            "temperature": assistant.llm.temperature
        },
        "call": {
            "greeting_message": assistant.call.greeting_message,
            "max_duration": assistant.call.max_call_duration_seconds,
            "record_calls": assistant.call.record_calls
        },
        "stats": {
            "total_calls": assistant.total_calls,
            "successful_calls": assistant.successful_calls,
            "avg_duration": assistant.avg_call_duration
        }
    }


@assistant_router.patch("/{assistant_id}")
async def update_assistant(
    assistant_id: str,
    request: UpdateAssistantRequest
):
    """Update assistant"""
    try:
        updates = request.dict(exclude_none=True)
        assistant = assistant_service.update_assistant(assistant_id, updates)
        
        return {"status": "updated", "assistant_id": assistant.id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@assistant_router.delete("/{assistant_id}")
async def delete_assistant(assistant_id: str):
    """Delete assistant"""
    if assistant_service.delete_assistant(assistant_id):
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="Assistant not found")


@assistant_router.post("/{assistant_id}/phone")
async def assign_phone(assistant_id: str, phone_number_id: str):
    """Assign phone number to assistant"""
    try:
        assistant = assistant_service.assign_phone_number(assistant_id, phone_number_id)
        return {"status": "assigned", "phone_number_id": phone_number_id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ============================================
# Additional routes added for frontend compatibility
# ============================================

@assistant_router.put("/{assistant_id}")
async def update_assistant_put(
    assistant_id: str,
    request: UpdateAssistantRequest
):
    """Update assistant (PUT alias for PATCH)."""
    try:
        updates = request.dict(exclude_none=True)
        assistant = assistant_service.update_assistant(assistant_id, updates)
        return {"status": "updated", "assistant_id": assistant.id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@assistant_router.post("/{assistant_id}/start")
async def start_assistant(assistant_id: str):
    """Activate an assistant."""
    try:
        updates = {"is_active": True}
        assistant = assistant_service.update_assistant(assistant_id, updates)
        return {"assistant_id": assistant.id, "status": "active"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@assistant_router.post("/{assistant_id}/stop")
async def stop_assistant(assistant_id: str):
    """Deactivate an assistant."""
    try:
        updates = {"is_active": False}
        assistant = assistant_service.update_assistant(assistant_id, updates)
        return {"assistant_id": assistant.id, "status": "inactive"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@assistant_router.get("/{assistant_id}/stats")
async def get_assistant_stats(assistant_id: str):
    """Get assistant performance stats."""
    assistant = assistant_service.get_assistant(assistant_id)
    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")
    return {
        "assistant_id": assistant.id,
        "total_calls": assistant.total_calls,
        "successful_calls": assistant.successful_calls,
        "avg_duration_seconds": assistant.avg_call_duration,
        "success_rate": round(assistant.successful_calls / assistant.total_calls * 100, 1)
                        if assistant.total_calls else 0,
    }
