"""
Campaign Execution Service
============================
Triggers telephony bulk calls when a campaign is started.
Connects campaigns to Vobiz/Bolna/TeleCMI for actual dialing.
"""

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


async def execute_campaign(
    campaign_id: int,
    campaign_name: str,
    phone_numbers: List[str],
    from_number: str,
    agent_id: str = "",
    provider: str = "vobiz",
    webhook_url: str = "",
    tts_text: Optional[str] = None,
    audio_url: Optional[str] = None,
    language: str = "hi",
) -> Dict[str, Any]:
    """Execute a campaign by triggering bulk calls via telephony provider.

    Args:
        campaign_id: Campaign database ID
        campaign_name: Campaign name for tracking
        phone_numbers: List of numbers to dial (E.164 format)
        from_number: Caller ID number
        agent_id: AI agent ID (required for Bolna)
        provider: Telephony provider (vobiz, bolna, telecmi)
        webhook_url: URL to receive call completion events
        tts_text: Text for TTS (Vobiz)
        audio_url: Pre-recorded audio URL (Vobiz)
        language: Language for TTS (hi, ta, en)

    Returns:
        Execution result with batch_id and status
    """
    from integrations.telephony.manager import TelephonyManager

    manager = TelephonyManager()
    result = {"campaign_id": campaign_id, "provider": provider, "total_numbers": len(phone_numbers)}

    if provider == "vobiz":
        vobiz = manager.get_provider("vobiz")
        if hasattr(vobiz, "broadcast"):
            resp = await vobiz.broadcast(
                phone_numbers=phone_numbers,
                tts_text=tts_text,
                audio_url=audio_url,
                tts_language=language,
                webhook_url=webhook_url or f"/api/v1/telephony/webhooks/vobiz",
                campaign_name=f"vf_{campaign_id}_{campaign_name}",
            )
            result.update(resp)
        else:
            result["error"] = "Vobiz broadcast not available"

    elif provider == "bolna":
        bolna = manager.get_provider("bolna")
        if hasattr(bolna, "make_batch_calls"):
            resp = await bolna.make_batch_calls(
                agent_id=agent_id,
                phone_numbers=phone_numbers,
                from_number=from_number,
                webhook_url=webhook_url or f"/api/v1/telephony/webhooks/bolna",
            )
            result.update(resp)
        else:
            result["error"] = "Bolna batch calls not available"

    elif provider in ("telecmi", "exotel", "twilio"):
        # Sequential dialing for providers without batch API
        p = manager.get_provider(provider)
        success_count = 0
        for number in phone_numbers[:10]:  # Limit to 10 for safety
            try:
                resp = await p.make_call(
                    from_number=from_number,
                    to_number=number,
                    webhook_url=webhook_url or f"/api/v1/telephony/webhooks/{provider}",
                    record=True,
                )
                if resp.get("success"):
                    success_count += 1
            except Exception as exc:
                logger.warning("Call failed to %s: %s", number, exc)
        result["success"] = True
        result["calls_initiated"] = success_count
        result["note"] = f"Sequential dialing ({provider}) — first 10 numbers"

    else:
        result["error"] = f"Unsupported campaign provider: {provider}"

    logger.info(
        "Campaign %s executed: provider=%s, numbers=%d, result=%s",
        campaign_id, provider, len(phone_numbers), result.get("success", False),
    )
    return result
