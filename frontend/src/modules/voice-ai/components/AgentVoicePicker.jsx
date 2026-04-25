/**
 * AgentVoicePicker — voice selector for Agent Builder.
 *
 * Loads voices from three sources:
 *   1. Built-in catalog (12 Aura, ElevenLabs, Sarvam, Edge, OpenAI, Cartesia,
 *      Indic curated voices) — same set the Voice Library page shows.
 *   2. Tenant's cloned voices via voiceCloneAPI.listVoices().
 *   3. A few legacy IDs for backward compat ('priya', 'meera', etc).
 *
 * Includes:
 *   - Provider-grouped tabs
 *   - Search box
 *   - Gender + language filter
 *   - Preview button (calls /api/v1/tts/preview)
 *   - "Manage cloned voices" deep link to Voice Library & Studio
 */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Search, Volume2, Play, Pause, Mic, Sparkles, Globe, Crown, Wallet,
  Zap, Loader2, ExternalLink, ChevronDown, RefreshCw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { voiceCloneAPI } from '../../../services/api'

/* Language name → ISO code (matches catalog API) */
const LANG_TO_ISO = {
  'English': 'en', 'Hindi': 'hi', 'Tamil': 'ta', 'Telugu': 'te',
  'Kannada': 'kn', 'Malayalam': 'ml', 'Bengali': 'bn', 'Gujarati': 'gu',
  'Marathi': 'mr', 'Punjabi': 'pa', 'Odia': 'or', 'Assamese': 'as',
  'Hinglish': 'hi',
}

/* ISO code → full language name */
const ISO_TO_LANG = {
  'en': 'English', 'hi': 'Hindi', 'ta': 'Tamil', 'te': 'Telugu',
  'kn': 'Kannada', 'ml': 'Malayalam', 'bn': 'Bengali', 'gu': 'Gujarati',
  'mr': 'Marathi', 'pa': 'Punjabi', 'or': 'Odia', 'as': 'Assamese',
}

/* Engine name → display provider label */
const ENGINE_LABEL = {
  'elevenlabs': 'ElevenLabs', 'cartesia': 'Cartesia',
  'sarvam': 'Sarvam', 'edge': 'Edge TTS',
}

/* Convert a catalog API voice object to the internal picker format */
function apiVoiceToRow(v) {
  return {
    id:       v.id,
    name:     v.name,
    provider: ENGINE_LABEL[v.engine] || v.engine,
    gender:   v.gender ? (v.gender[0].toUpperCase() + v.gender.slice(1)) : 'Female',
    lang:     ISO_TO_LANG[v.language] || v.language || 'Multi',
    accent:   v.accent || '',
    tag:      v.tier === 'premium' ? 'Premium' : 'Free',
  }
}

