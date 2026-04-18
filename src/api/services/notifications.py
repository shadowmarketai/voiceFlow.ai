"""
Notification helpers — email + WhatsApp for ticket + alert events.

Email uses the SMTP_* env vars already configured in Coolify.
WhatsApp reuses the existing /api/v1/whatsapp/send endpoint.

All failures are swallowed (logged only) so notification issues never
block the core app flow.
"""

from __future__ import annotations

import logging
import os
import smtplib
from collections.abc import Iterable
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)


def _smtp_creds() -> tuple[str | None, str | None, str, int]:
    user = os.getenv("SMTP_USER") or None
    pw = os.getenv("SMTP_PASSWORD") or None
    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port = int(os.getenv("SMTP_PORT", "587"))
    return user, pw, host, port


def send_email(to: str | Iterable[str], subject: str, body_html: str,
               reply_to: str | None = None) -> bool:
    """Best-effort SMTP send. Returns True on success, False on any failure."""
    user, pw, host, port = _smtp_creds()
    if not user or not pw:
        logger.info("SMTP not configured — skipping email to %s", to)
        return False

    recipients = [to] if isinstance(to, str) else list(to)
    if not recipients:
        return False

    msg = MIMEMultipart("alternative")
    msg["From"] = user
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = subject
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.attach(MIMEText(body_html, "html", "utf-8"))

    try:
        with smtplib.SMTP(host, port, timeout=10) as s:
            s.starttls()
            s.login(user, pw)
            s.sendmail(user, recipients, msg.as_string())
        logger.info("email sent: %s to %s", subject[:50], recipients)
        return True
    except Exception as exc:
        logger.warning("email send failed: %s", exc)
        return False


def send_whatsapp(to_phone: str, message: str) -> bool:
    """Send a WhatsApp text via the existing /api/v1/whatsapp/send backend helper."""
    try:
        from integrations.whatsapp.whatsapp_service import send_whatsapp_text
    except Exception:
        logger.info("WhatsApp service not loaded — skipping")
        return False
    try:
        send_whatsapp_text(to_phone, message)
        return True
    except Exception as exc:
        logger.warning("whatsapp send failed: %s", exc)
        return False


# ── Ticket-specific templates ──────────────────────────────────────────────

def notify_ticket_created(ticket: dict, super_admin_email: str | None = None) -> None:
    subject = f"[VoiceFlow Support] New ticket: {ticket.get('subject', '—')} (#{ticket.get('id')})"
    html = f"""
    <h3>New support ticket</h3>
    <p><b>From tenant:</b> {ticket.get('tenant_id') or 'direct user'}</p>
    <p><b>Priority:</b> {ticket.get('priority', 'medium')}</p>
    <p><b>Category:</b> {ticket.get('category') or '—'}</p>
    <p><b>Subject:</b> {ticket.get('subject')}</p>
    <p><b>Body:</b></p>
    <div style="padding:12px;border-left:3px solid #6366f1;background:#f9fafb">
      {ticket.get('body', '').replace(chr(10), '<br>')}
    </div>
    <p style="margin-top:16px">
      <a href="https://voice.shadowmarket.ai/admin/tickets/{ticket.get('id')}"
         style="background:#6366f1;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">
        Open in admin console
      </a>
    </p>
    """
    target = super_admin_email or os.getenv("SUPER_ADMIN_EMAIL") or "mkumaran2931@gmail.com"
    send_email(target, subject, html)


def notify_ticket_reply(ticket: dict, reply_body: str, recipient_email: str,
                        is_from_admin: bool) -> None:
    who = "VoiceFlow support" if is_from_admin else "Your tenant user"
    subject = f"[VoiceFlow Support] {who} replied: {ticket.get('subject', '—')}"
    html = f"""
    <h3>{who} posted a reply on ticket #{ticket.get('id')}</h3>
    <p><b>Subject:</b> {ticket.get('subject')}</p>
    <div style="padding:12px;border-left:3px solid #10b981;background:#f0fdf4">
      {reply_body.replace(chr(10), '<br>')}
    </div>
    <p style="margin-top:16px">
      <a href="{'https://voice.shadowmarket.ai/admin/tickets/' if is_from_admin else 'https://voice.shadowmarket.ai/platform-support?t='}{ticket.get('id')}"
         style="background:#6366f1;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">
        View ticket
      </a>
    </p>
    """
    send_email(recipient_email, subject, html)


def notify_ticket_status(ticket: dict, recipient_email: str) -> None:
    subject = f"[VoiceFlow Support] Ticket #{ticket.get('id')} is now {ticket.get('status')}"
    html = f"""
    <h3>Your ticket status changed</h3>
    <p><b>Subject:</b> {ticket.get('subject')}</p>
    <p><b>New status:</b> <code>{ticket.get('status')}</code></p>
    """
    send_email(recipient_email, subject, html)
