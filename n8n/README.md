# VoiceFlow AI — n8n Workflow Imports

## How to import

1. Open your n8n instance: `https://n8n.shadowmarket.ai`
2. Go to **Workflows → Import from File**
3. Import each JSON file below in order

## Workflows

| File | Webhook Path | What it does |
|------|-------------|--------------|
| `01_book_appointment.json` | `POST /webhook/book-appointment` | Creates Google Calendar event + sends Tamil SMS confirmation |
| `02_send_whatsapp.json` | `POST /webhook/send-whatsapp` | Sends WhatsApp text or document via Meta Cloud API |
| `03_check_availability.json` | `POST /webhook/check-availability` | Reads Google Calendar and returns free 30-min slots |
| `04_update_crm.json` | `POST /webhook/update-crm` | Upserts lead in Zoho CRM + optional custom webhook |
| `05_send_payment_link.json` | `POST /webhook/send-payment-link` | Creates Razorpay payment link and sends SMS to caller |
| `06_send_sms.json` | `POST /webhook/send-sms` | Sends plain SMS via Twilio |

## Credentials to configure in n8n

After importing, set up these credentials in **n8n → Credentials**:

| Credential Name | Type | Used by |
|----------------|------|---------|
| `Google Calendar` | Google Calendar OAuth2 | 01, 03 |
| `Twilio` | Twilio API | 01, 06 |
| `Razorpay Basic Auth` | HTTP Basic Auth (Key ID + Secret) | 05 |

## Environment variables to set in n8n

Go to **Settings → Environment Variables** in your n8n instance:

```
GOOGLE_CALENDAR_ID     = your-calendar@group.calendar.google.com
TWILIO_FROM_NUMBER     = +91XXXXXXXXXX
WHATSAPP_PHONE_ID      = your Meta phone number ID
WHATSAPP_TOKEN         = your Meta permanent access token
RAZORPAY_KEY_ID        = rzp_live_XXXXXXXX
RAZORPAY_KEY_SECRET    = your_razorpay_secret
CUSTOM_CRM_WEBHOOK     = https://your-crm.com/api/leads (optional)
```

## Coolify env vars for VoiceFlow API

```
N8N_BASE_URL       = https://n8n.shadowmarket.ai
N8N_WEBHOOK_KEY    = (optional Bearer token for webhook security)
```

## Testing a workflow manually

```bash
# Test book_appointment
curl -X POST https://n8n.shadowmarket.ai/webhook/book-appointment \
  -H "Content-Type: application/json" \
  -d '{
    "caller_name": "Kumar",
    "phone": "+919876543210",
    "date": "2026-04-25",
    "time": "10:00 AM",
    "purpose": "Property Visit",
    "location": "Velachery"
  }'

# Test send_whatsapp
curl -X POST https://n8n.shadowmarket.ai/webhook/send-whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+919876543210",
    "message": "வணக்கம்! உங்கள் appointment confirm ஆகியது.",
    "document_url": ""
  }'

# Test payment link
curl -X POST https://n8n.shadowmarket.ai/webhook/send-payment-link \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+919876543210",
    "amount_inr": 5000,
    "description": "Property booking advance"
  }'
```
