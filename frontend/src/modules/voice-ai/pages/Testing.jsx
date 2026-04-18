/**
 * Testing Playground — Real agent testing with TTS audio playback
 * ================================================================
 * - Loads real agents from API + auto-selects from "Try Now" handoff
 * - Uses each agent's actual system_prompt and llmProvider
 * - Speaks replies aloud via /api/v1/tts/preview (ElevenLabs)
 * - Deepgram Nova-2 STT for mic input
 */

import { useEffect, useRef, useState, useMemo, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic, MicOff, Send, Bot, Activity, Brain, ChevronDown, Sparkles,
  Volume2, AudioLines, Loader2, AlertTriangle, VolumeX, CheckCircle2,
} from 'lucide-react'
import useDeepgramStream from '../../../hooks/useDeepgramStream'
import api, { agentsAPI } from '../../../services/api'

const LiveKitVoiceRoom = lazy(() => import('../../../components/LiveKitRoom'))

/* ── Language code map ───────────────────────────────────────────── */
const LANG_MAP = {
  'English': 'en', 'Hindi': 'hi', 'Tamil': 'ta', 'Telugu': 'te',
  'Gujarati': 'gu', 'Bengali': 'bn', 'Kannada': 'kn', 'Odia': 'or',
  'Assamese': 'as', 'Marathi': 'mr', 'Punjabi': 'pa', 'Malayalam': 'ml',
  'Tamil + English': 'ta', 'Hindi + English': 'hi',
  'Gujarati + English': 'gu',
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
}

