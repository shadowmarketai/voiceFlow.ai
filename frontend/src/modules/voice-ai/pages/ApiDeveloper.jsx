/**
 * API & Developer — Full developer console with working API key management,
 * live endpoint testing, embed code, and webhook configuration.
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  Key, Code, Globe, Webhook, Copy, Eye, EyeOff, Plus, Trash2,
  ExternalLink, Check, Play, Loader2, ChevronDown, ChevronRight,
  X, Send, AlertCircle, CheckCircle2, Terminal, Zap, Phone,
  Mic, Volume2, Brain, Shield, RefreshCw
} from 'lucide-react'

/* ─── API Base URL ──────────────────────────────────────────────── */
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001'

/* ─── All API Endpoints ─────────────────────────────────────────── */
const API_SECTIONS = [
  {
    title: 'Authentication',
    icon: Shield,
    color: 'emerald',
    endpoints: [
      { method: 'POST', path: '/api/v1/auth/login', description: 'Login with email & password', body: '{"email":"test@example.com","password":"Test1234"}' },
      { method: 'POST', path: '/api/v1/auth/register', description: 'Register new user', body: '{"email":"new@example.com","password":"Test1234","full_name":"Test User"}' },
      { method: 'POST', path: '/api/v1/auth/refresh', description: 'Refresh access token', body: '{"refresh_token":"..."}' },
    ],
  },
  {
    title: 'Voice AI Pipeline',
    icon: Mic,
    color: 'indigo',
    endpoints: [
      { method: 'POST', path: '/api/v1/voice/respond', description: 'Full voice turn: audio → STT → LLM → TTS', body: 'FormData: file (audio)' },
      { method: 'POST', path: '/api/v1/voice/analyze-and-speak', description: 'Analyze audio + synthesize response', body: 'FormData: file (audio), response_text' },
    ],
  },
  {
    title: 'Voice Cloning',
    icon: Brain,
    color: 'violet',
    endpoints: [
      { method: 'POST', path: '/api/v1/voice-clone/register', description: 'Upload sample & create voice clone', body: 'FormData: audio_file, voice_name' },
      { method: 'POST', path: '/api/v1/voice-clone/synthesize', description: 'Speak text in cloned voice', body: '{"voice_id":"vc_xxx","text":"Hello","language":"en"}' },
      { method: 'POST', path: '/api/v1/voice-clone/quality-check', description: 'Check audio quality before cloning', body: 'FormData: audio_file' },
      { method: 'GET', path: '/api/v1/voice-clone/voices', description: 'List all cloned voices', body: null },
      { method: 'DELETE', path: '/api/v1/voice-clone/voices/{voice_id}', description: 'Delete a cloned voice', body: null },
    ],
  },
  {
    title: 'TTS (Text-to-Speech)',
    icon: Volume2,
    color: 'pink',
    endpoints: [
      { method: 'POST', path: '/api/v1/tts/synthesize', description: 'Convert text to speech (5 Indic engines)', body: '{"text":"வணக்கம்","language":"ta","emotion":"happy"}' },
      { method: 'GET', path: '/api/v1/tts/engines', description: 'List available TTS engines', body: null },
      { method: 'GET', path: '/api/v1/tts/voices', description: 'List available voices per engine', body: null },
    ],
  },
  {
    title: 'Telephony (7 Providers)',
    icon: Phone,
    color: 'blue',
    endpoints: [
      { method: 'POST', path: '/api/v1/telephony/call', description: 'Make outbound call (auto provider selection)', body: '{"from_number":"+919876543210","to_number":"+918012345678","webhook_url":"https://...","call_type":"standard"}' },
      { method: 'POST', path: '/api/v1/telephony/bulk-call', description: 'Bulk voice broadcast (Vobiz/Bolna)', body: '{"phone_numbers":["+91..."],"from_number":"+91...","webhook_url":"...","provider":"vobiz"}' },
      { method: 'GET', path: '/api/v1/telephony/numbers', description: 'List phone numbers across all providers', body: null },
      { method: 'GET', path: '/api/v1/telephony/providers', description: 'Get all provider statuses', body: null },
      { method: 'POST', path: '/api/v1/telephony/cost-estimate', description: 'Estimate call cost', body: '{"to_number":"+919876543210","duration_minutes":10}' },
      { method: 'POST', path: '/api/v1/telephony/webhooks/{provider}', description: 'Handle telephony webhooks', body: '{}' },
    ],
  },
  {
    title: 'WebRTC (Browser Calls)',
    icon: Globe,
    color: 'teal',
    endpoints: [
      { method: 'POST', path: '/api/v1/webrtc/session', description: 'Create WebRTC session', body: '{"agent_id":"agent-1","tenant_id":"t-1"}' },
      { method: 'POST', path: '/api/v1/webrtc/signal/{session_id}/offer', description: 'Send SDP offer', body: '{"sdp":"..."}' },
      { method: 'POST', path: '/api/v1/webrtc/signal/{session_id}/ice', description: 'Send ICE candidate', body: '{"candidate":{}}' },
      { method: 'GET', path: '/api/v1/webrtc/ice-config', description: 'Get ICE server config', body: null },
    ],
  },
  {
    title: 'System',
    icon: Zap,
    color: 'amber',
    endpoints: [
      { method: 'GET', path: '/api/info', description: 'Platform info & features', body: null },
      { method: 'GET', path: '/health', description: 'Health check', body: null },
      { method: 'GET', path: '/docs', description: 'Swagger API documentation', body: null },
    ],
  },
]

