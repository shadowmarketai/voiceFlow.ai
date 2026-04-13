/**
 * TypeScript Enums matching backend Python enums
 * Keep in sync with src/models/ and src/voice_engine/engine.py
 */

// ── User & Auth ──

export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  AGENT = 'agent',
  USER = 'user',
  VIEWER = 'viewer',
}

// ── CRM ──

export enum LeadStatus {
  NEW = 'new',
  CONTACTED = 'contacted',
  QUALIFIED = 'qualified',
  PROPOSAL = 'proposal',
  NEGOTIATION = 'negotiation',
  WON = 'won',
  LOST = 'lost',
}

export enum DealStage {
  DISCOVERY = 'discovery',
  PROPOSAL = 'proposal',
  NEGOTIATION = 'negotiation',
  CONTRACT = 'contract',
  CLOSED_WON = 'closed_won',
  CLOSED_LOST = 'closed_lost',
}

export enum ActivityType {
  CALL = 'call',
  EMAIL = 'email',
  MEETING = 'meeting',
  NOTE = 'note',
  TASK = 'task',
  WHATSAPP = 'whatsapp',
  SMS = 'sms',
}

// ── Voice AI ──

export enum EmotionType {
  HAPPY = 'happy',
  SAD = 'sad',
  ANGRY = 'angry',
  NEUTRAL = 'neutral',
  FEARFUL = 'fearful',
  SURPRISED = 'surprised',
  DISGUSTED = 'disgusted',
}

export enum IntentType {
  PURCHASE = 'purchase',
  INQUIRY = 'inquiry',
  COMPLAINT = 'complaint',
  SUPPORT = 'support',
  CANCELLATION = 'cancellation',
  FEEDBACK = 'feedback',
  RENEWAL = 'renewal',
  REFERRAL = 'referral',
  UNKNOWN = 'unknown',
}

export enum DialectType {
  STANDARD_HINDI = 'standard_hindi',
  BHOJPURI_HINDI = 'bhojpuri_hindi',
  RAJASTHANI_HINDI = 'rajasthani_hindi',
  CHENNAI_TAMIL = 'chennai_tamil',
  MADURAI_TAMIL = 'madurai_tamil',
  KONGU_TAMIL = 'kongu_tamil',
  TIRUNELVELI_TAMIL = 'tirunelveli_tamil',
  STANDARD_ENGLISH = 'standard_english',
  INDIAN_ENGLISH = 'indian_english',
}

export enum SentimentType {
  POSITIVE = 'positive',
  NEGATIVE = 'negative',
  NEUTRAL = 'neutral',
}

// ── Campaigns ──

export enum CampaignStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum CampaignType {
  VOICE = 'voice',
  WHATSAPP = 'whatsapp',
  SMS = 'sms',
  EMAIL = 'email',
  META_ADS = 'meta_ads',
  GOOGLE_ADS = 'google_ads',
}

// ── Help Desk ──

export enum TicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  WAITING = 'waiting',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum TicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

// ── Messaging ──

export enum MessageProvider {
  WATI = 'wati',
  GUPSHUP = 'gupshup',
  TWILIO = 'twilio',
  MSG91 = 'msg91',
  TEXTLOCAL = 'textlocal',
  SENDGRID = 'sendgrid',
  MAILGUN = 'mailgun',
  SMTP = 'smtp',
}

export enum MessageType {
  WHATSAPP = 'whatsapp',
  SMS = 'sms',
  EMAIL = 'email',
}

export enum MessageStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
}
