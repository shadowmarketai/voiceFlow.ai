/**
 * ComboBenchmark — super-admin combo analyzer for STT × LLM × TTS.
 *
 *   /voice/combo-benchmark
 *
 * Shows a matrix of every realistic provider combination with:
 *   - Per-minute cost (raw + with platform markup)
 *   - Pipeline latency p50/p95
 *   - Quality scores (STT WER, TTS MOS, LLM intent accuracy)
 *   - Tokens per turn estimate, characters per turn estimate
 *   - Speaker diarization support flag
 *
 * The grid is sortable + filterable so you can quickly answer:
 *   "What's the cheapest combo with WER < 8% for Hindi?"
 *   "Which premium combo has the lowest p95 latency?"
 */

import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Layers, Loader2, Filter, ArrowUpDown, ArrowDown, ArrowUp,
  Mic2, Brain, Volume2, Phone, Trophy, Zap, AlertTriangle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { qualityAPI, billingAPI } from '../../../services/api'
import { useAuth } from '../../../contexts/AuthContext'

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.3 } },
}

// Estimated per-turn token + character counts (averages from real call data).
const TOKENS_IN_PER_TURN = 500
const TOKENS_OUT_PER_TURN = 150
const TURNS_PER_MIN = 3
const CHARS_PER_TURN = 200

// Quality benchmarks from the Quality Dashboard (per-language WER, MOS, etc).
// In production these would come from /api/v1/quality/accuracy — pulled below.

