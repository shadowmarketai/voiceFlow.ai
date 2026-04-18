"""
VoiceFlow Marketing AI - Knowledge Base / RAG Service
======================================================
Adapted from livekit-voice-agent/knowledge.py for main backend integration.
Manages training data, chunking, embedding, and semantic search.
"""

import logging
import re

import aiohttp
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import settings
from api.models.voice_agent import KnowledgeDocument

logger = logging.getLogger(__name__)

# Chunking config
CHUNK_SIZE_TOKENS = 500
CHUNK_OVERLAP_TOKENS = 50


# ---------------------------------------------------------------------------
# Text Chunking
# ---------------------------------------------------------------------------

def _estimate_tokens(text: str) -> int:
    """Rough token count: ~4 chars per token for English."""
    return len(text) // 4


def chunk_text(
    text: str,
    chunk_size: int = CHUNK_SIZE_TOKENS,
    overlap: int = CHUNK_OVERLAP_TOKENS,
) -> list[str]:
    """Split text into overlapping chunks using sentence boundaries."""
    if _estimate_tokens(text) <= chunk_size:
        return [text.strip()]

    sentences = re.split(r'(?<=[.!?])\s+', text)
    chunks = []
    current_chunk: list[str] = []
    current_tokens = 0

    for sentence in sentences:
        sent_tokens = _estimate_tokens(sentence)

        if current_tokens + sent_tokens > chunk_size and current_chunk:
            chunks.append(" ".join(current_chunk))
            overlap_tokens = 0
            overlap_start = len(current_chunk)
            for i in range(len(current_chunk) - 1, -1, -1):
                overlap_tokens += _estimate_tokens(current_chunk[i])
                if overlap_tokens >= overlap:
                    overlap_start = i
                    break
            current_chunk = current_chunk[overlap_start:]
            current_tokens = sum(_estimate_tokens(s) for s in current_chunk)

        current_chunk.append(sentence)
        current_tokens += sent_tokens

    if current_chunk:
        chunks.append(" ".join(current_chunk))

    return chunks


# ---------------------------------------------------------------------------
# Embedding Generation
# ---------------------------------------------------------------------------

async def generate_embedding(text: str) -> list[float] | None:
    """Generate embedding vector using OpenAI text-embedding-3-small."""
    openai_key = settings.OPENAI_API_KEY
    if not openai_key:
        logger.warning("OPENAI_API_KEY not set — cannot generate embeddings")
        return None

    try:
        async with aiohttp.ClientSession() as http:
            resp = await http.post(
                "https://api.openai.com/v1/embeddings",
                headers={
                    "Authorization": f"Bearer {openai_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.EMBEDDING_MODEL,
                    "input": text,
                },
                timeout=aiohttp.ClientTimeout(total=30),
            )
            if resp.status == 200:
                data = await resp.json()
                return data["data"][0]["embedding"]
            else:
                body = await resp.text()
                logger.error("OpenAI embedding API returned %d: %s", resp.status, body[:200])
    except Exception as exc:
        logger.error("Embedding generation failed: %s", exc)
    return None


# ---------------------------------------------------------------------------
# Knowledge CRUD
# ---------------------------------------------------------------------------

async def add_document(
    db: AsyncSession,
    *,
    tenant_id: str,
    title: str,
    content: str,
    doc_type: str = "document",
    scope: str = "agent",
    agent_id: str | None = None,
    campaign_id: str | None = None,
    question: str | None = None,
    answer: str | None = None,
) -> list[KnowledgeDocument]:
    """Add a document to the knowledge base with auto-chunking and embedding.

    scope:
      "global"   — visible to all agents/campaigns for this tenant
      "campaign" — shared by all agents in campaign_id
      "agent"    — private to agent_id
    """
    if doc_type == "faq" and question and answer:
        embed_text = f"Question: {question}\nAnswer: {answer}"
        chunks = [embed_text]
    else:
        chunks = chunk_text(content)

    docs = []
    for i, chunk in enumerate(chunks):
        embedding = await generate_embedding(chunk)

        doc = KnowledgeDocument(
            tenant_id=tenant_id,
            agent_id=agent_id,
            campaign_id=campaign_id,
            scope=scope,
            title=title,
            doc_type=doc_type,
            content=chunk,
            question=question if i == 0 else None,
            answer=answer if i == 0 else None,
            embedding_vector=embedding,
            chunk_index=i,
            is_active=True,
        )
        db.add(doc)
        docs.append(doc)

    await db.flush()
    for doc in docs:
        await db.refresh(doc)
    return docs


async def bulk_add_documents(
    db: AsyncSession,
    *,
    tenant_id: str,
    items: list[dict],
    scope: str = "agent",
    agent_id: str | None = None,
    campaign_id: str | None = None,
) -> int:
    """Bulk upload documents/FAQs. Returns count of created rows."""
    count = 0
    for item in items:
        docs = await add_document(
            db,
            tenant_id=tenant_id,
            title=item.get("title", "Untitled"),
            content=item.get("content", item.get("answer", "")),
            doc_type=item.get("doc_type", "document"),
            scope=scope,
            agent_id=agent_id,
            campaign_id=campaign_id,
            question=item.get("question"),
            answer=item.get("answer"),
        )
        count += len(docs)
    return count