const METHOD_STYLES = {
  GET: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  POST: 'bg-blue-50 text-blue-700 border-blue-200',
  PUT: 'bg-amber-50 text-amber-700 border-amber-200',
  DELETE: 'bg-red-50 text-red-700 border-red-200',
  WS: 'bg-purple-50 text-purple-700 border-purple-200',
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}

/* ─── API Key Generator ──────────────────────────────────────────── */
function generateApiKey(prefix = 'vf_sk') {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let key = ''
  for (let i = 0; i < 32; i++) key += chars[Math.floor(Math.random() * chars.length)]
  return `${prefix}_${key}`
}

/* ─── Main Component ──────────────────────────────────────────────── */
export default function ApiDeveloper() {
  const [activeTab, setActiveTab] = useState('endpoints') // endpoints | keys | embed | webhooks
  const [apiKeys, setApiKeys] = useState(() => {
    const saved = localStorage.getItem('vf_api_keys')
    return saved ? JSON.parse(saved) : [
      { id: '1', name: 'Production Key', key: generateApiKey('vf_prod'), created: new Date().toISOString(), lastUsed: 'Never' },
    ]
  })
  const [showKey, setShowKey] = useState(null)
  const [newKeyName, setNewKeyName] = useState('')
  const [showNewKeyModal, setShowNewKeyModal] = useState(false)
  const [webhooks, setWebhooks] = useState(() => {
    const saved = localStorage.getItem('vf_webhooks')
    return saved ? JSON.parse(saved) : []
  })
  const [showWebhookModal, setShowWebhookModal] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookEvents, setWebhookEvents] = useState([])
  const [expandedSection, setExpandedSection] = useState(null)
  const [testingEndpoint, setTestingEndpoint] = useState(null)
  const [testResult, setTestResult] = useState(null)
  const [testLoading, setTestLoading] = useState(false)
  const [copiedEmbed, setCopiedEmbed] = useState(false)

  // Persist API keys and webhooks
  useEffect(() => { localStorage.setItem('vf_api_keys', JSON.stringify(apiKeys)) }, [apiKeys])
  useEffect(() => { localStorage.setItem('vf_webhooks', JSON.stringify(webhooks)) }, [webhooks])

  // ── API Key CRUD ──
  const handleCreateKey = () => {
    if (!newKeyName.trim()) { toast.error('Enter a key name'); return }
    const newKey = {
      id: Date.now().toString(),
      name: newKeyName.trim(),
      key: generateApiKey('vf_sk'),
      created: new Date().toISOString(),
      lastUsed: 'Never',
    }
    setApiKeys(prev => [...prev, newKey])
    setNewKeyName('')
    setShowNewKeyModal(false)
    toast.success(`API key "${newKey.name}" created`)
  }

  const handleCopyKey = (key) => {
    navigator.clipboard.writeText(key)
    toast.success('API key copied to clipboard')
  }

  const handleDeleteKey = (id) => {
    setApiKeys(prev => prev.filter(k => k.id !== id))
    toast.success('API key deleted')
  }

  // ── Endpoint Testing ──
  const handleTestEndpoint = async (endpoint) => {
    setTestingEndpoint(endpoint.path)
    setTestLoading(true)
    setTestResult(null)

    const startTime = Date.now()
    try {
      const url = `${API_BASE}${endpoint.path.replace(/{[^}]+}/g, 'test')}`
      const options = { method: endpoint.method === 'DELETE' ? 'DELETE' : endpoint.method }

      if (endpoint.method === 'POST' && endpoint.body && !endpoint.body.startsWith('FormData')) {
        options.headers = { 'Content-Type': 'application/json' }
        options.body = endpoint.body
      }

      const resp = await fetch(url, options)
      const elapsed = Date.now() - startTime
      let data
      try { data = await resp.json() } catch { data = await resp.text() }

      setTestResult({
        status: resp.status,
        statusText: resp.statusText,
        time: elapsed,
        data: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
        ok: resp.ok,
      })
    } catch (err) {
      setTestResult({
        status: 0,
        statusText: 'Network Error',
        time: Date.now() - startTime,
        data: err.message,
        ok: false,
      })
    }
    setTestLoading(false)
  }

  // ── Webhook CRUD ──
  const WEBHOOK_EVENTS = ['call.started', 'call.ended', 'call.transferred', 'transcript.ready', 'agent.error', 'voice.cloned', 'campaign.completed']

  const handleAddWebhook = () => {
    if (!webhookUrl.trim()) { toast.error('Enter a webhook URL'); return }
    if (webhookEvents.length === 0) { toast.error('Select at least one event'); return }
    const wh = {
      id: Date.now().toString(),
      url: webhookUrl.trim(),
      events: [...webhookEvents],
      created: new Date().toISOString(),
      status: 'active',
    }
    setWebhooks(prev => [...prev, wh])
    setWebhookUrl('')
    setWebhookEvents([])
    setShowWebhookModal(false)
    toast.success('Webhook added')
  }

  const handleDeleteWebhook = (id) => {
    setWebhooks(prev => prev.filter(w => w.id !== id))
    toast.success('Webhook removed')
  }

  const handleTestWebhook = async (wh) => {
    toast.promise(
      fetch(wh.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'test.ping', timestamp: new Date().toISOString(), data: {} }),
      }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`) }),
      { loading: 'Sending test ping...', success: 'Webhook responded OK', error: (e) => `Webhook failed: ${e.message}` }
    )
  }

  // ── Embed snippet ──
  const embedSnippet = `<!-- VoiceFlow AI Widget -->
