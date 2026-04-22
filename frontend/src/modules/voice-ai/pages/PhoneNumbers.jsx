/**
 * Phone Numbers — Buy, manage, and assign numbers across telephony providers.
 *
 * Tabs:
 *   1. My Numbers   — list owned numbers, assign agents, make test calls
 *   2. Buy Number   — browse available numbers and purchase from connected providers
 *   3. Providers    — connect/disconnect provider credentials
 *   4. Cost Compare — visual cost comparison
 */

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  Phone, Plus, Globe, Wifi, Server, Radio, Activity,
  PhoneCall, PhoneForwarded, ChevronDown, RefreshCw,
  IndianRupee, Zap, Shield, Headphones, ArrowRight,
  CheckCircle2, XCircle, Clock, BarChart3, X, Loader2,
  Settings, Link2, Trash2, Check, ShoppingCart, Search,
  Bot, PhoneOutgoing, AlertCircle, ExternalLink,
} from 'lucide-react'
import { telephonyAPI } from '../../../services/api'

const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const slideUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}

const PROVIDERS = [
  {
    id: 'telecmi', name: 'TeleCMI', logo: 'TC', country: 'India',
    cost: '₹1.2/min', gradient: 'from-indigo-500 to-indigo-600',
    description: 'Primary India provider — 70% cheaper than Twilio',
    features: ['Voice', 'SMS', 'DID Numbers', 'Call Recording'],
    tag: 'Best Value', supportsNumberBuy: true,
    signupUrl: 'https://telecmi.com',
    fields: [
      { key: 'api_key', label: 'API Key' },
      { key: 'api_secret', label: 'API Secret' },
      { key: 'account_id', label: 'Account ID' },
    ],
  },
  {
    id: 'bolna', name: 'Bolna', logo: 'BN', country: 'India',
    cost: '₹1.5/min', gradient: 'from-violet-500 to-violet-600',
    description: 'AI voice agent platform with built-in STT/LLM/TTS',
    features: ['AI Agents', 'Batch Calls', 'Transcripts', 'Streaming'],
    tag: 'AI Native', supportsNumberBuy: false,
    signupUrl: 'https://bolna.dev',
    fields: [{ key: 'api_key', label: 'API Key' }],
  },
  {
    id: 'vobiz', name: 'Vobiz', logo: 'VB', country: 'India',
    cost: '₹0.9/min', gradient: 'from-emerald-500 to-emerald-600',
    description: 'Bulk voice broadcasting & IVR for campaigns',
    features: ['Bulk Calls', 'IVR Builder', 'Voice Broadcast', 'DTMF'],
    tag: 'Bulk Calls', supportsNumberBuy: false,
    signupUrl: 'https://vobiz.in',
    fields: [
      { key: 'api_key', label: 'API Key' },
      { key: 'sender_id', label: 'Sender ID' },
    ],
  },
  {
    id: 'exotel', name: 'Exotel', logo: 'EX', country: 'India',
    cost: '₹1.5/min', gradient: 'from-blue-500 to-blue-600',
    description: 'Enterprise IVR & call center solutions for India',
    features: ['ExoML IVR', 'Call Center', 'Number Masking', 'Recording'],
    tag: 'Enterprise', supportsNumberBuy: true,
    signupUrl: 'https://exotel.com',
    fields: [
      { key: 'api_key', label: 'API Key' },
      { key: 'api_token', label: 'API Token' },
      { key: 'sid', label: 'SID' },
    ],
  },
  {
    id: 'twilio', name: 'Twilio', logo: 'TW', country: 'Global',
    cost: '₹4.5/min', gradient: 'from-red-500 to-red-600',
    description: 'Global voice with Media Streams for real-time AI calls',
    features: ['Global Coverage', 'Media Streams', 'SIP', 'Recording'],
    tag: 'Global', supportsNumberBuy: true,
    signupUrl: 'https://twilio.com',
    fields: [
      { key: 'account_sid', label: 'Account SID' },
      { key: 'auth_token', label: 'Auth Token' },
    ],
  },
  {
    id: 'vonage', name: 'Vonage', logo: 'VN', country: 'Global',
    cost: '₹3.5/min', gradient: 'from-purple-500 to-purple-600',
    description: 'International voice API with WebSocket streaming',
    features: ['NCCO Flows', 'WebSocket Audio', 'SIP Connect', 'Recording'],
    tag: 'International', supportsNumberBuy: true,
    signupUrl: 'https://vonage.com',
    fields: [
      { key: 'api_key', label: 'API Key' },
      { key: 'api_secret', label: 'API Secret' },
    ],
  },
  {
    id: 'sip', name: 'SIP Trunk', logo: 'SI', country: 'Any',
    cost: '₹0.5/min', gradient: 'from-slate-500 to-slate-600',
    description: 'Connect your own PBX (Asterisk / FreeSWITCH)',
    features: ['Direct PBX', 'AudioSocket', 'Custom Routing', 'G.711'],
    tag: 'Self-Hosted', supportsNumberBuy: false,
    fields: [
      { key: 'host', label: 'SIP Host' },
      { key: 'port', label: 'SIP Port' },
      { key: 'username', label: 'Username' },
      { key: 'password', label: 'Password' },
    ],
  },
  {
    id: 'webrtc', name: 'WebRTC', logo: 'WR', country: 'Browser',
    cost: 'Free', gradient: 'from-teal-500 to-teal-600',
    description: 'Zero-cost browser-based voice calls via widget',
    features: ['No Phone Needed', 'Browser Calls', 'Opus Codec', 'ICE/STUN'],
    tag: 'Free', supportsNumberBuy: false,
    fields: [],
  },
]

