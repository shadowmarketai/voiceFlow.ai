/**
 * AgentBuilder - Light Theme No-Code Visual Agent Builder
 * Clean white panels, indigo accents, subtle shadows
 */

import React, { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Bot, User, Mic, Globe, Brain, FileText, Webhook, Settings,
  Play, Pause, Upload, Trash2, Plus, Copy, Check, ChevronDown,
  ChevronRight, Save, Rocket, Eye, Code, X, Volume2, Clock,
  MessageSquare, Shield, Sparkles, Zap, Send, Loader2,
  Image, FileUp, Link2, HelpCircle
} from 'lucide-react';

/* ─── Design Tokens ────────────────────────────────────────────── */

const LANGUAGES = [
  'English', 'Hindi', 'Tamil', 'Telugu', 'Bengali',
  'Marathi', 'Gujarati', 'Kannada', 'Malayalam', 'Punjabi', 'Hinglish'
];

const VOICE_PRESETS = [
  { id: 'f-natural', name: 'Priya', gender: 'Female', style: 'Natural', color: '#ec4899' },
  { id: 'f-energetic', name: 'Ananya', gender: 'Female', style: 'Energetic', color: '#f97316' },
  { id: 'f-calm', name: 'Meera', gender: 'Female', style: 'Calm', color: '#14b8a6' },
  { id: 'm-professional', name: 'Arjun', gender: 'Male', style: 'Professional', color: '#6366f1' },
  { id: 'm-warm', name: 'Raj', gender: 'Male', style: 'Warm', color: '#f59e0b' },
  { id: 'm-calm', name: 'Vikram', gender: 'Male', style: 'Calm', color: '#3b82f6' },
];

const PERSONALITY_PRESETS = [
  { id: 'professional', label: 'Professional', icon: '\u{1F4BC}' },
  { id: 'friendly', label: 'Friendly', icon: '\u{1F60A}' },
  { id: 'formal', label: 'Formal', icon: '\u{1F3A9}' },
  { id: 'casual', label: 'Casual', icon: '\u270C\uFE0F' },
  { id: 'energetic', label: 'Energetic', icon: '\u26A1' },
  { id: 'calm', label: 'Calm', icon: '\u{1F9D8}' },
];

const AVATAR_PRESETS = [
  { id: 'bot-1', emoji: '\u{1F916}', bg: 'from-indigo-500 to-violet-600' },
  { id: 'bot-2', emoji: '\u{1F3A7}', bg: 'from-emerald-500 to-teal-600' },
  { id: 'bot-3', emoji: '\u{1F4DE}', bg: 'from-amber-500 to-orange-600' },
  { id: 'bot-4', emoji: '\u{1F4AC}', bg: 'from-rose-500 to-pink-600' },
  { id: 'bot-5', emoji: '\u{1F3AF}', bg: 'from-cyan-500 to-blue-600' },
  { id: 'bot-6', emoji: '\u{1F9E0}', bg: 'from-purple-500 to-fuchsia-600' },
];

/* ─── Section Wrapper ──────────────────────────────────────────── */

