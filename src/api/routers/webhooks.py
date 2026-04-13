"""
VoiceFlow Marketing AI - Webhooks & API Keys Router
=====================================================
API key management and webhook configuration endpoints.
API keys are stored as SHA-256 hashes. The plain key is returned only once
at creation time.
"""

import hashlib
import logging
import secrets
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from api.database import get_db
from api.permissions import require_permission
from api.models.webhook import APIKey, WebhookConfig, WebhookDeliveryLog
from api.schemas.webhook import (
    APIKeyCreate,
    APIKeyCreatedResponse,
    APIKeyResponse,
    WebhookCreate,
    WebhookDeliveryLogResponse,
    WebhookResponse,
    WebhookTestResponse,
    WebhookUpdate,
)
from api.schemas.common import PaginatedResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["Webhooks & API Keys"])


# ── Helpers ─────────────────────────────────────────────────────


def _get_user_id(current_user: dict) -> int:
    """Extract a numeric user_id from the current_user dict."""
    raw = current_user.get("id", "")
    if isinstance(raw, int):
        return raw
    try:
        return int(raw)
    except (ValueError, TypeError):
        return abs(hash(raw)) % (2**31)


def _generate_api_key() -> tuple[str, str, str]:
    """Generate a new API key.

    Returns:
        Tuple of (plain_key, key_hash, key_prefix).
    """
    # Generate a secure random key with a recognizable prefix
    random_part = secrets.token_urlsafe(32)
    plain_key = f"vfk_{random_part}"
    key_hash = hashlib.sha256(plain_key.encode()).hexdigest()
    key_prefix = plain_key[:8]
    return plain_key, key_hash, key_prefix


def _apikey_to_dict(key: APIKey) -> dict:
    """Convert an APIKey ORM object to a dict."""
    return {
        "id": key.id,
        "name": key.name,
        "description": key.description,
        "key_prefix": key.key_prefix,
        "permissions": key.permissions,
        "allowed_ips": key.allowed_ips,
        "allowed_origins": key.allowed_origins,
        "rate_limit_per_minute": key.rate_limit_per_minute,
        "rate_limit_per_hour": key.rate_limit_per_hour,
        "rate_limit_per_day": key.rate_limit_per_day,
        "is_active": key.is_active,
        "last_used_at": key.last_used_at,
        "total_requests": key.total_requests,
        "total_errors": key.total_errors,
        "expires_at": key.expires_at,
        "user_id": key.user_id,
        "created_at": key.created_at,
    }


def _webhook_to_dict(wh: WebhookConfig) -> dict:
    """Convert a WebhookConfig ORM object to a dict."""
    return {
        "id": wh.id,
        "name": wh.name,
        "url": wh.url,
        "description": wh.description,
        "events": wh.events,
        "auth_type": wh.auth_type,
        "http_method": wh.http_method,
        "content_type": wh.content_type,
        "timeout_seconds": wh.timeout_seconds,
        "max_retries": wh.max_retries,
        "retry_delay_seconds": wh.retry_delay_seconds,
        "is_active": wh.is_active,
        "total_deliveries": wh.total_deliveries,
        "successful_deliveries": wh.successful_deliveries,
        "failed_deliveries": wh.failed_deliveries,
        "consecutive_failures": wh.consecutive_failures,
        "last_delivery_at": wh.last_delivery_at,
        "last_delivery_status": wh.last_delivery_status,
        "last_error_message": wh.last_error_message,
        "auto_disable_after_failures": wh.auto_disable_after_failures,
        "disabled_at": wh.disabled_at,
        "disabled_reason": wh.disabled_reason,
        "user_id": wh.user_id,
        "created_at": wh.created_at,
        "updated_at": wh.updated_at,
    }


def _delivery_log_to_dict(log: WebhookDeliveryLog) -> dict:
    """Convert a WebhookDeliveryLog ORM object to a dict."""
    return {
        "id": log.id,
        "event_type": log.event_type,
        "event_id": log.event_id,
        "request_url": log.request_url,
        "request_headers": log.request_headers,
        "request_body": log.request_body,
        "response_status": log.response_status,
        "response_body": log.response_body,
        "duration_ms": log.duration_ms,
        "attempt_number": log.attempt_number,
        "is_success": log.is_success,
        "error_message": log.error_message,
        "webhook_config_id": log.webhook_config_id,
        "created_at": log.created_at,
    }