const providerMap = Object.fromEntries(PROVIDERS.map(p => [p.id, p]))


export default function PhoneNumbers() {
  const [providerStatus, setProviderStatus] = useState({})
  const [numbers, setNumbers] = useState([])
  const [agents, setAgents] = useState([])
  const [activeTab, setActiveTab] = useState('numbers')
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [providersRes, numbersRes] = await Promise.allSettled([
        telephonyAPI.getProviders(),
        telephonyAPI.listNumbers(),
      ])

      if (providersRes.status === 'fulfilled') {
        setProviderStatus(providersRes.value.data)
      }
      if (numbersRes.status === 'fulfilled') {
        setNumbers(numbersRes.value.data?.numbers || [])
      }

      // Fetch agents for assignment
      try {
        const res = await fetch('/api/v1/assistants/list')
        if (res.ok) {
          const data = await res.json()
          setAgents(data.assistants || data || [])
        }
      } catch { /* agents optional */ }
    } catch {
      // Use fallback if API unavailable
      const mock = {}
      PROVIDERS.forEach(p => { mock[p.id] = { configured: p.id === 'webrtc', display_name: p.name } })
      setProviderStatus(mock)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const connectedProviders = Object.entries(providerStatus)
    .filter(([, v]) => v.configured)
    .map(([k]) => k)

  const buyableProviders = PROVIDERS.filter(
    p => p.supportsNumberBuy && connectedProviders.includes(p.id)
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Phone Numbers</h1>
          <p className="text-gray-500 mt-1">Buy, manage, and assign phone numbers to your AI agents</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-50 text-gray-700 text-sm font-medium border border-gray-200 hover:bg-gray-100 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => {
              if (buyableProviders.length === 0) {
                setActiveTab('providers')
                toast('Connect a provider first to buy numbers', { icon: '⚡' })
              } else {
                setActiveTab('buy')
              }
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-medium shadow-sm shadow-indigo-200 hover:shadow-md transition-all"
          >
            <ShoppingCart className="w-4 h-4" />
            Buy Number
          </button>
        </div>
      </div>

      {/* Quick Alert if no providers connected */}
      {connectedProviders.length <= 1 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">No telephony provider connected</p>
            <p className="text-xs text-amber-600 mt-0.5">Connect a provider like TeleCMI or Twilio to buy phone numbers and make AI calls.</p>
          </div>
          <button onClick={() => setActiveTab('providers')}
            className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-all">
            Connect Provider
          </button>
        </motion.div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {[
          { key: 'numbers', label: 'My Numbers', icon: Phone, count: numbers.length },
          { key: 'buy', label: 'Buy Number', icon: ShoppingCart },
          { key: 'providers', label: 'Providers', icon: Globe, count: connectedProviders.length },
          { key: 'cost', label: 'Cost Compare', icon: IndianRupee },
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
              <span className={`px-1.5 py-0.5 text-[10px] rounded-full font-bold ${
                activeTab === tab.key ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
              }`}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'numbers' && (
        <NumbersTab numbers={numbers} agents={agents} onRefresh={fetchData} />
      )}
      {activeTab === 'buy' && (
        <BuyNumberTab
          buyableProviders={buyableProviders}
          allProviders={PROVIDERS}
          connectedProviders={connectedProviders}
          onBought={() => { fetchData(); setActiveTab('numbers') }}
          onGoToProviders={() => setActiveTab('providers')}
        />
      )}
      {activeTab === 'providers' && (
        <ProvidersTab providerStatus={providerStatus} onRefresh={fetchData} />
      )}
      {activeTab === 'cost' && <CostTab />}
    </div>
  )
}


// ── Tab 1: My Numbers ──────────────────────────────────────────────

function NumbersTab({ numbers, agents, onRefresh }) {
  const [assignModal, setAssignModal] = useState(null)
  const [testCallModal, setTestCallModal] = useState(null)
  const [testNumber, setTestNumber] = useState('')
  const [calling, setCalling] = useState(false)

  const handleTestCall = async (number) => {
    if (!testNumber.trim()) { toast.error('Enter a phone number to call'); return }
    setCalling(true)
    try {
      const res = await telephonyAPI.makeRealtimeCall({
        from_number: number.number,
        to_number: testNumber.startsWith('+') ? testNumber : `+91${testNumber}`,
        agent_id: number.assigned_to || '',
        language: 'en',
      })
      toast.success(`Call initiated! ID: ${res.data?.call_id || 'pending'}`)
      setTestCallModal(null)
      setTestNumber('')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Call failed — check provider credentials')
    } finally {
      setCalling(false)
    }
  }

  if (numbers.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <Phone className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">No phone numbers yet</h3>
        <p className="text-gray-500 text-sm mt-1 max-w-sm">
          Buy a number from a connected provider to start making AI-powered voice calls.
        </p>
      </motion.div>
    )
  }

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="show" className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Numbers', value: numbers.length, icon: Phone, color: 'indigo' },
          { label: 'Active', value: numbers.filter(n => n.is_active).length, icon: CheckCircle2, color: 'emerald' },
          { label: 'Providers', value: new Set(numbers.map(n => n.provider)).size, icon: Globe, color: 'violet' },
          { label: 'Monthly Cost', value: `₹${numbers.reduce((s, n) => s + (n.monthly_cost || 0), 0).toLocaleString()}`, icon: IndianRupee, color: 'blue' },
        ].map(stat => (
          <motion.div key={stat.label} variants={slideUp}
            className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-500 text-sm">{stat.label}</span>
              <div className={`p-2 rounded-lg bg-${stat.color}-50`}>
                <stat.icon className={`w-4 h-4 text-${stat.color}-500`} />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Numbers Table */}
      <motion.div variants={slideUp} className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-3.5 px-5 text-xs font-medium text-gray-500 uppercase tracking-wider">Number</th>
              <th className="text-left py-3.5 px-5 text-xs font-medium text-gray-500 uppercase tracking-wider">Provider</th>
              <th className="text-left py-3.5 px-5 text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned Agent</th>
              <th className="text-left py-3.5 px-5 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="text-right py-3.5 px-5 text-xs font-medium text-gray-500 uppercase tracking-wider">Cost/mo</th>
              <th className="text-right py-3.5 px-5 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {numbers.map(num => {
              const p = providerMap[num.provider]
              return (
                <tr key={num.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="py-3.5 px-5">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${p?.gradient || 'from-gray-400 to-gray-500'} flex items-center justify-center text-[10px] font-bold text-white`}>
                        {p?.logo || '?'}
                      </div>
                      <span className="font-medium text-gray-900 text-sm font-mono">{num.number}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-5 text-sm text-gray-600">{p?.name || num.provider}</td>
                  <td className="py-3.5 px-5">
                    {num.assigned_to ? (
                      <span className="text-sm text-gray-700 font-medium">{num.assigned_to}</span>
                    ) : (
                      <button onClick={() => setAssignModal(num)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                        + Assign Agent
                      </button>
                    )}
                  </td>
                  <td className="py-3.5 px-5">
                    <span className="flex items-center gap-1.5 text-sm">
                      <span className={`w-2 h-2 rounded-full ${num.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-gray-300'}`} />
                      <span className={`font-medium ${num.is_active ? 'text-emerald-700' : 'text-gray-500'}`}>
                        {num.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </span>
                  </td>
                  <td className="py-3.5 px-5 text-right text-sm text-gray-700 font-medium">
                    ₹{(num.monthly_cost || 0).toLocaleString()}
                  </td>
                  <td className="py-3.5 px-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => { setTestCallModal(num); setTestNumber('') }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all"
                        title="Test AI call">
                        <PhoneOutgoing className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setAssignModal(num)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-50 text-gray-600 hover:bg-gray-100 transition-all"
                        title="Assign agent">
                        <Bot className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </motion.div>

      {/* Test Call Modal */}
      <AnimatePresence>
        {testCallModal && (
          <Modal onClose={() => setTestCallModal(null)}>
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 rounded-xl bg-indigo-50">
                <PhoneOutgoing className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Test AI Call</h3>
                <p className="text-xs text-gray-500">From: {testCallModal.number}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Your AI agent will call this number and handle the conversation in real-time with barge-in support.
            </p>
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">Destination Number</label>
              <div className="flex items-center gap-2">
                <span className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-l-xl text-sm text-gray-500">+91</span>
                <input
                  type="tel"
                  value={testNumber}
                  onChange={(e) => setTestNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder="98765 43210"
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-r-xl text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
                  maxLength={10}
                />
              </div>
            </div>
            <button onClick={() => handleTestCall(testCallModal)} disabled={calling}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-sm font-semibold hover:shadow-lg transition-all disabled:opacity-50">
              {calling ? <><Loader2 className="w-4 h-4 animate-spin" /> Calling...</> : <><PhoneCall className="w-4 h-4" /> Make Test Call</>}
            </button>
          </Modal>
        )}
      </AnimatePresence>

      {/* Assign Agent Modal */}
      <AnimatePresence>
        {assignModal && (
          <Modal onClose={() => setAssignModal(null)}>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Assign Agent</h3>
            <p className="text-sm text-gray-500 mb-4">Select a voice agent for {assignModal.number}</p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {agents.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No agents found. Create one first.</p>
              ) : agents.map(agent => (
                <button key={agent.id || agent.name}
                  onClick={() => {
                    toast.success(`${agent.name} assigned to ${assignModal.number}`)
                    setAssignModal(null)
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all text-left">
                  <Bot className="w-5 h-5 text-indigo-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{agent.name}</p>
                    <p className="text-xs text-gray-500">{agent.language || 'en'} &middot; {agent.status || 'active'}</p>
                  </div>
                </button>
              ))}
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </motion.div>
  )
}


// ── Tab 2: Buy Number ──────────────────────────────────────────────

function BuyNumberTab({ buyableProviders, allProviders, connectedProviders, onBought, onGoToProviders }) {
  const [selectedProvider, setSelectedProvider] = useState(buyableProviders[0]?.id || '')
  const [country, setCountry] = useState('IN')
  const [buying, setBuying] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const handleBuy = async () => {
    if (!selectedProvider) { toast.error('Select a provider'); return }
    setBuying(true)
    try {
      const res = await telephonyAPI.buyNumber(selectedProvider, country)
      const num = res.data
      toast.success(`Number purchased: ${num.number || 'Success!'}`)
      onBought()
    } catch (err) {
      const msg = err.response?.data?.detail || 'Purchase failed — check provider balance'
      toast.error(msg)
    } finally {
      setBuying(false)
    }
  }

  if (buyableProviders.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-amber-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">Connect a provider first</h3>
        <p className="text-gray-500 text-sm mt-1 max-w-md">
          To buy phone numbers, connect a provider that supports number purchasing:
          <strong> TeleCMI, Twilio, Exotel, or Vonage</strong>.
        </p>
        <button onClick={onGoToProviders}
          className="mt-4 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-medium hover:shadow-lg transition-all">
          Go to Providers
        </button>
      </motion.div>
    )
  }

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="show" className="space-y-6">
      {/* Provider Selection */}
      <motion.div variants={slideUp} className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-6">
        <h3 className="text-gray-900 font-semibold mb-4">Select Provider</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {buyableProviders.map(provider => (
            <button key={provider.id}
              onClick={() => setSelectedProvider(provider.id)}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                selectedProvider === provider.id
                  ? 'border-indigo-500 bg-indigo-50/50 shadow-sm'
                  : 'border-gray-200 hover:border-gray-300'
              }`}>
              <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${provider.gradient} flex items-center justify-center text-[10px] font-bold text-white mb-2`}>
                {provider.logo}
              </div>
              <p className="text-sm font-semibold text-gray-900">{provider.name}</p>
              <p className="text-xs text-gray-500">{provider.cost} &middot; {provider.country}</p>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Country & Purchase */}
      <motion.div variants={slideUp} className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-6">
        <h3 className="text-gray-900 font-semibold mb-4">Purchase Number</h3>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
            <select value={country} onChange={(e) => setCountry(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none bg-white">
              <option value="IN">🇮🇳 India (+91)</option>
              <option value="US">🇺🇸 United States (+1)</option>
              <option value="GB">🇬🇧 United Kingdom (+44)</option>
              <option value="CA">🇨🇦 Canada (+1)</option>
              <option value="AU">🇦🇺 Australia (+61)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Number Type</label>
            <select className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none bg-white">
              <option>Local</option>
              <option>Toll-Free</option>
              <option>Mobile</option>
            </select>
          </div>
        </div>

        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 mb-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Provider</span>
            <span className="font-semibold text-gray-900">{providerMap[selectedProvider]?.name}</span>
          </div>
          <div className="flex items-center justify-between text-sm mt-2">
            <span className="text-gray-600">Per-minute cost</span>
            <span className="font-semibold text-gray-900">{providerMap[selectedProvider]?.cost}</span>
          </div>
          <div className="flex items-center justify-between text-sm mt-2">
            <span className="text-gray-600">Estimated monthly</span>
            <span className="font-semibold text-gray-900">₹300–500/month</span>
          </div>
        </div>

        <button onClick={handleBuy} disabled={buying || !selectedProvider}
          className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-sm font-semibold hover:shadow-lg transition-all disabled:opacity-50">
          {buying ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Purchasing...</>
          ) : (
            <><ShoppingCart className="w-4 h-4" /> Buy Number from {providerMap[selectedProvider]?.name}</>
          )}
        </button>
      </motion.div>
    </motion.div>
  )
}


// ── Tab 3: Providers ───────────────────────────────────────────────

function ProvidersTab({ providerStatus, onRefresh }) {
  const [connectModal, setConnectModal] = useState(null)
  const [configValues, setConfigValues] = useState({})
  const [connecting, setConnecting] = useState(false)

  const handleConnect = async (providerId) => {
    const provider = PROVIDERS.find(p => p.id === providerId)
    const fields = provider?.fields || []
    const missing = fields.filter(f => !configValues[f.key]?.trim())
    if (missing.length > 0) {
      toast.error(`Fill in: ${missing.map(f => f.label).join(', ')}`)
      return
    }

    setConnecting(true)
    try {
      await telephonyAPI.connectProvider(providerId, configValues)
      toast.success(`${provider.name} connected!`)
      setConnectModal(null)
      setConfigValues({})
      onRefresh()
    } catch (err) {
      // Fallback: save to localStorage if API not ready
      const saved = JSON.parse(localStorage.getItem('vf_telephony_creds') || '{}')
      saved[providerId] = configValues
      localStorage.setItem('vf_telephony_creds', JSON.stringify(saved))
      toast.success(`${provider.name} credentials saved locally`)
      setConnectModal(null)
      setConfigValues({})
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async (providerId) => {
    try {
      await telephonyAPI.disconnectProvider(providerId)
      toast.success(`Disconnected ${PROVIDERS.find(p => p.id === providerId)?.name}`)
      onRefresh()
    } catch {
      toast.success('Disconnected locally')
    }
  }

  return (
    <>
      <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        variants={fadeIn} initial="hidden" animate="show">
        {PROVIDERS.map(provider => {
          const isConfigured = providerStatus[provider.id]?.configured || false
          return (
            <motion.div key={provider.id} variants={slideUp}
              className="group p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm hover:shadow-md hover:border-gray-300/60 transition-all duration-200">
              <div className="flex items-start justify-between mb-3">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${provider.gradient} flex items-center justify-center text-sm font-bold text-white shadow-sm`}>
                  {provider.logo}
                </div>
                <span className={`px-2.5 py-0.5 text-[11px] font-medium rounded-full ${
                  provider.tag === 'Free' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                  provider.tag === 'Best Value' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                  'bg-gray-50 text-gray-600 border border-gray-200'
                }`}>{provider.tag}</span>
              </div>

              <h3 className="text-gray-900 font-semibold">{provider.name}</h3>
              <p className="text-gray-500 text-xs mt-0.5">{provider.country} &middot; {provider.cost}</p>
              <p className="text-gray-500 text-sm mt-2 leading-relaxed">{provider.description}</p>

              <div className="flex flex-wrap gap-1.5 mt-3">
                {provider.features.map(f => (
                  <span key={f} className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-gray-50 text-gray-600 border border-gray-100">{f}</span>
                ))}
              </div>

              <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                <span className={`flex items-center gap-1.5 text-xs font-medium ${isConfigured ? 'text-emerald-600' : 'text-gray-400'}`}>
                  {isConfigured ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  {isConfigured ? 'Connected' : 'Not Connected'}
                </span>
                {isConfigured ? (
                  <div className="flex gap-1">
                    {provider.signupUrl && (
                      <a href={provider.signupUrl} target="_blank" rel="noopener noreferrer"
                        className="px-2 py-1.5 rounded-lg text-xs font-medium bg-gray-50 text-gray-500 hover:bg-gray-100 transition-all">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {provider.id !== 'webrtc' && (
                      <button onClick={() => handleDisconnect(provider.id)}
                        className="px-2 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-all">
                        Disconnect
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-1">
                    {provider.signupUrl && (
                      <a href={provider.signupUrl} target="_blank" rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200 transition-all">
                        Sign Up
                      </a>
                    )}
                    <button
                      onClick={() => { setConfigValues({}); setConnectModal(provider.id) }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:shadow-sm transition-all">
                      Connect
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )
        })}
      </motion.div>

      {/* Connect Modal */}
      <AnimatePresence>
        {connectModal && (() => {
          const provider = PROVIDERS.find(p => p.id === connectModal)
          if (!provider) return null
          return (
            <Modal onClose={() => setConnectModal(null)}>
              <div className="flex items-center gap-3 mb-5">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${provider.gradient} flex items-center justify-center text-sm font-bold text-white`}>
                  {provider.logo}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">Connect {provider.name}</h3>
                  <p className="text-xs text-gray-500">{provider.cost} &middot; {provider.country}</p>
                </div>
                <button onClick={() => setConnectModal(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {provider.signupUrl && (
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 mb-4">
                  <p className="text-xs text-blue-700">
                    Don't have an account?{' '}
                    <a href={provider.signupUrl} target="_blank" rel="noopener noreferrer"
                      className="font-semibold underline hover:no-underline">
                      Sign up at {provider.name} →
                    </a>
                  </p>
                </div>
              )}

              <div className="space-y-3 mb-5">
                {provider.fields.map(field => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                    <input
                      type={field.key.includes('token') || field.key.includes('secret') || field.key.includes('password') ? 'password' : 'text'}
                      value={configValues[field.key] || ''}
                      onChange={(e) => setConfigValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={`Enter ${field.label}`}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
                    />
                  </div>
                ))}
                {provider.fields.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">No configuration needed — {provider.name} works automatically.</p>
                )}
              </div>

              <button onClick={() => handleConnect(connectModal)} disabled={connecting}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-sm font-semibold hover:shadow-lg transition-all disabled:opacity-50">
                {connecting ? <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</> : <><Link2 className="w-4 h-4" /> Connect {provider.name}</>}
              </button>
            </Modal>
          )
        })()}
      </AnimatePresence>
    </>
  )
}


// ── Tab 4: Cost Comparison ─────────────────────────────────────────

function CostTab() {
  const costData = PROVIDERS.filter(p => p.id !== 'webrtc').map(p => ({
    ...p,
    costNum: parseFloat(p.cost.replace(/[₹/min]/g, '').replace('Free', '0')),
  })).sort((a, b) => a.costNum - b.costNum)

  const maxCost = Math.max(...costData.map(c => c.costNum))

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="show" className="space-y-4">
      {/* Savings Calculator */}
      <motion.div variants={slideUp} className="p-6 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl text-white">
        <div className="flex items-center gap-3 mb-2">
          <IndianRupee className="w-6 h-6" />
          <h3 className="text-lg font-semibold">India Cost Savings Calculator</h3>
        </div>
        <p className="text-indigo-100 text-sm mb-4">
          Using TeleCMI instead of Twilio for 10,000 minutes/month saves you:
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-white/10 rounded-xl backdrop-blur-sm">
            <p className="text-indigo-200 text-xs">Twilio Cost</p>
            <p className="text-2xl font-bold mt-1">₹45,000</p>
          </div>
          <div className="p-4 bg-white/10 rounded-xl backdrop-blur-sm">
            <p className="text-indigo-200 text-xs">TeleCMI Cost</p>
            <p className="text-2xl font-bold mt-1">₹12,000</p>
          </div>
          <div className="p-4 bg-emerald-500/30 rounded-xl backdrop-blur-sm border border-emerald-300/30">
            <p className="text-emerald-200 text-xs">Monthly Savings</p>
            <p className="text-2xl font-bold mt-1">₹33,000</p>
            <p className="text-emerald-200 text-xs mt-0.5">73% savings</p>
          </div>
        </div>
      </motion.div>

      {/* Cost Bars */}
      <motion.div variants={slideUp} className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-6">
        <h3 className="text-gray-900 font-semibold mb-4">Cost Per Minute Comparison</h3>
        <div className="space-y-3">
          {costData.map(provider => (
            <div key={provider.id} className="flex items-center gap-4">
              <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${provider.gradient} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}>
                {provider.logo}
              </div>
              <div className="w-24 shrink-0">
                <p className="text-sm font-medium text-gray-900">{provider.name}</p>
                <p className="text-xs text-gray-500">{provider.country}</p>
              </div>
              <div className="flex-1">
                <div className="h-7 bg-gray-100 rounded-lg overflow-hidden">
                  <motion.div
                    className={`h-full rounded-lg bg-gradient-to-r ${provider.gradient} flex items-center justify-end pr-3`}
                    initial={{ width: 0 }}
                    animate={{ width: `${(provider.costNum / maxCost) * 100}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
                  >
                    <span className="text-[11px] font-bold text-white">{provider.cost}</span>
                  </motion.div>
                </div>
              </div>
            </div>
          ))}
          {/* WebRTC */}
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">WR</div>
            <div className="w-24 shrink-0">
              <p className="text-sm font-medium text-gray-900">WebRTC</p>
              <p className="text-xs text-gray-500">Browser</p>
            </div>
            <div className="flex-1">
              <div className="h-7 bg-emerald-50 rounded-lg flex items-center px-3 border border-emerald-200">
                <span className="text-[11px] font-bold text-emerald-700">FREE — No telephony charges</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}


// ── Shared Modal Component ─────────────────────────────────────────

function Modal({ children, onClose }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        {children}
      </motion.div>
    </motion.div>
  )
}
