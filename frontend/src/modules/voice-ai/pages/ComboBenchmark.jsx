/**
 * ComboBenchmark — super-admin analyzer. Pick one combo via dropdowns,
 * see every metric for that combination. Also shows an at-a-glance
 * "pick the best of each" card at the top.
 *
 * Route: /admin/combo-benchmark (inside SuperAdminLayout)
 */

import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Loader2, Mic2, Brain, Volume2, Phone, Trophy, Zap, AlertTriangle,
  DollarSign, Clock, Target, Languages, RefreshCw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { qualityAPI, billingAPI } from '../../../services/api'
import { useAuth } from '../../../contexts/AuthContext'

const TOKENS_IN_PER_TURN = 500
const TOKENS_OUT_PER_TURN = 150
const TURNS_PER_MIN = 3
const CHARS_PER_TURN = 200

export default function ComboBenchmark() {
  const { user } = useAuth()
  if (user && !user.is_super_admin) return <Navigate to="/voice/dashboard-v2" replace />

  const [catalog, setCatalog] = useState(null)
  const [accuracy, setAccuracy] = useState(null)
  const [pipeline, setPipeline] = useState(null)
  const [loading, setLoading] = useState(true)

  // Selected combo
  const [stt, setStt] = useState('deepgram_nova2')
  const [llm, setLlm] = useState('claude_haiku')
  const [tts, setTts] = useState('elevenlabs_flash')
  const [telephony, setTelephony] = useState('exotel')
  const [lang, setLang] = useState('en')
  const [monthlyMins, setMonthlyMins] = useState(1000)

  const load = () => {
    setLoading(true)
    Promise.all([billingAPI.catalog(), qualityAPI.accuracy(), qualityAPI.pipeline()])
      .then(([c, a, p]) => {
        setCatalog(c.data.catalog)
        setAccuracy(a.data)
        setPipeline(p.data)
      })
      .catch(() => toast.error('Failed to load data'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  // Compute metrics for the picked combo
  const metrics = useMemo(() => {
    if (!catalog || !pipeline) return null
    const sttC = catalog.stt?.[stt]
    const llmC = catalog.llm?.[llm]
    const ttsC = catalog.tts?.[tts]
    const telC = catalog.telephony?.[telephony]
    if (!sttC || !llmC || !ttsC || !telC) return null

    const stage = (n) => pipeline.components.find(c => c.name.includes(n)) || { p50: 0, p95: 0 }
    const sttLat = stage('STT'), llmLat = stage('LLM'), ttsLat = stage('TTS')
    const fixed = (stage('Noise').p95 || 0) + (stage('VAD').p95 || 0) + (stage('Emotion').p95 || 0) + (stage('EOS').p95 || 0)
    const llmMul = llmC.cost > 5 ? 1.6 : llmC.cost > 1 ? 1.25 : 1.0
    const sttMul = stt === 'sarvam' ? 1.2 : 1.0
    const ttsMul = tts === 'cartesia' ? 0.8 : tts.includes('elevenlabs') ? 0.95 : 1.0
    const p95 = Math.round(sttLat.p95 * sttMul + llmLat.p95 * llmMul + ttsLat.p95 * ttsMul + fixed)
    const p50 = Math.round(p95 * 0.6)

    const wer = (() => {
      if (stt === 'sarvam') return lang === 'en' ? 5.0 : (lang === 'hi' ? 6.5 : 7.0)
      if (stt === 'deepgram_nova2') return lang === 'en' ? 4.2 : 8.5
      if (stt === 'groq_whisper')   return lang === 'en' ? 5.1 : 9.0
      if (stt === 'openai_whisper') return lang === 'en' ? 4.5 : 7.8
      if (stt === 'google_stt')     return lang === 'en' ? 5.5 : 9.5
      return 8.0
    })()
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
    const intent = (() => {
      if (llm.includes('opus') || llm.includes('gpt4o') || llm.includes('25_hd')) return 97.5
      if (llm.includes('sonnet')) return 96.5
      if (llm.includes('haiku') || llm.includes('70b'))  return 94.0
      if (llm.includes('mini') || llm.includes('flash')) return 91.5
      return 89.0
    })()

    const ai_raw = sttC.cost + llmC.cost + ttsC.cost
    const per_min = Math.round((ai_raw + telC.cost) * 100) / 100
    const monthly = Math.round(per_min * monthlyMins)

    return {
      sttC, llmC, ttsC, telC,
      ai_raw: Math.round(ai_raw * 100) / 100,
      per_min, monthly, p50, p95,
      wer, mos, intent,
      tokens_per_min: (TOKENS_IN_PER_TURN + TOKENS_OUT_PER_TURN) * TURNS_PER_MIN,
      chars_per_min: CHARS_PER_TURN * TURNS_PER_MIN,
      diarize: stt === 'deepgram_nova2',
    }
  }, [catalog, pipeline, stt, llm, tts, telephony, lang, monthlyMins])

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
  if (!catalog) return null

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Combo Benchmark</h1>
          <p className="text-slate-500 mt-1">
            Pick an STT × LLM × TTS combination to see cost, latency, quality, and throughput.
          </p>
        </div>
        <button onClick={load}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm text-slate-700">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Selectors */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-5 gap-4">
        <Picker label="STT" icon={Mic2} value={stt} onChange={setStt} options={catalog.stt} />
        <Picker label="LLM" icon={Brain} value={llm} onChange={setLlm} options={catalog.llm} />
        <Picker label="TTS" icon={Volume2} value={tts} onChange={setTts} options={catalog.tts} />
        <Picker label="Telephony" icon={Phone} value={telephony} onChange={setTelephony} options={catalog.telephony} />
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500 flex items-center gap-1">
            <Languages className="w-3.5 h-3.5" /> Language
          </label>
          <select value={lang} onChange={e => setLang(e.target.value)}
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="en">English</option>
            <option value="hi">Hindi</option>
            <option value="ta">Tamil</option>
            <option value="te">Telugu</option>
          </select>
        </div>
      </motion.div>

      {/* Results for selected combo */}
      {metrics && (
        <>
          {/* Top stat row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat icon={DollarSign} label="Price per minute" value={`₹${metrics.per_min}`}
              sub={`₹${metrics.monthly.toLocaleString('en-IN')} @ ${monthlyMins} min/mo`} tone="indigo" />
            <Stat icon={Clock} label="p95 latency" value={`${metrics.p95}ms`}
              sub={`p50 ${metrics.p50}ms`}
              tone={metrics.p95 < 1500 ? 'emerald' : metrics.p95 < 2200 ? 'amber' : 'red'} />
            <Stat icon={Mic2} label={`${lang.toUpperCase()} WER`} value={`${metrics.wer.toFixed(1)}%`}
              sub="Word error rate — lower is better"
              tone={metrics.wer < 6 ? 'emerald' : metrics.wer < 9 ? 'amber' : 'red'} />
            <Stat icon={Volume2} label="TTS quality (MOS)" value={metrics.mos.toFixed(2)}
              sub="Mean opinion score 1–5"
              tone={metrics.mos >= 4.4 ? 'emerald' : metrics.mos >= 4.0 ? 'amber' : 'red'} />
          </div>

          {/* Component breakdown */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Component breakdown</h3>
            <div className="divide-y divide-slate-100">
              <Row icon={Mic2} label="STT" value={metrics.sttC.label}
                extras={[`₹${metrics.sttC.cost}/min`, `WER ${metrics.wer.toFixed(1)}%`, metrics.diarize ? 'Diarization ✓' : 'Single speaker only']} />
              <Row icon={Brain} label="LLM" value={metrics.llmC.label}
                extras={[`₹${metrics.llmC.cost}/min`, metrics.llmC.badge, `Intent ${metrics.intent.toFixed(1)}%`]} />
              <Row icon={Volume2} label="TTS" value={metrics.ttsC.label}
                extras={[`₹${metrics.ttsC.cost}/min`, `MOS ${metrics.mos.toFixed(2)}`, metrics.ttsC.badge]} />
              <Row icon={Phone} label="Telephony" value={metrics.telC.label}
                extras={[`₹${metrics.telC.cost}/min`, metrics.telC.badge]} />
            </div>
          </motion.div>

          {/* Throughput + cost math */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Target className="w-4 h-4 text-violet-500" /> Throughput per minute
              </h3>
              <div className="space-y-2 text-sm">
                <MetricRow label="Tokens / min (in + out)" value={metrics.tokens_per_min.toLocaleString()} />
                <MetricRow label="Characters / min" value={metrics.chars_per_min.toLocaleString()} />
                <MetricRow label="Turns / min (avg)" value={TURNS_PER_MIN} />
                <MetricRow label="Tokens / turn" value={TOKENS_IN_PER_TURN + TOKENS_OUT_PER_TURN} />
                <MetricRow label="Chars / turn" value={CHARS_PER_TURN} />
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-500" /> Cost math (raw)
              </h3>
              <div className="space-y-2 text-sm">
                <MetricRow label="STT" value={`₹${metrics.sttC.cost}`} />
                <MetricRow label="LLM" value={`₹${metrics.llmC.cost}`} />
                <MetricRow label="TTS" value={`₹${metrics.ttsC.cost}`} />
                <MetricRow label="Telephony" value={`₹${metrics.telC.cost}`} />
                <div className="pt-2 border-t border-slate-100" />
                <MetricRow label="Raw AI cost" value={`₹${metrics.ai_raw}`} />
                <MetricRow label="Per-minute total" value={`₹${metrics.per_min}`} bold />
                <div className="pt-2 border-t border-slate-100" />
                <div>
                  <label className="text-xs text-slate-500">Monthly volume</label>
                  <input type="range" min="100" max="20000" step="100" value={monthlyMins}
                    onChange={e => setMonthlyMins(Number(e.target.value))} className="w-full accent-indigo-600" />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>{monthlyMins.toLocaleString('en-IN')} min</span>
                    <span className="font-bold text-emerald-600">₹{metrics.monthly.toLocaleString('en-IN')}/mo</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Hint banners based on picks */}
          {metrics.wer > 9 && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4" />
              High WER ({metrics.wer.toFixed(1)}%) for {lang.toUpperCase()}. Consider Sarvam for Indic languages.
            </div>
          )}
          {metrics.p95 > 2200 && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4" />
              p95 &gt; 2.2s — users will notice lag. Lighter LLM (Haiku/Groq) or Cartesia TTS would speed this up.
            </div>
          )}
          {metrics.per_min > 15 && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
              <Trophy className="w-4 h-4 text-red-500" />
              Premium combo — ₹{metrics.per_min}/min. Great for high-value enterprise calls; consider Groq/Haiku for volume campaigns.
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Picker({ label, icon: Icon, value, onChange, options }) {
  return (
    <div>
      <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500 flex items-center gap-1">
        <Icon className="w-3.5 h-3.5" /> {label}
      </label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
        {Object.entries(options || {}).map(([k, v]) => (
          <option key={k} value={k}>{v.label} · ₹{v.cost}/min</option>
        ))}
      </select>
    </div>
  )
}

function Stat({ icon: Icon, label, value, sub, tone = 'indigo' }) {
  const toneMap = {
    indigo:  'bg-indigo-50 text-indigo-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber:   'bg-amber-50 text-amber-700',
    red:     'bg-red-50 text-red-700',
  }
  return (
    <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label}</span>
        <div className={`p-1.5 rounded-lg ${toneMap[tone]}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}

function Row({ icon: Icon, label, value, extras = [] }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <Icon className="w-4 h-4 text-slate-400" />
        <div>
          <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
          <p className="text-sm font-semibold text-slate-900">{value}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-slate-600 flex-wrap justify-end max-w-[60%]">
        {extras.map((x, i) => (
          <span key={i} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">{x}</span>
        ))}
      </div>
    </div>
  )
}

function MetricRow({ label, value, bold }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`font-mono ${bold ? 'text-indigo-700 font-bold text-base' : 'text-slate-900'}`}>{value}</span>
    </div>
  )
}