/* Built-in fallback catalog (used when API is unavailable). */
const CATALOG = [
  // ── Deepgram Aura — 12 voices ──
  { id: 'dg-asteria',  name: 'Asteria',  provider: 'Deepgram Aura', gender: 'Female', lang: 'English', accent: 'American', tag: 'Default' },
  { id: 'dg-luna',     name: 'Luna',     provider: 'Deepgram Aura', gender: 'Female', lang: 'English', accent: 'American', tag: 'Youthful' },
  { id: 'dg-stella',   name: 'Stella',   provider: 'Deepgram Aura', gender: 'Female', lang: 'English', accent: 'American', tag: 'Friendly' },
  { id: 'dg-athena',   name: 'Athena',   provider: 'Deepgram Aura', gender: 'Female', lang: 'English', accent: 'British',  tag: 'Mature' },
  { id: 'dg-hera',     name: 'Hera',     provider: 'Deepgram Aura', gender: 'Female', lang: 'English', accent: 'American', tag: 'Authoritative' },
  { id: 'dg-orion',    name: 'Orion',    provider: 'Deepgram Aura', gender: 'Male',   lang: 'English', accent: 'American', tag: 'Confident' },
  { id: 'dg-arcas',    name: 'Arcas',    provider: 'Deepgram Aura', gender: 'Male',   lang: 'English', accent: 'American', tag: 'Casual' },
  { id: 'dg-perseus',  name: 'Perseus',  provider: 'Deepgram Aura', gender: 'Male',   lang: 'English', accent: 'American', tag: 'Energetic' },
  { id: 'dg-angus',    name: 'Angus',    provider: 'Deepgram Aura', gender: 'Male',   lang: 'English', accent: 'Irish',    tag: 'Gentle' },
  { id: 'dg-orpheus',  name: 'Orpheus',  provider: 'Deepgram Aura', gender: 'Male',   lang: 'English', accent: 'American', tag: 'Smooth' },
  { id: 'dg-helios',   name: 'Helios',   provider: 'Deepgram Aura', gender: 'Male',   lang: 'English', accent: 'British',  tag: 'Bright' },
  { id: 'dg-zeus',     name: 'Zeus',     provider: 'Deepgram Aura', gender: 'Male',   lang: 'English', accent: 'American', tag: 'Commanding' },

  // ── ElevenLabs ──
  { id: 'el-rachel',   name: 'Rachel',   provider: 'ElevenLabs', gender: 'Female', lang: 'English', accent: 'American', tag: 'Premium' },
  { id: 'el-bella',    name: 'Bella',    provider: 'ElevenLabs', gender: 'Female', lang: 'English', accent: 'American', tag: 'Warm' },
  { id: 'el-elli',     name: 'Elli',     provider: 'ElevenLabs', gender: 'Female', lang: 'English', accent: 'American', tag: 'Youthful' },
  { id: 'el-nicole',   name: 'Nicole',   provider: 'ElevenLabs', gender: 'Female', lang: 'English', accent: 'American', tag: 'Whispered' },
  { id: 'el-adam',     name: 'Adam',     provider: 'ElevenLabs', gender: 'Male',   lang: 'English', accent: 'American', tag: 'Deep' },
  { id: 'el-josh',     name: 'Josh',     provider: 'ElevenLabs', gender: 'Male',   lang: 'English', accent: 'American', tag: 'Versatile' },
  { id: 'el-antoni',   name: 'Antoni',   provider: 'ElevenLabs', gender: 'Male',   lang: 'English', accent: 'American', tag: 'Classy' },

  // ── Sarvam (Indic) ──
  { id: 'sv-meera',    name: 'Meera',    provider: 'Sarvam', gender: 'Female', lang: 'Hindi',     accent: 'Indian', tag: 'Warm' },
  { id: 'sv-pavithra', name: 'Pavithra', provider: 'Sarvam', gender: 'Female', lang: 'Tamil',     accent: 'Indian', tag: 'Natural' },
  { id: 'sv-maitreyi', name: 'Maitreyi', provider: 'Sarvam', gender: 'Female', lang: 'Hindi',     accent: 'Indian', tag: 'Professional' },
  { id: 'sv-arvind',   name: 'Arvind',   provider: 'Sarvam', gender: 'Male',   lang: 'Hindi',     accent: 'Indian', tag: 'Confident' },
  { id: 'sv-amol',     name: 'Amol',     provider: 'Sarvam', gender: 'Male',   lang: 'Marathi',   accent: 'Indian', tag: 'Friendly' },
  { id: 'sv-amartya',  name: 'Amartya',  provider: 'Sarvam', gender: 'Male',   lang: 'Bengali',   accent: 'Indian', tag: 'Professional' },
  { id: 'sv-diya',     name: 'Diya',     provider: 'Sarvam', gender: 'Female', lang: 'Bengali',   accent: 'Indian', tag: 'Warm' },
  { id: 'sv-neel',     name: 'Neel',     provider: 'Sarvam', gender: 'Male',   lang: 'Telugu',    accent: 'Indian', tag: 'Clear' },
  { id: 'sv-misha',    name: 'Misha',    provider: 'Sarvam', gender: 'Female', lang: 'Telugu',    accent: 'Indian', tag: 'Friendly' },
  { id: 'sv-vian',     name: 'Vian',     provider: 'Sarvam', gender: 'Male',   lang: 'Kannada',   accent: 'Indian', tag: 'Clear' },
  { id: 'sv-arjun',    name: 'Arjun',    provider: 'Sarvam', gender: 'Male',   lang: 'Multi',     accent: 'Indian', tag: 'Versatile' },
  { id: 'sv-maya',     name: 'Maya',     provider: 'Sarvam', gender: 'Female', lang: 'Multi',     accent: 'Indian', tag: 'Versatile' },

  // ── OpenAI TTS ──
  { id: 'oa-alloy',    name: 'Alloy',    provider: 'OpenAI', gender: 'Female', lang: 'Multi', accent: 'Neutral', tag: 'Balanced' },
  { id: 'oa-echo',     name: 'Echo',     provider: 'OpenAI', gender: 'Male',   lang: 'Multi', accent: 'Neutral', tag: 'Warm' },
  { id: 'oa-fable',    name: 'Fable',    provider: 'OpenAI', gender: 'Male',   lang: 'Multi', accent: 'British', tag: 'Storytelling' },
  { id: 'oa-onyx',     name: 'Onyx',     provider: 'OpenAI', gender: 'Male',   lang: 'Multi', accent: 'American', tag: 'Deep' },
  { id: 'oa-nova',     name: 'Nova',     provider: 'OpenAI', gender: 'Female', lang: 'Multi', accent: 'American', tag: 'Friendly' },
  { id: 'oa-shimmer',  name: 'Shimmer',  provider: 'OpenAI', gender: 'Female', lang: 'Multi', accent: 'American', tag: 'Warm' },

  // ── Edge TTS (free) — Indic ──
  { id: 'edge-neerja',   name: 'Neerja',   provider: 'Edge TTS', gender: 'Female', lang: 'Hindi',     accent: 'Indian', tag: 'Free' },
  { id: 'edge-madhur',   name: 'Madhur',   provider: 'Edge TTS', gender: 'Male',   lang: 'Hindi',     accent: 'Indian', tag: 'Free' },
  { id: 'edge-pallavi',  name: 'Pallavi',  provider: 'Edge TTS', gender: 'Female', lang: 'Tamil',     accent: 'Indian', tag: 'Free' },
  { id: 'edge-valluvar', name: 'Valluvar', provider: 'Edge TTS', gender: 'Male',   lang: 'Tamil',     accent: 'Indian', tag: 'Free' },
  { id: 'edge-shruti',   name: 'Shruti',   provider: 'Edge TTS', gender: 'Female', lang: 'Telugu',    accent: 'Indian', tag: 'Free' },
  { id: 'edge-sapna',    name: 'Sapna',    provider: 'Edge TTS', gender: 'Female', lang: 'Kannada',   accent: 'Indian', tag: 'Free' },
  { id: 'edge-sobhana',  name: 'Sobhana',  provider: 'Edge TTS', gender: 'Female', lang: 'Malayalam', accent: 'Indian', tag: 'Free' },

  // ── Cartesia ──
  { id: 'cart-sonic',  name: 'Sonic',    provider: 'Cartesia', gender: 'Female', lang: 'English', accent: 'American', tag: 'Fastest' },

  // ── Legacy IDs from earlier builder (kept for backward compat) ──
  { id: 'priya', name: 'Priya', provider: 'Legacy', gender: 'Female', lang: 'Tamil',   accent: 'Indian', tag: 'Natural' },
  { id: 'meera', name: 'Meera', provider: 'Legacy', gender: 'Female', lang: 'Hindi',   accent: 'Indian', tag: 'Warm' },
  { id: 'leda',  name: 'Leda',  provider: 'Legacy', gender: 'Female', lang: 'Multi',   accent: 'Neutral', tag: 'Youthful' },
  { id: 'arjun', name: 'Arjun', provider: 'Legacy', gender: 'Male',   lang: 'Hindi',   accent: 'Indian', tag: 'Professional' },
  { id: 'arun',  name: 'Arun',  provider: 'Legacy', gender: 'Male',   lang: 'English', accent: 'Indian', tag: 'Clear' },
  { id: 'nova',  name: 'Nova',  provider: 'Legacy', gender: 'Female', lang: 'Multi',   accent: 'Neutral', tag: 'Friendly' },
]

