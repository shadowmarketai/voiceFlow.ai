/**
 * Testing Playground — Premium AI agent testing interface
 */

import { useEffect, useState, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Send, Bot, Activity, Brain, ChevronDown, Sparkles, Phone, PhoneOff, Wifi, Volume2, AudioLines, ShieldCheck, Loader2, AlertTriangle } from 'lucide-react'
import useDeepgramStream from '../../../hooks/useDeepgramStream'

const LiveKitVoiceRoom = lazy(() => import('../../../components/LiveKitRoom'))

const mockAgents = [
  { id: '1', name: 'Sales Assistant', language: 'English' },
  { id: '2', name: 'Support Bot', language: 'Hindi' },
  { id: '3', name: 'Appointment Scheduler', language: 'Tamil' },
]

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
}

export default function Testing() {
  const [selectedAgent, setSelectedAgent] = useState('')
  const [message, setMessage] = useState('')
  const [conversation, setConversation] = useState([])
  const [isWebRTCCall, setIsWebRTCCall] = useState(false)

  // Deepgram streaming STT — live captions as the user speaks.
  const agentLang = mockAgents.find((a) => a.id === selectedAgent)?.language || ''
  const langCode = { English: 'en', Hindi: 'hi', Tamil: 'ta', Telugu: 'te' }[agentLang] || ''
  const { start, stop, recording, partial, finals, error: sttError } =
    useDeepgramStream({ language: langCode, diarize: false })
  const isRecording = recording

  const toggleRecording = () => {
    if (recording) stop()
    else start()
  }

  // Auto-append every final utterance into the chat as a user message.
  useEffect(() => {
    if (!finals.length || !selectedAgent) return
    const last = finals[finals.length - 1]
    if (!last?.text) return
    setConversation((prev) => {
      // Avoid double-append on re-renders
      if (prev.length && prev[prev.length - 1]?.sttFinalIndex === finals.length - 1) return prev
      return [
        ...prev,
        { role: 'user', text: last.text, timestamp: new Date().toLocaleTimeString(), sttFinalIndex: finals.length - 1 },
        {
          role: 'agent',
          text: 'Live transcript captured. Connect your LLM pipeline to respond automatically.',
          timestamp: new Date().toLocaleTimeString(),
          emotion: 'neutral',
          intent: 'transcribed',
          confidence: last.confidence || 0.9,
        },
      ]
    })
  }, [finals, selectedAgent])

  const handleSend = () => {
    if (!message.trim() || !selectedAgent) return
    setConversation((prev) => [
      ...prev,
      { role: 'user', text: message, timestamp: new Date().toLocaleTimeString() },
      {
        role: 'agent',
        text: 'This is a placeholder response. Connect your backend to enable real agent testing.',
        timestamp: new Date().toLocaleTimeString(),
        emotion: 'neutral',
        intent: 'general_inquiry',
        confidence: 0.92,
      },
    ])
    setMessage('')
  }

  const lastAgentMsg = conversation.filter((m) => m.role === 'agent').slice(-1)[0]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Testing Playground</h1>
          <p className="text-gray-500 mt-1">Test your AI agents with live voice and chat interactions</p>
        </div>
        {isRecording && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 border border-red-200"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <span className="text-sm font-medium text-red-700">Recording</span>
          </motion.div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Chat Interface */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="lg:col-span-2 flex flex-col bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden"
        >
          {/* Agent Selector */}
          <div className="p-4 border-b border-gray-100">
            <div className="relative">
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="w-full appearance-none bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 pr-10 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
              >
                <option value="">Select an agent to test...</option>
                {mockAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} ({agent.language})
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 min-h-[400px] p-5 space-y-4 overflow-y-auto bg-gray-50/30">
            {conversation.length === 0 ? (
              <div className="flex items-center justify-center h-full text-center">
                <div>
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center mx-auto mb-4">
                    <Bot className="w-8 h-8 text-indigo-500" />
                  </div>
                  <p className="text-gray-500 text-sm font-medium">
                    {selectedAgent
                      ? 'Send a message or start recording to test the agent'
                      : 'Select an agent above to begin testing'}
                  </p>
                  <p className="text-gray-400 text-xs mt-1">Messages will appear here in real-time</p>
                </div>
              </div>
            ) : (
              <AnimatePresence>
                {conversation.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm ${
                        msg.role === 'user'
                          ? 'bg-indigo-50 text-gray-900 border border-indigo-100'
                          : 'bg-white text-gray-700 border border-gray-200 shadow-sm'
                      }`}
                    >
                      {msg.role === 'agent' && (
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Sparkles className="w-3 h-3 text-indigo-500" />
                          <span className="text-[11px] font-medium text-indigo-600">AI Agent</span>
                        </div>
                      )}
                      <p className="leading-relaxed">{msg.text}</p>
                      <p className="text-[10px] mt-2 text-gray-400">{msg.timestamp}</p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-100 bg-white">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleRecording}
                disabled={!selectedAgent}
                className={`p-3 rounded-xl transition-all duration-200 ${
                  isRecording
                    ? 'bg-red-500 text-white shadow-sm shadow-red-200'
                    : selectedAgent
                    ? 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 hover:text-gray-700'
                    : 'bg-gray-50 text-gray-300 border border-gray-100 cursor-not-allowed'
                }`}
              >
                {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                disabled={!selectedAgent}
                placeholder={selectedAgent ? 'Type a message...' : 'Select an agent first'}
                className="flex-1 bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 disabled:opacity-40 transition-all"
              />
              <button
                onClick={handleSend}
                disabled={!message.trim() || !selectedAgent}
                className="p-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-200 hover:shadow-md hover:shadow-indigo-300 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Analysis Panel */}
        <div className="space-y-5">
          {/* Live Transcription */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            transition={{ delay: 0.1 }}
            className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm"
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div className="p-1.5 rounded-lg bg-indigo-50">
                <Activity className="w-4 h-4 text-indigo-600" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900">Live Transcription</h3>
            </div>
            <div className="min-h-[160px] p-4 rounded-xl bg-gray-50/80 border border-gray-200/60 space-y-2 max-h-[260px] overflow-y-auto">
              {/* Committed utterances */}
              {finals.map((f, i) => (
                <p key={i} className="text-sm text-gray-800 leading-relaxed">
                  {f.speaker != null && (
                    <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-mono mr-1.5">
                      S{f.speaker}
                    </span>
                  )}
                  {f.text}
                </p>
              ))}
              {/* In-flight partial */}
              {partial && (
                <p className="text-sm text-gray-400 italic leading-relaxed">
                  {partial}<span className="inline-block w-1 h-3 bg-gray-400 ml-0.5 animate-pulse" />
                </p>
              )}
              {/* Status + errors */}
              {!finals.length && !partial && (
                isRecording ? (
                  <div className="flex items-center gap-2.5">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                    </span>
                    <p className="text-sm text-gray-600">Listening... speak now</p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Click the mic and speak — transcripts appear live via Deepgram Nova-2.</p>
                )
              )}
              {sttError && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>{sttError}</span>
                </div>
              )}
            </div>
          </motion.div>

          {/* Emotion Analysis */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            transition={{ delay: 0.2 }}
            className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm"
          >
            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-1.5 rounded-lg bg-violet-50">
                <Brain className="w-4 h-4 text-violet-600" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900">Analysis</h3>
            </div>
            <div className="space-y-3">
              {lastAgentMsg ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50/80 border border-gray-200/40">
                    <span className="text-sm text-gray-500">Emotion</span>
                    <span className="text-sm text-gray-900 font-medium capitalize bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded-lg border border-amber-100">
                      {lastAgentMsg.emotion}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50/80 border border-gray-200/40">
                    <span className="text-sm text-gray-500">Intent</span>
                    <span className="text-sm font-medium bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-lg border border-indigo-100">
                      {lastAgentMsg.intent}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50/80 border border-gray-200/40">
                    <span className="text-sm text-gray-500">Confidence</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                          style={{ width: `${lastAgentMsg.confidence * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-emerald-600">
                        {(lastAgentMsg.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 rounded-xl bg-gray-50/50 text-center">
                  <Brain className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">
                    Start a conversation to see emotion and intent analysis
                  </p>
                </div>
              )}
            </div>
          </motion.div>

          {/* Voice Pipeline Status */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            transition={{ delay: 0.3 }}
            className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm"
          >
            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-1.5 rounded-lg bg-emerald-50">
                <AudioLines className="w-4 h-4 text-emerald-600" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900">Voice Pipeline</h3>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Noise Reduction', status: 'Spectral Gate', color: 'emerald' },
                { label: 'VAD', status: 'Silero / Energy', color: 'blue' },
                { label: 'STT', status: 'Whisper + Deepgram', color: 'indigo' },
                { label: 'Emotion', status: 'Transformer', color: 'violet' },
                { label: 'LLM', status: 'Groq / Claude', color: 'purple' },
                { label: 'TTS', status: '5 Indic Engines', color: 'pink' },
                { label: 'EOS', status: 'Smart + Indian', color: 'amber' },
              ].map(step => (
                <div key={step.label} className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-gray-500">{step.label}</span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md bg-${step.color}-50 text-${step.color}-700 border border-${step.color}-100`}>
                    {step.status}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* LiveKit Voice Call */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            transition={{ delay: 0.4 }}
            className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden"
          >
            <Suspense fallback={
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
              </div>
            }>
              <LiveKitVoiceRoom
                agentId={selectedAgent}
                agentName={mockAgents.find(a => a.id === selectedAgent)?.name || 'AI Agent'}
                onEnd={() => setIsWebRTCCall(false)}
              />
            </Suspense>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
