"""
VoiceFlow AI - Email Service
==============================
Sends transactional emails via SMTP (Gmail, SendGrid, etc.).
"""

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from api.config import settings

logger = logging.getLogger(__name__)


def send_password_reset_email(to_email: str, reset_token: str) -> bool:
    """Send a password reset email with the reset link."""
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"

    html = f"""
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; width: 48px; height: 48px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 12px; line-height: 48px; color: white; font-size: 20px; font-weight: bold;">V</div>
        <h2 style="margin: 12px 0 0; color: #0f172a; font-size: 20px;">VoiceFlow AI</h2>
      </div>
      <h1 style="color: #0f172a; font-size: 24px; font-weight: 700; margin: 0 0 12px;">Reset your password</h1>
      <p style="color: #64748b; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
        We received a request to reset your password. Click the button below to set a new one.
        This link expires in 15 minutes.
      </p>
      <a href="{reset_url}" style="display: inline-block; padding: 12px 32px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
        Reset Password
      </a>
      <p style="color: #94a3b8; font-size: 13px; margin-top: 32px; line-height: 1.5;">
        If you didn't request this, you can safely ignore this email.
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0 16px;" />
      <p style="color: #cbd5e1; font-size: 11px; text-align: center;">&copy; 2026 VoiceFlow AI. All rights reserved.</p>
    </div>
    """

    text = f"Reset your VoiceFlow AI password: {reset_url}\n\nThis link expires in 15 minutes."

    return _send_email(
        to_email=to_email,
        subject="Reset your VoiceFlow AI password",
        html=html,
        text=text,
    )


def _send_email(to_email: str, subject: str, html: str, text: str) -> bool:
    """Send an email via SMTP."""
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning("SMTP not configured — email to %s not sent", to_email)
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_USER}>"
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)

        logger.info("Email sent to %s: %s", to_email, subject)
        return True
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to_email, exc)
        return False