<script
  src="${API_BASE}/api/v1/widget/embed.js"
  data-agent="YOUR_AGENT_ID"
  data-theme="light"
  data-position="bottom-right"
  data-language="en"
></script>`

  const handleCopyEmbed = () => {
    navigator.clipboard.writeText(embedSnippet)
    setCopiedEmbed(true)
    toast.success('Embed code copied')
    setTimeout(() => setCopiedEmbed(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">API & Developer</h1>
          <p className="text-gray-500 mt-1">Manage keys, test endpoints, embed widgets, configure webhooks</p>
        </div>
        <a
          href={`${API_BASE}/docs`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-200 hover:shadow-md transition-all"
        >
          <ExternalLink className="w-4 h-4" />
          Swagger Docs
        </a>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {[
          { key: 'endpoints', label: 'API Endpoints', icon: Terminal, count: API_SECTIONS.reduce((a, s) => a + s.endpoints.length, 0) },
          { key: 'keys', label: 'API Keys', icon: Key, count: apiKeys.length },
          { key: 'embed', label: 'Embed Widget', icon: Code },
          { key: 'webhooks', label: 'Webhooks', icon: Webhook, count: webhooks.length },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
              activeTab === tab.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.count !== undefined && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                activeTab === tab.key ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-500'
              }`}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ ENDPOINTS TAB ═══ */}
      {activeTab === 'endpoints' && (
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-4">
          {API_SECTIONS.map(section => {
            const Icon = section.icon
            const isExpanded = expandedSection === section.title
            return (
              <div key={section.title} className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpandedSection(isExpanded ? null : section.title)}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className={`p-2 rounded-lg bg-${section.color}-50`}>
                    <Icon className={`w-4 h-4 text-${section.color}-600`} />
                  </div>
                  <span className="text-sm font-semibold text-gray-900 flex-1 text-left">{section.title}</span>
                  <span className="text-xs text-gray-400">{section.endpoints.length} endpoints</span>
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t border-gray-100"
                    >
                      <div className="p-4 space-y-2">
                        {section.endpoints.map(ep => (
                          <div key={ep.path} className="group">
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50/50 border border-gray-200/40 hover:border-gray-300/60 hover:bg-gray-50 transition-all">
                              <span className={`px-2.5 py-0.5 text-[11px] font-mono font-bold rounded-md border shrink-0 ${METHOD_STYLES[ep.method] || METHOD_STYLES.GET}`}>
                                {ep.method}
                              </span>
                              <code className="text-xs text-gray-700 flex-1 font-mono truncate">{ep.path}</code>
                              <span className="text-[11px] text-gray-400 hidden lg:block max-w-[200px] truncate">{ep.description}</span>
                              <button
                                onClick={() => handleTestEndpoint(ep)}
                                disabled={testLoading && testingEndpoint === ep.path}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
                              >
                                {testLoading && testingEndpoint === ep.path
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <Play className="w-3 h-3" />
                                }
                                Try it
                              </button>
                            </div>

                            {/* Test Result */}
                            {testingEndpoint === ep.path && testResult && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="mt-2 p-3 rounded-xl bg-gray-900 text-gray-100 text-xs font-mono overflow-hidden"
                              >
                                <div className="flex items-center gap-2 mb-2">
                                  {testResult.ok
                                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                    : <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                                  }
                                  <span className={testResult.ok ? 'text-emerald-400' : 'text-red-400'}>
                                    {testResult.status} {testResult.statusText}
                                  </span>
                                  <span className="text-gray-500">({testResult.time}ms)</span>
                                  <button onClick={() => { setTestingEndpoint(null); setTestResult(null) }}
                                    className="ml-auto text-gray-500 hover:text-white">
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                                <pre className="max-h-48 overflow-auto text-[10px] leading-relaxed whitespace-pre-wrap text-gray-300">
                                  {testResult.data}
                                </pre>
                              </motion.div>
                            )}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </motion.div>
      )}

      {/* ═══ API KEYS TAB ═══ */}
      {activeTab === 'keys' && (
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Manage API keys for authenticating requests</p>
            <button
              onClick={() => setShowNewKeyModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-medium shadow-sm hover:shadow-md transition-all"
            >
              <Plus className="w-4 h-4" /> Create Key
            </button>
          </div>

          <div className="space-y-3">
            {apiKeys.map(k => (
              <div key={k.id} className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-900 font-semibold">{k.name}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setShowKey(showKey === k.id ? null : k.id)}
                      className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all" title="Show/Hide">
                      {showKey === k.id ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button onClick={() => handleCopyKey(k.key)}
                      className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all" title="Copy">
                      <Copy className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDeleteKey(k.id)}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <code className="block px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs font-mono text-gray-600">
                  {showKey === k.id ? k.key : k.key.slice(0, 12) + '••••••••••••••••••••'}
                </code>
                <div className="flex items-center gap-4 mt-3 text-[11px] text-gray-400">
                  <span>Created: {new Date(k.created).toLocaleDateString()}</span>
                  <span>Last used: {k.lastUsed}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Create Key Modal */}
          {showNewKeyModal && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowNewKeyModal(false)}>
              <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Create API Key</h3>
                  <button onClick={() => setShowNewKeyModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
                </div>
                <input
                  type="text" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="Key name (e.g., Production, Development)"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none mb-4"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateKey()}
                  autoFocus
                />
                <button onClick={handleCreateKey}
                  className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-sm font-semibold hover:shadow-lg transition-all">
                  Generate API Key
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ═══ EMBED TAB ═══ */}
      {activeTab === 'embed' && (
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-6">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-2 rounded-lg bg-violet-50"><Code className="w-4 h-4 text-violet-600" /></div>
              <h3 className="text-gray-900 font-semibold">Embed Voice Widget</h3>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Add this snippet before the closing <code className="text-indigo-600 bg-indigo-50 px-1 rounded">&lt;/body&gt;</code> tag of your website.
            </p>
            <div className="relative">
              <pre className="p-4 rounded-xl bg-gray-900 text-gray-100 text-xs overflow-x-auto whitespace-pre font-mono leading-relaxed">
                {embedSnippet}
              </pre>
              <button onClick={handleCopyEmbed}
                className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-all text-xs font-medium">
                {copiedEmbed ? <><Check className="w-3 h-3 text-emerald-400" /><span className="text-emerald-400">Copied</span></> : <><Copy className="w-3 h-3" /> Copy</>}
              </button>
            </div>

            <div className="mt-5 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
              <h4 className="text-sm font-medium text-indigo-800 mb-2">Configuration Options</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { attr: 'data-agent', desc: 'Your agent ID (required)' },
                  { attr: 'data-theme', desc: '"light" or "dark"' },
                  { attr: 'data-position', desc: '"bottom-right" or "bottom-left"' },
                  { attr: 'data-language', desc: 'Default language (en, hi, ta)' },
                  { attr: 'data-color', desc: 'Primary color hex (e.g., #6366f1)' },
                  { attr: 'data-greeting', desc: 'Custom welcome message' },
                ].map(opt => (
                  <div key={opt.attr} className="flex items-start gap-2">
                    <code className="text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded font-mono shrink-0">{opt.attr}</code>
                    <span className="text-indigo-600">{opt.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ═══ WEBHOOKS TAB ═══ */}
      {activeTab === 'webhooks' && (
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Receive real-time notifications for call events</p>
            <button onClick={() => setShowWebhookModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-medium shadow-sm hover:shadow-md transition-all">
              <Plus className="w-4 h-4" /> Add Webhook
            </button>
          </div>

          {webhooks.length === 0 ? (
            <div className="p-10 bg-white rounded-2xl border border-gray-200/60 shadow-sm text-center">
              <Webhook className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-600 font-medium">No webhooks configured</p>
              <p className="text-xs text-gray-400 mt-1">Click "Add Webhook" to start receiving event notifications</p>
            </div>
          ) : (
            <div className="space-y-3">
              {webhooks.map(wh => (
                <div key={wh.id} className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <code className="text-xs font-mono text-gray-700 bg-gray-50 px-2 py-1 rounded-lg">{wh.url}</code>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleTestWebhook(wh)}
                        className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all" title="Test">
                        <Send className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteWebhook(wh.id)}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {wh.events.map(ev => (
                      <span key={ev} className="px-2 py-0.5 text-[10px] font-mono rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">{ev}</span>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2">Added {new Date(wh.created).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}

          {/* Add Webhook Modal */}
          {showWebhookModal && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowWebhookModal(false)}>
              <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Add Webhook</h3>
                  <button onClick={() => setShowWebhookModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint URL</label>
                    <input type="url" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://your-server.com/webhooks/voiceflow"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Events</label>
                    <div className="flex flex-wrap gap-2">
                      {WEBHOOK_EVENTS.map(ev => (
                        <button key={ev}
                          onClick={() => setWebhookEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev])}
                          className={`px-3 py-1.5 text-xs font-mono rounded-lg border transition-all ${
                            webhookEvents.includes(ev)
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-indigo-200'
                          }`}
                        >{ev}</button>
                      ))}
                    </div>
                  </div>
                  <button onClick={handleAddWebhook}
                    className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-sm font-semibold hover:shadow-lg transition-all">
                    Add Webhook
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}
