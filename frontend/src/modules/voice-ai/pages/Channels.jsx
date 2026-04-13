/**
 * Channels — Premium deployment channel management
 */

import { motion } from 'framer-motion'
import { Globe, MessageCircle, Phone, Code, CheckCircle, Clock, Copy, Check } from 'lucide-react'
import { useState } from 'react'

const channels = [
  {
    id: 'web-widget',
    name: 'Web Widget',
    description: 'Embed a voice/chat widget on your website. Copy the snippet and paste it before the closing </body> tag.',
    icon: Globe,
    accent: 'indigo',
    gradient: 'from-indigo-500 to-indigo-600',
    status: 'active',
    statusLabel: 'Active',
    details: [
      'Customizable floating widget',
      'Voice + text chat modes',
      'Auto-detect visitor language',
      'Mobile responsive',
    ],
    embedCode: '<script src="https://cdn.voiceflow.ai/widget.js" data-agent="YOUR_AGENT_ID"></script>',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    description: 'Connect your WhatsApp Business account to handle conversations with AI agents.',
    icon: MessageCircle,
    accent: 'emerald',
    gradient: 'from-emerald-500 to-emerald-600',
    status: 'pending',
    statusLabel: 'Coming Soon',
    details: [
      'WhatsApp Business API integration',
      'Rich media message support',
      'Template message management',
      'Multi-number support',
    ],
  },
  {
    id: 'phone',
    name: 'Phone (Inbound / Outbound)',
    description: 'Handle inbound calls and make outbound calls using AI agents over phone lines.',
    icon: Phone,
    accent: 'blue',
    gradient: 'from-blue-500 to-blue-600',
    status: 'active',
    statusLabel: 'Active',
    details: [
      'Inbound call routing',
      'Outbound campaign dialing',
      'Call transfer to human agents',
      'Real-time transcription',
    ],
  },
  {
    id: 'api',
    name: 'API / WebSocket',
    description: 'Integrate voice AI directly into your applications via REST API or real-time WebSocket.',
    icon: Code,
    accent: 'violet',
    gradient: 'from-violet-500 to-violet-600',
    status: 'active',
    statusLabel: 'Active',
    details: [
      'REST API for async operations',
      'WebSocket for real-time streaming',
      'SDKs for Python, Node.js, Go',
      'Webhook event notifications',
    ],
  },
]

const accentMap = {
  indigo: { dot: 'bg-indigo-500', check: 'text-indigo-500', light: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
  emerald: { dot: 'bg-emerald-500', check: 'text-emerald-500', light: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  blue: { dot: 'bg-blue-500', check: 'text-blue-500', light: 'bg-blue-50 text-blue-600 border-blue-100' },
  violet: { dot: 'bg-violet-500', check: 'text-violet-500', light: 'bg-violet-50 text-violet-600 border-violet-100' },
}

function StatusBadge({ status, label }) {
  if (status === 'active') {
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        {label}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full bg-gray-50 text-gray-500 border border-gray-200">
      <Clock className="w-3 h-3" />
      {label}
    </span>
  )
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
}

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}

export default function Channels() {
  const [copiedId, setCopiedId] = useState(null)

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Channels</h1>
        <p className="text-gray-500 mt-1">Deploy your AI agents across multiple communication channels</p>
      </div>

      {/* Channel Cards */}
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-5"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {channels.map((channel) => {
          const Icon = channel.icon
          const colors = accentMap[channel.accent]
          return (
            <motion.div
              key={channel.id}
              variants={item}
              className="group p-6 bg-white rounded-2xl border border-gray-200/60 shadow-sm hover:shadow-md hover:border-gray-300/60 transition-all duration-200 space-y-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl bg-gradient-to-br ${channel.gradient} shadow-sm`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-gray-900 font-semibold">{channel.name}</h3>
                  </div>
                </div>
                <StatusBadge status={channel.status} label={channel.statusLabel} />
              </div>

              <p className="text-gray-500 text-sm leading-relaxed">{channel.description}</p>

              <ul className="space-y-2">
                {channel.details.map((detail) => (
                  <li key={detail} className="flex items-center gap-2.5 text-sm text-gray-600">
                    <CheckCircle className={`w-4 h-4 ${colors.check} flex-shrink-0`} />
                    {detail}
                  </li>
                ))}
              </ul>

              {channel.embedCode && (
                <div className="p-4 rounded-xl bg-gray-50 border border-gray-200/60">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">Embed Code</p>
                    <button
                      onClick={() => handleCopy(channel.embedCode, channel.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-all"
                    >
                      {copiedId === channel.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-600">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <code className="text-xs text-gray-600 font-mono break-all leading-relaxed">{channel.embedCode}</code>
                </div>
              )}

              <button
                disabled={channel.status !== 'active'}
                className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  channel.status === 'active'
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-200 hover:shadow-md hover:shadow-indigo-300'
                    : 'bg-gray-50 text-gray-400 border border-gray-200 cursor-not-allowed'
                }`}
              >
                {channel.status === 'active' ? 'Configure' : 'Coming Soon'}
              </button>
            </motion.div>
          )
        })}
      </motion.div>
    </div>
  )
}
