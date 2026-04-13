/**
 * Core TypeScript Interfaces for Swetha Structures CRM
 *
 * KB-008: NO 'any' type — every field is explicitly typed.
 * These interfaces match the FastAPI backend Pydantic models.
 */

import {
  UserRole,
  LeadStatus,
  DealStage,
  ActivityType,
  EmotionType,
  IntentType,
  DialectType,
  SentimentType,
  CampaignStatus,
  CampaignType,
  TicketStatus,
  TicketPriority,
  MessageStatus,
  MessageType,
} from './enums';

// Re-export all enums for convenience
export * from './enums';

// ─────────────────────────────────────────────
// Auth & User
// ─────────────────────────────────────────────

export interface User {
  id: number | string;
  email: string;
  full_name: string;
  name?: string; // Alias used in demo login
  role: UserRole | string;
  phone?: string;
  is_active: boolean;
  avatar_url?: string;
  tenant_id?: number;
  company?: string;
  plan?: string;
  created_at: string;
  updated_at?: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
}

// ─────────────────────────────────────────────
// API
// ─────────────────────────────────────────────

export interface ApiError {
  detail: string;
  status_code: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface ApiQueryParams {
  page?: number;
  per_page?: number;
  search?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  [key: string]: string | number | boolean | undefined;
}

// ─────────────────────────────────────────────
// CRM: Lead
// ─────────────────────────────────────────────

export interface Lead {
  id: number;
  user_id: number;
  name: string;
  email?: string;
  phone: string;
  company?: string;
  source?: string;
  status: LeadStatus;
  lead_score: number;
  tags?: string[];
  notes?: string;
  assigned_to?: number;
  last_contacted_at?: string;
  created_at: string;
  updated_at?: string;
}

export interface LeadCreatePayload {
  name: string;
  email?: string;
  phone: string;
  company?: string;
  source?: string;
  status?: LeadStatus;
  tags?: string[];
  notes?: string;
}

// ─────────────────────────────────────────────
// CRM: Company
// ─────────────────────────────────────────────

export interface Company {
  id: number;
  user_id: number;
  name: string;
  industry?: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  employee_count?: number;
  annual_revenue?: number;
  description?: string;
  created_at: string;
  updated_at?: string;
}

// ─────────────────────────────────────────────
// CRM: Contact
// ─────────────────────────────────────────────

export interface Contact {
  id: number;
  user_id: number;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  mobile?: string;
  company_id?: number;
  company_name?: string;
  designation?: string;
  department?: string;
  address?: string;
  notes?: string;
  tags?: string[];
  created_at: string;
  updated_at?: string;
}

// ─────────────────────────────────────────────
// CRM: Deal
// ─────────────────────────────────────────────

export interface Deal {
  id: number;
  user_id: number;
  name: string;
  value: number;
  currency: string;
  stage: DealStage;
  probability?: number;
  expected_close_date?: string;
  lead_id?: number;
  company_id?: number;
  contact_id?: number;
  assigned_to?: number;
  description?: string;
  tags?: string[];
  created_at: string;
  updated_at?: string;
}

// ─────────────────────────────────────────────
// CRM: Activity
// ─────────────────────────────────────────────

export interface Activity {
  id: number;
  user_id: number;
  type: ActivityType;
  title: string;
  description?: string;
  lead_id?: number;
  deal_id?: number;
  contact_id?: number;
  due_date?: string;
  completed: boolean;
  completed_at?: string;
  created_at: string;
  updated_at?: string;
}

// ─────────────────────────────────────────────
// Voice AI
// ─────────────────────────────────────────────

export interface VoiceAnalysis {
  id: number;
  request_id: string;
  user_id: number;
  lead_id?: number;

  // Transcription
  transcription: string;
  language: string;
  dialect: DialectType | string;
  confidence: number;

  // Emotion
  emotion: EmotionType;
  emotion_confidence: number;
  emotion_scores: Record<string, number>;

  // Gen Z detection
  gen_z_score: number;
  slang_detected: SlangItem[];

  // Code mixing
  is_code_mixed: boolean;
  languages_detected: Record<string, number>;

  // Marketing intent
  intent: IntentType;
  intent_confidence: number;
  lead_score: number;
  sentiment: number;

  // Keywords
  keywords: string[];