# ═══════════════════════════════════════════════════════════════
# API KEYS
# ═══════════════════════════════════════════════════════════════


# ── GET /api-keys ───────────────────────────────────────────────


@router.get(
    "/api-keys",
    response_model=list[APIKeyResponse],
    summary="List API keys",
)
async def list_api_keys(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("webhooks", "read")),
) -> list[APIKeyResponse]:
    """List all API keys for the current user. Plain keys are never returned."""
    uid = _get_user_id(current_user)

    keys = (
        db.query(APIKey)
        .filter(
            APIKey.user_id == uid,
            APIKey.is_active == True,  # noqa: E712
        )
        .order_by(APIKey.created_at.desc())
        .all()
    )

    return [APIKeyResponse(**_apikey_to_dict(k)) for k in keys]


# ── POST /api-keys ──────────────────────────────────────────────


@router.post(
    "/api-keys",
    response_model=APIKeyCreatedResponse,
    status_code=201,
    summary="Generate a new API key",
)
async def create_api_key(
    body: APIKeyCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("webhooks", "create")),
) -> APIKeyCreatedResponse:
    """Generate a new API key. The plain key is returned ONCE and cannot be retrieved again."""
    uid = _get_user_id(current_user)

    plain_key, key_hash, key_prefix = _generate_api_key()

    api_key = APIKey(
        key_hash=key_hash,
        key_prefix=key_prefix,
        name=body.name,
        description=body.description,
        permissions=body.permissions,
        allowed_ips=body.allowed_ips,
        allowed_origins=body.allowed_origins,
        rate_limit_per_minute=body.rate_limit_per_minute,
        rate_limit_per_hour=body.rate_limit_per_hour,
        rate_limit_per_day=body.rate_limit_per_day,
        expires_at=body.expires_at,
        is_active=True,
        user_id=uid,
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)

    logger.info("API key created: %s (prefix=%s, user=%s)", body.name, key_prefix, uid)

    return APIKeyCreatedResponse(
        id=api_key.id,
        name=api_key.name,
        key=plain_key,
        key_prefix=key_prefix,
        permissions=api_key.permissions,
        expires_at=api_key.expires_at,
        created_at=api_key.created_at,
    )


# ── DELETE /api-keys/{key_id} ──────────────────────────────────


@router.delete(
    "/api-keys/{key_id}",
    status_code=204,
    summary="Revoke an API key",
)
async def revoke_api_key(
    key_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("webhooks", "delete")),
) -> None:
    """Revoke (deactivate) an API key. The key cannot be used after revocation."""
    uid = _get_user_id(current_user)

    api_key = db.query(APIKey).filter(
        APIKey.id == key_id,
        APIKey.user_id == uid,
    ).first()

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"API key {key_id} not found",
        )

    if not api_key.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="API key is already revoked",
        )

    api_key.is_active = False
    api_key.revoked_at = datetime.now(timezone.utc)
    api_key.revoked_reason = "Revoked by user"
    db.commit()

    logger.info("API key revoked: %s (prefix=%s, user=%s)", api_key.name, api_key.key_prefix, uid)


# ═══════════════════════════════════════════════════════════════
# WEBHOOKS
# ═══════════════════════════════════════════════════════════════


# ── GET /webhooks ───────────────────────────────────────────────


@router.get(
    "/webhooks",
    response_model=list[WebhookResponse],
    summary="List webhook configs",
)
async def list_webhooks(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("webhooks", "read")),
) -> list[WebhookResponse]:
    """List all webhook configurations for the current user."""
    uid = _get_user_id(current_user)

    webhooks = (
        db.query(WebhookConfig)
        .filter(WebhookConfig.user_id == uid)
        .order_by(WebhookConfig.created_at.desc())
        .all()
    )

    return [WebhookResponse(**_webhook_to_dict(w)) for w in webhooks]