/* ── TTS helper — plays agent reply aloud via backend ElevenLabs ─── */
async function playTTS(text, voice = 'nova', language = 'en') {
  if (!text || text === '…') return
  try {
    const params = new URLSearchParams({ text, voice, provider: 'auto', language })
    const { data } = await api.get(`/api/v1/tts/preview?${params}`)
    if (data?.audio_base64) {
      const binary = atob(data.audio_base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob = new Blob([bytes], { type: `audio/${data.format || 'wav'}` })
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.play().catch(() => {})
      audio.onended = () => URL.revokeObjectURL(url)
    }
  } catch {
    // TTS unavailable — text still shown, no crash
  }
}

export default function Testing() {
  /* ── Agent state ─────────────────────────────────────────────── */
  const [agents, setAgents] = useState([])           // from API
  const [currentAgent, setCurrentAgent] = useState(null) // selected agent object
  const [selectedId, setSelectedId] = useState('')
  const [agentsLoading, setAgentsLoading] = useState(true)
  const [ttsEnabled, setTtsEnabled] = useState(true)

  /* ── Chat state ──────────────────────────────────────────────── */
  const [message, setMessage] = useState('')
  const [conversation, setConversation] = useState([])
  const [sending, setSending] = useState(false)
  const chatEndRef = useRef(null)

  /* ── Derived agent config ────────────────────────────────────── */
  const agentConfig = useMemo(() => {
    if (!currentAgent) return {}
    const cfg = currentAgent.config || {}
    const lang = currentAgent.language || ''
    return {
      systemPrompt: cfg.prompt || 'You are a helpful AI voice assistant. Keep replies concise.',
      provider: cfg.llmProvider || 'auto',
      voice: cfg.voice || 'nova',
      langCode: LANG_MAP[lang] || LANG_MAP[lang.split('+')[0]?.trim()] || 'en',
      langLabel: lang,
    }
  }, [currentAgent])

  /* ── Load agents from API + pick up "Try Now" handoff ───────── */
  useEffect(() => {
    setAgentsLoading(true)
    agentsAPI.list()
      .then(({ data }) => {
        const list = data?.agents || []
        setAgents(list)

        // Check for agent passed via "Try Now" from AgentsListPage
        try {
          const stored = localStorage.getItem('vf_test_agent')
          if (stored) {
            const agent = JSON.parse(stored)
            localStorage.removeItem('vf_test_agent')
            setCurrentAgent(agent)
            setSelectedId(agent.id)
            return
          }
        } catch {}

        // Auto-select first agent if only one
        if (list.length === 1) {
          setCurrentAgent(list[0])
          setSelectedId(list[0].id)
        }
      })
      .catch(() => {
        // Still check localStorage on API failure
        try {
          const stored = localStorage.getItem('vf_test_agent')
          if (stored) {
            const agent = JSON.parse(stored)
            localStorage.removeItem('vf_test_agent')
            setCurrentAgent(agent)
            setSelectedId(agent.id)
          }
        } catch {}
      })
      .finally(() => setAgentsLoading(false))
  }, [])

  /* ── Sync currentAgent when dropdown changes ─────────────────── */
  const handleSelectAgent = (id) => {
    setSelectedId(id)
    setConversation([]) // clear chat when switching
    if (!id) { setCurrentAgent(null); return }
    const found = agents.find(a => a.id === id) ||
                  (currentAgent?.id === id ? currentAgent : null)
    if (found) setCurrentAgent(found)
  }

  /* ── Combined agent list (API agents + current demo agent if any) */
  const agentList = useMemo(() => {
    const list = [...agents]
    // If current agent (e.g., a demo) is not in the API list, prepend it
    if (currentAgent && !agents.find(a => a.id === currentAgent.id)) {
      list.unshift(currentAgent)
    }
    return list
  }, [agents, currentAgent])

  /* ── Auto-scroll chat ────────────────────────────────────────── */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation])

  /* ── Deepgram STT ────────────────────────────────────────────── */
  const { start, stop, recording, partial, finals, error: sttError } =
    useDeepgramStream({ language: agentConfig.langCode || '', diarize: false })

  const toggleRecording = () => { recording ? stop() : start() }

  /* ── Auto-send STT finals to LLM ─────────────────────────────── */
  const lastSentRef = useRef(-1)
  useEffect(() => {
    if (!finals.length || !currentAgent) return
    const idx = finals.length - 1
    if (lastSentRef.current === idx) return
    const last = finals[idx]
    if (!last?.text) return
    lastSentRef.current = idx
    sendToLLM(last.text, last.confidence || 0.9)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finals, currentAgent])

  /* ── Core LLM call ──────────────────────────────────────────── */
  const sendToLLM = async (text, confidence = 0.95) => {
    const ts = () => new Date().toLocaleTimeString()
    setConversation(prev => [
      ...prev,
      { role: 'user', text, timestamp: ts() },
      { role: 'agent', text: '…', timestamp: ts(), pending: true },
    ])
    try {
      const { data } = await api.post('/api/v1/chat', {
        message: text,
        system_prompt: agentConfig.systemPrompt,
        provider: agentConfig.provider,
        language: agentConfig.langCode || undefined,
      })
      const reply = data.text || '(empty reply)'
      setConversation(prev => {
        const out = prev.slice(0, -1)
        out.push({
          role: 'agent', text: reply, timestamp: ts(),
          emotion: 'neutral', intent: 'reply', confidence,
          provider: data.provider, latency: Math.round(data.latency_ms || 0),
        })
        return out
      })
      if (ttsEnabled) playTTS(reply, agentConfig.voice, agentConfig.langCode)
    } catch (e) {
      const detail = e.response?.data?.detail || 'LLM call failed'
      setConversation(prev => {
        const out = prev.slice(0, -1)
        out.push({ role: 'agent', text: `Error: ${detail}`, timestamp: ts(), emotion: 'neutral', intent: 'error', confidence: 0 })
        return out
      })
    }
  }

  /* ── Text input send ─────────────────────────────────────────── */
  const handleSend = async () => {
    const text = message.trim()
    if (!text || !currentAgent || sending) return
    setMessage('')
    setSending(true)
    await sendToLLM(text)
    setSending(false)
  }

  const lastAgentMsg = conversation.filter(m => m.role === 'agent' && !m.pending).slice(-1)[0]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Testing Playground</h1>
          <p className="text-gray-500 mt-1">Test your AI agents with live voice and chat</p>
        </div>
        <div className="flex items-center gap-3">
          {/* TTS toggle */}
          <button
            onClick={() => setTtsEnabled(v => !v)}
            title={ttsEnabled ? 'Voice replies ON' : 'Voice replies OFF'}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
              ttsEnabled
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-gray-50 text-gray-500 border-gray-200'
            }`}
          >
            {ttsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            {ttsEnabled ? 'Voice ON' : 'Voice OFF'}
          </button>
          {recording && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 border border-red-200">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              <span className="text-sm font-medium text-red-700">Recording</span>
            </motion.div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Chat Interface ── */}
        <motion.div variants={fadeUp} initial="hidden" animate="show"
          className="lg:col-span-2 flex flex-col bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden"
          style={{ minHeight: 560 }}
        >
          {/* Agent selector */}
          <div className="p-4 border-b border-gray-100">
            {agentsLoading ? (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading agents…
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedId}
                  onChange={e => handleSelectAgent(e.target.value)}
                  className="w-full appearance-none bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 pr-10 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                >
                  <option value="">Select an agent to test…</option>
                  {agentList.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.icon ? `${a.icon} ` : ''}{a.name}
                      {a.language ? ` — ${a.language}` : ''}
                      {a.isDemo ? ' (Demo)' : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            )}
            {currentAgent && (
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Using <span className="font-medium text-gray-700">{agentConfig.systemPrompt.slice(0, 60)}…</span></span>
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 p-5 space-y-4 overflow-y-auto bg-gray-50/30">
            {conversation.length === 0 ? (
              <div className="flex items-center justify-center h-full text-center">
                <div>
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center mx-auto mb-4">
                    <Bot className="w-8 h-8 text-indigo-500" />
                  </div>
                  <p className="text-gray-500 text-sm font-medium">
                    {currentAgent ? `Testing "${currentAgent.name}" — type or speak` : 'Select an agent above to begin'}
                  </p>
                  <p className="text-gray-400 text-xs mt-1">
                    {currentAgent
                      ? ttsEnabled ? 'Replies will be spoken aloud via ElevenLabs TTS' : 'Voice replies off — toggle above to enable'
                      : 'Messages will appear here in real-time'}
                  </p>
                </div>
              </div>
            ) : (
              <AnimatePresence>
                {conversation.map((msg, i) => (
                  <motion.div key={i}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm ${
                      msg.role === 'user'
                        ? 'bg-indigo-50 text-gray-900 border border-indigo-100'
                        : 'bg-white text-gray-700 border border-gray-200 shadow-sm'
                    }`}>
                      {msg.role === 'agent' && (
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Sparkles className="w-3 h-3 text-indigo-500" />
                          <span className="text-[11px] font-medium text-indigo-600">
                            {currentAgent?.name || 'AI Agent'}
                          </span>
                          {msg.provider && (
                            <span className="text-[10px] text-gray-400 ml-1">via {msg.provider}</span>
                          )}
                        </div>
                      )}
                      <p className="leading-relaxed">{msg.pending ? <span className="animate-pulse">…</span> : msg.text}</p>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-[10px] text-gray-400">{msg.timestamp}</p>
                        {msg.latency > 0 && (
                          <p className="text-[10px] text-gray-400">{msg.latency}ms</p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input bar */}
          <div className="p-4 border-t border-gray-100 bg-white">
            <div className="flex items-center gap-3">
              <button onClick={toggleRecording} disabled={!currentAgent}
                className={`p-3 rounded-xl transition-all duration-200 ${
                  recording
                    ? 'bg-red-500 text-white shadow-sm shadow-red-200'
                    : currentAgent
                    ? 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 hover:text-gray-700'
                    : 'bg-gray-50 text-gray-300 border border-gray-100 cursor-not-allowed'
                }`}
              >
                {recording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <input
                type="text" value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                disabled={!currentAgent}
                placeholder={currentAgent ? `Message ${currentAgent.name}…` : 'Select an agent first'}
                className="flex-1 bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 disabled:opacity-40 transition-all"
              />
              <button onClick={handleSend} disabled={!message.trim() || !currentAgent || sending}
                className="p-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-200 hover:shadow-md hover:shadow-indigo-300 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </motion.div>

        {/* ── Right panel ── */}
        <div className="space-y-5">
          {/* Live Transcription */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.1 }}
            className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm"
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div className="p-1.5 rounded-lg bg-indigo-50"><Activity className="w-4 h-4 text-indigo-600" /></div>
              <h3 className="text-sm font-semibold text-gray-900">Live Transcription</h3>
            </div>
            <div className="min-h-[160px] p-4 rounded-xl bg-gray-50/80 border border-gray-200/60 space-y-2 max-h-[260px] overflow-y-auto">
              {finals.map((f, i) => (
                <p key={i} className="text-sm text-gray-800 leading-relaxed">
                  {f.speaker != null && (
                    <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-mono mr-1.5">S{f.speaker}</span>
                  )}
                  {f.text}
                </p>
              ))}
              {partial && <p className="text-sm text-gray-400 italic leading-relaxed">{partial}<span className="inline-block w-1 h-3 bg-gray-400 ml-0.5 animate-pulse" /></p>}
              {!finals.length && !partial && (
                recording ? (
                  <div className="flex items-center gap-2.5">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                    </span>
                    <p className="text-sm text-gray-600">Listening… speak now</p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Click the mic and speak — transcripts appear live via Deepgram Nova-2.</p>
                )
              )}
              {sttError && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{sttError}</span>
                </div>
              )}
            </div>
          </motion.div>

          {/* Analysis */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.2 }}
            className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm"
          >
            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-1.5 rounded-lg bg-violet-50"><Brain className="w-4 h-4 text-violet-600" /></div>
              <h3 className="text-sm font-semibold text-gray-900">Analysis</h3>
            </div>
            <div className="space-y-3">
              {lastAgentMsg ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50/80 border border-gray-200/40">
                    <span className="text-sm text-gray-500">Provider</span>
                    <span className="text-sm font-medium bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-lg border border-indigo-100 capitalize">{lastAgentMsg.provider || agentConfig.provider}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50/80 border border-gray-200/40">
                    <span className="text-sm text-gray-500">Latency</span>
                    <span className="text-sm font-semibold text-emerald-600">{lastAgentMsg.latency || 0}ms</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50/80 border border-gray-200/40">
                    <span className="text-sm text-gray-500">Confidence</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500" style={{ width: `${(lastAgentMsg.confidence || 0) * 100}%` }} />
                      </div>
                      <span className="text-sm font-semibold text-emerald-600">{((lastAgentMsg.confidence || 0) * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 rounded-xl bg-gray-50/50 text-center">
                  <Brain className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Start a conversation to see analysis</p>
                </div>
              )}
            </div>
          </motion.div>

          {/* Voice Pipeline */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.3 }}
            className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm"
          >
            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-1.5 rounded-lg bg-emerald-50"><AudioLines className="w-4 h-4 text-emerald-600" /></div>
              <h3 className="text-sm font-semibold text-gray-900">Voice Pipeline</h3>
            </div>
            <div className="space-y-2">
              {[
                { label: 'STT', status: 'Deepgram Nova-2', color: 'indigo', active: true },
                { label: 'LLM', status: currentAgent ? (agentConfig.provider === 'auto' ? 'Auto (Groq→OpenAI)' : agentConfig.provider) : 'No agent', color: 'violet', active: !!currentAgent },
                { label: 'TTS', status: ttsEnabled ? 'ElevenLabs' : 'Disabled', color: 'pink', active: ttsEnabled },
                { label: 'Language', status: currentAgent ? (agentConfig.langCode?.toUpperCase() || 'EN') : '—', color: 'amber', active: !!currentAgent },
              ].map(step => (
                <div key={step.label} className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-gray-500">{step.label}</span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                    step.active
                      ? `bg-${step.color}-50 text-${step.color}-700 border border-${step.color}-100`
                      : 'bg-gray-50 text-gray-400 border border-gray-100'
                  }`}>
                    {step.status}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* LiveKit Voice Call */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.4 }}
            className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden"
          >
            <Suspense fallback={<div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>}>
              <LiveKitVoiceRoom
                agentId={selectedId}
                agentName={currentAgent?.name || 'AI Agent'}
                language={agentConfig.langCode || 'en'}
                onEnd={() => {}}
              />
            </Suspense>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
