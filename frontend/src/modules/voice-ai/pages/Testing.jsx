/**
 * Testing Playground v2 — Multilingual-First
 * ===========================================
 *
 * Why this rewrite:
 *   The previous Testing page wired the mic straight into Deepgram
 *   streaming. Deepgram Nova-2 STREAMING only supports Hindi from the
 *   Indic family — Tamil/Telugu/Kannada/Malayalam/Bengali/Marathi/
 *   Gujarati/Punjabi/Odia all silently fall back to English STT, which
 *   is why agents felt "stuck in English".  This rewrite:
 *
 *   1. Adds an explicit per-session language picker (overrides agent)
 *   2. Routes STT smartly:
 *        en, hi  →  Deepgram WebSocket streaming (low latency)
 *        all other Indic → MediaRecorder push-to-talk → /api/v1/stt/transcribe
 *                          which uses Sarvam (correct native script)
 *   3. Listens for {type:"language"} events from /text-stream and
 *      auto-promotes the session language when detection differs from
 *      what we requested.
 *   4. Shows per-turn diagnostics: STT provider, detected language,
 *      LLM provider, TTS provider, latency.
 *   5. Shows a language badge on every chat bubble.
 *
 * Backend deps (from the multilingual-fix-v2 patch):
 *   POST /api/v1/voice/text-stream    — now emits {type:"language"} events
 *   POST /api/v1/stt/transcribe       — NEW batch STT for Indic
 *   WS   /api/v1/stt/stream           — existing Deepgram (en/hi only)
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic, MicOff, Send, Bot, Activity, Brain, ChevronDown, Sparkles,
  Volume2, AudioLines, Loader2, AlertTriangle, VolumeX, CheckCircle2,
  Phone, PhoneOff, Languages, Radio, Zap,
} from 'lucide-react'
import useDeepgramStream from '../../../hooks/useDeepgramStream'
import api, { agentsAPI } from '../../../services/api'

/* ── Language catalog ──────────────────────────────────────────────── */
// stt: 'stream' = Deepgram WebSocket, 'batch' = MediaRecorder + Sarvam
// Auto-detect MUST use batch — Deepgram streaming has no language ID.
// Sarvam's language_code='unknown' returns the actually detected language.
const LANGUAGES = [
  { code: '',   label: 'Auto-detect',    native: 'Auto', stt: 'batch'  },
  { code: 'en', label: 'English',        native: 'English',     stt: 'stream' },
  { code: 'hi', label: 'Hindi',          native: 'हिन्दी',       stt: 'stream' },
  { code: 'ta', label: 'Tamil',          native: 'தமிழ்',        stt: 'batch'  },
  { code: 'te', label: 'Telugu',         native: 'తెలుగు',       stt: 'batch'  },
  { code: 'kn', label: 'Kannada',        native: 'ಕನ್ನಡ',         stt: 'batch'  },
  { code: 'ml', label: 'Malayalam',      native: 'മലയാളം',       stt: 'batch'  },
  { code: 'bn', label: 'Bengali',        native: 'বাংলা',         stt: 'batch'  },
  { code: 'mr', label: 'Marathi',        native: 'मराठी',         stt: 'batch'  },
  { code: 'gu', label: 'Gujarati',       native: 'ગુજરાતી',       stt: 'batch'  },
  { code: 'pa', label: 'Punjabi',        native: 'ਪੰਜਾਬੀ',         stt: 'batch'  },
  { code: 'or', label: 'Odia',           native: 'ଓଡ଼ିଆ',          stt: 'batch'  },
  { code: 'ur', label: 'Urdu',           native: 'اردو',          stt: 'stream' },
]
const LANG_BY_CODE = Object.fromEntries(LANGUAGES.map(l => [l.code, l]))

const LEGACY_LANG_MAP = {
  'English': 'en', 'Hindi': 'hi', 'Tamil': 'ta', 'Telugu': 'te',
  'Gujarati': 'gu', 'Bengali': 'bn', 'Kannada': 'kn', 'Odia': 'or',
  'Assamese': 'as', 'Marathi': 'mr', 'Punjabi': 'pa', 'Malayalam': 'ml',
  'Tamil + English': 'ta', 'Hindi + English': 'hi', 'Gujarati + English': 'gu',
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
}

/* ── Audio playback (sequential, no overlap) ───────────────────────── */
let _ttsAudio = null
let _chunkQueue = []
let _chunkPlaying = false

function _b64toUrl(b64, format = 'wav') {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: `audio/${format}` }))
}

