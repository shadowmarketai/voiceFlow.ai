/**
 * Testing Playground — Voice + Chat agent testing
 * =================================================
 * - Loads real agents from API + auto-selects from "Try Now" handoff
 * - Uses each agent's actual system_prompt, knowledge base, and llmProvider
 * - Voice Chat: mic → Deepgram STT → LLM → ElevenLabs TTS → speaker
 * - Text Chat: type → LLM → TTS
 * - No LiveKit dependency — pure browser-based voice loop
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic, MicOff, Send, Bot, Activity, Brain, ChevronDown, Sparkles,
  Volume2, AudioLines, Loader2, AlertTriangle, VolumeX, CheckCircle2,
  Phone, PhoneOff,
} from 'lucide-react'
import useDeepgramStream from '../../../hooks/useDeepgramStream'
import api, { agentsAPI } from '../../../services/api'

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

/* ── Audio playback helpers ─────────────────────────────────────── */
let _ttsAudio = null

/** Decode base64 audio and return a playable Blob URL */
function _b64toUrl(b64, format = 'wav') {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], { type: `audio/${format}` })
  return URL.createObjectURL(blob)
}

/** Stop whatever is currently playing, clear the queue, release URLs */
function _stopCurrent() {
  if (_ttsAudio) {
    _ttsAudio.pause()
    if (_ttsAudio._url) URL.revokeObjectURL(_ttsAudio._url)
    _ttsAudio = null
  }
  // Release any queued-but-not-yet-played chunk URLs
  for (const item of _chunkQueue) URL.revokeObjectURL(item.url)
  _chunkQueue = []
  _chunkPlaying = false
}

/** Play a pre-synthesised filler clip; returns the Audio element so it can be cancelled */
function playFiller(b64) {
  if (!b64) return null
  _stopCurrent()
  const url = _b64toUrl(b64)
  const audio = new Audio(url)
  audio._url = url
  _ttsAudio = audio
  audio.play().catch(() => {})
  audio.onended = () => { URL.revokeObjectURL(url); if (_ttsAudio === audio) _ttsAudio = null }
  return audio
}

/** Sequential audio chunk queue — plays chunks one after another without overlap */
let _chunkQueue = []
let _chunkPlaying = false

function _playNextChunk() {
  if (_chunkPlaying || _chunkQueue.length === 0) return
  const { url } = _chunkQueue.shift()
  _chunkPlaying = true
  const audio = new Audio(url)
  audio._url = url
  _ttsAudio = audio
  audio.play().catch(() => {})
  audio.onended = () => {
    URL.revokeObjectURL(url)
    if (_ttsAudio === audio) _ttsAudio = null
    _chunkPlaying = false
    _playNextChunk()
  }
  // If playback fails, unblock the queue
  audio.onerror = () => {
    URL.revokeObjectURL(url)
    _chunkPlaying = false
    _playNextChunk()
  }
}

/** Enqueue an audio chunk; if filler is still running on the first chunk, stop it first */
function playChunk(b64, isFirst = false) {
  if (!b64) return
  if (isFirst) {
    // Stop filler and clear any queued chunks from a previous turn
    _stopCurrent()
    _chunkQueue = []
    _chunkPlaying = false
  }
  _chunkQueue.push({ url: _b64toUrl(b64) })
  _playNextChunk()
}

/* ── Legacy TTS helper (used when streaming is unavailable) ─────── */
async function playTTS(text, voice = 'nova', language = 'en', provider = 'auto') {
  if (!text || text === '…') return
  _stopCurrent()
  try {
    const params = new URLSearchParams({ text, voice, provider, language })
    const { data } = await api.get(`/api/v1/tts/preview?${params}`)
    if (data?.audio_base64) {
      playChunk(data.audio_base64)
    }
  } catch {
    // TTS unavailable — text still shown
  }
}