const PROVIDER_TABS = ['All', 'Cloned', 'Deepgram Aura', 'ElevenLabs', 'Sarvam', 'OpenAI', 'Edge TTS', 'Cartesia']

export default function AgentVoicePicker({ selected, onSelect, language }) {
  const [cloned, setCloned] = useState([])
  const [catalogVoices, setCatalogVoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('All')
  const [search, setSearch] = useState('')
  const [genderFilter, setGenderFilter] = useState('all')
  const [langFilter, setLangFilter] = useState('all')
  const [previewing, setPreviewing] = useState(null)

  const loadCloned = async () => {
    try {
      const { data } = await voiceCloneAPI.listVoices()
      const list = (data?.voices || data || []).map(v => ({
        id: v.id || v.voice_id, name: v.name || 'Custom', provider: 'Cloned',
        gender: v.gender || 'Custom', lang: v.language || 'Multi',
        accent: v.accent || '', tag: 'Cloned', cloned: true,
      }))
      setCloned(list)
    } catch {
      setCloned([])
    }
  }

  const loadCatalog = async (lang) => {
    setLoading(true)
    try {
      const iso = LANG_TO_ISO[lang] || 'en'
      const resp = await fetch(`/api/v1/voices/catalog?language=${iso}`)
      if (!resp.ok) throw new Error(resp.statusText)
      const data = await resp.json()
      setCatalogVoices((data.voices || []).map(apiVoiceToRow))
    } catch {
      // Fall back to hardcoded CATALOG on error
      setCatalogVoices(CATALOG)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCloned()
  }, [])

  useEffect(() => {
    loadCatalog(language || 'English')
  }, [language])

  const all = useMemo(() => [...cloned, ...catalogVoices], [cloned, catalogVoices])

  const visible = useMemo(() => {
    let v = all
    if (tab !== 'All') v = v.filter(x => x.provider === tab)
    if (genderFilter !== 'all') v = v.filter(x => x.gender.toLowerCase() === genderFilter)
    if (langFilter !== 'all') v = v.filter(x => x.lang === langFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      v = v.filter(x => x.name.toLowerCase().includes(q) || x.lang.toLowerCase().includes(q) || x.tag.toLowerCase().includes(q))
    }
    return v
  }, [all, tab, search, genderFilter, langFilter])

  const langs = useMemo(() => Array.from(new Set(all.map(v => v.lang))).sort(), [all])

  const preview = async (v) => {
    setPreviewing(v.id)
    try {
      const audioUrl = `/api/v1/tts/preview?voice=${encodeURIComponent(v.name)}&engine=${encodeURIComponent(providerSlug(v.provider))}`
      const audio = new Audio(audioUrl)
      await audio.play().catch(() => {
        // Fallback: browser SpeechSynthesis
        if ('speechSynthesis' in window) {
          const u = new SpeechSynthesisUtterance(`Hello, this is ${v.name}. I'm here to help.`)
          window.speechSynthesis.speak(u)
        } else {
          toast.error('Preview unavailable')
        }
      })
      setTimeout(() => setPreviewing(null), 3000)
    } catch (e) {
      toast.error('Preview failed')
      setPreviewing(null)
    }
  }

  return (
    <div className="space-y-3">
      {/* Provider tabs + search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 flex-wrap">
          {PROVIDER_TABS.map(p => (
            <button key={p} onClick={() => setTab(p)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                tab === p ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {p}{p === 'Cloned' && ` (${cloned.length})`}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search voices..."
            className="pl-8 pr-3 py-1.5 rounded-md border border-gray-200 text-xs w-48 focus:outline-none focus:border-indigo-400" />
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <select value={genderFilter} onChange={e => setGenderFilter(e.target.value)}
          className="px-2 py-1 rounded-md border border-gray-200 bg-white text-gray-700">
          <option value="all">Any gender</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
        </select>
        <select value={langFilter} onChange={e => setLangFilter(e.target.value)}
          className="px-2 py-1 rounded-md border border-gray-200 bg-white text-gray-700">
          <option value="all">Any language</option>
          {langs.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <span className="text-gray-400 ml-auto">{visible.length} voice{visible.length !== 1 && 's'} · selected: <span className="font-mono text-gray-700">{selected || '—'}</span></span>
      </div>

      {/* Voice grid */}
      {loading ? (
        <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>
      ) : visible.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400">
          No voices match. Try a different filter or <Link to="/voice/studio" className="text-indigo-600 underline">clone your own voice</Link>.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-[460px] overflow-y-auto pr-1">
          {visible.map(v => {
            const active = selected === v.id
            return (
              <div key={v.id}
                className={`relative p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                  active ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'
                }`}
                onClick={() => onSelect(v.id)}>
                <span className={`inline-block w-7 h-7 rounded-full text-xs font-bold leading-7 ${
                  v.cloned ? 'bg-amber-100 text-amber-600' :
                  v.gender === 'Female' ? 'bg-pink-100 text-pink-600' : 'bg-blue-100 text-blue-600'
                }`}>
                  {v.cloned ? <Mic className="w-3.5 h-3.5 inline" /> : (v.gender === 'Female' ? '♀' : '♂')}
                </span>
                <p className="text-[12px] font-medium text-gray-900 mt-1 truncate">{v.name}</p>
                <p className="text-[9px] text-gray-500 truncate">{v.provider}</p>
                <p className="text-[9px] text-gray-400 truncate">{v.lang} · {v.tag}</p>
                <button
                  onClick={(e) => { e.stopPropagation(); preview(v) }}
                  className="absolute top-1 right-1 p-1 rounded text-gray-400 hover:text-indigo-600 hover:bg-white"
                  title="Preview voice">
                  {previewing === v.id ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1 border-t border-gray-100">
        <Link to="/voice/studio" className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium">
          Browse full Voice Library & Studio <ExternalLink className="w-3 h-3" />
        </Link>
        <button onClick={loadCloned} className="flex items-center gap-1 text-gray-500 hover:text-indigo-600">
          <RefreshCw className="w-3 h-3" /> Refresh cloned voices
        </button>
      </div>
    </div>
  )
}

function providerSlug(provider) {
  const m = {
    'Deepgram Aura': 'deepgram',
    'ElevenLabs': 'elevenlabs',
    'Sarvam': 'sarvam',
    'OpenAI': 'openai',
    'Edge TTS': 'edge',
    'Cartesia': 'cartesia',
    'Cloned': 'voice_clone',
    'Legacy': 'edge',
  }
  return m[provider] || 'edge'
}