function _stopCurrent() {
  if (_ttsAudio) {
    _ttsAudio.pause()
    if (_ttsAudio._url) URL.revokeObjectURL(_ttsAudio._url)
    _ttsAudio = null
  }
  for (const item of _chunkQueue) URL.revokeObjectURL(item.url)
  _chunkQueue = []
  _chunkPlaying = false
}

function _playNextChunk() {
  if (_chunkPlaying || _chunkQueue.length === 0) return
  const { url } = _chunkQueue.shift()
  _chunkPlaying = true
  const audio = new Audio(url)
  audio._url = url
  _ttsAudio = audio
  audio.play().catch(() => {})
  audio.onended = audio.onerror = () => {
    URL.revokeObjectURL(url)
    if (_ttsAudio === audio) _ttsAudio = null
    _chunkPlaying = false
    _playNextChunk()
  }
}

function playFiller(b64) {
  if (!b64) return
  _stopCurrent()
  const url = _b64toUrl(b64)
  const audio = new Audio(url)
  audio._url = url
  _ttsAudio = audio
  audio.play().catch(() => {})
  audio.onended = () => { URL.revokeObjectURL(url); if (_ttsAudio === audio) _ttsAudio = null }
}

function playChunk(b64, isFirst = false) {
  if (!b64) return
  if (isFirst) _stopCurrent()
  _chunkQueue.push({ url: _b64toUrl(b64) })
  _playNextChunk()
}

/* ── Batch STT recorder (for Indic / non-streamable languages) ─────── */
function useBatchRecorder() {
  const recRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const [isRecording, setIsRecording] = useState(false)

  const start = useCallback(async () => {
    chunksRef.current = []
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    })
    streamRef.current = stream
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : ''
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    rec.start(250)
    recRef.current = rec
    setIsRecording(true)
  }, [])

  const stop = useCallback(() => {
    return new Promise(resolve => {
      const rec = recRef.current
      if (!rec || rec.state === 'inactive') {
        streamRef.current?.getTracks().forEach(t => t.stop())
        setIsRecording(false)
        resolve(null)
        return
      }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        recRef.current = null
        chunksRef.current = []
        setIsRecording(false)
        resolve(blob.size > 0 ? blob : null)
      }
      rec.stop()
    })
  }, [])

  return { start, stop, isRecording }
}