  // Metadata
  processing_time_ms: number;
  audio_duration_s: number;
  timestamp: string;
  created_at: string;
}

export interface SlangItem {
  term: string;
  meaning: string;
}

export interface VoiceProcessRequest {
  audio_url?: string;
  language?: string;
  enable_emotion?: boolean;
  enable_intent?: boolean;
  callback_url?: string;
}

// ─────────────────────────────────────────────
// Campaigns
// ─────────────────────────────────────────────

export interface Campaign {
  id: number;
  user_id: number;
  tenant_id?: number;
  name: string;
  description?: string;
  type: CampaignType | string;
  status: CampaignStatus;

  // Targeting
  audience_criteria?: Record<string, string | number | boolean>;
  recipient_count: number;

  // Budget (in paisa for Razorpay)
  budget?: number;
  spent?: number;
  currency: string;

  // Scheduling
  scheduled_at?: string;
  started_at?: string;
  completed_at?: string;

  // Stats
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;

  // Metadata
  created_at: string;
  updated_at?: string;
  created_by?: number;
}

// ─────────────────────────────────────────────
// Help Desk: Ticket
// ─────────────────────────────────────────────

export interface Ticket {
  id: number;
  user_id: number;
  tenant_id?: number;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category?: string;
  assigned_to?: number;
  assigned_agent_name?: string;
  contact_id?: number;
  lead_id?: number;
  tags?: string[];
  resolution?: string;
  resolved_at?: string;
  first_response_at?: string;
  created_at: string;
  updated_at?: string;
}

export interface TicketComment {
  id: number;
  ticket_id: number;
  user_id: number;
  author_name: string;
  comment: string;
  is_internal: boolean;
  created_at: string;
}

// ─────────────────────────────────────────────
// Surveys
// ─────────────────────────────────────────────

export interface Survey {
  id: number;
  user_id: number;
  tenant_id?: number;
  title: string;
  description?: string;
  questions: SurveyQuestion[];
  is_active: boolean;
  response_count: number;
  share_url?: string;
  created_at: string;
  updated_at?: string;
}

export interface SurveyQuestion {
  id: string;
  type: 'text' | 'rating' | 'multiple_choice' | 'checkbox' | 'dropdown' | 'nps';
  question: string;
  required: boolean;
  options?: string[];
}

export interface SurveyResponse {
  id: number;
  survey_id: number;
  respondent_name?: string;
  respondent_email?: string;
  respondent_phone?: string;
  answers: Record<string, string | number | string[]>;
  submitted_at: string;
}

// ─────────────────────────────────────────────
// Messaging
// ─────────────────────────────────────────────

export interface Message {
  id: number;
  tenant_id: number;
  message_type: MessageType;
  recipient_phone?: string;
  recipient_email?: string;
  recipient_name?: string;
  lead_id?: number;
  subject?: string;
  content: string;
  template_name?: string;
  status: MessageStatus;
  external_id?: string;
  error_message?: string;
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
  created_at: string;
}

// ─────────────────────────────────────────────
// AI Assistants
// ─────────────────────────────────────────────

export interface Assistant {
  id: number;
  user_id: number;
  name: string;
  description?: string;
  voice_id?: string;
  language: string;
  system_prompt?: string;
  is_active: boolean;
  total_calls: number;
  avg_duration?: number;
  success_rate?: number;
  created_at: string;
  updated_at?: string;
}

// ─────────────────────────────────────────────
// Notifications
// ─────────────────────────────────────────────

export interface Notification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  is_read: boolean;
  link?: string;
  created_at: string;
}

// ─────────────────────────────────────────────
// Dashboard / Analytics
// ─────────────────────────────────────────────

export interface DashboardStats {
  total_leads: number;
  total_calls: number;
  total_campaigns: number;
  total_revenue: number;
  conversion_rate: number;
  avg_call_duration: number;
  active_campaigns: number;
  open_tickets: number;
}

export interface ChartDataPoint {
  label: string;
  value: number;
  date?: string;
}

// ─────────────────────────────────────────────
// Lead Source Integrations
// ─────────────────────────────────────────────

export interface LeadSourceConfigCreate {
  provider: 'indiamart' | 'justdial' | 'facebook_leads';
  api_key?: string;
  api_secret?: string;
  app_secret?: string;
  page_id?: string;
  polling_interval_minutes?: number;
  is_active?: boolean;
  auto_assign?: boolean;
  assign_to_user_id?: number;
  default_tags?: string[];
}