export default function Testing() {
  /* ── Agent state ─────────────────────────────────────────────── */
  const [agents, setAgents] = useState([])
  const [currentAgent, setCurrentAgent] = useState(null)
  const [selectedId, setSelectedId] = useState('')
  const [agentsLoading, setAgentsLoading] = useState(true)
  const [ttsEnabled, setTtsEnabled] = useState(true)

  /* ── Provider overrides ───────────────────────────────────────── */
  const [sttOverride, setSttOverride] = useState('deepgram')
  const [llmOverride, setLlmOverride] = useState('')  // '' = use agent default
  const [ttsOverride, setTtsOverride] = useState('')  // '' = auto

  /* ── Chat state ──────────────────────────────────────────────── */
  const [message, setMessage] = useState('')
  const [conversation, setConversation] = useState([])
  const [sending, setSending] = useState(false)
  const chatEndRef = useRef(null)
  const sessionStartRef = useRef(null)
  const savedRef = useRef(false)

  /* ── Voice call state ────────────────────────────────────────── */
  const [voiceCallActive, setVoiceCallActive] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const [agentSpeaking, setAgentSpeaking] = useState(false)

  /* ── Derived agent config ────────────────────────────────────── */
  const agentConfig = useMemo(() => {
    if (!currentAgent) return {}
    const cfg = currentAgent.config || {}
    const lang = currentAgent.language || ''
    let fullPrompt = cfg.prompt || 'You are a helpful AI voice assistant. Keep replies concise.'
    if (cfg.knowledgeContext) {
      fullPrompt += `\n\n## KNOWLEDGE BASE\nUse the following information to answer questions accurately. If a question is not covered here, say you'll find out and get back to them.\n\n${cfg.knowledgeContext}`
    }
    return {
      systemPrompt: fullPrompt,
      firstMessage: cfg.firstMessage || '',
      // Upgrade legacy "groq" agents to Gemini 2.5 Pro automatically
      provider: (cfg.llmProvider && cfg.llmProvider !== 'groq') ? cfg.llmProvider : 'gemini',
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
        if (list.length === 1) {
          setCurrentAgent(list[0])
          setSelectedId(list[0].id)
        }
      })
      .catch(() => {
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

  /* ── Save conversation to DB ──────────────────────────────────── */
  const saveConversationToDB = useCallback(async (conv, agent) => {
    if (!agent || !conv || conv.length < 2 || savedRef.current) return
    savedRef.current = true
    const userMsgs = conv.filter(m => m.role === 'user')
    if (userMsgs.length === 0) return // no user interaction to save

    const transcript = conv
      .filter(m => !m.pending)
      .map(m => `${m.role === 'user' ? 'User' : 'Agent'}: ${m.text}`)
      .join('\n')

    const lastEmotion = conv.filter(m => m.emotion).slice(-1)[0]?.emotion || 'neutral'
    const now = new Date().toISOString()
    const startedAt = sessionStartRef.current || now
    const durationSec = sessionStartRef.current
      ? Math.round((Date.now() - new Date(sessionStartRef.current).getTime()) / 1000)
      : 0

    try {
      await agentsAPI.logCall({
        agent_id: String(agent.id),
        direction: 'test',
        channel: 'testing_playground',
        from_addr: 'test-user',
        to_addr: agent.name || 'AI Agent',
        started_at: startedAt,
        ended_at: now,
        duration_sec: durationSec,
        outcome: 'completed',
        sentiment: lastEmotion === 'happy' ? 'positive' : lastEmotion === 'angry' ? 'negative' : 'neutral',
        emotion: lastEmotion,
        transcript,
        meta: {
          message_count: conv.length,
          user_messages: userMsgs.length,
          agent_name: agent.name,
          language: agentConfig.langCode || 'en',
        },
      })
    } catch (e) {
      // Silent fail — don't block UX
    }
  }, [agentConfig])

  // Save on page unmount
  useEffect(() => {
    return () => {
      saveConversationToDB(conversation, currentAgent)
    }
  }, []) // intentionally empty — uses refs on unmount

  // Track session start when first user message is sent
  useEffect(() => {
    const hasUser = conversation.some(m => m.role === 'user')
    if (hasUser && !sessionStartRef.current) {
      sessionStartRef.current = new Date().toISOString()
    }
  }, [conversation])

  /* ── Show agent's first message when selected ─────────────────── */
  const firstMsgShownRef = useRef('')
  useEffect(() => {
    if (!currentAgent || firstMsgShownRef.current === currentAgent.id) return
    const fm = currentAgent.config?.firstMessage
    if (fm) {
      firstMsgShownRef.current = currentAgent.id
      const ts = new Date().toLocaleTimeString()
      setConversation([{ role: 'agent', text: fm, timestamp: ts, intent: 'greeting' }])
      if (ttsEnabled) playTTS(fm, currentAgent.config?.voice || 'nova', LANG_MAP[currentAgent.language] || 'en')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAgent])

  /* ── Sync currentAgent when dropdown changes ─────────────────── */
  const handleSelectAgent = (id) => {
    // Save current conversation before switching
    if (conversation.length >= 2 && currentAgent) {
      saveConversationToDB(conversation, currentAgent)
    }
    setSelectedId(id)
    setConversation([])
    firstMsgShownRef.current = ''
    sessionStartRef.current = null
    savedRef.current = false
    if (voiceCallActive) endVoiceCall()
    if (!id) { setCurrentAgent(null); return }
    const found = agents.find(a => a.id === id) ||
                  (currentAgent?.id === id ? currentAgent : null)
    if (found) setCurrentAgent(found)
  }

  /* ── Combined agent list ─────────────────────────────────────── */
  const agentList = useMemo(() => {
    const list = [...agents]
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

  /* ── Auto-send STT finals to LLM ─────────────────────────────── */
  const lastSentRef = useRef(-1)
  const agentSpeakingRef = useRef(false)  // ref mirror of agentSpeaking for use inside effects
  useEffect(() => {
    if (!finals.length || !currentAgent) return
    // Skip if agent is currently speaking — prevents mic echo loop
    if (agentSpeakingRef.current) return
    const idx = finals.length - 1
    if (lastSentRef.current === idx) return
    const last = finals[idx]
    if (!last?.text) return
    lastSentRef.current = idx
    sendToLLM(last.text, last.confidence || 0.9)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finals, currentAgent])

  /* ── Core LLM call — uses /text-stream SSE for GAP-3/4 benefits ─ */
  const sendToLLM = useCallback(async (text, confidence = 0.95) => {
    const ts = () => new Date().toLocaleTimeString()
    // Stop any currently playing audio before starting a new response
    _stopCurrent()
    setAgentSpeaking(true)
    agentSpeakingRef.current = true
    setConversation(prev => [
      ...prev,
      { role: 'user', text, timestamp: ts() },
      { role: 'agent', text: '…', timestamp: ts(), pending: true },
    ])

    try {
      const baseUrl = (import.meta.env.VITE_API_URL || '')
      const res = await fetch(`${baseUrl}/api/v1/voice/text-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          system_prompt: agentConfig.systemPrompt,
          language: agentConfig.langCode || 'en',
          llm_provider: llmOverride || agentConfig.provider || 'gemini',
          tts_language: agentConfig.langCode || 'en',
        }),
      })

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let fullReply = ''
      let firstChunk = true
      let latencyMs = 0
      const startMs = Date.now()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })

        // SSE lines look like "data: {...}\n\n"
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let event
          try { event = JSON.parse(line.slice(6)) } catch { continue }

          if (event.type === 'filler' && ttsEnabled) {
            playFiller(event.audio_base64)
          } else if (event.type === 'llm_partial') {
            fullReply += event.text
            // Update the pending bubble with streaming text
            setConversation(prev => {
              const out = [...prev]
              const last = out[out.length - 1]
              if (last?.pending) out[out.length - 1] = { ...last, text: fullReply || '…' }
              return out
            })
          } else if (event.type === 'audio_chunk' && ttsEnabled) {
            playChunk(event.audio_base64, firstChunk)
            firstChunk = false
          } else if (event.type === 'done') {
            latencyMs = event.ttfa_ms || Math.round(Date.now() - startMs)
            if (event.text) fullReply = event.text
          }
        }
      }

      const reply = fullReply.trim() || '(empty reply)'
      setConversation(prev => {
        const out = prev.slice(0, -1)
        out.push({
          role: 'agent', text: reply, timestamp: ts(),
          emotion: 'neutral', intent: 'reply', confidence,
          provider: llmOverride || agentConfig.provider, latency: latencyMs,
        })
        return out
      })

      // Fallback: if streaming endpoint returned no audio, use legacy TTS
      if (firstChunk && ttsEnabled) {
        await playTTS(reply, agentConfig.voice, agentConfig.langCode, ttsOverride || 'auto')
      }

    } catch (e) {
      // Streaming unavailable — fall back to /api/v1/chat
      try {
        const { data } = await api.post('/api/v1/chat', {
          message: text,
          system_prompt: agentConfig.systemPrompt,
          provider: llmOverride || agentConfig.provider,
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
        if (ttsEnabled) {
          await playTTS(reply, agentConfig.voice, agentConfig.langCode, ttsOverride || 'auto')
        }
      } catch (e2) {
        const detail = e2.response?.data?.detail || 'LLM call failed'
        setConversation(prev => {
          const out = prev.slice(0, -1)
          out.push({ role: 'agent', text: `Error: ${detail}`, timestamp: ts(), emotion: 'neutral', intent: 'error', confidence: 0 })
          return out
        })
      }
    } finally {
      setAgentSpeaking(false)
      agentSpeakingRef.current = false
    }
  }, [agentConfig, ttsEnabled, llmOverride, ttsOverride])

  /* ── Text input send ─────────────────────────────────────────── */
  const handleSend = async () => {
    const text = message.trim()
    if (!text || !currentAgent || sending) return
    setMessage('')
    setSending(true)
    await sendToLLM(text)
    setSending(false)
  }

  /* ── Voice Call controls ─────────────────────────────────────── */
  const startVoiceCall = useCallback(() => {
    if (!currentAgent) return
    setVoiceCallActive(true)
    setCallDuration(0)
    lastSentRef.current = -1
    start() // start Deepgram STT
  }, [currentAgent, start])

  const endVoiceCall = useCallback(() => {
    setVoiceCallActive(false)
    stop() // stop Deepgram STT
    if (_ttsAudio) { _ttsAudio.pause(); _ttsAudio = null }
    // Save conversation when voice call ends
    if (conversation.length >= 2 && currentAgent) {
      saveConversationToDB(conversation, currentAgent)
    }
  }, [stop, conversation, currentAgent, saveConversationToDB])

  const toggleMic = useCallback(() => {
    if (voiceCallActive) {
      recording ? stop() : start()
    } else {
      recording ? stop() : start()
    }
  }, [voiceCallActive, recording, start, stop])

  // Mute mic while agent is speaking to prevent echo loop
  useEffect(() => {
    if (!voiceCallActive) return
    if (agentSpeaking && recording) {
      stop()   // pause STT while agent speaks
    } else if (!agentSpeaking && !recording) {
      start()  // resume STT when agent finishes
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentSpeaking, voiceCallActive])

  // Call duration timer
  useEffect(() => {
    if (!voiceCallActive) return
    const interval = setInterval(() => setCallDuration(d => d + 1), 1000)
    return () => clearInterval(interval)
  }, [voiceCallActive])

  // Cleanup on unmount
  useEffect(() => () => { stop(); if (_ttsAudio) { _ttsAudio.pause() } }, [stop])

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
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
          <button
            onClick={() => setTtsEnabled(v => !v)}
            title={ttsEnabled ? 'Voice replies ON' : 'Voice replies OFF'}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
              ttsEnabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-500 border-gray-200'
            }`}
          >
            {ttsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            {ttsEnabled ? 'Voice ON' : 'Voice OFF'}
          </button>
          {(recording || voiceCallActive) && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${voiceCallActive ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <span className="relative flex h-2.5 w-2.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${voiceCallActive ? 'bg-emerald-400' : 'bg-red-400'}`} />
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${voiceCallActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
              </span>
              <span className={`text-sm font-medium ${voiceCallActive ? 'text-emerald-700' : 'text-red-700'}`}>
                {voiceCallActive ? `Call ${formatTime(callDuration)}` : 'Recording'}
              </span>
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
                <select value={selectedId} onChange={e => handleSelectAgent(e.target.value)}
                  disabled={voiceCallActive}
                  className="w-full appearance-none bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 pr-10 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60 transition-all"
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
                <span className="truncate">Using <span className="font-medium text-gray-700">{currentAgent.name}</span> — {llmOverride || agentConfig.provider} + {agentConfig.langCode?.toUpperCase()}</span>
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
                    {currentAgent ? `Testing "${currentAgent.name}" — type, speak, or start a voice call` : 'Select an agent above to begin'}
                  </p>
                  <p className="text-gray-400 text-xs mt-1">
                    {currentAgent ? 'Use the mic button for quick speech, or Start Voice Call for hands-free conversation' : 'Messages will appear here in real-time'}
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
                          <span className="text-[11px] font-medium text-indigo-600">{currentAgent?.name || 'AI Agent'}</span>
                          {msg.provider && <span className="text-[10px] text-gray-400 ml-1">via {msg.provider}</span>}
                        </div>
                      )}
                      <p className="leading-relaxed">{msg.pending ? <span className="animate-pulse">…</span> : msg.text}</p>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-[10px] text-gray-400">{msg.timestamp}</p>
                        {msg.latency > 0 && <p className="text-[10px] text-gray-400">{msg.latency}ms</p>}
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
              <button onClick={toggleMic} disabled={!currentAgent}
                title={recording ? 'Stop mic' : 'Start mic'}
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
              <input type="text" value={message}
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
          {/* Voice Call Panel */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.05 }}
            className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden"
          >
            {voiceCallActive ? (
              /* ── Active call UI ── */
              <div className="flex flex-col items-center gap-4 p-6">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-sm font-medium text-emerald-700">Voice Call Active</span>
                </div>
                <p className="text-3xl font-mono font-bold text-gray-900">{formatTime(callDuration)}</p>

                {agentSpeaking && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100">
                    <AudioLines className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
                    <span className="text-xs text-indigo-600 font-medium">Agent speaking…</span>
                  </div>
                )}

                {partial && (
                  <div className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-500 italic text-center">
                    {partial}<span className="inline-block w-1 h-3 bg-gray-400 ml-0.5 animate-pulse" />
                  </div>
                )}

                <div className="flex items-center gap-3 mt-2">
                  <button onClick={toggleMic}
                    className={`p-4 rounded-full transition-all ${recording ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
                  >
                    {recording ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                  </button>
                  <button onClick={endVoiceCall}
                    className="p-4 rounded-full bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-200 transition-all"
                  >
                    <PhoneOff className="w-6 h-6" />
                  </button>
                </div>
                <p className="text-[10px] text-gray-400">Speak naturally — agent responds automatically</p>
              </div>
            ) : (
              /* ── Start call UI ── */
              <div className="flex flex-col items-center gap-4 p-8">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-200">
                  <Phone className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Voice Call</h3>
                <p className="text-sm text-gray-500 text-center max-w-xs">
                  Start a hands-free voice conversation. Speak naturally and the agent will respond.
                </p>
                <button onClick={startVoiceCall} disabled={!currentAgent}
                  className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold shadow-lg shadow-emerald-200 hover:shadow-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Phone className="w-5 h-5" /> Start Voice Call
                </button>
                <p className="text-[10px] text-gray-400">
                  {sttOverride === 'deepgram' ? 'Deepgram' : sttOverride} STT → {llmOverride || agentConfig.provider || 'gemini'} LLM → {ttsOverride || 'auto'} TTS
                </p>
              </div>
            )}
          </motion.div>

          {/* Live Transcription */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.1 }}
            className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm"
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div className="p-1.5 rounded-lg bg-indigo-50"><Activity className="w-4 h-4 text-indigo-600" /></div>
              <h3 className="text-sm font-semibold text-gray-900">Live Transcription</h3>
            </div>
            <div className="min-h-[120px] p-4 rounded-xl bg-gray-50/80 border border-gray-200/60 space-y-2 max-h-[200px] overflow-y-auto">
              {finals.map((f, i) => (
                <p key={i} className="text-sm text-gray-800 leading-relaxed">{f.text}</p>
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
                  <p className="text-sm text-gray-400">Click mic or start a voice call — transcripts appear live.</p>
                )
              )}
              {sttError && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span>{sttError}</span>
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
          </motion.div>

          {/* Provider Selection */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.25 }}
            className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm"
          >
            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-1.5 rounded-lg bg-emerald-50"><AudioLines className="w-4 h-4 text-emerald-600" /></div>
              <h3 className="text-sm font-semibold text-gray-900">Voice Pipeline</h3>
            </div>
            <div className="space-y-3">
              {/* STT Provider */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">STT (Speech-to-Text)</label>
                <select value={sttOverride} onChange={e => setSttOverride(e.target.value)}
                  disabled={voiceCallActive}
                  className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100 disabled:opacity-50 transition-all"
                >
                  <option value="deepgram">Deepgram Nova-2</option>
                  <option value="sarvam">Sarvam AI (Indic)</option>
                  <option value="groq">Groq Whisper</option>
                  <option value="openai">OpenAI Whisper</option>
                </select>
                {sttOverride !== 'deepgram' && (
                  <p className="text-[10px] text-amber-600 mt-1">Live streaming uses Deepgram. Other STT providers work for recorded audio.</p>
                )}
              </div>

              {/* LLM Provider */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">LLM (Language Model)</label>
                <select value={llmOverride} onChange={e => setLlmOverride(e.target.value)}
                  className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 focus:outline-none focus:border-violet-300 focus:ring-1 focus:ring-violet-100 transition-all"
                >
                  <option value="">Agent Default ({agentConfig.provider || 'gemini'})</option>
                  <option value="gemini">Gemini 2.5 Pro (Best)</option>
                  <option value="auto">Auto (Gemini → Groq → OpenAI)</option>
                  <option value="groq">Groq (Fastest)</option>
                  <option value="openai">OpenAI GPT</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="deepseek">DeepSeek</option>
                </select>
              </div>

              {/* TTS Provider */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">TTS (Text-to-Speech)</label>
                <select value={ttsOverride} onChange={e => setTtsOverride(e.target.value)}
                  className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 focus:outline-none focus:border-pink-300 focus:ring-1 focus:ring-pink-100 transition-all"
                >
                  <option value="">Auto (best available)</option>
                  <option value="elevenlabs">ElevenLabs</option>
                  <option value="sarvam">Sarvam AI (Indic)</option>
                  <option value="openai">OpenAI TTS</option>
                  <option value="deepgram">Deepgram Aura</option>
                  <option value="google">Google Cloud TTS</option>
                  <option value="edge">Edge TTS (Free)</option>
                </select>
              </div>

              {/* Active pipeline status */}
              <div className="pt-2 mt-1 border-t border-gray-100 space-y-1.5">
                {[
                  { label: 'Language', status: currentAgent ? (agentConfig.langCode?.toUpperCase() || 'EN') : '—', color: 'amber', active: !!currentAgent },
                  { label: 'Mode', status: voiceCallActive ? 'Voice Call' : recording ? 'Mic Active' : 'Text Chat', color: 'emerald', active: voiceCallActive || recording },
                ].map(step => (
                  <div key={step.label} className="flex items-center justify-between py-1">
                    <span className="text-xs text-gray-500">{step.label}</span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                      step.active ? `bg-${step.color}-50 text-${step.color}-700 border border-${step.color}-100` : 'bg-gray-50 text-gray-400 border border-gray-100'
                    }`}>{step.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
