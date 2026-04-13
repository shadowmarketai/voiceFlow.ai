/**
 * Voice Library — Browse and preview voices from all TTS providers
 * Inspired by Vani/Edesy voice library with India-first voice catalog
 */

import { useState, useRef, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Volume2, Play, Pause, Search, Filter, Mic2, Globe2,
  Sparkles, Star, Heart, ChevronDown, X, AudioLines,
  Languages, SlidersHorizontal
} from 'lucide-react'

/* ─── Voice Data — Real voices from 8 TTS providers ──────────────── */

const VOICES = [
  // ── Indic Parler-TTS (ai4bharat) — 12 emotions, 21 Indian languages ──
  { id: 'ip-priya', name: 'Priya', gender: 'female', provider: 'Indic Parler', language: 'ta-IN', langLabel: 'Tamil', accent: 'Chennai', description: 'Natural female Tamil voice with warm tone', emotions: true, quality: 4.3, sample: '/api/v1/tts/preview?voice=priya&engine=indic_parler&lang=ta' },
  { id: 'ip-meera', name: 'Meera', gender: 'female', provider: 'Indic Parler', language: 'hi-IN', langLabel: 'Hindi', accent: 'Standard', description: 'Expressive Hindi female with emotional range', emotions: true, quality: 4.3, sample: '/api/v1/tts/preview?voice=meera&engine=indic_parler&lang=hi' },
  { id: 'ip-arjun', name: 'Arjun', gender: 'male', provider: 'Indic Parler', language: 'hi-IN', langLabel: 'Hindi', accent: 'Standard', description: 'Professional Hindi male voice for business', emotions: true, quality: 4.3, sample: '/api/v1/tts/preview?voice=arjun&engine=indic_parler&lang=hi' },
  { id: 'ip-kavitha', name: 'Kavitha', gender: 'female', provider: 'Indic Parler', language: 'te-IN', langLabel: 'Telugu', accent: 'Hyderabad', description: 'Clear Telugu female with pleasant delivery', emotions: true, quality: 4.2, sample: '/api/v1/tts/preview?voice=kavitha&engine=indic_parler&lang=te' },
  { id: 'ip-ravi', name: 'Ravi', gender: 'male', provider: 'Indic Parler', language: 'ta-IN', langLabel: 'Tamil', accent: 'Madurai', description: 'Energetic Tamil male with regional flair', emotions: true, quality: 4.2, sample: '/api/v1/tts/preview?voice=ravi&engine=indic_parler&lang=ta' },
  { id: 'ip-ananya', name: 'Ananya', gender: 'female', provider: 'Indic Parler', language: 'kn-IN', langLabel: 'Kannada', accent: 'Bangalore', description: 'Smooth Kannada female voice', emotions: true, quality: 4.1, sample: '/api/v1/tts/preview?voice=ananya&engine=indic_parler&lang=kn' },
  { id: 'ip-lakshmi', name: 'Lakshmi', gender: 'female', provider: 'Indic Parler', language: 'ml-IN', langLabel: 'Malayalam', accent: 'Kochi', description: 'Natural Malayalam female voice', emotions: true, quality: 4.1, sample: '/api/v1/tts/preview?voice=lakshmi&engine=indic_parler&lang=ml' },
  { id: 'ip-suresh', name: 'Suresh', gender: 'male', provider: 'Indic Parler', language: 'bn-IN', langLabel: 'Bengali', accent: 'Kolkata', description: 'Warm Bengali male with clarity', emotions: true, quality: 4.1, sample: '/api/v1/tts/preview?voice=suresh&engine=indic_parler&lang=bn' },
  { id: 'ip-deepa', name: 'Deepa', gender: 'female', provider: 'Indic Parler', language: 'mr-IN', langLabel: 'Marathi', accent: 'Pune', description: 'Articulate Marathi female voice', emotions: true, quality: 4.1, sample: '/api/v1/tts/preview?voice=deepa&engine=indic_parler&lang=mr' },
  { id: 'ip-arun', name: 'Arun', gender: 'male', provider: 'Indic Parler', language: 'en-IN', langLabel: 'English', accent: 'Indian', description: 'Indian English male — clear, professional', emotions: true, quality: 4.3, sample: '/api/v1/tts/preview?voice=arun&engine=indic_parler&lang=en' },

  // ── IndicF5 (ai4bharat) — Highest quality (4.6 MOS) ──
  { id: 'f5-nila', name: 'Nila', gender: 'female', provider: 'IndicF5', language: 'ta-IN', langLabel: 'Tamil', accent: 'Chennai', description: 'Ultra-high quality Tamil female — 4.6 MOS', emotions: false, quality: 4.6, sample: '/api/v1/tts/preview?voice=nila&engine=indicf5&lang=ta', badge: 'Best Quality' },
  { id: 'f5-anika', name: 'Anika', gender: 'female', provider: 'IndicF5', language: 'hi-IN', langLabel: 'Hindi', accent: 'Delhi', description: 'Studio-grade Hindi female — natural prosody', emotions: false, quality: 4.6, sample: '/api/v1/tts/preview?voice=anika&engine=indicf5&lang=hi', badge: 'Best Quality' },
  { id: 'f5-vikram', name: 'Vikram', gender: 'male', provider: 'IndicF5', language: 'hi-IN', langLabel: 'Hindi', accent: 'Standard', description: 'Deep Hindi male — broadcast quality', emotions: false, quality: 4.5, sample: '/api/v1/tts/preview?voice=vikram&engine=indicf5&lang=hi' },
  { id: 'f5-prithvi', name: 'Prithvi', gender: 'male', provider: 'IndicF5', language: 'ta-IN', langLabel: 'Tamil', accent: 'Standard', description: 'Rich Tamil male — audiobook quality', emotions: false, quality: 4.5, sample: '/api/v1/tts/preview?voice=prithvi&engine=indicf5&lang=ta' },
  { id: 'f5-divya', name: 'Divya', gender: 'female', provider: 'IndicF5', language: 'te-IN', langLabel: 'Telugu', accent: 'Standard', description: 'Pristine Telugu female — highest clarity', emotions: false, quality: 4.5, sample: '/api/v1/tts/preview?voice=divya&engine=indicf5&lang=te' },

  // ── OpenVoice V2 (MyShell) — Zero-shot multilingual ──
  { id: 'ov-aria', name: 'Aria', gender: 'female', provider: 'OpenVoice V2', language: 'multi', langLabel: 'Multi-lang', accent: 'Neutral', description: 'Zero-shot voice cloning — any language', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=aria&engine=openvoice_v2', badge: 'Clone' },
  { id: 'ov-kai', name: 'Kai', gender: 'male', provider: 'OpenVoice V2', language: 'multi', langLabel: 'Multi-lang', accent: 'Neutral', description: 'Versatile male — real-time multilingual', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=kai&engine=openvoice_v2', badge: 'Clone' },
  { id: 'ov-zara', name: 'Zara', gender: 'female', provider: 'OpenVoice V2', language: 'multi', langLabel: 'Multi-lang', accent: 'Neutral', description: 'Expressive female — emotion style transfer', emotions: false, quality: 4.1, sample: '/api/v1/tts/preview?voice=zara&engine=openvoice_v2' },

  // ── XTTS-v2 (Coqui) — Cross-lingual, 32+ languages ──
  { id: 'xt-elena', name: 'Elena', gender: 'female', provider: 'XTTS v2', language: 'multi', langLabel: 'Multi-lang', accent: 'Global', description: 'Cross-lingual female — 32+ languages', emotions: false, quality: 4.3, sample: '/api/v1/tts/preview?voice=elena&engine=xtts_v2' },
  { id: 'xt-marco', name: 'Marco', gender: 'male', provider: 'XTTS v2', language: 'multi', langLabel: 'Multi-lang', accent: 'Global', description: 'Cross-lingual male — natural in any language', emotions: false, quality: 4.3, sample: '/api/v1/tts/preview?voice=marco&engine=xtts_v2' },
  { id: 'xt-sara', name: 'Sara', gender: 'female', provider: 'XTTS v2', language: 'en-IN', langLabel: 'English', accent: 'Indian', description: 'Indian English female — call center ready', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=sara&engine=xtts_v2&lang=en' },

  // ── Svara TTS (Canopy AI) — Indian languages focus ──
  { id: 'sv-amara', name: 'Amara', gender: 'female', provider: 'Svara', language: 'ta-IN', langLabel: 'Tamil', accent: 'Chennai', description: 'Native Tamil female — customer support', emotions: false, quality: 4.0, sample: '/api/v1/tts/preview?voice=amara&engine=svara&lang=ta' },
  { id: 'sv-rohit', name: 'Rohit', gender: 'male', provider: 'Svara', language: 'hi-IN', langLabel: 'Hindi', accent: 'Standard', description: 'Warm Hindi male — IVR optimized', emotions: false, quality: 4.0, sample: '/api/v1/tts/preview?voice=rohit&engine=svara&lang=hi' },

  // ── OpenAI TTS — High quality, 6 voices ──
  { id: 'oai-alloy', name: 'Alloy', gender: 'neutral', provider: 'OpenAI TTS', language: 'multi', langLabel: 'Multi-lang', accent: 'Global', description: 'Balanced and versatile', emotions: false, quality: 4.4, sample: '/api/v1/tts/preview?voice=alloy&engine=openai' },
  { id: 'oai-echo', name: 'Echo', gender: 'male', provider: 'OpenAI TTS', language: 'multi', langLabel: 'Multi-lang', accent: 'Global', description: 'Clear and articulate', emotions: false, quality: 4.4, sample: '/api/v1/tts/preview?voice=echo&engine=openai' },
  { id: 'oai-fable', name: 'Fable', gender: 'male', provider: 'OpenAI TTS', language: 'multi', langLabel: 'Multi-lang', accent: 'British', description: 'Warm storytelling voice', emotions: false, quality: 4.4, sample: '/api/v1/tts/preview?voice=fable&engine=openai' },
  { id: 'oai-onyx', name: 'Onyx', gender: 'male', provider: 'OpenAI TTS', language: 'multi', langLabel: 'Multi-lang', accent: 'Global', description: 'Deep and resonant', emotions: false, quality: 4.3, sample: '/api/v1/tts/preview?voice=onyx&engine=openai' },
  { id: 'oai-nova', name: 'Nova', gender: 'female', provider: 'OpenAI TTS', language: 'multi', langLabel: 'Multi-lang', accent: 'Global', description: 'Friendly and upbeat', emotions: false, quality: 4.5, sample: '/api/v1/tts/preview?voice=nova&engine=openai', badge: 'Popular' },
  { id: 'oai-shimmer', name: 'Shimmer', gender: 'female', provider: 'OpenAI TTS', language: 'multi', langLabel: 'Multi-lang', accent: 'Global', description: 'Warm and inviting', emotions: false, quality: 4.4, sample: '/api/v1/tts/preview?voice=shimmer&engine=openai' },

  // ── Google Cloud TTS — Wide language coverage ──
  { id: 'gc-aoede', name: 'Aoede', gender: 'female', provider: 'Google Cloud TTS', language: 'ta-IN', langLabel: 'Tamil', accent: 'Standard', description: 'Google WaveNet Tamil female', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=aoede&engine=google&lang=ta' },
  { id: 'gc-charon', name: 'Charon', gender: 'male', provider: 'Google Cloud TTS', language: 'ta-IN', langLabel: 'Tamil', accent: 'Standard', description: 'Google WaveNet Tamil male', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=charon&engine=google&lang=ta' },
  { id: 'gc-kore', name: 'Kore', gender: 'female', provider: 'Google Cloud TTS', language: 'hi-IN', langLabel: 'Hindi', accent: 'Standard', description: 'Google WaveNet Hindi female', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=kore&engine=google&lang=hi' },
  { id: 'gc-puck', name: 'Puck', gender: 'male', provider: 'Google Cloud TTS', language: 'hi-IN', langLabel: 'Hindi', accent: 'Standard', description: 'Google WaveNet Hindi male', emotions: false, quality: 4.1, sample: '/api/v1/tts/preview?voice=puck&engine=google&lang=hi' },
  { id: 'gc-wavenet-a', name: 'Wavenet A', gender: 'female', provider: 'Google Cloud TTS', language: 'en-IN', langLabel: 'English', accent: 'Indian', description: 'Google WaveNet Indian English', emotions: false, quality: 4.3, sample: '/api/v1/tts/preview?voice=wavenet-a&engine=google&lang=en' },

  // ── Deepgram Aura — Low-latency voices ──
  { id: 'dg-asteria', name: 'Asteria', gender: 'female', provider: 'Deepgram Aura', language: 'en-US', langLabel: 'English', accent: 'American', description: 'Warm and natural — lowest latency', emotions: false, quality: 4.3, sample: '/api/v1/tts/preview?voice=asteria&engine=deepgram', badge: 'Fast' },
  { id: 'dg-orpheus', name: 'Orpheus', gender: 'male', provider: 'Deepgram Aura', language: 'en-US', langLabel: 'English', accent: 'American', description: 'Clear professional male — real-time', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=orpheus&engine=deepgram', badge: 'Fast' },
  { id: 'dg-luna', name: 'Luna', gender: 'female', provider: 'Deepgram Aura', language: 'en-US', langLabel: 'English', accent: 'American', description: 'Soft and calming female', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=luna&engine=deepgram' },

  // ── Edge TTS (Microsoft) — Free, large catalog ──
  { id: 'edge-neerja', name: 'Neerja', gender: 'female', provider: 'Edge TTS', language: 'hi-IN', langLabel: 'Hindi', accent: 'Standard', description: 'Microsoft Hindi female — free tier', emotions: false, quality: 3.9, sample: '/api/v1/tts/preview?voice=neerja&engine=edge&lang=hi', badge: 'Free' },
  { id: 'edge-madhur', name: 'Madhur', gender: 'male', provider: 'Edge TTS', language: 'hi-IN', langLabel: 'Hindi', accent: 'Standard', description: 'Microsoft Hindi male — free tier', emotions: false, quality: 3.8, sample: '/api/v1/tts/preview?voice=madhur&engine=edge&lang=hi', badge: 'Free' },
  { id: 'edge-pallavi', name: 'Pallavi', gender: 'female', provider: 'Edge TTS', language: 'ta-IN', langLabel: 'Tamil', accent: 'Standard', description: 'Microsoft Tamil female — free tier', emotions: false, quality: 3.8, sample: '/api/v1/tts/preview?voice=pallavi&engine=edge&lang=ta', badge: 'Free' },
  { id: 'edge-valluvar', name: 'Valluvar', gender: 'male', provider: 'Edge TTS', language: 'ta-IN', langLabel: 'Tamil', accent: 'Standard', description: 'Microsoft Tamil male — free tier', emotions: false, quality: 3.8, sample: '/api/v1/tts/preview?voice=valluvar&engine=edge&lang=ta', badge: 'Free' },
  { id: 'edge-ravi-en', name: 'Ravi', gender: 'male', provider: 'Edge TTS', language: 'en-IN', langLabel: 'English', accent: 'Indian', description: 'Microsoft Indian English male — free', emotions: false, quality: 3.9, sample: '/api/v1/tts/preview?voice=ravi&engine=edge&lang=en', badge: 'Free' },
  { id: 'edge-neerja-en', name: 'Neerja', gender: 'female', provider: 'Edge TTS', language: 'en-IN', langLabel: 'English', accent: 'Indian', description: 'Microsoft Indian English female — free', emotions: false, quality: 3.9, sample: '/api/v1/tts/preview?voice=neerja&engine=edge&lang=en', badge: 'Free' },
]

const PROVIDERS = [...new Set(VOICES.map(v => v.provider))]
const LANGUAGES = [...new Set(VOICES.map(v => v.language))].sort()
const LANGUAGE_LABELS = Object.fromEntries(VOICES.map(v => [v.language, v.langLabel]))

const providerColors = {
  'Indic Parler': 'from-orange-500 to-orange-600',
  'IndicF5': 'from-rose-500 to-rose-600',
  'OpenVoice V2': 'from-teal-500 to-teal-600',
  'XTTS v2': 'from-blue-500 to-blue-600',
  'Svara': 'from-purple-500 to-purple-600',
  'OpenAI TTS': 'from-slate-700 to-slate-800',
  'Google Cloud TTS': 'from-blue-400 to-blue-500',
  'Deepgram Aura': 'from-emerald-500 to-emerald-600',
  'Edge TTS': 'from-sky-500 to-sky-600',
}

const badgeColors = {
  'Best Quality': 'bg-rose-50 text-rose-700 border-rose-100',
  'Popular': 'bg-violet-50 text-violet-700 border-violet-100',
  'Clone': 'bg-teal-50 text-teal-700 border-teal-100',
  'Fast': 'bg-emerald-50 text-emerald-700 border-emerald-100',
  'Free': 'bg-sky-50 text-sky-700 border-sky-100',
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.03 } },
}
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
}

/* ─── Voice Card ──────────────────────────────────────────────────── */

function VoiceCard({ voice, isPlaying, onPlay }) {
  const gradient = providerColors[voice.provider] || 'from-gray-500 to-gray-600'

  return (
    <motion.div
      variants={item}
      className="group p-4 bg-white rounded-2xl border border-gray-200/60 shadow-sm hover:shadow-md hover:border-gray-300/60 transition-all duration-200"
    >
      <div className="flex items-start justify-between mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">{voice.name}</h3>
          <span className="text-[11px]">
            {voice.gender === 'female' ? '♀' : voice.gender === 'male' ? '♂' : '◎'}
          </span>
          {voice.badge && (
            <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded-full border ${badgeColors[voice.badge] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
              {voice.badge}
            </span>
          )}
        </div>
        <button
          onClick={() => onPlay(voice.id)}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 shrink-0 ${
            isPlaying
              ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-200 scale-110'
              : 'bg-gray-100 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600'
          }`}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
      </div>

      {/* Provider + Language tags */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`px-2 py-0.5 text-[10px] font-medium rounded-md text-white bg-gradient-to-r ${gradient}`}>
          {voice.provider}
        </span>
        <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-gray-100 text-gray-600">
          {voice.emotions ? '🎭' : '✦'} {voice.langLabel}
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-500 leading-relaxed mb-2.5">{voice.description}</p>

      {/* Quality bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-500 transition-all"
            style={{ width: `${(voice.quality / 5) * 100}%` }}
          />
        </div>
        <span className="text-[10px] font-mono font-medium text-gray-500">{voice.quality.toFixed(1)}</span>
      </div>
    </motion.div>
  )
}

/* ─── Main Component ──────────────────────────────────────────────── */

export default function VoiceLibrary() {
  const [search, setSearch] = useState('')
  const [providerFilter, setProviderFilter] = useState('all')
  const [languageFilter, setLanguageFilter] = useState('all')
  const [genderFilter, setGenderFilter] = useState('all')
  const [playingId, setPlayingId] = useState(null)
  const [favorites, setFavorites] = useState(new Set())
  const audioRef = useRef(null)

  const filtered = useMemo(() => {
    return VOICES.filter(v => {
      if (providerFilter !== 'all' && v.provider !== providerFilter) return false
      if (languageFilter !== 'all' && v.language !== languageFilter) return false
      if (genderFilter !== 'all' && v.gender !== genderFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          v.name.toLowerCase().includes(q) ||
          v.provider.toLowerCase().includes(q) ||
          v.langLabel.toLowerCase().includes(q) ||
          v.description.toLowerCase().includes(q) ||
          v.accent.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [search, providerFilter, languageFilter, genderFilter])

  const stats = useMemo(() => ({
    total: VOICES.length,
    providers: PROVIDERS.length,
    languages: new Set(VOICES.map(v => v.langLabel)).size,
    filtered: filtered.length,
  }), [filtered])

  const handlePlay = (voiceId) => {
    if (playingId === voiceId) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }
    const voice = VOICES.find(v => v.id === voiceId)
    if (!voice) return

    // Use Web Speech API as fallback for demo
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(
        voice.langLabel === 'Tamil' ? 'வணக்கம்! நான் உங்கள் AI உதவியாளர். நான் உங்களுக்கு எப்படி உதவ முடியும்?' :
        voice.langLabel === 'Hindi' ? 'नमस्ते! मैं आपका AI सहायक हूं। मैं आपकी कैसे मदद कर सकता हूं?' :
        voice.langLabel === 'Telugu' ? 'నమస్కారం! నేను మీ AI సహాయకుడిని. నేను మీకు ఎలా సహాయం చేయగలను?' :
        `Hello! I'm ${voice.name}, your AI voice assistant. How can I help you today?`
      )
      utterance.lang = voice.language === 'multi' ? 'en-US' : voice.language.replace('-IN', '-IN')
      utterance.rate = 0.9
      utterance.onend = () => setPlayingId(null)
      window.speechSynthesis.speak(utterance)
    }
    setPlayingId(voiceId)
  }

  // Stop playback on unmount
  useEffect(() => {
    return () => { window.speechSynthesis?.cancel() }
  }, [])

  const clearFilters = () => {
    setSearch('')
    setProviderFilter('all')
    setLanguageFilter('all')
    setGenderFilter('all')
  }

  const hasFilters = search || providerFilter !== 'all' || languageFilter !== 'all' || genderFilter !== 'all'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Voice Library</h1>
          <Volume2 className="w-5 h-5 text-indigo-500" />
        </div>
        <p className="text-gray-500">
          Explore and preview {VOICES.length} voices from {PROVIDERS.length} TTS providers
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Mic2, label: 'Total Voices', value: stats.total, color: 'indigo' },
          { icon: Sparkles, label: 'TTS Providers', value: stats.providers, color: 'emerald' },
          { icon: Languages, label: 'Languages', value: stats.languages, color: 'blue' },
          { icon: Filter, label: 'Filtered Results', value: stats.filtered, color: 'violet' },
        ].map(s => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl bg-${s.color}-50`}>
                <s.icon className={`w-5 h-5 text-${s.color}-500`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="p-4 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 w-full lg:max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search voices by name, language, provider..."
              className="w-full bg-gray-50/50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
            />
          </div>

          {/* Dropdowns */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-indigo-300 appearance-none cursor-pointer pr-8"
            >
              <option value="all">All Providers</option>
              {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>

            <select
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
              className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-indigo-300 appearance-none cursor-pointer pr-8"
            >
              <option value="all">All Languages</option>
              {LANGUAGES.map(l => <option key={l} value={l}>{LANGUAGE_LABELS[l] || l}</option>)}
            </select>

            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-indigo-300 appearance-none cursor-pointer pr-8"
            >
              <option value="all">All Genders</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="neutral">Neutral</option>
            </select>

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-gray-500 hover:text-red-600 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Voice Grid */}
      {filtered.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-2xl border border-gray-200/60 shadow-sm">
          <AudioLines className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No voices match your filters</p>
          <p className="text-gray-400 text-sm mt-1">Try adjusting your search or filters</p>
          <button onClick={clearFilters} className="mt-4 px-4 py-2 rounded-xl bg-indigo-50 text-indigo-600 text-sm font-medium hover:bg-indigo-100 transition-colors">
            Clear all filters
          </button>
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          variants={container}
          initial="hidden"
          animate="show"
          key={`${providerFilter}-${languageFilter}-${genderFilter}-${search}`}
        >
          {filtered.map(voice => (
            <VoiceCard
              key={voice.id}
              voice={voice}
              isPlaying={playingId === voice.id}
              onPlay={handlePlay}
            />
          ))}
        </motion.div>
      )}

      <audio ref={audioRef} hidden />
    </div>
  )
}
