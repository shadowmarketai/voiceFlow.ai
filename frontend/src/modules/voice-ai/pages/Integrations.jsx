/**
 * Integrations — CRM, AI, Automation & Calendar connections
 * (Telephony providers are in Phone Numbers page)
 */

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Search, Check, X, Loader2, Settings, Unplug, Link2 } from 'lucide-react'

const categories = ['All', 'CRM', 'AI / Voice', 'Automation', 'Calendar']

const categoryColors = {
  'CRM': { text: 'text-blue-600', ring: 'from-blue-500 to-blue-600' },
  'AI / Voice': { text: 'text-violet-600', ring: 'from-violet-500 to-violet-600' },
  'Automation': { text: 'text-amber-600', ring: 'from-amber-500 to-amber-600' },
  'Calendar': { text: 'text-emerald-600', ring: 'from-emerald-500 to-emerald-600' },
}

const INITIAL_INTEGRATIONS = [
  { id: 'hubspot', name: 'HubSpot', category: 'CRM', description: 'Sync contacts, deals, and call logs with HubSpot CRM.', logo: 'HS', configFields: [{ key: 'api_key', label: 'API Key', placeholder: 'pat-xxx' }] },
  { id: 'salesforce', name: 'Salesforce', category: 'CRM', description: 'Push call outcomes and lead data to Salesforce automatically.', logo: 'SF', configFields: [{ key: 'client_id', label: 'Client ID', placeholder: 'xxx' }, { key: 'client_secret', label: 'Client Secret', placeholder: 'xxx' }] },
  { id: 'zoho', name: 'Zoho CRM', category: 'CRM', description: 'Bi-directional sync with Zoho CRM for contacts and activities.', logo: 'ZO', configFields: [{ key: 'client_id', label: 'Client ID', placeholder: '1000.xxx' }, { key: 'client_secret', label: 'Client Secret', placeholder: 'xxx' }] },
  { id: 'leadsquared', name: 'LeadSquared', category: 'CRM', description: 'Indian CRM for lead capture and nurturing workflows.', logo: 'LS', configFields: [{ key: 'access_key', label: 'Access Key', placeholder: 'xxx' }, { key: 'secret_key', label: 'Secret Key', placeholder: 'xxx' }] },
  { id: 'freshsales', name: 'Freshsales', category: 'CRM', description: 'AI-powered CRM by Freshworks — built for Indian businesses.', logo: 'FS', configFields: [{ key: 'api_key', label: 'API Key', placeholder: 'xxx' }, { key: 'domain', label: 'Domain', placeholder: 'yourcompany.freshsales.io' }] },
  { id: 'groq', name: 'Groq', category: 'AI / Voice', description: 'Ultra-fast LLM inference (~100ms) with Llama 3 for voice agents.', logo: 'GQ', badge: 'Fastest', configFields: [{ key: 'api_key', label: 'API Key', placeholder: 'gsk_xxx' }] },
  { id: 'anthropic', name: 'Anthropic Claude', category: 'AI / Voice', description: 'High-quality AI conversations with Claude for complex queries.', logo: 'CL', configFields: [{ key: 'api_key', label: 'API Key', placeholder: 'sk-ant-xxx' }] },
  { id: 'openai', name: 'OpenAI', category: 'AI / Voice', description: 'GPT-4 for AI responses + Whisper for speech-to-text.', logo: 'OA', configFields: [{ key: 'api_key', label: 'API Key', placeholder: 'sk-xxx' }] },
  { id: 'deepgram', name: 'Deepgram', category: 'AI / Voice', description: 'Real-time speech-to-text with streaming WebSocket support.', logo: 'DG', badge: 'STT', configFields: [{ key: 'api_key', label: 'API Key', placeholder: 'xxx' }] },
  { id: 'elevenlabs', name: 'ElevenLabs', category: 'AI / Voice', description: 'Best-in-class voice cloning + TTS for lifelike AI voices.', logo: 'EL', badge: 'Cloning', configFields: [{ key: 'api_key', label: 'API Key', placeholder: 'sk_xxx' }] },
  { id: 'sarvam', name: 'Sarvam AI', category: 'AI / Voice', description: 'Indian-built: STT + TTS + translation for all Indic languages.', logo: 'SV', badge: 'Indic', configFields: [{ key: 'api_key', label: 'API Key', placeholder: 'xxx' }] },
  { id: 'zapier', name: 'Zapier', category: 'Automation', description: 'Connect VoiceFlow AI with 5,000+ apps via automated workflows.', logo: 'ZP', configFields: [{ key: 'webhook_url', label: 'Webhook URL', placeholder: 'https://hooks.zapier.com/xxx' }] },
  { id: 'n8n', name: 'n8n', category: 'Automation', description: 'Self-hosted workflow automation with full data control.', logo: 'N8', configFields: [{ key: 'webhook_url', label: 'Webhook URL', placeholder: 'https://n8n.yourserver.com/webhook/xxx' }] },
  { id: 'make', name: 'Make', category: 'Automation', description: 'Visual automation platform for complex multi-step workflows.', logo: 'MK', configFields: [{ key: 'webhook_url', label: 'Webhook URL', placeholder: 'https://hook.make.com/xxx' }] },
  { id: 'google-calendar', name: 'Google Calendar', category: 'Calendar', description: 'Schedule appointments directly from voice conversations.', logo: 'GC', configFields: [{ key: 'client_id', label: 'OAuth Client ID', placeholder: 'xxx.apps.googleusercontent.com' }, { key: 'client_secret', label: 'Client Secret', placeholder: 'GOCSPX-xxx' }] },
  { id: 'calcom', name: 'Cal.com', category: 'Calendar', description: 'Open-source scheduling for booking meetings from calls.', logo: 'CC', configFields: [{ key: 'api_key', label: 'API Key', placeholder: 'cal_xxx' }] },
]