async def list_documents(
    db: AsyncSession,
    tenant_id: str,
    scope: str | None = None,
    agent_id: str | None = None,
    campaign_id: str | None = None,
    doc_type: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[KnowledgeDocument]:
    """List knowledge documents for a tenant, with optional scope/agent/campaign filters."""
    stmt = (
        select(KnowledgeDocument)
        .where(
            KnowledgeDocument.tenant_id == tenant_id,
            KnowledgeDocument.is_active == True,  # noqa: E712
        )
    )
    if scope:
        stmt = stmt.where(KnowledgeDocument.scope == scope)
    if agent_id:
        stmt = stmt.where(KnowledgeDocument.agent_id == agent_id)
    if campaign_id:
        stmt = stmt.where(KnowledgeDocument.campaign_id == campaign_id)
    if doc_type:
        stmt = stmt.where(KnowledgeDocument.doc_type == doc_type)
    stmt = stmt.order_by(KnowledgeDocument.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def update_document(
    db: AsyncSession,
    doc_id: int,
    **updates,
) -> KnowledgeDocument | None:
    """Update a knowledge document. Re-embeds if content changes."""
    doc = await db.get(KnowledgeDocument, doc_id)
    if doc is None:
        return None

    content_changed = False
    for key, value in updates.items():
        if hasattr(doc, key) and value is not None:
            if key in ("content", "question", "answer"):
                content_changed = True
            setattr(doc, key, value)

    if content_changed:
        embed_text = doc.content
        if doc.doc_type == "faq" and doc.question and doc.answer:
            embed_text = f"Question: {doc.question}\nAnswer: {doc.answer}"
        doc.embedding_vector = await generate_embedding(embed_text)

    await db.flush()
    await db.refresh(doc)
    return doc


async def delete_document(db: AsyncSession, doc_id: int) -> bool:
    """Soft-delete a knowledge document."""
    doc = await db.get(KnowledgeDocument, doc_id)
    if doc is None:
        return False
    doc.is_active = False
    return True


# ---------------------------------------------------------------------------
# Sarvam Translation (for multilingual RAG)
# ---------------------------------------------------------------------------

async def translate_to_english(text: str) -> str:
    """Translate Indian language text to English using Sarvam Mayura v1."""
    if not settings.SARVAM_TRANSLATE_ENABLED or not settings.SARVAM_API_KEY:
        return text

    non_ascii = sum(1 for c in text if ord(c) > 127)
    if non_ascii < len(text) * 0.2:
        return text

    try:
        async with aiohttp.ClientSession() as http:
            resp = await http.post(
                "https://api.sarvam.ai/translate",
                headers={
                    "api-subscription-key": settings.SARVAM_API_KEY,
                    "Content-Type": "application/json",
                },
                json={
                    "input": text,
                    "source_language_code": "auto",
                    "target_language_code": "en-IN",
                    "mode": "formal",
                },
                timeout=aiohttp.ClientTimeout(total=15),
            )
            if resp.status == 200:
                data = await resp.json()
                translated = data.get("translated_text", text)
                logger.debug("Translated for RAG: '%s' -> '%s'", text[:50], translated[:50])
                return translated
            else:
                body = await resp.text()
                logger.warning("Sarvam translate returned %d: %s", resp.status, body[:200])
    except Exception as exc:
        logger.warning("Sarvam translation failed, using original text: %s", exc)
    return text


# ---------------------------------------------------------------------------
# RAG Retrieval
# ---------------------------------------------------------------------------

async def get_rag_context(
    db: AsyncSession,
    tenant_id: str,
    user_text: str,
    agent_id: str | None = None,
    campaign_id: str | None = None,
    top_k: int = 5,
) -> str:
    """Retrieve relevant knowledge via pgvector cosine similarity search.

    Merges 3 knowledge scopes in priority order:
      1. global   — tenant-wide shared knowledge (always included)
      2. campaign — shared by all agents in the campaign (if campaign_id provided)
      3. agent    — private to this specific agent (if agent_id provided)

    All matching docs are ranked together by cosine distance; top_k returned.
    """
    search_text = await translate_to_english(user_text)
    embedding = await generate_embedding(search_text)
    if embedding is None:
        return ""

    from sqlalchemy import or_

    try:
        # Build a combined filter that covers all 3 scopes
        scope_filters = [
            KnowledgeDocument.scope == "global",
        ]
        if campaign_id:
            scope_filters.append(
                (KnowledgeDocument.scope == "campaign") &
                (KnowledgeDocument.campaign_id == campaign_id)
            )
        if agent_id:
            scope_filters.append(
                (KnowledgeDocument.scope == "agent") &
                (KnowledgeDocument.agent_id == agent_id)
            )

        stmt = (
            select(KnowledgeDocument)
            .where(
                KnowledgeDocument.tenant_id == tenant_id,
                KnowledgeDocument.is_active == True,  # noqa: E712
                KnowledgeDocument.embedding_vector.isnot(None),
                or_(*scope_filters),
            )
            .order_by(KnowledgeDocument.embedding_vector.cosine_distance(embedding))
            .limit(top_k)
        )

        result = await db.execute(stmt)
        docs = result.scalars().all()
    except Exception:
        logger.warning("pgvector cosine search failed — falling back to no RAG context")
        return ""

    if not docs:
        return ""

    context_parts = []
    for doc in docs:
        if doc.doc_type == "faq" and doc.question and doc.answer:
            context_parts.append(f"Q: {doc.question}\nA: {doc.answer}")
        else:
            context_parts.append(f"[{doc.title}]: {doc.content}")

    return "\n\n".join(context_parts)
