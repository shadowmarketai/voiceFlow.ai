/**
 * Phone Numbers — Manage numbers across 7 telephony providers + WebRTC
 */

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Phone, Plus, Globe, Wifi, Server, Radio, Activity,
  PhoneCall, PhoneForwarded, ChevronDown, RefreshCw,
  IndianRupee, Zap, Shield, Headphones, ArrowRight,
  CheckCircle2, XCircle, Clock, BarChart3
} from 'lucide-react'

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}

const PROVIDERS = [
  {
    id: 'telecmi', name: 'TeleCMI', logo: 'TC', country: 'India',
    cost: '₹1.2/min', gradient: 'from-indigo-500 to-indigo-600',
    description: 'Primary India provider — 70% cheaper than Twilio',
    features: ['Voice', 'SMS', 'DID Numbers', 'Call Recording'],
    tag: 'Best Value',
  },
  {
    id: 'bolna', name: 'Bolna', logo: 'BN', country: 'India',
    cost: '₹1.5/min', gradient: 'from-violet-500 to-violet-600',
    description: 'AI voice agent platform with built-in STT/LLM/TTS',
    features: ['AI Agents', 'Batch Calls', 'Transcripts', 'Real-time Streaming'],
    tag: 'AI Native',
  },
  {
    id: 'vobiz', name: 'Vobiz', logo: 'VB', country: 'India',
    cost: '₹0.9/min', gradient: 'from-emerald-500 to-emerald-600',
    description: 'Bulk voice broadcasting & IVR for campaigns',
    features: ['Bulk Calls', 'IVR Builder', 'Voice Broadcast', 'DTMF'],
    tag: 'Bulk Calls',
  },
  {
    id: 'exotel', name: 'Exotel', logo: 'EX', country: 'India',
    cost: '₹1.5/min', gradient: 'from-blue-500 to-blue-600',
    description: 'Enterprise IVR & call center solutions for India',
    features: ['ExoML IVR', 'Call Center', 'Number Masking', 'Recording'],
    tag: 'Enterprise',
  },
  {
    id: 'twilio', name: 'Twilio', logo: 'TW', country: 'Global',
    cost: '₹4.5/min', gradient: 'from-red-500 to-red-600',
    description: 'Global voice API with Media Streams for real-time audio',
    features: ['Global Coverage', 'Media Streams', 'SIP Trunking', 'Recording'],
    tag: 'Global',
  },
  {
    id: 'vonage', name: 'Vonage', logo: 'VN', country: 'Global',
    cost: '₹3.5/min', gradient: 'from-purple-500 to-purple-600',
    description: 'International voice API with WebSocket streaming',
    features: ['NCCO Flows', 'WebSocket Audio', 'SIP Connect', 'Recording'],
    tag: 'International',
  },
  {
    id: 'sip', name: 'SIP Trunk', logo: 'SI', country: 'Any',
    cost: '₹0.5/min', gradient: 'from-slate-500 to-slate-600',
    description: 'Connect your own PBX (Asterisk / FreeSWITCH)',
    features: ['Direct PBX', 'AudioSocket', 'Custom Routing', 'G.711'],
    tag: 'Self-Hosted',
  },
  {
    id: 'webrtc', name: 'WebRTC', logo: 'WR', country: 'Browser',
    cost: 'Free', gradient: 'from-teal-500 to-teal-600',
    description: 'Zero-cost browser-based voice calls via widget',
    features: ['No Phone Needed', 'Browser Calls', 'Opus Codec', 'ICE/STUN'],
    tag: 'Free',
  },
]

// Mock data for phone numbers
const mockNumbers = [
  { id: '1', number: '+91 98765 43210', provider: 'telecmi', agent: 'Sales Bot', status: 'active', calls: 1240, cost: 2480 },
  { id: '2', number: '+91 80123 45678', provider: 'exotel', agent: 'Support Agent', status: 'active', calls: 890, cost: 1335 },
  { id: '3', number: '+1 (415) 555-0123', provider: 'twilio', agent: 'US Outreach', status: 'active', calls: 320, cost: 1440 },
  { id: '4', number: 'WebRTC Widget', provider: 'webrtc', agent: 'Website Bot', status: 'active', calls: 2100, cost: 0 },
  { id: '5', number: 'SIP: pbx.office.local', provider: 'sip', agent: 'Office PBX', status: 'active', calls: 560, cost: 280 },
]

const providerMap = Object.fromEntries(PROVIDERS.map(p => [p.id, p]))

export default function PhoneNumbers() {
  const [providerStatus, setProviderStatus] = useState({})
  const [activeTab, setActiveTab] = useState('numbers') // numbers | providers | cost
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Fetch provider status from API
    fetch('/api/v1/telephony/providers')
      .then(r => r.json())
      .then(data => setProviderStatus(data))
      .catch(() => {
        // Use mock status if API unavailable
        const mock = {}
        PROVIDERS.forEach(p => { mock[p.id] = { configured: p.id === 'webrtc', display_name: p.name } })
        setProviderStatus(mock)
      })
  }, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Phone Numbers & Channels</h1>
          <p className="text-gray-500 mt-1">7 telephony providers + WebRTC — India-first cost optimization</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1000) }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-50 text-gray-700 text-sm font-medium border border-gray-200 hover:bg-gray-100 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-medium shadow-sm shadow-indigo-200 hover:shadow-md transition-all">
            <Plus className="w-4 h-4" />
            Add Number
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-0">
        {[
          { key: 'numbers', label: 'My Numbers', icon: Phone },
          { key: 'providers', label: 'Providers', icon: Globe },
          { key: 'cost', label: 'Cost Comparison', icon: IndianRupee },
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
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'numbers' && <NumbersTab numbers={mockNumbers} />}
      {activeTab === 'providers' && <ProvidersTab providerStatus={providerStatus} />}
      {activeTab === 'cost' && <CostTab />}
    </div>
  )
}