function ConfigSection({ title, icon: Icon, iconColor, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className={`p-1.5 rounded-lg ${iconColor}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-sm font-semibold text-slate-700 flex-1">{title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </div>
  );
}

/* ─── Input Components ─────────────────────────────────────────── */

function LightInput({ label, value, onChange, placeholder, type = 'text', helpText }) {
  return (
    <div>
      {label && <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all"
      />
      {helpText && <p className="text-[11px] text-slate-400 mt-1">{helpText}</p>}
    </div>
  );
}

function LightTextarea({ label, value, onChange, placeholder, rows = 3 }) {
  return (
    <div>
      {label && <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all resize-none"
      />
    </div>
  );
}

function LightSelect({ label, value, onChange, options }) {
  return (
    <div>
      {label && <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm text-slate-900 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all appearance-none cursor-pointer"
      >
        {options.map((opt) => (
          <option key={typeof opt === 'string' ? opt : opt.value} value={typeof opt === 'string' ? opt : opt.value}>
            {typeof opt === 'string' ? opt : opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function LightSlider({ label, value, onChange, min = 0, max = 100, step = 1, unit = '' }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-slate-600">{label}</label>
        <span className="text-xs text-indigo-600 font-mono font-medium">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gray-200 accent-indigo-500"
      />
    </div>
  );
}

function LightToggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between cursor-pointer group">
      <span className="text-xs font-medium text-slate-600 group-hover:text-slate-800 transition-colors">{label}</span>
      <div className="relative">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
        <div className={`w-9 h-5 rounded-full transition-colors ${checked ? 'bg-indigo-500' : 'bg-gray-200'}`} />
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </div>
    </label>
  );
}

/* ─── FAQ Pair ─────────────────────────────────────────────────── */

function FAQPair({ faq, index, onUpdate, onDelete }) {
  return (
    <div className="p-3 rounded-lg bg-slate-50 border border-gray-100 space-y-2 group">
      <div className="flex items-start justify-between">
        <span className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wider">FAQ #{index + 1}</span>
        <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <input
        value={faq.question}
        onChange={(e) => onUpdate({ ...faq, question: e.target.value })}
        placeholder="Question..."
        className="w-full px-2.5 py-1.5 rounded bg-white border border-gray-200 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-300 focus:outline-none"
      />
      <input
        value={faq.answer}
        onChange={(e) => onUpdate({ ...faq, answer: e.target.value })}
        placeholder="Answer..."
        className="w-full px-2.5 py-1.5 rounded bg-white border border-gray-200 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-300 focus:outline-none"
      />
    </div>
  );
}

/* ─── Chat Preview Widget ──────────────────────────────────────── */

function ChatPreview({ agentName, avatar, greeting, personality }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const chatRef = useRef(null);

  const selectedAvatar = AVATAR_PRESETS.find((a) => a.id === avatar) || AVATAR_PRESETS[0];

  const handleSend = useCallback(() => {
    if (!input.trim()) return;
    const userMsg = { role: 'user', text: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setTyping(true);

    setTimeout(() => {
      const responses = [
        `That's a great question! I'd be happy to help you with that.`,
        `Let me look into that for you. Based on our knowledge base, here's what I found...`,
        `I understand your concern. Let me connect you with the right information.`,
        `Absolutely! Here's what you need to know about that topic.`,
      ];
      setMessages((prev) => [...prev, { role: 'agent', text: responses[Math.floor(Math.random() * responses.length)] }]);
      setTyping(false);
    }, 1200);
  }, [input]);

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white">
        <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${selectedAvatar.bg} flex items-center justify-center text-lg shadow-sm`}>
          {selectedAvatar.emoji}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{agentName || 'My Agent'}</p>
          <p className="text-[10px] text-emerald-600 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Online
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
        {/* Greeting */}
        <div className="flex gap-2">
          <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${selectedAvatar.bg} flex items-center justify-center text-sm flex-shrink-0`}>
            {selectedAvatar.emoji}
          </div>
          <div className="max-w-[80%] px-3 py-2 rounded-2xl rounded-tl-sm bg-white border border-gray-100 shadow-sm">
            <p className="text-xs text-slate-700">{greeting || `Hi! I'm ${agentName || 'your AI assistant'}. How can I help you today?`}</p>
          </div>
        </div>

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'agent' && (
              <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${selectedAvatar.bg} flex items-center justify-center text-sm flex-shrink-0`}>
                {selectedAvatar.emoji}
              </div>
            )}
            <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-xs ${
              msg.role === 'user'
                ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-tr-sm shadow-sm'
                : 'bg-white border border-gray-100 text-slate-700 rounded-tl-sm shadow-sm'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}

        {typing && (
          <div className="flex gap-2">
            <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${selectedAvatar.bg} flex items-center justify-center text-sm flex-shrink-0`}>
              {selectedAvatar.emoji}
            </div>
            <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white border border-gray-100 shadow-sm">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-100 bg-white">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-gray-200 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-300 focus:outline-none"
          />
          <button
            onClick={handleSend}
            className="p-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white hover:from-indigo-400 hover:to-violet-400 transition-colors shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Embed Code Modal ─────────────────────────────────────────── */