# ── POST /webhooks ──────────────────────────────────────────────


@router.post(
    "/webhooks",
    response_model=WebhookResponse,
    status_code=201,
    summary="Create webhook config",
)
async def create_webhook(
    body: WebhookCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("webhooks", "create")),
) -> WebhookResponse:
    """Create a new webhook configuration."""
    uid = _get_user_id(current_user)

    webhook = WebhookConfig(
        name=body.name,
        url=body.url,
        description=body.description,
        events=body.events,
        secret=body.secret,
        headers=body.headers,
        auth_type=body.auth_type,
        auth_credentials=body.auth_credentials,
        http_method=body.http_method,
        content_type=body.content_type,
        timeout_seconds=body.timeout_seconds,
        max_retries=body.max_retries,
        retry_delay_seconds=body.retry_delay_seconds,
        auto_disable_after_failures=body.auto_disable_after_failures,
        is_active=True,
        user_id=uid,
    )
    db.add(webhook)
    db.commit()
    db.refresh(webhook)

    logger.info("Webhook created: %s -> %s (user=%s)", webhook.name, webhook.url, uid)
    return WebhookResponse(**_webhook_to_dict(webhook))


# ── PUT /webhooks/{webhook_id} ──────────────────────────────────


@router.put(
    "/webhooks/{webhook_id}",
    response_model=WebhookResponse,
    summary="Update webhook config",
)
async def update_webhook(
    webhook_id: int,
    body: WebhookUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("webhooks", "update")),
) -> WebhookResponse:
    """Update a webhook configuration."""
    uid = _get_user_id(current_user)

    webhook = db.query(WebhookConfig).filter(
        WebhookConfig.id == webhook_id,
        WebhookConfig.user_id == uid,
    ).first()

    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Webhook {webhook_id} not found",
        )

    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(webhook, field, value)

    # Reset consecutive failures if webhook is being re-enabled
    if "is_active" in updates and updates["is_active"]:
        webhook.consecutive_failures = 0
        webhook.disabled_at = None
        webhook.disabled_reason = None

    db.commit()
    db.refresh(webhook)

    logger.info("Webhook updated: %s (id=%s, user=%s)", webhook.name, webhook.id, uid)
    return WebhookResponse(**_webhook_to_dict(webhook))


# ── DELETE /webhooks/{webhook_id} ───────────────────────────────


@router.delete(
    "/webhooks/{webhook_id}",
    status_code=204,
    summary="Delete webhook",
)
async def delete_webhook(
    webhook_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("webhooks", "delete")),
) -> None:
    """Delete a webhook configuration and its delivery logs."""
    uid = _get_user_id(current_user)

    webhook = db.query(WebhookConfig).filter(
        WebhookConfig.id == webhook_id,
        WebhookConfig.user_id == uid,
    ).first()

    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Webhook {webhook_id} not found",
        )

    db.delete(webhook)
    db.commit()

    logger.info("Webhook deleted: %s (id=%s, user=%s)", webhook.name, webhook_id, uid)


# ── POST /webhooks/{webhook_id}/test ────────────────────────────


