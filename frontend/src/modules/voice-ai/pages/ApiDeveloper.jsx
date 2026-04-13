/**
 * API & Developer — Premium developer console
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Key, Code, Globe, Webhook, Copy, Eye, EyeOff, Plus, Trash2, ExternalLink, Check } from 'lucide-react'

const mockApiKeys = [
  { id: '1', name: 'Production Key', prefix: 'vf_prod_****a3b7', created: '2024-12-01', lastUsed: '2 hours ago' },
  { id: '2', name: 'Development Key', prefix: 'vf_dev_****9f2c', created: '2025-01-15', lastUsed: '5 days ago' },
]

const endpoints = [
  { method: 'POST', path: '/api/v1/agents/{id}/call', description: 'Initiate an outbound call' },
  { method: 'GET', path: '/api/v1/calls/{id}', description: 'Get call details and transcript' },
  { method: 'POST', path: '/api/v1/agents/{id}/chat', description: 'Send a chat message to an agent' },
  { method: 'GET', path: '/api/v1/analytics/summary', description: 'Get analytics summary' },
  { method: 'WS', path: '/ws/v1/stream/{agent_id}', description: 'Real-time voice streaming' },
]

const methodStyles = {
  GET: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  POST: 'bg-blue-50 text-blue-700 border-blue-200',
  WS: 'bg-amber-50 text-amber-700 border-amber-200',
}

function MethodBadge({ method }) {
  return (
    <span className={`px-2.5 py-0.5 text-[11px] font-mono font-bold rounded-md border ${methodStyles[method] || methodStyles.GET}`}>
      {method}
    </span>
  )
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
}

export default function ApiDeveloper() {
  const [showKey, setShowKey] = useState(null)
  const [copiedEmbed, setCopiedEmbed] = useState(false)

  const embedSnippet = `<!-- VoiceFlow AI Widget -->
<script
  src="https://cdn.voiceflow.ai/widget.js"
  data-agent="YOUR_AGENT_ID"
  data-theme="light"
  data-position="bottom-right"
></script>`

  const handleCopyEmbed = () => {
    navigator.clipboard.writeText(embedSnippet)
    setCopiedEmbed(true)
    setTimeout(() => setCopiedEmbed(false), 2000)
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">API & Developer</h1>
          <p className="text-gray-500 mt-1">Manage API keys, embed widgets, and configure webhooks</p>
        </div>
        <a
          href="#"
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-200 hover:shadow-md hover:shadow-indigo-300 transition-all duration-200"
        >
          <ExternalLink className="w-4 h-4" />
          API Docs
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* API Keys */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="p-6 bg-white rounded-2xl border border-gray-200/60 shadow-sm"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-indigo-50">
                <Key className="w-4 h-4 text-indigo-600" />
              </div>
              <h3 className="text-gray-900 font-semibold">API Keys</h3>
            </div>
            <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-medium shadow-sm shadow-indigo-200 hover:shadow-md hover:shadow-indigo-300 transition-all duration-200">
              <Plus className="w-3.5 h-3.5" />
              Create Key
            </button>
          </div>
          <div className="space-y-3">
            {mockApiKeys.map((key) => (
              <div
                key={key.id}
                className="p-4 rounded-xl bg-gray-50/80 border border-gray-200/60 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-900 font-medium">{key.name}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setShowKey(showKey === key.id ? null : key.id)}
                      className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
                    >
                      {showKey === key.id ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <code className="text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md font-mono">
                    {showKey === key.id ? 'vf_prod_sk_1234567890abcdef' : key.prefix}
                  </code>
                  <span>Created {key.created}</span>
                  <span>Last used {key.lastUsed}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Embed Code */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.1 }}
          className="p-6 bg-white rounded-2xl border border-gray-200/60 shadow-sm"
        >
          <div className="flex items-center gap-2.5 mb-4">
            <div className="p-2 rounded-lg bg-violet-50">
              <Code className="w-4 h-4 text-violet-600" />
            </div>
            <h3 className="text-gray-900 font-semibold">Embed Widget</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Add this snippet to your website to embed the voice AI widget.
          </p>
          <div className="relative">
            <pre className="p-4 rounded-xl bg-gray-50 border border-gray-200/60 text-xs text-gray-700 overflow-x-auto whitespace-pre font-mono leading-relaxed">
              {embedSnippet}
            </pre>
            <button
              onClick={handleCopyEmbed}
              className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 shadow-sm transition-all text-xs font-medium"
            >
              {copiedEmbed ? (
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
        </motion.div>

        {/* REST API Reference */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.2 }}
          className="p-6 bg-white rounded-2xl border border-gray-200/60 shadow-sm"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-blue-50">
                <Globe className="w-4 h-4 text-blue-600" />
              </div>
              <h3 className="text-gray-900 font-semibold">API Endpoints</h3>
            </div>
            <a
              href="#"
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-all"
            >
              Full Docs <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="space-y-2">
            {endpoints.map((ep) => (
              <div
                key={ep.path}
                className="flex items-center gap-3 p-3 rounded-xl bg-gray-50/50 border border-gray-200/40 hover:border-gray-300/60 hover:bg-gray-50 transition-all"
              >
                <MethodBadge method={ep.method} />
                <code className="text-xs text-gray-700 flex-1 truncate font-mono">{ep.path}</code>
                <span className="text-[11px] text-gray-400 hidden sm:block">{ep.description}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Webhooks */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.3 }}
          className="p-6 bg-white rounded-2xl border border-gray-200/60 shadow-sm"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-amber-50">
                <Webhook className="w-4 h-4 text-amber-600" />
              </div>
              <h3 className="text-gray-900 font-semibold">Webhooks</h3>
            </div>
            <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-medium shadow-sm shadow-indigo-200 hover:shadow-md hover:shadow-indigo-300 transition-all duration-200">
              <Plus className="w-3.5 h-3.5" />
              Add Webhook
            </button>
          </div>
          <div className="p-8 rounded-xl bg-gray-50/50 border border-dashed border-gray-300 text-center">
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Webhook className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm text-gray-600 font-medium">No webhooks configured</p>
            <p className="text-xs text-gray-400 mt-1">
              Receive real-time notifications for call events, transcriptions, and agent updates.
            </p>
          </div>
          <div className="mt-4 space-y-2">
            <p className="text-xs text-gray-500 font-medium">Available events</p>
            <div className="flex flex-wrap gap-1.5">
              {['call.started', 'call.ended', 'call.transferred', 'transcript.ready', 'agent.error'].map((event) => (
                <span
                  key={event}
                  className="px-2.5 py-1 text-[11px] font-mono rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100"
                >
                  {event}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