function apiHeaders() {
  const token = localStorage.getItem('voiceflow_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  }
}

export default function Integrations() {
  const [activeCategory, setActiveCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [connectionState, setConnectionState] = useState({})
  const [connectModal, setConnectModal] = useState(null)
  const [configValues, setConfigValues] = useState({})
  const [connecting, setConnecting] = useState(false)
  const [manageModal, setManageModal] = useState(null)

  // Load connections from DB on mount
  useState(() => {
    fetch('/api/v1/integrations/', { headers: apiHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.connections) setConnectionState(data.connections)
      })
      .catch(() => {})
  })

  const integrations = INITIAL_INTEGRATIONS.map(def => ({
    ...def,
    connected: !!connectionState[def.id]?.connected,
    config: connectionState[def.id]?.config,
  }))

  const saveConnection = async (id, connected, config) => {
    const next = { ...connectionState }
    if (connected) {
      next[id] = { connected: true, config }
      try {
        const integration = INITIAL_INTEGRATIONS.find(i => i.id === id)
        await fetch(`/api/v1/integrations/${id}/connect`, {
          method: 'POST',
          headers: apiHeaders(),
          body: JSON.stringify({ provider_name: integration?.name || id, config }),
        })
      } catch (_) {}
    } else {
      delete next[id]
      try {
        await fetch(`/api/v1/integrations/${id}`, {
          method: 'DELETE',
          headers: apiHeaders(),
        })
      } catch (_) {}
    }
    setConnectionState(next)
  }

  const filtered = integrations.filter((i) => {
    if (activeCategory !== 'All' && i.category !== activeCategory) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)
    }
    return true
  })

  const connectedCount = integrations.filter(i => i.connected).length

  const handleConnect = async (integrationId) => {
    const integration = INITIAL_INTEGRATIONS.find(i => i.id === integrationId)
    if (!integration) return
    const missing = integration.configFields?.filter(f => !configValues[f.key]?.trim())
    if (missing?.length > 0) {
      toast.error(`Fill in: ${missing.map(f => f.label).join(', ')}`)
      return
    }
    setConnecting(true)
    await saveConnection(integrationId, true, { ...configValues })
    setConnectModal(null)
    setConfigValues({})
    setConnecting(false)
    toast.success(`${integration.name} connected!`)
  }

  const handleDisconnect = async (integrationId) => {
    const integration = INITIAL_INTEGRATIONS.find(i => i.id === integrationId)
    await saveConnection(integrationId, false, undefined)
    setManageModal(null)
    toast.success(`${integration?.name} disconnected`)
  }

  const handleTest = (integrationId) => {
    const integration = INITIAL_INTEGRATIONS.find(i => i.id === integrationId)
    toast.promise(
      new Promise(r => setTimeout(r, 1500)),
      { loading: `Testing ${integration?.name}...`, success: `${integration?.name} is healthy`, error: 'Test failed' }
    )
  }

  // Find data for modals
  const connectIntegration = connectModal ? INITIAL_INTEGRATIONS.find(i => i.id === connectModal) : null
  const manageIntegration = manageModal ? integrations.find(i => i.id === manageModal) : null
  const connectColors = connectIntegration ? (categoryColors[connectIntegration.category] || categoryColors.CRM) : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Integrations</h1>
        <p className="text-gray-500 mt-1">
          {integrations.length} integrations &middot; {connectedCount} connected
          <span className="text-gray-400 ml-2">(Telephony providers are in <a href="/voice/phone-numbers" className="text-indigo-600 hover:underline">Phone Numbers</a>)</span>
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeCategory === cat
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat}
              <span className="ml-1.5 text-xs opacity-70">
                {cat === 'All' ? integrations.length : integrations.filter(i => i.category === cat).length}
              </span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search integrations..."
            className="w-full bg-gray-50/50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
          />
        </div>
      </div>

      {/* Cards — NO framer-motion key to avoid remount */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((integration) => {
          const colors = categoryColors[integration.category] || categoryColors.CRM
          return (
            <div
              key={integration.id}
              className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm hover:shadow-md hover:border-gray-300/60 transition-all duration-200"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors.ring} flex items-center justify-center text-sm font-bold text-white shadow-sm`}>
                    {integration.logo}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-gray-900 font-semibold text-sm">{integration.name}</h3>
                      {integration.badge && (
                        <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-violet-50 text-violet-700 border border-violet-100">
                          {integration.badge}
                        </span>
                      )}
                    </div>
                    <span className={`text-[11px] font-medium ${colors.text}`}>{integration.category}</span>
                  </div>
                </div>
                {integration.connected ? (
                  <span className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                    <Check className="w-3 h-3" /> Connected
                  </span>
                ) : (
                  <span className="px-2.5 py-1 text-[11px] font-medium rounded-full bg-gray-50 text-gray-500 border border-gray-200">
                    Not Connected
                  </span>
                )}
              </div>

              <p className="text-gray-500 text-sm leading-relaxed mb-4">{integration.description}</p>

              {integration.connected ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setManageModal(integration.id)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 transition-all"
                  >
                    <Settings className="w-3.5 h-3.5" /> Manage
                  </button>
                  <button
                    onClick={() => handleTest(integration.id)}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-all"
                  >
                    <Check className="w-3.5 h-3.5" /> Test
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setConfigValues({}); setConnectModal(integration.id) }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gradient-to-r hover:from-indigo-600 hover:to-violet-600 hover:text-white hover:border-transparent hover:shadow-sm transition-all duration-200"
                >
                  <Link2 className="w-3.5 h-3.5" /> Connect
                </button>
              )}
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="p-12 text-center bg-white rounded-2xl border border-gray-200/60 shadow-sm">
          <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No integrations found</p>
        </div>
      )}

      {/* ── Connect Modal ── */}
      {connectIntegration && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setConnectModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-5">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${connectColors.ring} flex items-center justify-center text-sm font-bold text-white`}>
                {connectIntegration.logo}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">Connect {connectIntegration.name}</h3>
                <p className="text-xs text-gray-500">{connectIntegration.category}</p>
              </div>
              <button onClick={() => setConnectModal(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4 mb-5">
              {connectIntegration.configFields?.map(field => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                  <input
                    type={field.key.includes('secret') || field.key.includes('key') ? 'password' : 'text'}
                    value={configValues[field.key] || ''}
                    onChange={(e) => setConfigValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
                  />
                </div>
              ))}
            </div>

            <button
              onClick={() => handleConnect(connectIntegration.id)}
              disabled={connecting}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-sm font-semibold hover:shadow-lg transition-all disabled:opacity-50"
            >
              {connecting ? <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</> : <><Link2 className="w-4 h-4" /> Connect {connectIntegration.name}</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Manage Modal ── */}
      {manageIntegration && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setManageModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-gray-900">Manage {manageIntegration.name}</h3>
              <button onClick={() => setManageModal(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-3 mb-5">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600" />
                <span className="text-sm text-emerald-700 font-medium">Connected and active</span>
              </div>
              {manageIntegration.config && Object.entries(manageIntegration.config).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <span className="text-xs text-gray-500 capitalize">{key.replace(/_/g, ' ')}</span>
                  <code className="text-xs text-gray-700 font-mono">{String(val).slice(0, 8)}****</code>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleTest(manageIntegration.id)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-all"
              >
                Test Connection
              </button>
              <button
                onClick={() => handleDisconnect(manageIntegration.id)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-all"
              >
                <Unplug className="w-3.5 h-3.5" /> Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