@router.post(
    "/webhooks/{webhook_id}/test",
    response_model=WebhookTestResponse,
    summary="Send test event to webhook",
)
async def test_webhook(
    webhook_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("webhooks", "update")),
) -> WebhookTestResponse:
    """Send a test event to the configured webhook URL."""
    uid = _get_user_id(current_user)

    webhook = db.query(WebhookConfig).filter(
        WebhookConfig.id == webhook_id,
        WebhookConfig.user_id == uid,
    ).first()

    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Webhook {webhook_id} not found",
        )

    # Build test payload
    event_id = str(uuid.uuid4())
    test_payload = {
        "event": "test.ping",
        "event_id": event_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": {
            "message": "This is a test event from VoiceFlow Marketing AI",
            "webhook_id": webhook.id,
            "webhook_name": webhook.name,
        },
    }

    # Build headers
    request_headers = {
        "Content-Type": webhook.content_type,
        "X-Webhook-Event": "test.ping",
        "X-Webhook-ID": str(webhook.id),
        "X-Event-ID": event_id,
        "User-Agent": "VoiceFlow-Webhook/1.0",
    }
    if webhook.headers:
        request_headers.update(webhook.headers)

    # Add HMAC signature if secret is configured
    if webhook.secret:
        import hmac as hmac_lib
        import json
        payload_str = json.dumps(test_payload, sort_keys=True)
        signature = hmac_lib.new(
            webhook.secret.encode(),
            payload_str.encode(),
            hashlib.sha256,
        ).hexdigest()
        request_headers["X-Webhook-Signature"] = f"sha256={signature}"

    # Send the test request
    response_status = None
    response_body = None
    duration_ms = None
    error_msg = None
    success = False

    try:
        import httpx

        start_time = time.time()
        async with httpx.AsyncClient(timeout=webhook.timeout_seconds) as client:
            if webhook.http_method.upper() == "GET":
                resp = await client.get(webhook.url, headers=request_headers, params=test_payload)
            else:
                resp = await client.request(
                    method=webhook.http_method.upper(),
                    url=webhook.url,
                    headers=request_headers,
                    json=test_payload,
                )

        duration_ms = round((time.time() - start_time) * 1000, 2)
        response_status = resp.status_code
        response_body = resp.text[:2000]  # Truncate response body
        success = 200 <= resp.status_code < 300

    except ImportError:
        # httpx not installed, simulate a test
        logger.warning("httpx not installed; simulating webhook test")
        duration_ms = 0.0
        response_status = None
        response_body = None
        error_msg = "httpx library not installed. Install with: pip install httpx"

    except Exception as exc:
        duration_ms = round((time.time() - start_time) * 1000, 2) if 'start_time' in dir() else 0.0
        error_msg = str(exc)
        logger.error("Webhook test failed for %s: %s", webhook.url, exc)

    # Log the delivery attempt
    delivery_log = WebhookDeliveryLog(
        event_type="test.ping",
        event_id=event_id,
        request_url=webhook.url,
        request_headers=request_headers,
        request_body=test_payload,
        response_status=response_status,
        response_body=response_body,
        duration_ms=duration_ms,
        attempt_number=1,
        is_success=success,
        error_message=error_msg,
        webhook_config_id=webhook.id,
    )
    db.add(delivery_log)

    # Update webhook stats
    webhook.total_deliveries += 1
    webhook.last_delivery_at = datetime.now(timezone.utc)
    webhook.last_delivery_status = response_status
    if success:
        webhook.successful_deliveries += 1
        webhook.consecutive_failures = 0
    else:
        webhook.failed_deliveries += 1
        webhook.consecutive_failures += 1
        webhook.last_error_message = error_msg

    db.commit()

    logger.info(
        "Webhook test for %s: success=%s, status=%s, duration=%sms",
        webhook.url,
        success,
        response_status,
        duration_ms,
    )

    return WebhookTestResponse(
        success=success,
        status_code=response_status,
        response_body=response_body,
        duration_ms=duration_ms,
        error=error_msg,
    )


# ── GET /webhooks/{webhook_id}/logs ─────────────────────────────


@router.get(
    "/webhooks/{webhook_id}/logs",
    response_model=PaginatedResponse,
    summary="Get webhook delivery logs",
)
async def get_delivery_logs(
    webhook_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    is_success: bool | None = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("webhooks", "read")),
) -> PaginatedResponse:
    """Get delivery logs for a webhook (paginated)."""
    uid = _get_user_id(current_user)

    # Verify webhook ownership
    webhook = db.query(WebhookConfig).filter(
        WebhookConfig.id == webhook_id,
        WebhookConfig.user_id == uid,
    ).first()

    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Webhook {webhook_id} not found",
        )

    query = db.query(WebhookDeliveryLog).filter(
        WebhookDeliveryLog.webhook_config_id == webhook_id,
    )

    if is_success is not None:
        query = query.filter(WebhookDeliveryLog.is_success == is_success)

    total = query.count()
    offset = (page - 1) * page_size
    logs = (
        query.order_by(WebhookDeliveryLog.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    items = [WebhookDeliveryLogResponse(**_delivery_log_to_dict(log)) for log in logs]
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)
