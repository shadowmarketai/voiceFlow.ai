/**
 * AgentBuilder — Full Voice Agent Configuration (Edesy-style tabs)
 * ================================================================
 * 5 tabs: Overview | Voice & AI | Behavior | Tools | Integrations
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import CostCalculator from '../components/CostCalculator';
import { useAuth } from '../../../contexts/AuthContext';
import {
  Bot, Mic, Brain, FileText, Webhook, Settings, Play, Pause,
  Trash2, Plus, Copy, Check, ChevronDown, ChevronRight, Save,
  Rocket, Code, X, Volume2, Clock, Sparkles, Zap, Loader2,
  Phone, Shield, Activity, FileUp, HelpCircle, BookOpen,
  ShoppingBag, ScrollText, Search, CheckCircle2, Eye, Globe,
  SlidersHorizontal, MessageSquare, AlertCircle, ArrowRight,
  Headphones, Languages, PhoneCall, PhoneOff, ToggleLeft,
  ToggleRight, Send, ExternalLink, Database, Calendar, Link2,
  CreditCard, Users, Target, Radio, AudioLines, Wrench
} from 'lucide-react';

/* ─── Toggle Component — Green=ON, Red=OFF, pill style ────────── */
function Toggle({ enabled, onChange, label, description }) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {description && <p className="text-[10px] text-gray-400 mt-0.5">{description}</p>}
      </div>
      <button onClick={() => onChange(!enabled)} aria-checked={enabled} role="switch"
        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none ${enabled ? 'bg-emerald-500' : 'bg-red-400'}`}>
        <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform duration-300 ease-in-out ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

/* ─── Section Component ───────────────────────────────────────── */
function Section({ title, icon: Icon, children, collapsible = false, defaultOpen = true, badge, action }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
      <div
        onClick={() => collapsible && setOpen(!open)}
        className={`flex items-center gap-3 px-5 py-4 ${collapsible ? 'cursor-pointer hover:bg-gray-50' : ''} transition-colors`}>
        {Icon && <div className="p-1.5 rounded-lg bg-indigo-50"><Icon className="w-4 h-4 text-indigo-600" /></div>}
        <span className="text-sm font-semibold text-gray-900 flex-1">{title}</span>
        {badge && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{badge}</span>}
        {action}
        {collapsible && (open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />)}
      </div>
      {(!collapsible || open) && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </div>
  );
}

/* ─── Constants ───────────────────────────────────────────────── */
const LLM_PROVIDERS = [
  { id: 'groq', name: 'Groq', model: 'llama-3.1-8b-instant', badge: 'Fastest' },
  { id: 'anthropic', name: 'Anthropic Claude', model: 'claude-haiku-4-5-20251001', badge: 'Quality' },
  { id: 'openai', name: 'OpenAI', model: 'gpt-4o-mini' },
  { id: 'gemini', name: 'Gemini Live 2.5 HD', model: 'gemini-2.5-flash', badge: 'Native Audio' },
];

/* Per-provider model options shown in the Advanced Settings dropdown. */
const MODEL_OPTIONS = {
  groq: [
    { id: 'default',                   label: 'Llama 3.1 8B Instant (Recommended)' },
    { id: 'llama-3.1-8b-instant',       label: 'Llama 3.1 8B Instant — fastest' },
    { id: 'llama-3.1-70b-versatile',    label: 'Llama 3.1 70B — higher quality' },
    { id: 'mixtral-8x7b-32768',         label: 'Mixtral 8x7B — long context' },
  ],
  anthropic: [
    { id: 'default',                     label: 'Claude Haiku 4.5 (Recommended)' },
    { id: 'claude-haiku-4-5-20251001',    label: 'Claude Haiku 4.5 — fast' },
    { id: 'claude-sonnet-4-6',            label: 'Claude Sonnet 4.6 — premium' },
    { id: 'claude-opus-4-6',              label: 'Claude Opus 4.6 — ultra (expensive)' },
  ],
  openai: [
    { id: 'default',       label: 'GPT-4o Mini (Recommended)' },
    { id: 'gpt-4o-mini',    label: 'GPT-4o Mini — fast' },
    { id: 'gpt-4o',         label: 'GPT-4o — premium' },
    { id: 'gpt-4-turbo',    label: 'GPT-4 Turbo' },
  ],
  gemini: [
    { id: 'default',                  label: 'Gemini 2.5 Flash Live (Recommended)' },
    { id: 'gemini-2.5-flash',          label: 'Gemini 2.5 Flash — fast, native audio' },
    { id: 'gemini-2.5-pro',            label: 'Gemini 2.5 Pro — premium' },
    { id: 'gemini-2.0-flash',          label: 'Gemini 2.0 Flash' },
  ],
};

function getModelOptions(providerId) {
  return MODEL_OPTIONS[providerId] || [{ id: 'default', label: 'Default' }];
}

const QUICK_PRESETS = [
  { id: 'low_latency', icon: Zap, label: 'Low Latency', desc: 'Fastest response, Groq + Deepgram' },
  { id: 'high_quality', icon: Sparkles, label: 'High Quality', desc: 'Best accuracy, Claude + ElevenLabs' },
  { id: 'budget', icon: CreditCard, label: 'Budget', desc: 'Cost-effective, Edge TTS + Whisper' },
  { id: 'native_audio', icon: AudioLines, label: 'Native Audio', desc: 'Gemini Live end-to-end' },
];

/* Map AgentBuilder-internal provider ids → pricing catalog keys */
const LLM_TO_CATALOG = {
  groq: 'groq_llama3_8b',
  anthropic: 'claude_haiku',
  openai: 'gpt4o_mini',
  gemini: 'gemini_25_hd',
};
const PRESET_TO_PIPELINE = {
  low_latency:  { stt: 'deepgram_nova2', tts: 'cartesia',           telephony: 'exotel' },
  high_quality: { stt: 'deepgram_nova2', tts: 'elevenlabs_flash',   telephony: 'twilio' },
  budget:       { stt: 'groq_whisper',   tts: 'edge_tts',           telephony: 'airtel' },
  native_audio: { stt: 'deepgram_nova2', tts: 'google_tts',         telephony: 'telecmi' },
};

const VOICES = [
  { id: 'priya', name: 'Priya', gender: 'Female', style: 'Natural', lang: 'Tamil' },
  { id: 'meera', name: 'Meera', gender: 'Female', style: 'Warm', lang: 'Hindi' },
  { id: 'leda', name: 'Leda', gender: 'Female', style: 'Youthful', lang: 'Multi' },
  { id: 'arjun', name: 'Arjun', gender: 'Male', style: 'Professional', lang: 'Hindi' },
  { id: 'arun', name: 'Arun', gender: 'Male', style: 'Clear', lang: 'English' },
  { id: 'nova', name: 'Nova', gender: 'Female', style: 'Friendly', lang: 'Multi' },
];

const OUTCOME_DEFS = [
  { id: 'qualified', label: 'Qualified', desc: 'Lead meets qualification criteria', code: 'QUALIFIED' },
  { id: 'not_qualified', label: 'Not Qualified', desc: 'Lead does not meet criteria', code: 'NOT_QUALIFIED' },
  { id: 'callback', label: 'Callback Requested', desc: 'Lead requested a callback', code: 'CALLBACK_REQUESTED' },
  { id: 'no_answer', label: 'No Answer', desc: 'Call was not answered', code: 'NO_ANSWER' },
  { id: 'voicemail', label: 'Voicemail', desc: 'Reached voicemail', code: 'VOICEMAIL' },
];

const CORE_TOOLS = [
  { id: 'end_call', name: 'End Call', desc: 'End the call. Call this AFTER set_call_outcome and finalize_conversation.', on: true },
  { id: 'set_call_outcome', name: 'Set Call Outcome', desc: 'Records the call result (qualified, not interested, callback, etc.)', on: true },
  { id: 'finalize_conversation', name: 'Finalize Conversation', desc: 'Captures transcript, outcome, and data at call end', on: true },
];

const FEATURE_TOOLS = [
  { id: 'collect_data', name: 'Collect Data', desc: 'Stores individual data points collected during the call', on: false },
  { id: 'collect_multiple', name: 'Collect Multiple Data', desc: 'Stores multiple data points at once from user responses', on: false },
  { id: 'book_meeting', name: 'Book Meeting', desc: 'Record meeting or consultation booking', on: false },
  { id: 'submit_booking', name: 'Submit Booking', desc: 'Store structured booking request (travel, etc.)', on: false },
];

const INTEGRATION_TOOLS = [
  { id: 'calendar', name: 'Calendar & Scheduling', desc: 'Check availability and book via Google Calendar or Cal.com', connected: false },
  { id: 'knowledge_rag', name: 'Knowledge Base (RAG)', desc: 'Search connected knowledge bases for information', connected: true },
  { id: 'browser_auto', name: 'Browser Automation', desc: 'Control web browsers for booking, forms, and data extraction', connected: false },
  { id: 'messaging', name: 'Messaging (SMS & WhatsApp)', desc: 'Send SMS and WhatsApp messages during calls', connected: true },
  { id: 'payment_links', name: 'Payment Links', desc: 'Generate and send payment links during calls', connected: true },
  { id: 'call_transfer', name: 'Call Transfer', desc: 'Transfer calls to human agents or departments', connected: true },
];

const TEMPLATES = [
  { id: 'sales', name: 'Sales Agent', icon: '💼', prompt: 'You are a professional sales agent. Handle objections warmly, always ask for the next step. Keep responses under 40 words.' },
  { id: 'support', name: 'Customer Support', icon: '🎧', prompt: 'You are a patient customer support agent. Listen, acknowledge, and provide clear solutions. Keep responses under 40 words.' },
  { id: 'appointment', name: 'Appointment Scheduler', icon: '📅', prompt: 'You help callers book, reschedule, or cancel appointments. Confirm date, time, and details.' },
  { id: 'survey', name: 'Survey Agent', icon: '📊', prompt: 'Conduct a customer satisfaction survey. Ask questions one at a time. Be polite and brief.' },
  { id: 'lead_qual', name: 'Lead Qualifier', icon: '🎯', prompt: 'Ask about budget, timeline, decision-maker, and pain points. Score the lead and hand off if qualified.' },
  { id: 'payment', name: 'Payment Reminder', icon: '💳', prompt: 'Inform about pending payments, offer payment links, note responses. Professional, never threatening.' },
  { id: 'realestate', name: 'Real Estate', icon: '🏠', prompt: 'You are a real estate lead qualifier. Ask about property preferences, budget, timeline. Offer site visits.' },
  { id: 'onboarding', name: 'Onboarding Guide', icon: '🚀', prompt: 'Walk new customers through setup steps, answer questions, ensure comfort with the product.' },
];

/* ─── Main Component ──────────────────────────────────────────── */
export default function AgentBuilder() {
  const { agentId } = useParams();
  const navigate = useNavigate();
  const isEditMode = !!agentId;

  const [activeTab, setActiveTab] = useState('overview');
  const [saving, setSaving] = useState(false);

  // Agent Identity
  const [agentName, setAgentName] = useState('My Voice Agent');
  const [agentLang, setAgentLang] = useState('English');
  const [agentStatus, setAgentStatus] = useState('draft');

  // Overview — Prompt
  const [systemPrompt, setSystemPrompt] = useState('');
  const [promptVars, setPromptVars] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');

  // Voice & AI
  const { user } = useAuth();
  const isSuperAdmin = !!user?.is_super_admin;
  const [quickPreset, setQuickPreset] = useState('low_latency');

  // ── LLM state (must be declared BEFORE the ref/effects that read it) ──
  const [llmProvider, setLlmProvider] = useState('groq');
  // Advanced LLM settings (shown in an expandable "Advanced Settings" block)
  const [llmModel, setLlmModel] = useState('default');      // specific model within provider
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2000);
  const [topP, setTopP] = useState(0.95);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('priya');

  // Track previous LLM catalog key for cost-impact warnings.
  // This must come AFTER llmProvider is declared (TDZ).
  const prevLlmRef = useRef(LLM_TO_CATALOG[llmProvider] || 'groq_llama3_8b');
  const previousLlmCatalog = prevLlmRef.current;
  useEffect(() => {
    prevLlmRef.current = LLM_TO_CATALOG[llmProvider] || 'groq_llama3_8b';
    // Reset model to default when the provider changes so we don't keep a
    // stale model id from the previous provider's catalog.
    setLlmModel('default');
  }, [llmProvider]);

  // Load agent data in edit mode
  useEffect(() => {
    if (!isEditMode) return;
    try {
      const saved = localStorage.getItem('vf_editing_agent');
      if (!saved) return;
      const agent = JSON.parse(saved);
      setAgentName(agent.name || 'My Voice Agent');
      setAgentLang(agent.language || 'English');
      setAgentStatus(agent.status || 'active');
      if (agent.config) {
        if (agent.config.prompt) setSystemPrompt(agent.config.prompt);
        if (agent.config.llmProvider) setLlmProvider(agent.config.llmProvider);
        if (agent.config.llmModel) setLlmModel(agent.config.llmModel);
        if (agent.config.temperature != null) setTemperature(agent.config.temperature);
        if (agent.config.maxTokens != null) setMaxTokens(agent.config.maxTokens);
        if (agent.config.topP != null) setTopP(agent.config.topP);
        if (agent.config.voice) setSelectedVoice(agent.config.voice);
        if (agent.config.accent) setSpeechAccent(agent.config.accent);
      }
    } catch {}
  }, [isEditMode]);
  const [responseTiming, setResponseTiming] = useState('balanced');
  const [speechAccent, setSpeechAccent] = useState('default');
  const [noiseFilter, setNoiseFilter] = useState(true);
  const [noiseThreshold, setNoiseThreshold] = useState(30);
  const [voicemailDetection, setVoicemailDetection] = useState(false);
  const [silenceHandling, setSilenceHandling] = useState(false);
  const [speechStartSensitivity, setSpeechStartSensitivity] = useState('high');
  const [speechEndSensitivity, setSpeechEndSensitivity] = useState('high');
  const [noiseSuppression, setNoiseSuppression] = useState(false);

  // Behavior
  const [dataFields, setDataFields] = useState([]);
  const [outcomes, setOutcomes] = useState(OUTCOME_DEFS);
  const [customOutcomeInput, setCustomOutcomeInput] = useState('');
  const [allowInterruptions, setAllowInterruptions] = useState(true);
  const [maxDuration, setMaxDuration] = useState(5);
  const [inactivityTimeout, setInactivityTimeout] = useState(15);
  const [idleTurns, setIdleTurns] = useState(3);
  const [endCallBehavior, setEndCallBehavior] = useState('');
  const [callTransfer, setCallTransfer] = useState(false);
  const [realtimeOutcome, setRealtimeOutcome] = useState(true);
  const [postCallAnalysis, setPostCallAnalysis] = useState(false);

  // Tools
  const [coreTools, setCoreTools] = useState(CORE_TOOLS);
  const [featureTools, setFeatureTools] = useState(FEATURE_TOOLS);
  const [integrationTools, setIntegrationTools] = useState(INTEGRATION_TOOLS);

  // Integrations
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookHeaders, setWebhookHeaders] = useState('');
  const [knowledgeLinked, setKnowledgeLinked] = useState(false);

  const handleSave = () => {
    setSaving(true);
    try {
      const id = agentId || `agent-${Date.now()}`;
      const agentData = {
        id,
        name: agentName,
        language: agentLang,
        status: agentStatus,
        updatedAt: new Date().toISOString(),
        config: {
          prompt: systemPrompt,
          llmProvider,
          llmModel,
          temperature,
          maxTokens,
          topP,
          voice: selectedVoice,
          accent: speechAccent,
          quickPreset,
          responseTiming,
          allowInterruptions,
          maxDuration,
          inactivityTimeout,
        },
      };
      // Upsert into vf_custom_agents
      const saved = JSON.parse(localStorage.getItem('vf_custom_agents') || '[]');
      const filtered = saved.filter((a) => a.id !== id);
      localStorage.setItem('vf_custom_agents', JSON.stringify([agentData, ...filtered]));
      localStorage.removeItem('vf_editing_agent');
      toast.success(`Agent "${agentName}" saved`);
      // Navigate back to agents list so the user sees the saved row
      setTimeout(() => navigate('/voice/agents-list'), 400);
    } catch (e) {
      toast.error('Failed to save agent');
    } finally {
      setSaving(false);
    }
  };

  const applyTemplate = (t) => { setSelectedTemplate(t.id); setSystemPrompt(t.prompt); toast.success(`"${t.name}" template applied`); };

  const toggleCoreTool = (id) => setCoreTools(prev => prev.map(t => t.id === id ? { ...t, on: !t.on } : t));
  const toggleFeatureTool = (id) => setFeatureTools(prev => prev.map(t => t.id === id ? { ...t, on: !t.on } : t));
  const toggleIntegrationTool = (id) => setIntegrationTools(prev => prev.map(t => t.id === id ? { ...t, connected: !t.connected } : t));

  const addCustomOutcome = () => {
    if (!customOutcomeInput.trim()) return;
    setOutcomes(prev => [...prev, { id: `custom_${Date.now()}`, label: customOutcomeInput.trim(), desc: 'Custom outcome', code: customOutcomeInput.trim().toUpperCase().replace(/\s+/g, '_') }]);
    setCustomOutcomeInput('');
  };

  const TABS = [
    { id: 'overview', label: 'Overview', icon: FileText },
    { id: 'voice', label: 'Voice & AI', icon: AudioLines },
    { id: 'behavior', label: 'Behavior', icon: Target },
    { id: 'tools', label: 'Tools', icon: Wrench },
    { id: 'integrations', label: 'Integrations', icon: Link2 },
  ];

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001';

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <button onClick={() => navigate('/voice/agents-list')} className="hover:text-indigo-600 transition-colors">Agents</button>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-900 font-medium">{isEditMode ? 'Edit Agent' : 'New Agent'}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <input value={agentName} onChange={e => setAgentName(e.target.value)}
                className="text-lg font-bold text-gray-900 bg-transparent border-none focus:outline-none focus:border-b-2 focus:border-indigo-500 p-0" />
              <span className="text-xs text-gray-500">IN</span>
              <span className="text-xs text-gray-500">{agentLang}</span>
              <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${agentStatus === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : agentStatus === 'draft' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-gray-100 text-gray-500'}`}>
                {agentStatus}
              </span>
            </div>
            {isEditMode && <p className="text-[10px] text-gray-400 mt-0.5">Updated {new Date().toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEditMode && (
            <button onClick={() => { navigate('/voice/testing'); toast.success(`Testing "${agentName}"`); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 transition-all">
              <Phone className="w-4 h-4" /> Test Call
            </button>
          )}
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 shadow-sm hover:shadow-md disabled:opacity-50 transition-all">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
              activeTab === tab.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ OVERVIEW TAB ═══ */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Agent Instructions (Prompt) */}
          <Section title="Agent Instructions" icon={MessageSquare}>
            <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={12}
              placeholder="## CRITICAL INSTRUCTION - DO NOT OUTPUT THINKING&#10;NEVER output your internal thoughts, reasoning, or meta-commentary.&#10;&#10;## ROLE&#10;You are a sales agent for..."
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-mono resize-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none leading-relaxed" />
            <p className="text-[10px] text-gray-400">{systemPrompt.length} characters &middot; Use {'{{variable}}'} for runtime replacement</p>
          </Section>

          {/* Variables */}
          <Section title="Variables" icon={Code} collapsible defaultOpen={false} badge={`${promptVars.length}`}>
            <p className="text-xs text-gray-500">Use <code className="bg-gray-100 px-1 rounded">{'{{variable_name}}'}</code> in your prompt to use variables.</p>
            {promptVars.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={v.name} onChange={e => setPromptVars(prev => prev.map((p, j) => j === i ? { ...p, name: e.target.value } : p))}
                  placeholder="Variable name" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                <button onClick={() => setPromptVars(prev => prev.filter((_, j) => j !== i))} className="p-2 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <button onClick={() => setPromptVars(prev => [...prev, { name: '', type: 'string', default: '' }])}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium">
              <Plus className="w-3 h-3" /> Add variable
            </button>
          </Section>
        </div>
      )}

      {/* ═══ VOICE & AI TAB ═══ */}
      {activeTab === 'voice' && (
        <div className="space-y-4">
          {/* Voice Pipeline Summary */}
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AudioLines className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-semibold text-gray-900">Voice Pipeline</h3>
                <span className="text-[10px] text-gray-400">How your agent hears and speaks</span>
              </div>
              <span className="text-xs text-gray-500">~120ms</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span className="px-2 py-1 bg-blue-50 rounded-lg text-blue-700 font-medium">Audio In</span>
              <ArrowRight className="w-3 h-3 text-gray-300" />
              <span className="px-2 py-1 bg-violet-50 rounded-lg text-violet-700 font-medium">{LLM_PROVIDERS.find(p => p.id === llmProvider)?.name}</span>
              <ArrowRight className="w-3 h-3 text-gray-300" />
              <span className="px-2 py-1 bg-emerald-50 rounded-lg text-emerald-700 font-medium">Audio Out</span>
            </div>

            {/* Live cost calculator — uses backend pricing catalog + tenant rate plan */}
            <CostCalculator
              stt={(PRESET_TO_PIPELINE[quickPreset] || PRESET_TO_PIPELINE.low_latency).stt}
              llm={LLM_TO_CATALOG[llmProvider] || 'groq_llama3_8b'}
              tts={(PRESET_TO_PIPELINE[quickPreset] || PRESET_TO_PIPELINE.low_latency).tts}
              telephony={(PRESET_TO_PIPELINE[quickPreset] || PRESET_TO_PIPELINE.low_latency).telephony}
              previousLlm={previousLlmCatalog}
              monthlyMinutes={1000}
            />
          </div>

          {/* Quick Setup */}
          <Section title="Quick Setup" icon={Zap}>
            <p className="text-xs text-gray-500 mb-2">Select a preset or customize below</p>
            <div className="grid grid-cols-4 gap-3">
              {QUICK_PRESETS.map(p => (
                <button key={p.id} onClick={() => setQuickPreset(p.id)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${quickPreset === p.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'}`}>
                  <p.icon className={`w-5 h-5 mb-1 ${quickPreset === p.id ? 'text-indigo-600' : 'text-gray-400'}`} />
                  <p className="text-xs font-semibold text-gray-900">{p.label}</p>
                  <p className="text-[9px] text-gray-400 mt-0.5">{p.desc}</p>
                </button>
              ))}
            </div>
          </Section>

          {/* LLM Configuration — super-admin only
              (Regular users / tenants pick a preset above; the preset
              determines the LLM/STT/TTS stack behind the scenes.) */}
          {isSuperAdmin && (
            <Section title="LLM Configuration (Super Admin)" icon={Brain}>
              <p className="text-xs text-gray-500 mb-3">
                Override the preset's default LLM. Visible only to platform admins.
              </p>
              <div className="space-y-3">
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Provider</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {LLM_PROVIDERS.map(p => (
                    <button key={p.id} onClick={() => setLlmProvider(p.id)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${llmProvider === p.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'}`}>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                        {p.badge && <span className="text-[8px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{p.badge}</span>}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5 font-mono">{p.model}</p>
                    </button>
                  ))}
                </div>
              </div>
            </Section>
          )}

          {/* Advanced Settings — everyone sees this (temperature / max tokens / model) */}
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
            <button onClick={() => setAdvancedOpen(o => !o)}
              className="w-full flex items-center justify-between text-left">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-900">Advanced Settings</h3>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
            </button>

            {advancedOpen && (
              <div className="mt-4 space-y-5">
                {/* Model */}
                <div>
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Model</label>
                  <select value={llmModel} onChange={(e) => setLlmModel(e.target.value)}
                    className="mt-1.5 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-indigo-300">
                    {getModelOptions(llmProvider).map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-400 mt-1">
                    Model used for {LLM_PROVIDERS.find(p => p.id === llmProvider)?.name || 'this provider'}
                  </p>
                </div>

                {/* Temperature */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Temperature</label>
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-700">
                      {temperature.toFixed(2)}
                    </span>
                  </div>
                  <input type="range" min="0" max="2" step="0.05" value={temperature}
                    onChange={(e) => setTemperature(Number(e.target.value))}
                    className="w-full accent-indigo-600" />
                  <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                    <span>Focused · deterministic</span>
                    <span>Creative · varied</span>
                  </div>
                </div>

                {/* Max Tokens + Top P */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Max Tokens</label>
                    <input type="number" min="100" max="32000" step="100" value={maxTokens}
                      onChange={(e) => setMaxTokens(Number(e.target.value) || 2000)}
                      className="mt-1.5 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-300" />
                    <p className="text-[10px] text-gray-400 mt-1">Longest reply the LLM can produce.</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Top P</label>
                    <input type="number" min="0" max="1" step="0.05" value={topP}
                      onChange={(e) => setTopP(Number(e.target.value) || 0.95)}
                      className="mt-1.5 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-300" />
                    <p className="text-[10px] text-gray-400 mt-1">Nucleus-sampling probability. Leave 0.95 if unsure.</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Voice + Response Timing */}
          <Section title="Voice" icon={Volume2}>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
              {VOICES.map(v => (
                <button key={v.id} onClick={() => setSelectedVoice(v.id)}
                  className={`p-2.5 rounded-xl border text-center transition-all ${selectedVoice === v.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'}`}>
                  <span className={`inline-block w-6 h-6 rounded-full text-[10px] font-bold leading-6 ${v.gender === 'Female' ? 'bg-pink-100 text-pink-600' : 'bg-blue-100 text-blue-600'}`}>
                    {v.gender === 'Female' ? '♀' : '♂'}
                  </span>
                  <p className="text-[11px] font-medium text-gray-900 mt-1">{v.name}</p>
                  <p className="text-[9px] text-gray-400">{v.gender} · {v.style}</p>
                </button>
              ))}
            </div>

            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-2 block">Response Timing</label>
            <div className="grid grid-cols-3 gap-2">
              {['Low Latency', 'Balanced', 'Conservative'].map(t => (
                <button key={t} onClick={() => setResponseTiming(t.toLowerCase().replace(' ', '_'))}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${responseTiming === t.toLowerCase().replace(' ', '_') ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-indigo-300'}`}>
                  {t}
                </button>
              ))}
            </div>
          </Section>

          {/* Speech Accent */}
          <Section title="Speech Accent" icon={Languages} collapsible defaultOpen={false}>
            <div className="flex flex-wrap gap-2">
              {['Default', 'Indian English', 'British English', 'American English', 'Australian English'].map(a => (
                <button key={a} onClick={() => setSpeechAccent(a.toLowerCase().replace(/ /g, '_'))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${speechAccent === a.toLowerCase().replace(/ /g, '_') ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-indigo-50'}`}>
                  {a}
                </button>
              ))}
            </div>
          </Section>

          {/* Audio Processing */}
          <Section title="Audio Processing" icon={SlidersHorizontal} collapsible defaultOpen={false} badge="Advanced">
            <Toggle label="Noise Filter" description="Remove background noise from caller audio" enabled={noiseFilter} onChange={setNoiseFilter} />
            {noiseFilter && (
              <div className="pl-3">
                <label className="text-xs text-gray-600">Volume Threshold: {noiseThreshold}%</label>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-gray-400">Sensitive (1%)</span>
                  <input type="range" min="1" max="100" value={noiseThreshold} onChange={e => setNoiseThreshold(parseInt(e.target.value))}
                    className="flex-1 h-1.5 bg-gray-200 rounded-full accent-indigo-500" />
                  <span className="text-[10px] text-gray-400">Aggressive (30%)</span>
                </div>
              </div>
            )}
            <Toggle label="Voicemail Detection" description="Detect voicemail and handle outbound calls" enabled={voicemailDetection} onChange={setVoicemailDetection} />
            <Toggle label="Silence Handling — Multilingual" description="Optimized for multi-language pauses" enabled={silenceHandling} onChange={setSilenceHandling} />

            <div className="p-3 bg-gray-50 rounded-xl">
              <p className="text-xs font-medium text-gray-700 mb-2">Speech Sensitivity</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] text-gray-400">Start:</span>
                  <div className="flex gap-2 mt-1">
                    {['High', 'Low'].map(v => (
                      <button key={v} onClick={() => setSpeechStartSensitivity(v.toLowerCase())}
                        className={`flex-1 px-2 py-1 rounded text-xs font-medium ${speechStartSensitivity === v.toLowerCase() ? 'bg-indigo-500 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400">End:</span>
                  <div className="flex gap-2 mt-1">
                    {['High', 'Low'].map(v => (
                      <button key={v} onClick={() => setSpeechEndSensitivity(v.toLowerCase())}
                        className={`flex-1 px-2 py-1 rounded text-xs font-medium ${speechEndSensitivity === v.toLowerCase() ? 'bg-indigo-500 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <Toggle label="Noise Suppression — RNNoise" description="ML-based noise reduction" enabled={noiseSuppression} onChange={setNoiseSuppression} />
          </Section>
        </div>
      )}

      {/* ═══ BEHAVIOR TAB ═══ */}
      {activeTab === 'behavior' && (
        <div className="space-y-4">
          {/* Data Collection */}
          <Section title="Data Collection" icon={Database} action={
            <button onClick={() => setDataFields(prev => [...prev, { name: '', type: 'text' }])}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700">
              <Plus className="w-3 h-3" /> Add Field
            </button>
          }>
            <p className="text-xs text-gray-500">Define what information the agent should collect during calls</p>
            {dataFields.length === 0 ? (
              <div className="py-8 text-center">
                <Database className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-400">No data fields defined yet.</p>
                <p className="text-[10px] text-gray-400">Add fields to define what information the agent should collect.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {dataFields.map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={f.name} onChange={e => setDataFields(prev => prev.map((p, j) => j === i ? { ...p, name: e.target.value } : p))}
                      placeholder="Field name (e.g., budget, timeline)" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                    <select value={f.type} onChange={e => setDataFields(prev => prev.map((p, j) => j === i ? { ...p, type: e.target.value } : p))}
                      className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white">
                      <option value="text">Text</option><option value="number">Number</option><option value="email">Email</option><option value="phone">Phone</option><option value="boolean">Yes/No</option>
                    </select>
                    <button onClick={() => setDataFields(prev => prev.filter((_, j) => j !== i))} className="p-2 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Lead Qualification & Outcomes */}
          <Section title="Lead Qualification & Outcomes" icon={Target}>
            <Toggle label="Real-time Outcome Detection" description="Allow the AI agent to determine outcomes during the conversation" enabled={realtimeOutcome} onChange={setRealtimeOutcome} />
            <Toggle label="Post-Call Analysis" description="Analyze transcript after call to verify or determine outcome" enabled={postCallAnalysis} onChange={setPostCallAnalysis} />

            <div className="mt-3">
              <label className="text-xs font-medium text-gray-700 mb-2 block">Outcome Definitions</label>
              <div className="space-y-2">
                {outcomes.map(o => (
                  <div key={o.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{o.label}</p>
                      <p className="text-[10px] text-gray-400">{o.desc}</p>
                    </div>
                    <code className="text-[10px] font-mono text-gray-500 bg-white px-2 py-1 rounded border">{o.code}</code>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <input value={customOutcomeInput} onChange={e => setCustomOutcomeInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustomOutcome()}
                  placeholder="Add custom outcome..." className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                <button onClick={addCustomOutcome} className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50">
                  <Plus className="w-3 h-3" /> Add Custom Outcome
                </button>
              </div>
            </div>
          </Section>

          {/* Call Behavior */}
          <Section title="Call Behavior" icon={Phone}>
            <Toggle label="Allow Interruptions" description="When enabled, callers can interrupt the agent mid-speech. Disable for IVR menus." enabled={allowInterruptions} onChange={setAllowInterruptions} />

            <div className="grid grid-cols-3 gap-4 mt-3">
              <div>
                <label className="text-xs text-gray-600">Max Duration</label>
                <p className="text-lg font-bold text-gray-900">{maxDuration}m</p>
                <input type="range" min={1} max={15} value={maxDuration} onChange={e => setMaxDuration(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-gray-200 rounded-full accent-indigo-500" />
                <p className="text-[9px] text-gray-400">30s - 15min</p>
              </div>
              <div>
                <label className="text-xs text-gray-600">Inactivity Timeout</label>
                <p className="text-lg font-bold text-gray-900">{inactivityTimeout}s</p>
                <input type="range" min={5} max={60} value={inactivityTimeout} onChange={e => setInactivityTimeout(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-gray-200 rounded-full accent-indigo-500" />
                <p className="text-[9px] text-gray-400">5s - 60s</p>
              </div>
              <div>
                <label className="text-xs text-gray-600">Idle Turns</label>
                <p className="text-lg font-bold text-gray-900">{idleTurns}</p>
                <input type="range" min={1} max={10} value={idleTurns} onChange={e => setIdleTurns(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-gray-200 rounded-full accent-indigo-500" />
                <p className="text-[9px] text-gray-400">1 - 10 turns</p>
              </div>
            </div>
          </Section>

          {/* End Call Behavior */}
          <Section title="End Call Behavior" icon={PhoneOff} collapsible defaultOpen={false}>
            <p className="text-xs text-gray-500 mb-2">Customize how the agent ends conversations</p>
            <textarea value={endCallBehavior} onChange={e => setEndCallBehavior(e.target.value)} rows={5}
              placeholder="When ending a call, always:&#10;1. Confirm the user has no more questions&#10;2. Summarize any actions/next steps&#10;3. Say a complete goodbye message&#10;4. FINISH speaking before calling end_call function"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm resize-none font-mono" />
            <p className="text-[10px] text-gray-400">{endCallBehavior.length}/2000</p>
          </Section>

          {/* Call Transfer */}
          <Section title="Call Transfer" icon={PhoneCall} badge="Beta">
            <Toggle label="Call Transfer" description="Allow the AI agent to transfer calls to human agents or departments when needed." enabled={callTransfer} onChange={setCallTransfer} />
          </Section>
        </div>
      )}

      {/* ═══ TOOLS TAB ═══ */}
      {activeTab === 'tools' && (
        <div className="space-y-4">
          <Section title="Core Functions" icon={Wrench} badge={`${coreTools.filter(t => t.on).length}/${coreTools.length}`}>
            <div className="space-y-2">
              {coreTools.map(tool => (
                <div key={tool.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Zap className="w-4 h-4 text-indigo-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{tool.name}</p>
                      <p className="text-[10px] text-gray-400">{tool.desc}</p>
                    </div>
                  </div>
                  <button onClick={() => toggleCoreTool(tool.id)}
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out ${tool.on ? 'bg-emerald-500' : 'bg-red-400'}`}>
                    <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform duration-300 ease-in-out ${tool.on ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Feature Tools" icon={Settings} badge={`${featureTools.filter(t => t.on).length}/${featureTools.length}`}>
            <div className="space-y-2">
              {featureTools.map(tool => (
                <div key={tool.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Database className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{tool.name}</p>
                      <p className="text-[10px] text-gray-400">{tool.desc}</p>
                    </div>
                  </div>
                  <button onClick={() => toggleFeatureTool(tool.id)}
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out ${tool.on ? 'bg-emerald-500' : 'bg-red-400'}`}>
                    <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform duration-300 ease-in-out ${tool.on ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Integrations" icon={Link2}>
            <div className="space-y-2">
              {integrationTools.map(tool => (
                <div key={tool.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Globe className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{tool.name}</p>
                      <p className="text-[10px] text-gray-400">{tool.desc}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {tool.connected && <span className="text-[10px] text-emerald-600 flex items-center gap-1"><Check className="w-3 h-3" /> Connected</span>}
                    <button onClick={() => toggleIntegrationTool(tool.id)}
                      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out ${tool.connected ? 'bg-emerald-500' : 'bg-red-400'}`}>
                      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform duration-300 ease-in-out ${tool.connected ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      {/* ═══ INTEGRATIONS TAB ═══ */}
      {activeTab === 'integrations' && (
        <div className="space-y-4">
          {/* Scope note */}
          <div className="flex items-center gap-2 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
            <AlertCircle className="w-4 h-4 text-indigo-500 shrink-0" />
            <p className="text-xs text-indigo-700">
              These settings apply to <span className="font-semibold">this agent only</span>. To manage account-wide API keys and provider connections, go to{' '}
              <a href="/voice/integrations" className="underline font-medium hover:text-indigo-900">Integrations</a>.
            </p>
          </div>

          {/* Knowledge Base */}
          <Section title="Knowledge Base" icon={BookOpen} badge={knowledgeLinked ? 'Linked' : ''}>
            <p className="text-xs text-gray-500 mb-3">Connect knowledge bases to enable RAG-powered conversations. The agent will use document content to answer questions.</p>
            {!knowledgeLinked ? (
              <div className="py-8 text-center border-2 border-dashed border-gray-200 rounded-xl">
                <BookOpen className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-600 font-medium">No knowledge bases linked</p>
                <p className="text-xs text-gray-400 mb-3">Link a knowledge base to enable your agent to answer questions using your documents.</p>
                <button onClick={() => { setKnowledgeLinked(true); toast.success('Knowledge Base linked'); }}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700">
                  Create Knowledge Base
                </button>
              </div>
            ) : (
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm text-emerald-700 font-medium">Knowledge Base connected</span>
                </div>
                <button onClick={() => setKnowledgeLinked(false)} className="text-xs text-red-500 hover:underline">Disconnect</button>
              </div>
            )}
          </Section>

          {/* Webhook */}
          <Section title="Webhook" icon={Webhook}>
            <p className="text-xs text-gray-500 mb-3">Receive call data via HTTP POST after each call ends. Includes transcript, outcome, and all qualification data.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Endpoint URL</label>
                <input value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://your-server.com/webhooks/call-ended"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Custom Headers</label>
                <input value={webhookHeaders} onChange={e => setWebhookHeaders(e.target.value)} placeholder='Authorization: Bearer token'
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono" />
                <p className="text-[10px] text-gray-400 mt-1">Method: HTTP POST (fire-and-forget), Timeout: 10 seconds</p>
              </div>
            </div>
          </Section>

          {/* API Integration */}
          <Section title="API Integration" icon={Code}>
            <p className="text-xs text-gray-500 mb-3">Use these API endpoints to integrate this agent into your applications.</p>

            <div className="mb-4 p-3 bg-gray-50 rounded-xl">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider">Base URL</label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 text-sm font-mono text-gray-900">{API_BASE}</code>
                <button onClick={() => { navigator.clipboard.writeText(API_BASE); toast.success('Copied'); }}
                  className="p-1.5 text-gray-400 hover:text-gray-700"><Copy className="w-4 h-4" /></button>
              </div>
            </div>

            {/* API Endpoints */}
            {[
              { method: 'POST', path: '/api/v1/telephony/call', label: 'Initiate Outbound Call', type: 'Voice', body: `{\n  "from_number": "+919876543210",\n  "to_number": "+918012345678",\n  "webhook_url": "${API_BASE}/api/v1/telephony/webhooks/telecmi",\n  "provider": "telecmi",\n  "call_type": "ai_agent",\n  "agent_id": "${agentName}"\n}` },
              { method: 'POST', path: '/api/v1/telephony/call/{provider}/{call_id}/end', label: 'End Active Call', type: 'Voice', body: '{\n  "call_sid": "CA1234567890abcdef"\n}' },
              { method: 'POST', path: '/api/v1/voice/respond', label: 'Voice Turn (STT→LLM→TTS)', type: 'Voice', body: 'FormData: file (audio), language, system_prompt' },
              { method: 'POST', path: '/api/v1/webrtc/session', label: 'Create Chat Session', type: 'Chat', body: `{\n  "agent_id": "${agentName}",\n  "tenant_id": "your-tenant"\n}` },
              { method: 'GET', path: '/api/v1/voice-clone/voices', label: 'List Cloned Voices', type: 'Voice', body: null },
            ].map(ep => (
              <div key={ep.path} className="mb-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-900">{ep.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{ep.type}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${ep.method === 'POST' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{ep.method}</span>
                  </div>
                </div>
                <div className="px-4 py-2 bg-gray-50 flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono text-gray-700">{ep.path}</code>
                  <button onClick={() => { navigator.clipboard.writeText(`${API_BASE}${ep.path}`); toast.success('Copied'); }}
                    className="p-1 text-gray-400 hover:text-gray-700"><Copy className="w-3.5 h-3.5" /></button>
                </div>
                {ep.body && (
                  <div className="px-4 py-3">
                    <div className="flex gap-4 text-[10px] font-medium text-gray-400 mb-2">
                      <span className="text-indigo-600 border-b border-indigo-600 pb-1">Request Body</span>
                      <span className="cursor-pointer hover:text-gray-600">Response</span>
                      <span className="cursor-pointer hover:text-gray-600">cURL</span>
                    </div>
                    <pre className="text-xs font-mono text-gray-700 bg-gray-50 p-3 rounded-lg overflow-x-auto">{ep.body}</pre>
                  </div>
                )}
              </div>
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}