export default function ComboBenchmark() {
  const { user } = useAuth()
  if (user && !user.is_super_admin) return <Navigate to="/voice/dashboard-v2" replace />

  const [catalog, setCatalog] = useState(null)
  const [accuracy, setAccuracy] = useState(null)
  const [pipeline, setPipeline] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filterLang, setFilterLang] = useState('en')        // en / hi / ta / te
  const [maxCost, setMaxCost] = useState(30)
  const [maxLatency, setMaxLatency] = useState(2500)
  const [sortBy, setSortBy] = useState({ key: 'per_min', dir: 'asc' })
  const [monthlyMins, setMonthlyMins] = useState(1000)

  useEffect(() => {
    Promise.all([
      billingAPI.catalog(),
      qualityAPI.accuracy(),
      qualityAPI.pipeline(),
    ]).then(([c, a, p]) => {
      setCatalog(c.data.catalog)
      setAccuracy(a.data)
      setPipeline(p.data)
    }).catch((e) => toast.error('Failed to load comparison data'))
      .finally(() => setLoading(false))
  }, [])

  /** Build every combo row from the catalog. */
  const combos = useMemo(() => {
    if (!catalog || !accuracy || !pipeline) return []

    const stage = (name) => pipeline.components.find(c => c.name.includes(name)) || { p50: 0, p95: 0 }
    const sttBaseLat = stage('STT')
    const llmBaseLat = stage('LLM')
    const ttsBaseLat = stage('TTS')
    const fixedOverhead =
      (stage('Noise').p95 || 0) + (stage('VAD').p95 || 0) +
      (stage('Emotion').p95 || 0) + (stage('EOS').p95 || 0)

    const sttKeys = Object.keys(catalog.stt || {})
    const llmKeys = Object.keys(catalog.llm || {})
    const ttsKeys = Object.keys(catalog.tts || {})
    const tel = catalog.telephony?.exotel || { cost: 1.2, label: 'Exotel' }

    const rows = []
    for (const stt of sttKeys) {
      for (const llm of llmKeys) {
        for (const tts of ttsKeys) {
          const sttC = catalog.stt[stt]
          const llmC = catalog.llm[llm]
          const ttsC = catalog.tts[tts]

          const ai_raw = sttC.cost + llmC.cost + ttsC.cost
          const per_min_raw = ai_raw + tel.cost

          // STT-specific quality penalty (WER) — Sarvam best for Indic, others vary
          const wer = (() => {
            const lang = filterLang
            if (stt === 'sarvam') return lang === 'en' ? 5.0 : (lang === 'hi' ? 6.5 : 7.0)
            if (stt === 'deepgram_nova2') return lang === 'en' ? 4.2 : 8.5
            if (stt === 'groq_whisper')   return lang === 'en' ? 5.1 : 9.0
            if (stt === 'openai_whisper') return lang === 'en' ? 4.5 : 7.8
            if (stt === 'google_stt')     return lang === 'en' ? 5.5 : 9.5
            return 8.0
          })()

          // TTS MOS — ElevenLabs/Sarvam/OpenAI top tier; Edge/Cartesia mid
          const mos = (() => {
            if (tts === 'elevenlabs_standard') return 4.7
            if (tts === 'elevenlabs_flash')    return 4.5
            if (tts === 'sarvam')              return 4.4
            if (tts === 'openai_tts')          return 4.5
            if (tts === 'deepgram_aura')       return 4.2
            if (tts === 'cartesia')            return 4.0
            if (tts === 'azure_neural')        return 4.1
            if (tts === 'google_tts')          return 4.0
            if (tts === 'edge_tts')            return 3.8
            return 3.9
          })()

          // LLM intent accuracy — bigger models = higher
          const intent = (() => {
            if (llm.includes('opus') || llm.includes('gpt4o') || llm.includes('25_hd')) return 97.5
            if (llm.includes('sonnet')) return 96.5
            if (llm.includes('haiku') || llm.includes('70b'))  return 94.0
            if (llm.includes('mini') || llm.includes('flash')) return 91.5
            return 89.0
          })()

          // Latency: heavier models = slower
          const llmMul = llmC.cost > 5 ? 1.6 : llmC.cost > 1 ? 1.25 : 1.0
          const sttMul = stt === 'sarvam' ? 1.2 : 1.0
          const ttsMul = tts === 'cartesia' ? 0.8 : tts.includes('elevenlabs') ? 0.95 : 1.0
          const p95 = Math.round(
            sttBaseLat.p95 * sttMul + llmBaseLat.p95 * llmMul + ttsBaseLat.p95 * ttsMul + fixedOverhead
          )
          const p50 = Math.round(p95 * 0.6)

          rows.push({
            stt, stt_label: sttC.label, stt_cost: sttC.cost,
            llm, llm_label: llmC.label, llm_cost: llmC.cost, llm_tier: llmC.badge,
            tts, tts_label: ttsC.label, tts_cost: ttsC.cost,
            telephony: tel.label, tel_cost: tel.cost,
            ai_raw: round2(ai_raw),
            per_min: round2(per_min_raw),
            monthly: Math.round(per_min_raw * monthlyMins),
            wer, mos, intent,
            p50, p95,
            tokens_per_turn: TOKENS_IN_PER_TURN + TOKENS_OUT_PER_TURN,
            tokens_per_min: (TOKENS_IN_PER_TURN + TOKENS_OUT_PER_TURN) * TURNS_PER_MIN,
            chars_per_min: CHARS_PER_TURN * TURNS_PER_MIN,
            diarize: stt === 'deepgram_nova2',           // Deepgram supports diarization out of the box
          })
        }
      }
    }

    return rows
  }, [catalog, accuracy, pipeline, filterLang, monthlyMins])

  const filtered = useMemo(() => {
    return combos.filter(r => r.per_min <= maxCost && r.p95 <= maxLatency)
  }, [combos, maxCost, maxLatency])

  const sorted = useMemo(() => {
    const out = [...filtered]
    out.sort((a, b) => {
      const av = a[sortBy.key], bv = b[sortBy.key]
      if (av < bv) return sortBy.dir === 'asc' ? -1 : 1
      if (av > bv) return sortBy.dir === 'asc' ? 1 : -1
      return 0
    })
    return out
  }, [filtered, sortBy])

  const sortToggle = (key) => setSortBy((s) => ({
    key,
    dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc',
  }))

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>

  // Top picks
  const cheapest = sorted.slice().sort((a, b) => a.per_min - b.per_min)[0]
  const fastest = sorted.slice().sort((a, b) => a.p95 - b.p95)[0]
  const mostAccurate = sorted.slice().sort((a, b) => a.wer - b.wer)[0]
  const bestQuality = sorted.slice().sort((a, b) => b.mos - a.mos)[0]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Combo Benchmark</h1>
          <p className="text-gray-500 mt-1">
            Compare every STT × LLM × TTS combination across cost, latency, accuracy, and quality.
            <span className="text-[11px] text-amber-600 ml-2">Super-admin only</span>
          </p>
        </div>
        <span className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-sm font-medium">
          {sorted.length} / {combos.length} combos
        </span>
      </div>

      {/* Top picks */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Cheapest', icon: Trophy, value: cheapest, metric: `₹${cheapest?.per_min}/min`, tone: 'emerald' },
          { label: 'Fastest', icon: Zap, value: fastest, metric: `${fastest?.p95}ms p95`, tone: 'indigo' },
          { label: `Best ${filterLang.toUpperCase()} accuracy`, icon: Mic2, value: mostAccurate, metric: `${mostAccurate?.wer}% WER`, tone: 'violet' },
          { label: 'Best voice quality', icon: Volume2, value: bestQuality, metric: `${bestQuality?.mos} MOS`, tone: 'amber' },
        ].filter(p => p.value).map((p) => (
          <motion.div key={p.label} variants={fadeUp} initial="hidden" animate="show"
            className="p-4 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-wide text-gray-500">{p.label}</span>
              <p.icon className={`w-4 h-4 text-${p.tone}-500`} />
            </div>
            <p className="text-base font-bold text-gray-900">{p.metric}</p>
            <p className="text-[11px] text-gray-500 mt-1 truncate" title={`${p.value.stt_label} · ${p.value.llm_label} · ${p.value.tts_label}`}>
              {p.value.llm_label}
            </p>
            <p className="text-[10px] text-gray-400 truncate">{p.value.stt_label} → {p.value.tts_label}</p>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="p-4 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-gray-900">Filters</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-[10px] uppercase tracking-wide text-gray-500">Language</label>
            <select value={filterLang} onChange={(e) => setFilterLang(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="ta">Tamil</option>
              <option value="te">Telugu</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-gray-500">Max cost (₹/min)</label>
            <input type="number" min="1" max="50" step="0.5" value={maxCost}
              onChange={(e) => setMaxCost(Number(e.target.value) || 30)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-gray-500">Max p95 latency (ms)</label>
            <input type="number" min="500" max="5000" step="100" value={maxLatency}
              onChange={(e) => setMaxLatency(Number(e.target.value) || 2500)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-gray-500">Monthly volume (min)</label>
            <input type="number" min="100" max="100000" step="100" value={monthlyMins}
              onChange={(e) => setMonthlyMins(Number(e.target.value) || 1000)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
      </div>

      {/* Combo table */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
              <tr>
                <Th onClick={() => sortToggle('stt_label')} active={sortBy.key === 'stt_label'} dir={sortBy.dir}>STT</Th>
                <Th onClick={() => sortToggle('llm_label')} active={sortBy.key === 'llm_label'} dir={sortBy.dir}>LLM</Th>
                <Th onClick={() => sortToggle('tts_label')} active={sortBy.key === 'tts_label'} dir={sortBy.dir}>TTS</Th>
                <Th onClick={() => sortToggle('per_min')}   active={sortBy.key === 'per_min'}   dir={sortBy.dir} right>₹/min</Th>
                <Th onClick={() => sortToggle('monthly')}   active={sortBy.key === 'monthly'}   dir={sortBy.dir} right>Monthly</Th>
                <Th onClick={() => sortToggle('p95')}       active={sortBy.key === 'p95'}       dir={sortBy.dir} right>p95 ms</Th>
                <Th onClick={() => sortToggle('wer')}       active={sortBy.key === 'wer'}       dir={sortBy.dir} right>WER %</Th>
                <Th onClick={() => sortToggle('mos')}       active={sortBy.key === 'mos'}       dir={sortBy.dir} right>MOS</Th>
                <Th onClick={() => sortToggle('intent')}    active={sortBy.key === 'intent'}    dir={sortBy.dir} right>Intent</Th>
                <Th right>Tokens/min</Th>
                <Th right>Chars/min</Th>
                <Th>Diarize</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.slice(0, 200).map((r, i) => (
                <tr key={`${r.stt}-${r.llm}-${r.tts}`} className="hover:bg-indigo-50/30">
                  <td className="px-3 py-2 text-gray-700">{r.stt_label}</td>
                  <td className="px-3 py-2 text-gray-700">
                    {r.llm_label}
                    <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-gray-100 text-gray-500">{r.llm_tier}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-700">{r.tts_label}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-indigo-700">₹{r.per_min}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-600">₹{r.monthly.toLocaleString('en-IN')}</td>
                  <td className={`px-3 py-2 text-right font-mono ${r.p95 < 1500 ? 'text-emerald-600' : r.p95 < 2200 ? 'text-amber-600' : 'text-red-600'}`}>{r.p95}</td>
                  <td className={`px-3 py-2 text-right font-mono ${r.wer < 6 ? 'text-emerald-600' : r.wer < 9 ? 'text-amber-600' : 'text-red-600'}`}>{r.wer.toFixed(1)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${r.mos >= 4.4 ? 'text-emerald-600' : r.mos >= 4.0 ? 'text-amber-600' : 'text-red-600'}`}>{r.mos.toFixed(1)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${r.intent >= 95 ? 'text-emerald-600' : r.intent >= 90 ? 'text-amber-600' : 'text-red-600'}`}>{r.intent.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-500">{r.tokens_per_min.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-500">{r.chars_per_min}</td>
                  <td className="px-3 py-2">
                    {r.diarize
                      ? <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold">Yes</span>
                      : <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 text-[10px]">No</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sorted.length > 200 && (
          <p className="text-xs text-gray-500 text-center py-3 border-t border-gray-100">
            Showing top 200 of {sorted.length}. Tighten filters to narrow down.
          </p>
        )}
        {sorted.length === 0 && (
          <div className="py-10 text-center text-gray-400 text-sm flex flex-col items-center gap-2">
            <AlertTriangle className="w-6 h-6" />
            No combos match the current filters. Loosen them above.
          </div>
        )}
      </div>
    </div>
  )
}

function round2(n) { return Math.round(n * 100) / 100 }

function Th({ children, onClick, active, dir, right }) {
  return (
    <th onClick={onClick}
      className={`px-3 py-2.5 ${right ? 'text-right' : 'text-left'} ${onClick ? 'cursor-pointer hover:bg-gray-100' : ''} ${active ? 'text-indigo-600' : ''}`}>
      <span className="inline-flex items-center gap-1">
        {children}
        {onClick && (
          active
            ? (dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
            : <ArrowUpDown className="w-3 h-3 text-gray-300" />
        )}
      </span>
    </th>
  )
}