function EmbedCodeModal({ agentId, onClose }) {
  const [copied, setCopied] = useState(false);
  const code = `<script src="https://your-domain.com/api/v1/widget/embed.js" data-agent-id="${agentId}"></script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success('Embed code copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 rounded-2xl bg-white border border-gray-200 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Embed Code</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-4">Copy this code and paste it before the closing <code className="text-indigo-600 bg-indigo-50 px-1 rounded">&lt;/body&gt;</code> tag of your website.</p>
        <div className="relative">
          <pre className="p-4 rounded-xl bg-slate-50 border border-gray-200 text-xs text-slate-700 overflow-x-auto font-mono">
            {code}
          </pre>
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 p-2 rounded-lg bg-white border border-gray-200 hover:bg-slate-50 transition-colors shadow-sm"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-slate-500" />}
          </button>
        </div>
        <button
          onClick={onClose}
          className="w-full mt-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:from-indigo-500 hover:to-violet-500 transition-colors shadow-lg shadow-indigo-200"
        >
          Done
        </button>
      </div>
    </div>
  );
}

/* ─── Publish Confirmation Modal ───────────────────────────────── */

function PublishModal({ agentName, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-2xl bg-white border border-gray-200 p-6 shadow-2xl">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200">
            <Rocket className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Publish Agent?</h3>
          <p className="text-sm text-slate-500 mb-6">
            You're about to publish <span className="text-slate-900 font-medium">{agentName || 'this agent'}</span>.
            It will be live and accessible via the embed widget immediately.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:from-indigo-500 hover:to-violet-500 transition-colors shadow-lg shadow-indigo-200"
          >
            Publish Now
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main AgentBuilder ────────────────────────────────────────── */

export default function AgentBuilder() {
  const [agentName, setAgentName] = useState('My Voice Agent');
  const [description, setDescription] = useState('');
  const [avatar, setAvatar] = useState('bot-1');
  const [language, setLanguage] = useState('English');
  const [selectedVoice, setSelectedVoice] = useState('f-natural');
  const [speed, setSpeed] = useState(1.0);
  const [pitch, setPitch] = useState(1.0);
  const [personality, setPersonality] = useState('professional');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [greeting, setGreeting] = useState('');
  const [faqs, setFaqs] = useState([{ question: '', answer: '' }]);
  const [documents, setDocuments] = useState([]);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [allowedDomains, setAllowedDomains] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [apiKey] = useState('vf_sk_' + Math.random().toString(36).slice(2, 18));
  const [maxConvLength, setMaxConvLength] = useState(10);
  const [escalationTrigger, setEscalationTrigger] = useState(3);
  const [workingHoursEnabled, setWorkingHoursEnabled] = useState(false);
  const [autoGreeting, setAutoGreeting] = useState(true);
  const [status, setStatus] = useState('draft');

  const [showEmbedModal, setShowEmbedModal] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const fileInputRef = useRef(null);

  const handleSaveDraft = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.success('Draft saved successfully');
    }, 800);
  };

  const handlePublish = () => {
    setShowPublishModal(false);
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setStatus('published');
      toast.success('Agent published successfully!');
    }, 1000);
  };

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []);
    const newDocs = files.map((f) => ({ name: f.name, size: f.size, type: f.type }));
    setDocuments((prev) => [...prev, ...newDocs]);
    toast.success(`${files.length} file(s) added`);
  };

  const handleCopyApiKey = () => {
    navigator.clipboard.writeText(apiKey);
    setApiKeyCopied(true);
    toast.success('API key copied');
    setTimeout(() => setApiKeyCopied(false), 2000);
  };

  const addFaq = () => setFaqs((prev) => [...prev, { question: '', answer: '' }]);
  const updateFaq = (index, faq) => setFaqs((prev) => prev.map((f, i) => (i === index ? faq : f)));
  const removeFaq = (index) => setFaqs((prev) => prev.filter((_, i) => i !== index));

  const STATUS_COLORS = {
    draft: 'bg-amber-50 text-amber-600 border-amber-200',
    published: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    paused: 'bg-slate-50 text-slate-500 border-slate-200',
  };

  return (
    <div className="-mx-4 lg:-mx-6 -mt-6 lg:-mt-8">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="bg-[#fafbfe] min-h-screen flex flex-col"
      >
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 lg:px-6 py-3 border-b border-gray-200 bg-white sticky top-0 z-30 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            {editingName ? (
              <input
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
                autoFocus
                className="text-lg font-bold text-slate-900 bg-transparent border-b-2 border-indigo-500 focus:outline-none px-0"
              />
            ) : (
              <button onClick={() => setEditingName(true)} className="text-lg font-bold text-slate-900 hover:text-indigo-600 transition-colors truncate">
                {agentName}
              </button>
            )}
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${STATUS_COLORS[status]}`}>
              {status}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEmbedModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 border border-gray-200 hover:bg-slate-50 transition-colors"
            >
              <Code className="w-3.5 h-3.5" /> Embed
            </button>
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 border border-gray-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Draft
            </button>
            <button
              onClick={() => setShowPublishModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-lg shadow-indigo-200 transition-all"
            >
              <Rocket className="w-3.5 h-3.5" /> Publish
            </button>
          </div>
        </div>

        {/* Main content: sidebar + preview */}
        <div className="flex flex-1 min-h-0">
          {/* LEFT SIDEBAR (Configuration) */}
          <div className="w-[420px] flex-shrink-0 border-r border-gray-200 overflow-y-auto bg-white">
            {/* Agent Identity */}
            <ConfigSection title="Agent Identity" icon={User} iconColor="bg-indigo-50 text-indigo-500">
              <LightInput label="Agent Name" value={agentName} onChange={setAgentName} placeholder="e.g., Sales Assistant" />
              <LightTextarea label="Description" value={description} onChange={setDescription} placeholder="What does this agent do?" rows={2} />
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Avatar</label>
                <div className="grid grid-cols-6 gap-2">
                  {AVATAR_PRESETS.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setAvatar(a.id)}
                      className={`w-full aspect-square rounded-xl bg-gradient-to-br ${a.bg} flex items-center justify-center text-xl transition-all ${
                        avatar === a.id ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-white scale-110 shadow-md' : 'opacity-60 hover:opacity-100'
                      }`}
                    >
                      {a.emoji}
                    </button>
                  ))}
                </div>
              </div>
            </ConfigSection>

            {/* Voice & Language */}
            <ConfigSection title="Voice & Language" icon={Mic} iconColor="bg-emerald-50 text-emerald-500">
              <LightSelect label="Language" value={language} onChange={setLanguage} options={LANGUAGES} />
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Voice</label>
                <div className="grid grid-cols-2 gap-2">
                  {VOICE_PRESETS.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVoice(v.id)}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all ${
                        selectedVoice === v.id
                          ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-100'
                          : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: v.color + '15' }}>
                        <Volume2 className="w-3.5 h-3.5" style={{ color: v.color }} />
                      </div>
                      <div className="text-left min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">{v.name}</p>
                        <p className="text-[10px] text-slate-400">{v.gender} - {v.style}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <LightSlider label="Speed" value={speed} onChange={setSpeed} min={0.5} max={2.0} step={0.1} unit="x" />
              <LightSlider label="Pitch" value={pitch} onChange={setPitch} min={0.5} max={2.0} step={0.1} unit="x" />
            </ConfigSection>

            {/* Personality */}
            <ConfigSection title="Personality" icon={Brain} iconColor="bg-violet-50 text-violet-500">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Personality Preset</label>
                <div className="flex flex-wrap gap-2">
                  {PERSONALITY_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPersonality(p.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                        personality === p.id
                          ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-200'
                          : 'bg-slate-50 text-slate-600 border border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span>{p.icon}</span> {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <LightTextarea
                label="System Prompt (Advanced)"
                value={systemPrompt}
                onChange={setSystemPrompt}
                placeholder="You are a helpful voice assistant that..."
                rows={4}
              />
              <LightInput
                label="Greeting Message"
                value={greeting}
                onChange={setGreeting}
                placeholder="Hi! I'm your AI assistant. How can I help?"
              />
            </ConfigSection>

            {/* Knowledge Base */}
            <ConfigSection title="Knowledge Base" icon={FileText} iconColor="bg-amber-50 text-amber-500" defaultOpen={false}>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Upload Documents</label>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex flex-col items-center gap-2 p-6 rounded-xl border-2 border-dashed border-gray-200 hover:border-indigo-300 bg-slate-50 text-slate-400 hover:text-indigo-500 transition-all cursor-pointer"
                >
                  <FileUp className="w-8 h-8" />
                  <p className="text-xs font-medium">Drop files or click to upload</p>
                  <p className="text-[10px] text-slate-400">PDF, TXT, CSV - Max 10MB</p>
                </button>
                <input ref={fileInputRef} type="file" multiple accept=".pdf,.txt,.csv" onChange={handleFileUpload} className="hidden" />
              </div>

              {documents.length > 0 && (
                <div className="space-y-2">
                  {documents.map((doc, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-gray-100">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        <span className="text-xs text-slate-700 truncate">{doc.name}</span>
                      </div>
                      <button onClick={() => setDocuments((prev) => prev.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-slate-600">FAQ Pairs</label>
                  <button onClick={addFaq} className="flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-500 font-medium transition-colors">
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>
                <div className="space-y-2">
                  {faqs.map((faq, i) => (
                    <FAQPair key={i} faq={faq} index={i} onUpdate={(f) => updateFaq(i, f)} onDelete={() => removeFaq(i)} />
                  ))}
                </div>
              </div>

              <LightInput label="Website URL to Scrape" value={websiteUrl} onChange={setWebsiteUrl} placeholder="https://your-company.com" helpText="We'll extract content from this URL for the knowledge base" />
            </ConfigSection>

            {/* Integration Settings */}
            <ConfigSection title="Integration" icon={Webhook} iconColor="bg-cyan-50 text-cyan-500" defaultOpen={false}>
              <LightInput label="Allowed Domains" value={allowedDomains} onChange={setAllowedDomains} placeholder="example.com, app.example.com" helpText="Comma-separated domains where the widget can be embedded" />
              <LightInput label="Webhook URL" value={webhookUrl} onChange={setWebhookUrl} placeholder="https://your-api.com/webhook" helpText="Receive real-time events for conversations" />
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">API Key</label>
                <div className="flex gap-2">
                  <div className="flex-1 px-3 py-2 rounded-lg bg-slate-50 border border-gray-200 text-xs font-mono text-slate-600 truncate">
                    {apiKey}
                  </div>
                  <button onClick={handleCopyApiKey} className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-slate-50 transition-colors">
                    {apiKeyCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-slate-500" />}
                  </button>
                </div>
              </div>
            </ConfigSection>

            {/* Behavior */}
            <ConfigSection title="Behavior" icon={Settings} iconColor="bg-rose-50 text-rose-500" defaultOpen={false}>
              <LightSlider
                label="Max Conversation Length"
                value={maxConvLength}
                onChange={setMaxConvLength}
                min={1}
                max={30}
                unit=" min"
              />
              <LightSlider
                label="Escalation After Failed Responses"
                value={escalationTrigger}
                onChange={setEscalationTrigger}
                min={1}
                max={10}
                unit=" fails"
              />
              <LightToggle label="Working Hours Only" checked={workingHoursEnabled} onChange={setWorkingHoursEnabled} />
              {workingHoursEnabled && (
                <div className="flex gap-3">
                  <LightInput label="Start" value="09:00" onChange={() => {}} type="time" />
                  <LightInput label="End" value="18:00" onChange={() => {}} type="time" />
                </div>
              )}
              <LightToggle label="Auto-Greeting" checked={autoGreeting} onChange={setAutoGreeting} />
            </ConfigSection>
          </div>

          {/* RIGHT PANEL (Live Preview) */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#f1f5f9]">
            {/* Preview header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Live Preview</span>
              </div>
              <button
                onClick={() => setShowEmbedModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors"
              >
                <Code className="w-3 h-3" /> Get Embed Code
              </button>
            </div>

            {/* Mock website with widget overlay */}
            <div className="flex-1 relative overflow-hidden">
              {/* Mock website background */}
              <div className="absolute inset-0 p-8 opacity-40">
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="h-16 rounded-xl bg-gray-200/60" />
                  <div className="grid grid-cols-3 gap-6">
                    <div className="col-span-2 space-y-4">
                      <div className="h-8 w-3/4 rounded-lg bg-gray-200/60" />
                      <div className="h-4 w-full rounded bg-gray-200/40" />
                      <div className="h-4 w-5/6 rounded bg-gray-200/40" />
                      <div className="h-4 w-4/6 rounded bg-gray-200/40" />
                      <div className="h-48 rounded-xl bg-gray-200/60 mt-6" />
                      <div className="h-4 w-full rounded bg-gray-200/40" />
                      <div className="h-4 w-3/4 rounded bg-gray-200/40" />
                    </div>
                    <div className="space-y-4">
                      <div className="h-40 rounded-xl bg-gray-200/60" />
                      <div className="h-32 rounded-xl bg-gray-200/60" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Chat widget */}
              <div className="absolute bottom-6 right-6 w-[360px] h-[500px] rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-gray-300/30 overflow-hidden flex flex-col">
                <ChatPreview
                  agentName={agentName}
                  avatar={avatar}
                  greeting={greeting}
                  personality={personality}
                />
              </div>

              {/* Label */}
              <div className="absolute bottom-6 right-[396px] flex items-center gap-2 text-slate-400">
                <span className="text-xs font-medium whitespace-nowrap bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm">
                  Widget Preview
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modals */}
        {showEmbedModal && <EmbedCodeModal agentId="agent_abc123" onClose={() => setShowEmbedModal(false)} />}
        {showPublishModal && <PublishModal agentName={agentName} onConfirm={handlePublish} onCancel={() => setShowPublishModal(false)} />}
      </motion.div>
    </div>
  );
}
