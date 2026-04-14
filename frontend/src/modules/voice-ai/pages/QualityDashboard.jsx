/**
 * Quality Dashboard — Live testing metrics for VoiceFlow AI
 * ----------------------------------------------------------
 * Shows provider latency, pipeline breakdown, uptime, accuracy
 * scores, competitor comparison, and 7-day trends.
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Activity, Gauge, CheckCircle2, AlertTriangle, XCircle, TrendingUp,
  Zap, Mic2, Brain, Volume2, RefreshCw, Loader2, Clock, Trophy,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from 'recharts'
import { qualityAPI } from '../../../services/api'

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
}

function StatusDot({ ok, warn }) {
  const color = ok ? 'bg-emerald-500' : warn ? 'bg-amber-500' : 'bg-red-500'
  return (
    <span className="relative flex h-2.5 w-2.5">
      {ok && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${color}`} />}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${color}`} />
    </span>
  )
}

function LatencyBadge({ ms }) {
  if (ms === null || ms === undefined) return <span className="text-xs text-gray-400">—</span>
  const color = ms < 200 ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
    : ms < 500 ? 'text-amber-600 bg-amber-50 border-amber-100'
    : 'text-red-600 bg-red-50 border-red-100'
  return (
    <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-md border ${color}`}>
      {ms}ms
    </span>
  )
}

function MetricCard({ icon: Icon, label, value, unit, tone = 'indigo', subtitle }) {
  const toneMap = {
    indigo: 'from-indigo-50 to-violet-50 text-indigo-600',
    emerald: 'from-emerald-50 to-teal-50 text-emerald-600',
    amber: 'from-amber-50 to-orange-50 text-amber-600',
    rose: 'from-rose-50 to-pink-50 text-rose-600',
  }
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show"
      className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-2xl font-bold text-gray-900">{value}</span>
            {unit && <span className="text-sm text-gray-500">{unit}</span>}
          </div>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-2.5 rounded-xl bg-gradient-to-br ${toneMap[tone]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </motion.div>
  )
}

export default function QualityDashboard() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [providers, setProviders] = useState(null)
  const [pipeline, setPipeline] = useState(null)
  const [uptime, setUptime] = useState(null)
  const [accuracy, setAccuracy] = useState(null)
  const [competitors, setCompetitors] = useState(null)
  const [trends, setTrends] = useState(null)
  const [err, setErr] = useState(null)

  const load = async () => {
    setRefreshing(true)
    setErr(null)
    try {
      const [p, pl, u, a, c, t] = await Promise.all([
        qualityAPI.providers(),
        qualityAPI.pipeline(),
        qualityAPI.uptime(),
        qualityAPI.accuracy(),
        qualityAPI.competitors(),
        qualityAPI.trends(),
      ])
      setProviders(p.data)
      setPipeline(pl.data)
      setUptime(u.data)
      setAccuracy(a.data)
      setCompetitors(c.data)
      setTrends(t.data)
    } catch (e) {
      setErr(e.response?.data?.detail || 'Failed to load quality metrics')
    }
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 30000) // auto-refresh every 30s
    return () => clearInterval(id)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  const trendData = trends?.days.map((d, i) => ({
    day: d,
    latency: trends.p95_latency_ms[i],
    uptime: trends.uptime_percent[i],
    calls: trends.calls_handled[i],
    wer: trends.avg_hindi_wer[i],
  })) || []

  const competitorData = competitors?.metrics.map(m => ({
    metric: m.metric,
    ...m.scores,
  })) || []
  const competitorNames = competitors?.metrics[0]
    ? Object.keys(competitors.metrics[0].scores)
    : []
  const competitorColors = ['#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981']

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Quality & Testing Dashboard</h1>
          <p className="text-gray-500 mt-1">Live latency, uptime, accuracy, and competitor benchmarks</p>
        </div>
        <button
          onClick={load}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all text-sm font-medium text-gray-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {err && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{err}</div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={Gauge} label="E2E Latency (p95)" value={pipeline?.total_p95_ms} unit="ms"
          tone="indigo" subtitle={`Target < ${pipeline?.target_p95_ms}ms`} />
        <MetricCard icon={Activity} label="Uptime (30d)" value={uptime?.uptime_percent_30d} unit="%"
          tone="emerald" subtitle={`7d: ${uptime?.uptime_percent_7d}%`} />
        <MetricCard icon={Mic2} label="Hindi WER" value={accuracy?.stt.hindi_wer} unit="%"
          tone="amber" subtitle={`Tamil: ${accuracy?.stt.tamil_wer}%`} />
        <MetricCard icon={Volume2} label="Hindi TTS MOS" value={accuracy?.tts.hindi_mos} unit="/5"
          tone="rose" subtitle={`English: ${accuracy?.tts.english_mos}/5`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Pipeline breakdown */}
        <motion.div variants={fadeUp} initial="hidden" animate="show"
          className="lg:col-span-2 p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-indigo-500" />
            <h3 className="font-semibold text-gray-900">Pipeline Latency Breakdown</h3>
          </div>
          <div className="space-y-2.5">
            {pipeline?.components.map(c => {
              const pct = Math.min(100, (c.p95 / c.target) * 100)
              const hot = c.p95 > c.target * 0.9
              return (
                <div key={c.name}>
                  <div className="flex justify-between items-center text-sm mb-1">
                    <span className="text-gray-700 font-medium">{c.name}</span>
                    <span className="font-mono text-xs text-gray-500">
                      p50 {c.p50}ms · <span className={hot ? 'text-amber-600 font-semibold' : 'text-gray-700'}>p95 {c.p95}ms</span> / {c.target}ms
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${
                      hot ? 'bg-gradient-to-r from-amber-400 to-orange-500'
                          : 'bg-gradient-to-r from-emerald-400 to-teal-500'
                    }`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>

        {/* Services health */}
        <motion.div variants={fadeUp} initial="hidden" animate="show"
          className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            <h3 className="font-semibold text-gray-900">Services</h3>
          </div>
          <div className="space-y-2">
            {uptime?.services.map(s => (
              <div key={s.name} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50/70">
                <span className="text-sm text-gray-700">{s.name}</span>
                <div className="flex items-center gap-2">
                  <StatusDot ok={s.status === 'up'} />
                  <span className={`text-xs font-medium ${
                    s.status === 'up' ? 'text-emerald-700' : 'text-red-700'
                  }`}>{s.status}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Provider latency probes */}
      <motion.div variants={fadeUp} initial="hidden" animate="show"
        className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-violet-500" />
          <h3 className="font-semibold text-gray-900">Provider Latency (live probe)</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {['stt', 'llm', 'tts'].map(cat => (
            <div key={cat}>
              <p className="text-xs font-semibold uppercase text-gray-500 mb-2 tracking-wide">{cat}</p>
              <div className="space-y-1.5">
                {providers?.providers[cat].map(p => (
                  <div key={p.name} className="flex items-center justify-between p-2 rounded-lg bg-gray-50/60 border border-gray-100">
                    <div className="flex items-center gap-2">
                      <StatusDot ok={p.ok} warn={p.status === 'not_configured'} />
                      <span className="text-sm text-gray-700">{p.name}</span>
                    </div>
                    {p.status === 'not_configured'
                      ? <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">no key</span>
                      : <LatencyBadge ms={p.latency_ms} />}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Trend charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <motion.div variants={fadeUp} initial="hidden" animate="show"
          className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-indigo-500" />
            <h3 className="font-semibold text-gray-900">7-Day P95 Latency</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip />
              <Line type="monotone" dataKey="latency" stroke="#6366f1" strokeWidth={2.5}
                dot={{ fill: '#6366f1', r: 4 }} name="p95 (ms)" />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div variants={fadeUp} initial="hidden" animate="show"
          className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-5 h-5 text-emerald-500" />
            <h3 className="font-semibold text-gray-900">7-Day Hindi WER & Calls</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} />
              <YAxis yAxisId="l" stroke="#94a3b8" fontSize={11} />
              <YAxis yAxisId="r" orientation="right" stroke="#94a3b8" fontSize={11} />
              <Tooltip />
              <Legend />
              <Line yAxisId="l" type="monotone" dataKey="wer" stroke="#f59e0b" strokeWidth={2.5}
                dot={{ fill: '#f59e0b', r: 4 }} name="WER %" />
              <Line yAxisId="r" type="monotone" dataKey="calls" stroke="#10b981" strokeWidth={2.5}
                dot={{ fill: '#10b981', r: 4 }} name="Calls" />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Competitor comparison */}
      <motion.div variants={fadeUp} initial="hidden" animate="show"
        className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-amber-500" />
          <h3 className="font-semibold text-gray-900">Competitor Benchmark</h3>
          <span className="text-xs text-gray-400 ml-auto">Updated {competitors?.updated_at}</span>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={competitorData} layout="vertical" margin={{ left: 120 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis type="number" stroke="#94a3b8" fontSize={11} />
            <YAxis type="category" dataKey="metric" stroke="#94a3b8" fontSize={11} width={120} />
            <Tooltip />
            <Legend />
            {competitorNames.map((name, i) => (
              <Bar key={name} dataKey={name} fill={competitorColors[i % competitorColors.length]}
                radius={[0, 4, 4, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-gray-500 mt-2">
          Lower is better for latency, WER, and cost. Higher is better for MOS scores.
        </p>
      </motion.div>

      {/* Accuracy matrix */}
      <motion.div variants={fadeUp} initial="hidden" animate="show"
        className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">STT Accuracy (WER %)</h4>
          <div className="space-y-2">
            {Object.entries(accuracy?.stt || {}).map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm">
                <span className="text-gray-600 capitalize">{k.replace(/_/g, ' ')}</span>
                <span className={`font-mono font-semibold ${
                  v < 8 ? 'text-emerald-600' : v < 12 ? 'text-amber-600' : 'text-red-600'
                }`}>{v}%</span>
              </div>
            ))}
          </div>
        </div>
        <div className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">TTS Quality (MOS /5)</h4>
          <div className="space-y-2">
            {Object.entries(accuracy?.tts || {}).map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm">
                <span className="text-gray-600 capitalize">{k.replace(/_/g, ' ')}</span>
                <span className={`font-mono font-semibold ${
                  v >= 4.3 ? 'text-emerald-600' : v >= 4.0 ? 'text-amber-600' : 'text-red-600'
                }`}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">LLM Performance</h4>
          <div className="space-y-2">
            {Object.entries(accuracy?.llm || {}).map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm">
                <span className="text-gray-600 capitalize">{k.replace(/_/g, ' ')}</span>
                <span className={`font-mono font-semibold ${
                  k.includes('hallucination')
                    ? (v < 3 ? 'text-emerald-600' : v < 5 ? 'text-amber-600' : 'text-red-600')
                    : (v > 90 ? 'text-emerald-600' : v > 80 ? 'text-amber-600' : 'text-red-600')
                }`}>{v}%</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