async function transcribeBatch(blob, languageHint) {
  const baseUrl = import.meta.env.VITE_API_URL || ''
  const fd = new FormData()
  fd.append('file', blob, 'audio.webm')
  if (languageHint) fd.append('language', languageHint)
  const res = await fetch(`${baseUrl}/api/v1/stt/transcribe`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error(`STT batch HTTP ${res.status}`)
  return res.json()
}

async function playTTS(text, voice = 'nova', language = 'en', provider = 'auto') {
  if (!text || text === '…') return
  _stopCurrent()
  try {
    const params = new URLSearchParams({ text, voice, provider, language })
    const { data } = await api.get(`/api/v1/tts/preview?${params}`)
    if (data?.audio_base64) playChunk(data.audio_base64)
  } catch {}
}

/* ════════════════════════════════════════════════════════════════════
   Main component
   ════════════════════════════════════════════════════════════════════ */
export default function Testing() {
  const [agents, setAgents] = useState([])
  const [currentAgent, setCurrentAgent] = useState(null)
  const [selectedId, setSelectedId] = useState('')
  const [agentsLoading, setAgentsLoading] = useState(true)
  const [ttsEnabled, setTtsEnabled] = useState(true)

  // Per-session language; user overrides the agent's default
  const [sessionLang, setSessionLang] = useState('en')
  const [detectedLang, setDetectedLang] = useState('en')
  const [autoDetectMsg, setAutoDetectMsg] = useState('')

  const [llmOverride, setLlmOverride] = useState('')
  const [ttsOverride, setTtsOverride] = useState('')

  const [message, setMessage] = useState('')
  const [conversation, setConversation] = useState([])
  const [sending, setSending] = useState(false)
  const chatEndRef = useRef(null)
  const sessionStartRef = useRef(null)
  const savedRef = useRef(false)

  const [voiceCallActive, setVoiceCallActive] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const [agentSpeaking, setAgentSpeaking] = useState(false)

  const [lastDiag, setLastDiag] = useState(null)

  /* ── STT health check on mount ─────────────────────────────────── */
  // Surfaces a banner if Sarvam isn't configured — that's the #1
  // reason multilingual still doesn't work after applying the fixes.
  const [sttHealth, setSttHealth] = useState(null)
  useEffect(() => {
    const baseUrl = import.meta.env.VITE_API_URL || ''
    fetch(`${baseUrl}/api/v1/stt/health`)
      .then(r => r.json()).then(setSttHealth).catch(() => {})
  }, [])

  const agentConfig = useMemo(() => {
    if (!currentAgent) return {}
    const cfg = currentAgent.config || {}
    let fullPrompt = cfg.prompt || 'You are a helpful AI voice assistant. Keep replies concise.'
    if (cfg.knowledgeContext) fullPrompt += `\n\n## KNOWLEDGE BASE\n${cfg.knowledgeContext}`
    return {
      systemPrompt: fullPrompt,
      firstMessage: cfg.firstMessage || '',
      provider: (cfg.llmProvider && cfg.llmProvider !== 'groq') ? cfg.llmProvider : 'gemini',
      voice: cfg.voice || 'nova',
      defaultLang: LEGACY_LANG_MAP[currentAgent.language] ||
                   LEGACY_LANG_MAP[currentAgent.language?.split('+')?.[0]?.trim()] || 'en',
    }
  }, [currentAgent])

  useEffect(() => {
    if (agentConfig.defaultLang) {
      setSessionLang(agentConfig.defaultLang)
      setDetectedLang(agentConfig.defaultLang)
    }
  }, [agentConfig.defaultLang])

  const effectiveLang = sessionLang || detectedLang || 'en'
  const langInfo = LANG_BY_CODE[effectiveLang] || LANG_BY_CODE['en']
  // Auto-detect (sessionLang === '') ALWAYS uses batch mode — Deepgram
  // streaming has no language identification, only Sarvam batch does.
  const sttMode = sessionLang === '' ? 'batch' : (langInfo.stt || 'stream')

  /* ── Load agents ─────────────────────────────────────────────── */
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
        if (list.length === 1) { setCurrentAgent(list[0]); setSelectedId(list[0].id) }
      })
      .catch(() => {
        try {
          const stored = localStorage.getItem('vf_test_agent')
          if (stored) {
            const agent = JSON.parse(stored)
            localStorage.removeItem('vf_test_agent')
            setCurrentAgent(agent); setSelectedId(agent.id)
          }
        } catch {}
      })
      .finally(() => setAgentsLoading(false))
  }, [])

  /* ── Save conversation ──────────────────────────────────────── */
  const saveConversationToDB = useCallback(async (conv, agent) => {
    if (!agent || !conv || conv.length < 2 || savedRef.current) return
    savedRef.current = true
    const userMsgs = conv.filter(m => m.role === 'user')
    if (userMsgs.length === 0) return
    const transcript = conv.filter(m => !m.pending)
      .map(m => `${m.role === 'user' ? 'User' : 'Agent'}: ${m.text}`).join('\n')
    const lastEmotion = conv.filter(m => m.emotion).slice(-1)[0]?.emotion || 'neutral'
    const now = new Date().toISOString()
    const startedAt = sessionStartRef.current || now
    const durationSec = sessionStartRef.current
      ? Math.round((Date.now() - new Date(sessionStartRef.current).getTime()) / 1000) : 0
    try {
      await agentsAPI.logCall({
        agent_id: String(agent.id), direction: 'test', channel: 'testing_playground',
        from_addr: 'test-user', to_addr: agent.name || 'AI Agent',
        started_at: startedAt, ended_at: now, duration_sec: durationSec,
        outcome: 'completed',
        sentiment: lastEmotion === 'happy' ? 'positive' : lastEmotion === 'angry' ? 'negative' : 'neutral',
        emotion: lastEmotion, transcript,
        meta: { message_count: conv.length, user_messages: userMsgs.length,
                agent_name: agent.name, language: detectedLang || 'en' },
      })
    } catch {}
  }, [detectedLang])

  useEffect(() => () => saveConversationToDB(conversation, currentAgent), []) // eslint-disable-line
  useEffect(() => {
    const hasUser = conversation.some(m => m.role === 'user')
    if (hasUser && !sessionStartRef.current) sessionStartRef.current = new Date().toISOString()
  }, [conversation])

  /* ── First-message greeting ──────────────────────────────────── */
  const firstMsgShownRef = useRef('')
  useEffect(() => {
    if (!currentAgent || firstMsgShownRef.current === currentAgent.id) return
    const fm = currentAgent.config?.firstMessage
    if (fm) {
      firstMsgShownRef.current = currentAgent.id
      const ts = new Date().toLocaleTimeString()
      setConversation([{ role: 'agent', text: fm, timestamp: ts, intent: 'greeting',
                         language: agentConfig.defaultLang }])
      if (ttsEnabled) playTTS(fm, agentConfig.voice, agentConfig.defaultLang)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAgent])

  const handleSelectAgent = (id) => {
    if (conversation.length >= 2 && currentAgent) saveConversationToDB(conversation, currentAgent)
    setSelectedId(id)
    setConversation([])
    setLastDiag(null)
    setAutoDetectMsg('')
    firstMsgShownRef.current = ''
    sessionStartRef.current = null
    savedRef.current = false
    if (voiceCallActive) endVoiceCall()
    if (!id) { setCurrentAgent(null); return }
    const found = agents.find(a => a.id === id) || (currentAgent?.id === id ? currentAgent : null)
    if (found) setCurrentAgent(found)
  }

  const agentList = useMemo(() => {
    const list = [...agents]
    if (currentAgent && !agents.find(a => a.id === currentAgent.id)) list.unshift(currentAgent)
    return list
  }, [agents, currentAgent])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [conversation])

  /* ── STT engines ─────────────────────────────────────────────── */
  const dgLang = sttMode === 'stream' ? (effectiveLang || '') : ''
  const { start: dgStart, stop: dgStop, recording: dgRecording, partial, finals, error: sttError } =
    useDeepgramStream({ language: dgLang, diarize: false })
  const batch = useBatchRecorder()
  const recording = dgRecording || batch.isRecording

  /* ── Auto-send Deepgram finals (stream mode only) ────────────── */
  const lastSentRef = useRef(-1)
  const agentSpeakingRef = useRef(false)
  useEffect(() => {
    if (!finals.length || !currentAgent || sttMode !== 'stream') return
    if (agentSpeakingRef.current) return
    const idx = finals.length - 1
    if (lastSentRef.current === idx) return
    const last = finals[idx]
    if (!last?.text) return
    lastSentRef.current = idx
    sendToLLM(last.text, last.confidence || 0.9, { sttProvider: 'deepgram-stream' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finals, currentAgent, sttMode])

  /* ── Core LLM + TTS streaming call ───────────────────────────── */
  const sendToLLM = useCallback(async (text, confidence = 0.95, meta = {}) => {
    const ts = () => new Date().toLocaleTimeString()
    _stopCurrent()
    setAgentSpeaking(true)
    agentSpeakingRef.current = true

    const userBubbleLang = meta.detectedLang || effectiveLang
    setConversation(prev => [
      ...prev,
      { role: 'user', text, timestamp: ts(), language: userBubbleLang,
        sttProvider: meta.sttProvider, sttConfidence: meta.sttConfidence },
      { role: 'agent', text: '…', timestamp: ts(), pending: true },
    ])

    try {
      const baseUrl = import.meta.env.VITE_API_URL || ''
      // Build conversation history from previous turns (skip pending bubbles)
      const historyMsgs = conversation
        .filter(m => !m.pending && m.text && m.text !== '…')
        .slice(-20)
        .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }))

      const res = await fetch(`${baseUrl}/api/v1/voice/text-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          system_prompt: agentConfig.systemPrompt,
          language: userBubbleLang || 'en',
          llm_provider: llmOverride || agentConfig.provider || 'gemini',
          tts_language: userBubbleLang || 'en',
          conversation_history: historyMsgs,
        }),
      })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let fullReply = ''
      let firstChunk = true
      let latencyMs = 0
      let backendLang = userBubbleLang
      const startMs = Date.now()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let event
          try { event = JSON.parse(line.slice(6)) } catch { continue }

          if (event.type === 'language') {
            backendLang = event.to
            setAutoDetectMsg(`Auto-switched ${(event.from || '??').toUpperCase()} → ${event.to.toUpperCase()} (${event.reason})`)
            setDetectedLang(event.to)
          } else if (event.type === 'filler' && ttsEnabled) {
            playFiller(event.audio_base64)
          } else if (event.type === 'llm_partial') {
            fullReply += event.text
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
            if (event.language) backendLang = event.language
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
          language: backendLang,
        })
        return out
      })

      setLastDiag({
        sttProvider: meta.sttProvider || 'deepgram-stream',
        sttConfidence: meta.sttConfidence || confidence,
        detectedLang: backendLang,
        llmProvider: llmOverride || agentConfig.provider || 'gemini',
        ttsProvider: ttsOverride || 'auto',
        latencyMs,
      })

      if (firstChunk && ttsEnabled) await playTTS(reply, agentConfig.voice, backendLang, ttsOverride || 'auto')
    } catch (e) {
      try {
        const { data } = await api.post('/api/v1/chat', {
          message: text, system_prompt: agentConfig.systemPrompt,
          provider: llmOverride || agentConfig.provider,
          language: userBubbleLang || undefined,
        })
        const reply = data.text || '(empty reply)'
        setConversation(prev => {
          const out = prev.slice(0, -1)
          out.push({ role: 'agent', text: reply, timestamp: ts(),
                     emotion: 'neutral', intent: 'reply', confidence,
                     provider: data.provider, latency: Math.round(data.latency_ms || 0),
                     language: userBubbleLang })
          return out
        })
        if (ttsEnabled) await playTTS(reply, agentConfig.voice, userBubbleLang, ttsOverride || 'auto')
      } catch (e2) {
        const detail = e2.response?.data?.detail || 'LLM call failed'
        setConversation(prev => {
          const out = prev.slice(0, -1)
          out.push({ role: 'agent', text: `Error: ${detail}`, timestamp: ts(),
                     emotion: 'neutral', intent: 'error', confidence: 0 })
          return out
        })
      }
    } finally {
      setAgentSpeaking(false)
      agentSpeakingRef.current = false
    }
  }, [agentConfig, ttsEnabled, llmOverride, ttsOverride, effectiveLang])

  const handleSend = async () => {
    const text = message.trim()
    if (!text || !currentAgent || sending) return
    setMessage('')
    setSending(true)
    await sendToLLM(text, 0.99, { sttProvider: 'typed' })
    setSending(false)
  }

  const handleMicClick = useCallback(async () => {
    if (!currentAgent) return
    if (recording) {
      if (sttMode === 'batch') {
        const blob = await batch.stop()
        if (!blob) return
        try {
          const result = await transcribeBatch(blob, sessionLang)
          if (!result.text?.trim()) {
            setAutoDetectMsg('Did not catch that — please try again')
            return
          }
          setDetectedLang(result.language)
          await sendToLLM(result.text, result.confidence || 0.9, {
            sttProvider: result.provider,
            sttConfidence: result.confidence,
            detectedLang: result.language,
          })
        } catch (err) {
          setAutoDetectMsg(`STT failed: ${err.message}`)
        }
      } else {
        dgStop()
      }
    } else {
      _stopCurrent()
      lastSentRef.current = finals.length - 1
      if (sttMode === 'batch') {
        try { await batch.start() }
        catch (e) { setAutoDetectMsg(`Mic error: ${e.message}`) }
      } else {
        dgStart()
      }
    }
  }, [recording, sttMode, batch, dgStart, dgStop, sessionLang, currentAgent, finals.length, sendToLLM])

  const startVoiceCall = useCallback(() => {
    if (!currentAgent) return
    setVoiceCallActive(true)
    setCallDuration(0)
    if (sttMode === 'stream') {
      lastSentRef.current = finals.length - 1
      dgStart()
    }
    // batch mode: user taps the mic button inside the call UI to record
  }, [currentAgent, sttMode, dgStart, finals.length])

  const endVoiceCall = useCallback(() => {
    setVoiceCallActive(false)
    dgStop()
    // stop batch recorder if mid-recording when call ends
    if (batch.isRecording) batch.stop()
    if (_ttsAudio) { _ttsAudio.pause(); _ttsAudio = null }
    if (conversation.length >= 2 && currentAgent) saveConversationToDB(conversation, currentAgent)
  }, [dgStop, batch, conversation, currentAgent, saveConversationToDB])

  // Stream mode: mute mic while agent speaks, resume after
  useEffect(() => {
    if (!voiceCallActive || sttMode !== 'stream') return
    if (agentSpeaking && dgRecording) dgStop()
    else if (!agentSpeaking && !dgRecording) dgStart()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentSpeaking, voiceCallActive])

  // Batch mode: auto-start recording after agent finishes speaking
  useEffect(() => {
    if (!voiceCallActive || sttMode !== 'batch') return
    if (!agentSpeaking && !batch.isRecording) {
      batch.start().catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentSpeaking, voiceCallActive])

  // Batch mode in call: mic button stops recording and sends
  const handleCallBatchMic = useCallback(async () => {
    if (!batch.isRecording) return
    const blob = await batch.stop()
    if (!blob) return
    try {
      const result = await transcribeBatch(blob, sessionLang)
      if (!result.text?.trim()) return
      setDetectedLang(result.language)
      await sendToLLM(result.text, result.confidence || 0.9, {
        sttProvider: result.provider,
        sttConfidence: result.confidence,
        detectedLang: result.language,
      })
    } catch (err) {
      setAutoDetectMsg(`STT failed: ${err.message}`)
    }
  }, [batch, sessionLang, sendToLLM])

  useEffect(() => {
    if (!voiceCallActive) return
    const interval = setInterval(() => setCallDuration(d => d + 1), 1000)
    return () => clearInterval(interval)
  }, [voiceCallActive])

  useEffect(() => () => { dgStop(); if (_ttsAudio) { _ttsAudio.pause() } }, []) // eslint-disable-line

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  /* ════════════════════════════════════════════════════════════════
     Render
     ════════════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Testing Playground</h1>
          <p className="text-gray-500 mt-1 text-sm">Multilingual-aware testing — speak any of 12 Indian languages</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setTtsEnabled(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
              ttsEnabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                         : 'bg-gray-50 text-gray-500 border-gray-200'
            }`}>
            {ttsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            {ttsEnabled ? 'Voice ON' : 'Voice OFF'}
          </button>
          {recording && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              <span className="text-xs font-medium text-red-700">
                {sttMode === 'batch' ? 'Recording (tap mic to send)' : 'Listening'}
              </span>
            </motion.div>
          )}
        </div>
      </div>

      {/* ── STT Health Banner — shows when Sarvam is missing ── */}
      {sttHealth && !sttHealth.sarvam && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <div className="font-semibold text-amber-900">Sarvam API key not configured</div>
            <div className="text-amber-700 mt-0.5">
              Tamil/Telugu/Kannada/Malayalam/Bengali/etc. STT will fall back to Whisper (lower accuracy).
              Add <code className="font-mono bg-amber-100 px-1 rounded">SARVAM_API_KEY=sk_...</code> to your <code className="font-mono bg-amber-100 px-1 rounded">.env</code> and restart.
            </div>
          </div>
        </div>
      )}

      {/* ── LANGUAGE PICKER ── */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex items-center gap-2 shrink-0">
            <div className="p-2 rounded-lg bg-white shadow-sm">
              <Languages className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Conversation Language</div>
              <div className="text-sm font-semibold text-gray-900">
                {LANG_BY_CODE[sessionLang]?.label || 'Auto-detect'}
                {sessionLang === '' && detectedLang && (
                  <span className="ml-2 text-xs font-normal text-indigo-600">→ detecting as {detectedLang.toUpperCase()}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex-1 flex flex-wrap gap-1.5 min-w-[280px]">
            {LANGUAGES.map(l => (
              <button key={l.code || 'auto'}
                onClick={() => { setSessionLang(l.code); if (l.code) setDetectedLang(l.code) }}
                disabled={voiceCallActive}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  sessionLang === l.code
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-200 hover:bg-indigo-50/50'
                } disabled:opacity-50 disabled:cursor-not-allowed`}>
                <span>{l.label}</span>
                <span className="ml-1.5 text-[10px] opacity-70">{l.stt === 'batch' ? '◉' : '⟿'}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-4 text-[11px] text-gray-500 flex-wrap">
          <span className="flex items-center gap-1"><span className="text-indigo-500">⟿</span> Live streaming STT</span>
          <span className="flex items-center gap-1"><span className="text-indigo-500">◉</span> Push-to-talk + Sarvam STT (Indic)</span>
          {autoDetectMsg && (
            <span className="ml-auto text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
              {autoDetectMsg}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Chat ── */}
        <motion.div variants={fadeUp} initial="hidden" animate="show"
          className="lg:col-span-2 flex flex-col bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden"
          style={{ minHeight: 560 }}>
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
                  className="w-full appearance-none bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 pr-10 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60 transition-all">
                  <option value="">Select an agent to test…</option>
                  {agentList.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.icon ? `${a.icon} ` : ''}{a.name}{a.language ? ` — ${a.language}` : ''}
                      {a.isDemo ? ' (Demo)' : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            )}
            {currentAgent && (
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Using <span className="font-medium text-gray-700">{currentAgent.name}</span></span>
                <span className="text-gray-300">•</span>
                <span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-100 font-mono">{llmOverride || agentConfig.provider}</span>
                <span className="text-gray-300">•</span>
                <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 font-mono">{effectiveLang.toUpperCase()}</span>
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
                    {currentAgent ? `Testing "${currentAgent.name}" — type or speak in ${langInfo.label}`
                                  : 'Select an agent above to begin'}
                  </p>
                  <p className="text-gray-400 text-xs mt-1">
                    {currentAgent
                      ? sttMode === 'batch'
                        ? 'Tap mic to record, tap again to send. Sarvam STT will transcribe in native script.'
                        : 'Tap mic for live streaming, or use Voice Call for hands-free.'
                      : 'Pick an agent and a language to start'}
                  </p>
                </div>
              </div>
            ) : (
              <AnimatePresence>
                {conversation.map((msg, i) => (
                  <motion.div key={i}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm ${
                      msg.role === 'user'
                        ? 'bg-indigo-50 text-gray-900 border border-indigo-100'
                        : 'bg-white text-gray-700 border border-gray-200 shadow-sm'
                    }`}>
                      {msg.role === 'agent' && (
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <Sparkles className="w-3 h-3 text-indigo-500" />
                          <span className="text-[11px] font-medium text-indigo-600">{currentAgent?.name || 'AI Agent'}</span>
                          {msg.provider && <span className="text-[10px] text-gray-400 ml-1">via {msg.provider}</span>}
                        </div>
                      )}
                      <p className="leading-relaxed">{msg.pending ? <span className="animate-pulse">…</span> : msg.text}</p>
                      <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
                        <p className="text-[10px] text-gray-400">{msg.timestamp}</p>
                        <div className="flex items-center gap-1.5">
                          {msg.language && (
                            <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${
                              msg.role === 'user' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-50 text-emerald-700'
                            }`}>
                              {String(msg.language).toUpperCase()}
                            </span>
                          )}
                          {msg.sttProvider && msg.role === 'user' && (
                            <span className="text-[10px] text-gray-400">{msg.sttProvider}</span>
                          )}
                          {msg.latency > 0 && <p className="text-[10px] text-gray-400">{msg.latency}ms</p>}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-100 bg-white">
            <div className="flex items-center gap-3">
              <button onClick={handleMicClick} disabled={!currentAgent}
                title={recording ? (sttMode === 'batch' ? 'Stop & send' : 'Stop mic') : 'Start mic'}
                className={`p-3 rounded-xl transition-all duration-200 ${
                  recording
                    ? sttMode === 'batch'
                      ? 'bg-amber-500 text-white shadow-sm shadow-amber-200'
                      : 'bg-red-500 text-white shadow-sm shadow-red-200'
                    : currentAgent
                    ? 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 hover:text-gray-700'
                    : 'bg-gray-50 text-gray-300 border border-gray-100 cursor-not-allowed'
                }`}>
                {recording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <input type="text" value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                disabled={!currentAgent}
                placeholder={currentAgent ? `Message ${currentAgent.name} in ${langInfo.label}…` : 'Select an agent first'}
                className="flex-1 bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 disabled:opacity-40 transition-all" />
              <button onClick={handleSend} disabled={!message.trim() || !currentAgent || sending}
                className="p-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-200 hover:shadow-md hover:shadow-indigo-300 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none">
                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
            {sttMode === 'batch' && currentAgent && (
              <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
                <Radio className="w-3 h-3" /> Push-to-talk mode for {langInfo.label} — tap mic to start, tap again to send
              </p>
            )}
          </div>
        </motion.div>

        {/* ── Right column ── */}
        <div className="space-y-5">
          {/* Voice Call */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.05 }}
            className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
            {voiceCallActive ? (
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
                {sttMode === 'batch' && !agentSpeaking && (
                  <div className="flex flex-col items-center gap-2">
                    <button onClick={handleCallBatchMic} disabled={!batch.isRecording}
                      className={`p-4 rounded-full transition-all shadow-lg ${
                        batch.isRecording
                          ? 'bg-amber-500 text-white shadow-amber-200 hover:bg-amber-600 animate-pulse'
                          : 'bg-gray-100 text-gray-300 shadow-gray-100 cursor-not-allowed'
                      }`}>
                      {batch.isRecording ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                    </button>
                    <p className="text-[10px] text-gray-500">
                      {batch.isRecording ? 'Recording… tap to send' : 'Starting mic…'}
                    </p>
                  </div>
                )}
                {sttMode === 'stream' && partial && (
                  <div className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-500 italic text-center">
                    {partial}<span className="inline-block w-1 h-3 bg-gray-400 ml-0.5 animate-pulse" />
                  </div>
                )}
                <button onClick={endVoiceCall}
                  className="p-4 rounded-full bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-200 transition-all">
                  <PhoneOff className="w-6 h-6" />
                </button>
                <p className="text-[10px] text-gray-400">
                  {sttMode === 'batch' ? `${langInfo.label} — tap mic to send each turn` : 'Speak naturally — agent responds automatically'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 p-8">
                <div className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg bg-gradient-to-br from-emerald-400 to-teal-500 shadow-emerald-200">
                  <Phone className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Voice Call</h3>
                <p className="text-sm text-gray-500 text-center max-w-xs">
                  {sttMode === 'stream'
                    ? 'Hands-free continuous conversation. Speak naturally.'
                    : `${langInfo.label}: tap-to-talk call. Mic auto-starts each turn.`}
                </p>
                <button onClick={startVoiceCall} disabled={!currentAgent}
                  className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold shadow-lg shadow-emerald-200 hover:shadow-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                  <Phone className="w-5 h-5" /> Start Voice Call
                </button>
              </div>
            )}
          </motion.div>

          {/* Live Transcription */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.1 }}
            className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="p-1.5 rounded-lg bg-indigo-50"><Activity className="w-4 h-4 text-indigo-600" /></div>
              <h3 className="text-sm font-semibold text-gray-900">Live Transcription</h3>
            </div>
            <div className="min-h-[120px] p-4 rounded-xl bg-gray-50/80 border border-gray-200/60 space-y-2 max-h-[200px] overflow-y-auto">
              {sttMode === 'stream' ? (
                <>
                  {finals.map((f, i) => <p key={i} className="text-sm text-gray-800 leading-relaxed">{f.text}</p>)}
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
                      <p className="text-sm text-gray-400">Streaming STT (Deepgram). Click mic to start.</p>
                    )
                  )}
                </>
              ) : (
                <div className="text-sm text-gray-400">
                  {recording
                    ? <div className="flex items-center gap-2 text-amber-700"><Radio className="w-3.5 h-3.5 animate-pulse" /> Recording {langInfo.label}… tap mic to send</div>
                    : `Push-to-talk mode (${langInfo.label}). Tap mic to record.`}
                </div>
              )}
              {sttError && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span>{sttError}</span>
                </div>
              )}
            </div>
          </motion.div>

          {/* Pipeline Diagnostics */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.2 }}
            className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-1.5 rounded-lg bg-violet-50"><Brain className="w-4 h-4 text-violet-600" /></div>
              <h3 className="text-sm font-semibold text-gray-900">Pipeline Diagnostics</h3>
            </div>
            {lastDiag ? (
              <div className="space-y-2">
                <DiagRow label="STT Provider" value={lastDiag.sttProvider} color="indigo" />
                <DiagRow label="Detected Language" value={lastDiag.detectedLang?.toUpperCase()} color="emerald" mono />
                <DiagRow label="LLM Provider" value={lastDiag.llmProvider} color="violet" />
                <DiagRow label="TTS Provider" value={lastDiag.ttsProvider} color="pink" />
                <DiagRow label="Latency (TTFA)" value={`${lastDiag.latencyMs}ms`} color="amber" mono />
                <DiagRow label="STT Confidence" value={`${((lastDiag.sttConfidence || 0) * 100).toFixed(0)}%`} color="emerald" mono />
              </div>
            ) : (
              <div className="p-6 rounded-xl bg-gray-50/50 text-center">
                <Zap className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Send a message to see live diagnostics</p>
              </div>
            )}
          </motion.div>

          {/* Provider Overrides */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.25 }}
            className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-1.5 rounded-lg bg-emerald-50"><AudioLines className="w-4 h-4 text-emerald-600" /></div>
              <h3 className="text-sm font-semibold text-gray-900">Provider Overrides</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">LLM</label>
                <select value={llmOverride} onChange={e => setLlmOverride(e.target.value)}
                  className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 focus:outline-none focus:border-violet-300 focus:ring-1 focus:ring-violet-100 transition-all">
                  <option value="">Agent default ({agentConfig.provider || 'gemini'})</option>
                  <option value="gemini">Gemini 2.5 Pro</option>
                  <option value="auto">Auto (Gemini → Groq → OpenAI)</option>
                  <option value="groq">Groq (fastest)</option>
                  <option value="openai">OpenAI GPT</option>
                  <option value="anthropic">Anthropic Claude</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">TTS</label>
                <select value={ttsOverride} onChange={e => setTtsOverride(e.target.value)}
                  className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 focus:outline-none focus:border-pink-300 focus:ring-1 focus:ring-pink-100 transition-all">
                  <option value="">Auto (best for language)</option>
                  <option value="sarvam">Sarvam AI (best for Indic)</option>
                  <option value="elevenlabs">ElevenLabs Multilingual</option>
                  <option value="openai">OpenAI TTS</option>
                  <option value="edge">Edge TTS (free)</option>
                </select>
              </div>
              <div className="pt-2 mt-1 border-t border-gray-100 text-[11px] text-gray-500">
                STT auto-routes:&nbsp;
                <span className="font-mono text-gray-700">
                  {sttMode === 'stream' ? 'Deepgram WebSocket' : 'Sarvam batch'}
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

function DiagRow({ label, value, color, mono }) {
  return (
    <div className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50/80 border border-gray-200/40">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-xs font-medium px-2 py-0.5 rounded-md bg-${color}-50 text-${color}-700 border border-${color}-100 ${mono ? 'font-mono' : 'capitalize'}`}>
        {value || '—'}
      </span>
    </div>
  )
}
