/**
 * Channels — deployment channel management (fully wired)
 * Each channel has real status + a working configuration modal.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Globe, MessageCircle, Phone, Code, CheckCircle, Clock, Copy, Check,
  X, ExternalLink, Save, Loader2, Settings, Zap, AlertCircle, Terminal,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../../services/api'
import ApiDeveloper from './ApiDeveloper'

/* ─────────── Helpers ─────────────────────────────────────────── */

const LS_KEY = 'voiceflow_channels_config'

function loadSavedConfig() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveConfig(id, data) {
  const all = loadSavedConfig()
  all[id] = { ...data, updated_at: new Date().toISOString() }
  localStorage.setItem(LS_KEY, JSON.stringify(all))
}

/* ─────────── Status badges ───────────────────────────────────── */

function StatusBadge({ status }) {
  const map = {
    active:       { cls: 'bg-emerald-50 text-emerald-700 border-emerald-100', dot: 'bg-emerald-500', label: 'Active' },
    configured:   { cls: 'bg-emerald-50 text-emerald-700 border-emerald-100', dot: 'bg-emerald-500', label: 'Configured' },
    ready:        { cls: 'bg-indigo-50 text-indigo-700 border-indigo-100',  dot: 'bg-indigo-500',  label: 'Ready' },
    needs_setup:  { cls: 'bg-amber-50 text-amber-700 border-amber-100',     dot: 'bg-amber-500',   label: 'Needs setup' },
    checking:     { cls: 'bg-gray-50 text-gray-500 border-gray-200',        dot: 'bg-gray-400',    label: 'Checking...' },
  }
  const s = map[status] || map.needs_setup
  return (
    <span className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full border ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}

/* ─────────── Modal shell ─────────────────────────────────────── */

function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
          className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 overflow-y-auto flex-1">{children}</div>
          {footer && <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50">{footer}</div>}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

/* ─────────── Per-channel config forms ────────────────────────── */

function WebWidgetConfig({ initial, onSave, agents }) {
  const [agentId, setAgentId] = useState(initial.agent_id || '')
  const [position, setPosition] = useState(initial.position || 'bottom-right')
  const [accent, setAccent] = useState(initial.accent || '#6366f1')
  const [greeting, setGreeting] = useState(initial.greeting || 'Hi! How can I help you today?')
  const [mode, setMode] = useState(initial.mode || 'voice+chat')

  const snippet = `<!-- VoiceFlow AI Widget -->
<script>
  window.VoiceFlowConfig = {
    agentId: "${agentId || 'YOUR_AGENT_ID'}",
    position: "${position}",
    accent: "${accent}",
    greeting: "${greeting.replace(/"/g, '\\"')}",
    mode: "${mode}"
  };
</script>
<script src="${window.location.origin}/api/v1/widget/embed.js" async></script>`

  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(snippet)
    setCopied(true)
    toast.success('Embed code copied')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-medium text-gray-700">Agent</label>
        <select value={agentId} onChange={(e) => setAgentId(e.target.value)}
          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
          <option value="">Select an agent...</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700">Position</label>
          <select value={position} onChange={(e) => setPosition(e.target.value)}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="bottom-right">Bottom right</option>
            <option value="bottom-left">Bottom left</option>
            <option value="top-right">Top right</option>
            <option value="top-left">Top left</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Mode</label>
          <select value={mode} onChange={(e) => setMode(e.target.value)}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="voice+chat">Voice + Chat</option>
            <option value="voice">Voice only</option>
            <option value="chat">Chat only</option>
          </select>
        </div>
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700">Accent color</label>
        <div className="flex items-center gap-2 mt-1">
          <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)}
            className="w-12 h-9 rounded-lg border border-gray-200" />
          <input value={accent} onChange={(e) => setAccent(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
        </div>
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700">Greeting message</label>
        <input value={greeting} onChange={(e) => setGreeting(e.target.value)}
          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
      </div>

      <div className="rounded-xl bg-gray-900 text-gray-100 p-4 font-mono text-xs relative">
        <button onClick={copy}
          className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-xs">
          {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
        </button>
        <pre className="whitespace-pre-wrap break-all pr-20">{snippet}</pre>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => onSave({ agent_id: agentId, position, accent, greeting, mode })}
          disabled={!agentId}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" /> Save configuration
        </button>
      </div>
    </div>
  )
}

function WhatsAppConfig({ initial, onSave, onRefresh }) {
  const [phoneId, setPhoneId] = useState(initial.phone_number_id || '')
  const [token, setToken] = useState(initial.access_token || '')
  const [verify, setVerify] = useState(initial.verify_token || 'voiceflow-whatsapp-verify-2026')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testNumber, setTestNumber] = useState('')
  const webhookUrl = `${window.location.origin}/api/v1/whatsapp/webhook`

  const save = async () => {
    setSaving(true)
    try {
      onSave({ phone_number_id: phoneId, access_token: token, verify_token: verify })
      toast.success('WhatsApp configuration saved locally. Set env vars + redeploy to activate server-side.')
    } finally {
      setSaving(false)
    }
  }

  const sendTest = async () => {
    if (!testNumber) return toast.error('Enter a phone number')
    setTesting(true)
    try {
      await api.post('/api/v1/whatsapp/send', { to: testNumber, message: 'Test from VoiceFlow AI — your WhatsApp is connected!' })
      toast.success('Test message sent')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Send failed — check credentials')
    } finally {
      setTesting(false)
    }
  }

  const [copied, setCopied] = useState(false)
  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 text-sm text-blue-900">
        <p className="font-medium mb-2 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Setup steps</p>
        <ol className="list-decimal ml-5 space-y-1 text-blue-800">
          <li>Create a Meta developer account at <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="underline">developers.facebook.com</a></li>
          <li>Create a WhatsApp Business App &amp; get <code className="bg-blue-100 px-1 rounded">phone_number_id</code> + <code className="bg-blue-100 px-1 rounded">access_token</code></li>
          <li>Register the webhook URL below with the verify token</li>
          <li>Subscribe to the <code className="bg-blue-100 px-1 rounded">messages</code> webhook field</li>
        </ol>
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700">Webhook URL (configure in Meta)</label>
        <div className="flex items-center gap-2 mt-1">
          <input readOnly value={webhookUrl}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono bg-gray-50" />
          <button onClick={copyUrl} className="px-3 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50">
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700">Phone Number ID</label>
        <input value={phoneId} onChange={(e) => setPhoneId(e.target.value)}
          placeholder="e.g. 123456789012345"
          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700">Access Token</label>
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)}
          placeholder="EAAxxxxxxx..."
          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700">Verify Token</label>
        <input value={verify} onChange={(e) => setVerify(e.target.value)}
          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
      </div>

      <div className="border-t border-gray-100 pt-4">
        <label className="text-sm font-medium text-gray-700">Send test message</label>
        <div className="flex items-center gap-2 mt-1">
          <input value={testNumber} onChange={(e) => setTestNumber(e.target.value)}
            placeholder="+91XXXXXXXXXX"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <button onClick={sendTest} disabled={testing || !testNumber}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-40">
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Send
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">Requires the env vars to be set on the server.</p>
      </div>

      <div className="flex justify-between">
        <button onClick={onRefresh} className="text-sm text-gray-500 hover:text-indigo-600">Refresh status</button>
        <button onClick={save} disabled={saving || !phoneId || !token}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </button>
      </div>
    </div>
  )
}

