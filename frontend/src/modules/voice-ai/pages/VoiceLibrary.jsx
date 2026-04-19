/**
 * Voice Library — Browse and preview voices from all TTS providers
 */

import { useState, useRef, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Volume2, Play, Pause, Search, Filter, Mic2, Globe2,
  Sparkles, X, AudioLines, Languages
} from 'lucide-react'
import {
  VOICES, PROVIDERS, ALL_LANGUAGES, LANGUAGE_LABELS,
  PROVIDER_COLORS, BADGE_COLORS, SAMPLE_TEXTS,
  getVoiceEngine, getApiVoiceId,
} from '../data/voices'

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.03 } },
}
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
}

/* -- Voice Card --------------------------------------------------------- */

function VoiceCard({ voice, isPlaying, onPlay }) {
  const colors = PROVIDER_COLORS[voice.provider] || { gradient: 'from-gray-500 to-gray-600', bar: 'from-gray-400 to-gray-500' }

  return (
    <motion.div
      variants={item}
      className="group p-4 bg-white rounded-2xl border border-gray-200/60 shadow-sm hover:shadow-md hover:border-gray-300/60 transition-all duration-200"
    >
      <div className="flex items-start justify-between mb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
            voice.gender === 'female'
              ? 'bg-pink-100 text-pink-600'
              : voice.gender === 'male'
                ? 'bg-blue-100 text-blue-600'
                : 'bg-gray-100 text-gray-600'
          }`}>
            {voice.gender === 'female' ? '\u2640' : voice.gender === 'male' ? '\u2642' : '\u25CE'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-gray-900">{voice.name}</h3>
              {voice.badge && (
                <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded-full border ${BADGE_COLORS[voice.badge] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                  {voice.badge}
                </span>
              )}
            </div>
          </div>
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
        <span className={`px-2 py-0.5 text-[10px] font-medium rounded-md text-white bg-gradient-to-r ${colors.gradient}`}>
          {voice.provider}
        </span>
        <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-gray-100 text-gray-600">
          {voice.emotions ? '\uD83C\uDFAD' : '\u2726'} {voice.langLabel}
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-500 leading-relaxed mb-2.5">{voice.description}</p>

      {/* Quality bar — color matches provider */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${colors.bar} transition-all`}
            style={{ width: `${(voice.quality / 5) * 100}%` }}
          />
        </div>
        <span className="text-[10px] font-mono font-medium text-gray-500">{voice.quality.toFixed(1)}</span>
      </div>
    </motion.div>
  )
}

/* -- Main Component ----------------------------------------------------- */

export default function VoiceLibrary() {
  const [search, setSearch] = useState('')
  const [providerFilter, setProviderFilter] = useState('all')
  const [languageFilter, setLanguageFilter] = useState('all')
  const [genderFilter, setGenderFilter] = useState('all')
  const [playingId, setPlayingId] = useState(null)
  const [browserVoices, setBrowserVoices] = useState([])
  const audioRef = useRef(null)

  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis?.getVoices() || []
      if (voices.length > 0) setBrowserVoices(voices)
    }
    loadVoices()
    window.speechSynthesis?.addEventListener('voiceschanged', loadVoices)
    return () => {
      window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices)
      window.speechSynthesis?.cancel()
    }
  }, [])

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

  const pickBrowserVoice = (langCode, gender) => {
    if (browserVoices.length === 0) return null
    const langPrefix = langCode === 'multi' ? 'en' : langCode.split('-')[0]
    const fullLang = langCode === 'multi' ? 'en-US' : langCode

    let candidates = browserVoices.filter(v => v.lang === fullLang)
    if (candidates.length === 0) candidates = browserVoices.filter(v => v.lang.startsWith(langPrefix))
    if (candidates.length === 0) candidates = browserVoices.filter(v => v.lang.startsWith('en'))

    if (candidates.length > 1 && gender !== 'neutral') {
      const femaleKw = ['female', 'woman', 'zira', 'hazel', 'susan', 'neerja', 'pallavi', 'priya', 'shruti']
      const maleKw = ['male', 'man', 'david', 'mark', 'ravi', 'madhur', 'prabhat']
      const kw = gender === 'female' ? femaleKw : maleKw
      const match = candidates.filter(v => kw.some(k => v.name.toLowerCase().includes(k)))
      if (match.length > 0) return match[0]
    }
    return candidates[0] || null
  }

  const handlePlay = async (voiceId) => {
    if (playingId === voiceId) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0 }
      window.speechSynthesis?.cancel()
      setPlayingId(null)
      return
    }

    const voice = VOICES.find(v => v.id === voiceId)
    if (!voice) return

    setPlayingId(voiceId)
    if (audioRef.current) audioRef.current.pause()
    window.speechSynthesis?.cancel()

    const sampleText = SAMPLE_TEXTS[voice.language] || SAMPLE_TEXTS['en-US']
    const langCode = voice.language?.split('-')[0] || 'en'

    // Try real TTS API first
    try {
      const engine = getVoiceEngine(voice)
      const apiVoice = getApiVoiceId(voice)
      const params = new URLSearchParams({ text: sampleText, provider: engine, language: langCode })
      if (apiVoice) params.set('voice', apiVoice)

      const resp = await fetch(`/api/v1/tts/preview?${params}`)
      if (resp.ok) {
        const data = await resp.json()
        if (data.audio_base64) {
          const format = data.format || 'mp3'
          audioRef.current.src = `data:audio/${format};base64,${data.audio_base64}`
          audioRef.current.onended = () => setPlayingId(null)
          audioRef.current.onerror = () => setPlayingId(null)
          await audioRef.current.play()
          return
        }
      }
    } catch (_) {
      // fall through to browser TTS
    }

    // Fallback: Browser SpeechSynthesis
    if (window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance(sampleText)
      utterance.lang = voice.language === 'multi' ? 'en-US' : voice.language
      const bv = pickBrowserVoice(voice.language, voice.gender)
      if (bv) utterance.voice = bv
      utterance.pitch = voice.gender === 'female' ? 1.15 : voice.gender === 'male' ? 0.8 : 1.0
      utterance.rate = 0.9
      utterance.onend = () => setPlayingId(null)
      utterance.onerror = () => setPlayingId(null)
      window.speechSynthesis.speak(utterance)
    } else {
      setPlayingId(null)
    }
  }

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
          Explore and preview {stats.total} voices from {stats.providers} TTS providers
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Mic2, label: 'Total Voices', value: stats.total, bgColor: 'bg-indigo-50', iconColor: 'text-indigo-500' },
          { icon: Sparkles, label: 'TTS Providers', value: stats.providers, bgColor: 'bg-emerald-50', iconColor: 'text-emerald-500' },
          { icon: Languages, label: 'Languages', value: stats.languages, bgColor: 'bg-blue-50', iconColor: 'text-blue-500' },
          { icon: Filter, label: 'Filtered Results', value: stats.filtered, bgColor: 'bg-violet-50', iconColor: 'text-violet-500' },
        ].map(s => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${s.bgColor}`}>
                <s.icon className={`w-5 h-5 ${s.iconColor}`} />
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
              {ALL_LANGUAGES.map(l => <option key={l} value={l}>{LANGUAGE_LABELS[l] || l}</option>)}
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