export interface LeadSourceConfigResponse {
  id: number;
  provider: string;
  api_key_masked?: string;
  page_id?: string;
  polling_interval_minutes: number;
  is_active: boolean;
  auto_assign: boolean;
  assign_to_user_id?: number;
  default_tags?: string[];
  total_ingested: number;
  total_duplicates: number;
  total_errors: number;
  last_sync_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface LeadIngestionResult {
  ingested: number;
  duplicates: number;
  errors: number;
  error_details: string[];
}

export interface LeadSourceStats {
  source: string;
  total: number;
  today: number;
  this_week: number;
  this_month: number;
}

// ─────────────────────────────────────────────
// Voice Agent (Cloned Voices, Knowledge, Recordings)
// ─────────────────────────────────────────────

export interface ClonedVoice {
  id: number;
  tenant_id: string;
  name: string;
  person_name: string | null;
  reference_audio_path: string;
  reference_duration_seconds: number;
  tts_engine: string;
  internal_voice_id: string | null;
  language: string;
  status: string;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface KnowledgeDocument {
  id: number;
  tenant_id: string;
  agent_id: string | null;
  title: string;
  doc_type: string;
  content: string;
  question: string | null;
  answer: string | null;
  chunk_index: number;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface AgentRecording {
  id: number;
  call_id: string;
  caller_number: string;
  agent_voice_id: string | null;
  sip_provider: string;
  recording_path: string | null;
  recording_size_bytes: number;
  audio_format: string;
  duration_seconds: number;
  sample_rate: number;
  full_transcript: string | null;
  transcript_json: Record<string, unknown> | null;
  caller_emotion: string | null;
  caller_intent: string | null;
  caller_sentiment: number | null;
  lead_score: number | null;
  tenant_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface RecordingStats {
  total_recordings: number;
  total_duration_seconds: number;
  avg_duration_seconds: number;
  avg_sentiment: number | null;
  avg_lead_score: number | null;
  emotion_distribution: Record<string, number>;
  intent_distribution: Record<string, number>;
}

// ─────────────────────────────────────────────
// PEB Quotation
// ─────────────────────────────────────────────

export interface Quotation {
  id: number;
  lead_id: number;
  user_id: number;
  project_name: string;
  client_name?: string;
  client_location?: string;
  building_params?: PEBInput;
  boq_results?: BOQResult;
  total_amount: number;
  rate_per_sqft: number;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'revised';
  revision: number;
  parent_quotation_id?: number;
  pdf_path?: string;
  created_at: string;
  updated_at?: string;
}

export interface PEBInput {
  building_length: number;
  building_width: number;
  full_height: number;
  wall_height: number;
  cladding_height: number;
  roof_type: 'gable' | 'single_slope';
  roof_sheet_type: 'bare' | 'puf';
  side_cladding_type: 'bare' | 'puf';
  mezzanine_required: boolean;
  mezz_length?: number;
  mezz_width?: number;
  lighting_sqft?: number;
  steel_rate_main?: number;
  steel_rate_mezz?: number;
}

export interface BOQItem {
  item_no: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  category: string;
  sub_note?: string;
}

export interface BOQResult {
  items: BOQItem[];
  total_amount: number;
  floor_area: number;
  rate_per_sqft: number;
  steel_summary: Record<string, number | string>;
  cladding_summary: Record<string, number>;
}

export interface QuotationLog {
  id: number;
  quotation_id: number;
  user_id: number;
  action: string;
  details?: Record<string, unknown>;
  created_at: string;
}

export interface MaterialRates {
  structural_steel: number;
  bare_galvalume: number;
  puf_panel_roof: number;
  puf_panel_wall: number;
  ridge_flashing: number;
  polycarbonate: number;
  mezzanine_decking: number;
}

// ─────────────────────────────────────────────
// Feature Flags & White Label
// ─────────────────────────────────────────────

export interface ModuleConfig {
  enabled: boolean;
  name: string;
  icon: string;
  description: string;
}

export interface FeatureConfig {
  modules: Record<string, ModuleConfig>;
  regional: {
    languages: string[];
    dialects: Record<string, string[]>;
    genZSupport: boolean;
    emotionDetection: boolean;
  };
}

export interface ThemeBrand {
  name: string;
  tagline: string;
  logo: string | null;
}

export interface ThemeColors {
  primary: Record<string, string>;
  secondary: Record<string, string>;
}

export interface ThemeConfig {
  brand: ThemeBrand;
  colors: ThemeColors;
}