function PhoneConfig({ initial, onSave, onRefresh }) {
  const [provider, setProvider] = useState(initial.provider || '')
  const [fromNumber, setFromNumber] = useState(initial.from_number || '')
  const [agentId, setAgentId] = useState(initial.agent_id || '')
  const [recordCalls, setRecordCalls] = useState(initial.record_calls ?? true)
  const [transcribe, setTranscribe] = useState(initial.transcribe ?? true)
  const [businessHours, setBusinessHours] = useState(initial.business_hours || '09:00-18:00')
  const [webhookUrl, setWebhookUrl] = useState(initial.webhook_url || '')
  const [providerStatuses, setProviderStatuses] = useState([])
  const [loading, setLoading] = useState(true)

  const PROVIDERS = [
    { id: 'telecmi', name: 'TeleCMI', cost: '1.2/min', region: 'India', color: 'bg-blue-500' },
    { id: 'vobiz', name: 'Vobiz', cost: '0.9/min', region: 'India (Bulk)', color: 'bg-indigo-500' },
    { id: 'bolna', name: 'Bolna', cost: '1.5/min', region: 'AI Agents', color: 'bg-violet-500' },
    { id: 'exotel', name: 'Exotel', cost: '1.5/min', region: 'India (IVR)', color: 'bg-emerald-500' },
    { id: 'twilio', name: 'Twilio', cost: '4.5/min', region: 'International', color: 'bg-red-500' },
    { id: 'vonage', name: 'Vonage', cost: '3.5/min', region: 'International', color: 'bg-amber-500' },
    { id: 'sip', name: 'SIP Trunk', cost: 'Varies', region: 'Custom', color: 'bg-gray-500' },
  ]

  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const resp = await api.get('/api/v1/telephony/providers')
        setProviderStatuses(resp.data?.providers || [])
      } catch { }
      setLoading(false)
    }
    fetchProviders()
  }, [])

  const isProviderConfigured = (id) => {
    const p = providerStatuses.find(s => s.name?.toLowerCase() === id || s.id === id)
    return p?.configured || false
  }

  return (
    <div className="space-y-5">
      {/* Provider Selection */}
      <div>
        <label className="text-sm font-medium text-gray-700 mb-2 block">Telephony Provider</label>
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading providers...</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {PROVIDERS.map(p => {
              const configured = isProviderConfigured(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => setProvider(p.id)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    provider === p.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : configured
                        ? 'border-gray-200 hover:border-gray-300'
                        : 'border-gray-100 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`w-2 h-2 rounded-full ${configured ? p.color : 'bg-gray-300'}`} />
                    <span className="text-sm font-medium text-gray-900">{p.name}</span>
                    {configured && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Ready</span>}
                  </div>
                  <p className="text-[10px] text-gray-500">{p.region} - Rs {p.cost}</p>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* From Number */}
      <div>
        <label className="text-sm font-medium text-gray-700">From Number (DID)</label>
        <input value={fromNumber} onChange={(e) => setFromNumber(e.target.value)}
          placeholder="+91XXXXXXXXXX"
          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        <p className="text-xs text-gray-400 mt-1">Your business phone number for inbound/outbound calls</p>
      </div>

      {/* Call Settings */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700">Business Hours</label>
          <input value={businessHours} onChange={(e) => setBusinessHours(e.target.value)}
            placeholder="09:00-18:00"
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Post-call Webhook</label>
          <input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://your-server.com/webhook"
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>

      {/* Toggles */}
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={recordCalls} onChange={(e) => setRecordCalls(e.target.checked)}
            className="w-4 h-4 text-indigo-600 border-gray-300 rounded" />
          <span className="text-sm text-gray-700">Record calls</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={transcribe} onChange={(e) => setTranscribe(e.target.checked)}
            className="w-4 h-4 text-indigo-600 border-gray-300 rounded" />
          <span className="text-sm text-gray-700">Auto-transcribe</span>
        </label>
      </div>

      {/* Info */}
      <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 text-xs text-blue-800">
        <p className="font-medium mb-1">Setup</p>
        <p>Go to <b>Integrations</b> to add your provider API credentials first. Once configured, providers will show as "Ready" above.</p>
      </div>

      <div className="flex justify-between">
        <button onClick={onRefresh} className="text-sm text-gray-500 hover:text-indigo-600">Refresh status</button>
        <button
          onClick={() => onSave({ provider, from_number: fromNumber, agent_id: agentId, record_calls: recordCalls, transcribe, business_hours: businessHours, webhook_url: webhookUrl })}
          disabled={!provider}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
        >
          <Save className="w-4 h-4" /> Save configuration
        </button>
      </div>
    </div>
  )
}

// ApiConfig sub-component removed — the Developer tab on this page
// now owns all API / keys / webhooks UX.

/* ─────────── Main page ───────────────────────────────────────── */

export default function Channels() {
  const navigate = useNavigate()
  // Top-level view switcher: no-code channels vs developer API.
  // URL `?view=developer` lands directly on the Developer pane so old
  // /voice/api bookmarks still resolve cleanly.
  const searchView = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('view')
    : null
  const [view, setView] = useState(searchView === 'developer' ? 'developer' : 'channels')
  const [open, setOpen] = useState(null)             // channel id currently being configured
  const [statuses, setStatuses] = useState({
    'web-widget': 'ready',
    'whatsapp': 'checking',
    'phone': 'checking',
  })
  const [savedConfig, setSavedConfig] = useState(loadSavedConfig())
  const [agents, setAgents] = useState([])

  const refreshStatuses = async () => {
    // WhatsApp
    try {
      const { data } = await api.get('/api/v1/whatsapp/status')
      setStatuses(s => ({ ...s, whatsapp: data.status === 'configured' ? 'configured' : 'needs_setup' }))
    } catch {
      setStatuses(s => ({ ...s, whatsapp: 'needs_setup' }))
    }
    // Phone — any telephony provider configured?
    try {
      const { data } = await api.get('/api/v1/telephony/providers')
      const hasAny = Array.isArray(data?.providers) && data.providers.some(p => p.configured)
      setStatuses(s => ({ ...s, phone: hasAny ? 'configured' : 'needs_setup' }))
    } catch {
      setStatuses(s => ({ ...s, phone: 'needs_setup' }))
    }
    // Web widget — configured if we have a saved agent_id
    const saved = loadSavedConfig()
    setSavedConfig(saved)
    setStatuses(s => ({
      ...s,
      'web-widget': saved['web-widget']?.agent_id ? 'configured' : 'ready',
    }))
  }

  const loadAgents = async () => {
    // Pull templates from localStorage (Agents page uses that), else fall back to backend
    try {
      const tpl = JSON.parse(localStorage.getItem('voiceflow_agents') || '[]')
      if (tpl.length > 0) {
        setAgents(tpl.map(a => ({ id: String(a.id), name: a.name })))
        return
      }
    } catch {}
    try {
      const { data } = await api.get('/api/v1/assistants')
      setAgents((data?.assistants || []).map(a => ({ id: String(a.id), name: a.name })))
    } catch {
      setAgents([
        { id: '1', name: 'Sales Assistant' },
        { id: '2', name: 'Support Bot' },
        { id: '3', name: 'Appointment Scheduler' },
      ])
    }
  }

  useEffect(() => {
    refreshStatuses()
    loadAgents()
  }, [])

  const channels = [
    {
      id: 'web-widget',
      name: 'Web Widget',
      description: 'Embed a voice/chat widget on your website. Configure appearance, assign an agent, and copy the snippet.',
      icon: Globe,
      gradient: 'from-indigo-500 to-indigo-600',
      check: 'text-indigo-500',
      features: ['Customizable floating widget', 'Voice + text chat modes', 'Auto-detect visitor language', 'Mobile responsive'],
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp Business',
      description: 'Connect a WhatsApp Business account via Meta Graph API. Handle conversations with AI agents end-to-end.',
      icon: MessageCircle,
      gradient: 'from-emerald-500 to-emerald-600',
      check: 'text-emerald-500',
      features: ['Meta Graph API integration', 'Rich media message support', 'Template message management', 'Test message sender'],
    },
    {
      id: 'phone',
      name: 'Phone (Inbound / Outbound)',
      description: 'Handle inbound calls and run outbound campaigns across telephony providers — TeleCMI, Twilio, Vonage, Exotel, SIP, and more.',
      icon: Phone,
      gradient: 'from-blue-500 to-blue-600',
      check: 'text-blue-500',
      features: ['Inbound routing', 'Outbound dialing', 'Call transfer to humans', 'Real-time transcription'],
    },
  ]

  const handleSave = (id, data) => {
    saveConfig(id, data)
    setSavedConfig(loadSavedConfig())
    setStatuses(s => ({ ...s, [id]: 'configured' }))
    toast.success(`${id.replace('-', ' ')} configuration saved`)
    setOpen(null)
  }

  const renderModalBody = (id) => {
    const initial = savedConfig[id] || {}
    switch (id) {
      case 'web-widget':
        return <WebWidgetConfig initial={initial} agents={agents} onSave={(d) => handleSave(id, d)} />
      case 'whatsapp':
        return <WhatsAppConfig initial={initial} onSave={(d) => handleSave(id, d)} onRefresh={refreshStatuses} />
      case 'phone':
        return <PhoneConfig initial={initial} onSave={(d) => handleSave(id, d)} onRefresh={refreshStatuses} />
      default: return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Channels <span className="text-gray-300">/</span> Developer
          </h1>
          <p className="text-gray-500 mt-1">
            {view === 'channels'
              ? 'Deploy your AI agents across multiple communication channels'
              : 'API endpoints, keys, and webhooks for direct integration'}
          </p>
        </div>
        {view === 'channels' && (
          <button onClick={refreshStatuses}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm text-gray-700">
            <Settings className="w-4 h-4" /> Refresh
          </button>
        )}
      </div>

      {/* Section switcher */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {[
          { key: 'channels',  label: 'Channels',  icon: Globe,
            desc: 'Web widget · WhatsApp · Phone' },
          { key: 'developer', label: 'Developer', icon: Terminal,
            desc: 'API · Keys · Webhooks' },
        ].map((t) => (
          <button key={t.key}
            onClick={() => {
              setView(t.key)
              const url = new URL(window.location)
              if (t.key === 'developer') url.searchParams.set('view', 'developer')
              else url.searchParams.delete('view')
              window.history.replaceState({}, '', url)
            }}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
              view === t.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Developer pane delegates to the existing ApiDeveloper component. */}
      {view === 'developer' && <ApiDeveloper embedded />}

      {view === 'channels' && <>

      {/* Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {channels.map((ch) => {
          const Icon = ch.icon
          const status = statuses[ch.id]
          return (
            <motion.div
              key={ch.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="group p-6 bg-white rounded-2xl border border-gray-200/60 shadow-sm hover:shadow-md hover:border-gray-300/60 transition-all space-y-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl bg-gradient-to-br ${ch.gradient} shadow-sm`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-gray-900 font-semibold">{ch.name}</h3>
                </div>
                <StatusBadge status={status} />
              </div>

              <p className="text-gray-500 text-sm leading-relaxed">{ch.description}</p>

              <ul className="space-y-2">
                {ch.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-gray-600">
                    <CheckCircle className={`w-4 h-4 ${ch.check} flex-shrink-0`} />{f}
                  </li>
                ))}
              </ul>

              {savedConfig[ch.id]?.updated_at && (
                <p className="text-[11px] text-gray-400">
                  Last saved: {new Date(savedConfig[ch.id].updated_at).toLocaleString()}
                </p>
              )}

              <button
                onClick={() => setOpen(ch.id)}
                className="w-full py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-200 hover:shadow-md hover:shadow-indigo-300 transition-all"
              >
                {status === 'configured' ? 'Update configuration' : 'Configure'}
              </button>
            </motion.div>
          )
        })}
      </div>

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? channels.find(c => c.id === open)?.name : ''}
      >
        {open && renderModalBody(open)}
      </Modal>
      </>}
    </div>
  )
}