function NumbersTab({ numbers }) {
  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Numbers', value: numbers.length, icon: Phone, color: 'indigo' },
          { label: 'Total Calls', value: numbers.reduce((s, n) => s + n.calls, 0).toLocaleString(), icon: PhoneCall, color: 'emerald' },
          { label: 'Monthly Cost', value: `₹${numbers.reduce((s, n) => s + n.cost, 0).toLocaleString()}`, icon: IndianRupee, color: 'violet' },
          { label: 'Providers Active', value: new Set(numbers.map(n => n.provider)).size, icon: Globe, color: 'blue' },
        ].map(stat => (
          <motion.div key={stat.label} variants={item} className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
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
      <motion.div variants={item} className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-3.5 px-5 text-xs font-medium text-gray-500 uppercase tracking-wider">Number / Channel</th>
              <th className="text-left py-3.5 px-5 text-xs font-medium text-gray-500 uppercase tracking-wider">Provider</th>
              <th className="text-left py-3.5 px-5 text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned Agent</th>
              <th className="text-left py-3.5 px-5 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="text-right py-3.5 px-5 text-xs font-medium text-gray-500 uppercase tracking-wider">Calls</th>
              <th className="text-right py-3.5 px-5 text-xs font-medium text-gray-500 uppercase tracking-wider">Cost (₹)</th>
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
                        {p?.logo}
                      </div>
                      <span className="font-medium text-gray-900 text-sm">{num.number}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-5">
                    <span className="text-sm text-gray-600">{p?.name}</span>
                  </td>
                  <td className="py-3.5 px-5">
                    <span className="text-sm text-gray-700 font-medium">{num.agent}</span>
                  </td>
                  <td className="py-3.5 px-5">
                    <span className="flex items-center gap-1.5 text-sm">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-emerald-700 font-medium capitalize">{num.status}</span>
                    </span>
                  </td>
                  <td className="py-3.5 px-5 text-right text-sm text-gray-700 font-medium">{num.calls.toLocaleString()}</td>
                  <td className="py-3.5 px-5 text-right text-sm text-gray-700 font-medium">
                    {num.cost === 0 ? <span className="text-emerald-600">Free</span> : `₹${num.cost.toLocaleString()}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </motion.div>
    </motion.div>
  )
}


function ProvidersTab({ providerStatus }) {
  return (
    <motion.div
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {PROVIDERS.map(provider => {
        const status = providerStatus[provider.id]
        const isConfigured = status?.configured || false
        return (
          <motion.div
            key={provider.id}
            variants={item}
            className="group p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm hover:shadow-md hover:border-gray-300/60 transition-all duration-200"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${provider.gradient} flex items-center justify-center text-sm font-bold text-white shadow-sm`}>
                {provider.logo}
              </div>
              <span className={`px-2.5 py-0.5 text-[11px] font-medium rounded-full ${
                provider.tag === 'Free'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                  : provider.tag === 'Best Value'
                    ? 'bg-amber-50 text-amber-700 border border-amber-100'
                    : 'bg-gray-50 text-gray-600 border border-gray-200'
              }`}>
                {provider.tag}
              </span>
            </div>

            <h3 className="text-gray-900 font-semibold">{provider.name}</h3>
            <p className="text-gray-500 text-xs mt-0.5">{provider.country} &middot; {provider.cost}</p>
            <p className="text-gray-500 text-sm mt-2 leading-relaxed">{provider.description}</p>

            {/* Features */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {provider.features.map(f => (
                <span key={f} className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-gray-50 text-gray-600 border border-gray-100">
                  {f}
                </span>
              ))}
            </div>

            {/* Status + Action */}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
              <span className={`flex items-center gap-1.5 text-xs font-medium ${isConfigured ? 'text-emerald-600' : 'text-gray-400'}`}>
                {isConfigured ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                {isConfigured ? 'Connected' : 'Not Configured'}
              </span>
              <button className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isConfigured
                  ? 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:shadow-sm'
              }`}>
                {isConfigured ? 'Manage' : 'Connect'}
              </button>
            </div>
          </motion.div>
        )
      })}
    </motion.div>
  )
}


function CostTab() {
  const costData = PROVIDERS.filter(p => p.id !== 'webrtc').map(p => ({
    ...p,
    costNum: parseFloat(p.cost.replace(/[₹/min]/g, '').replace('Free', '0')),
  })).sort((a, b) => a.costNum - b.costNum)

  const maxCost = Math.max(...costData.map(c => c.costNum))

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">
      {/* Savings Calculator */}
      <motion.div variants={item} className="p-6 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl text-white">
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
      <motion.div variants={item} className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-6">
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
          {/* WebRTC row */}
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
              WR
            </div>
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
