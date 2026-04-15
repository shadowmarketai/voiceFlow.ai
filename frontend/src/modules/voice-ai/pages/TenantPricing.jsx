/**
 * TenantPricing — white-label pricing page for the tenant (agency).
 *
 *   /voice/tenant-pricing
 *
 * The tenant sees:
 *   - "Your cost" (what WE charge them for the current provider stack)   [readonly]
 *   - "Your markup"  (fee + % markup) — editable, must be ≥ 0
 *   - "Your end-user price" (what their users will pay)                  [computed]
 *
 * They CANNOT change our platform markup or the raw provider prices.
 * They CAN lock LLM/TTS for their own users (separate from platform lock).
 */

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Building2, Save, Loader2, TrendingUp, Lock, Unlock, Calculator,
  AlertTriangle, RefreshCw, Sparkles, Wallet, Users, ArrowRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { billingAPI } from '../../../services/api'

export default function TenantPricing() {
  const [plan, setPlan] = useState(null)
  const [catalog, setCatalog] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Editable tenant fields
  const [fee, setFee] = useState(0)
  const [aiMarkup, setAiMarkup] = useState(0)
  const [lockLlm, setLockLlm] = useState(false)
  const [lockTts, setLockTts] = useState(false)

  // Simulator — lets tenant preview what their user would pay on any combo
  const [sim, setSim] = useState({ stt: '', llm: '', tts: '', telephony: '' })
  const [simResult, setSimResult] = useState(null)
  const [monthlyMins, setMonthlyMins] = useState(1000)

  const loadAll = async () => {
    setLoading(true)
    try {
      const [p, c] = await Promise.all([billingAPI.tenantRatePlan(), billingAPI.catalog()])
      setPlan(p.data)
      setCatalog(c.data.catalog)
      setFee(p.data.tenant_fee_inr)
      setAiMarkup(p.data.tenant_ai_markup_pct)
      setLockLlm(p.data.tenant_locks_for_users?.lock_llm || false)
      setLockTts(p.data.tenant_locks_for_users?.lock_tts || false)
      setSim({
        stt: p.data.providers.stt, llm: p.data.providers.llm,
        tts: p.data.providers.tts, telephony: p.data.providers.telephony,
      })
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load pricing')
    } finally { setLoading(false) }
  }

  useEffect(() => { loadAll() }, [])

  useEffect(() => {
    if (!sim.stt || !sim.llm || !sim.tts || !sim.telephony) return
    billingAPI.tenantCalculate({ ...sim })
      .then(({ data }) => setSimResult(data))
      .catch(() => setSimResult(null))
  }, [sim])

  const save = async () => {
    setSaving(true)
    try {
      await billingAPI.tenantUpdateRatePlan({
        tenant_fee_inr: fee,
        tenant_ai_markup_pct: aiMarkup,
        tenant_lock_llm: lockLlm,
        tenant_lock_tts: lockTts,
      })
      toast.success('Your pricing saved')
      loadAll()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed')
    } finally { setSaving(false) }
  }

  // Compute preview user price from local edits (without hitting backend on every keystroke)
  const localUserPrice = useMemo(() => {
    if (!plan) return null
    const tenantCost = plan.tenant_cost_per_min
    // Approximate: add fee + AI-markup on (ai_after_platform)
    const aiBase = plan.breakdown?.ai_after_tenant
      ? (plan.breakdown.ai_after_tenant / (1 + (plan.tenant_ai_markup_pct || 0) / 100))
      : 0
    const aiAdj = aiBase * (1 + (aiMarkup / 100))
    const aiExtra = aiAdj - aiBase
    const approx = tenantCost + (fee || 0) + aiExtra
    return Math.max(approx, tenantCost)
  }, [plan, fee, aiMarkup])

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>

  if (!plan) {
    return (
      <div className="p-6 bg-white rounded-2xl border border-gray-200 text-center">
        <p className="text-gray-500">Pricing plan not available yet.</p>
        <button onClick={loadAll} className="mt-3 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm">Retry</button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Your Pricing & Fees</h1>
          <p className="text-gray-500 mt-1">Set the markup you add on top of our platform cost. Your users see only the final price.</p>
        </div>
        <button onClick={loadAll} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm text-gray-700">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Flow diagram */}
      <div className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
        <div className="flex flex-col md:flex-row items-stretch gap-3">
          <div className="flex-1 p-4 rounded-xl bg-indigo-50 border border-indigo-100">
            <div className="flex items-center gap-2 text-indigo-700 text-xs font-semibold uppercase tracking-wide mb-2">
              <Building2 className="w-3.5 h-3.5" /> Platform charges you
            </div>
            <p className="text-2xl font-bold text-indigo-700">₹{plan.tenant_cost_per_min.toFixed(2)}/min</p>
            <p className="text-[11px] text-indigo-600 mt-1">Readonly · set by super-admin</p>
          </div>

          <div className="flex items-center justify-center">
            <ArrowRight className="w-5 h-5 text-gray-300" />
          </div>

          <div className="flex-1 p-4 rounded-xl bg-violet-50 border border-violet-100">
            <div className="flex items-center gap-2 text-violet-700 text-xs font-semibold uppercase tracking-wide mb-2">
              <TrendingUp className="w-3.5 h-3.5" /> Your markup
            </div>
            <p className="text-2xl font-bold text-violet-700">+ ₹{(fee + (localUserPrice - plan.tenant_cost_per_min - fee)).toFixed(2)}/min</p>
            <p className="text-[11px] text-violet-600 mt-1">₹{fee.toFixed(2)} fixed + {aiMarkup}% on AI</p>
          </div>

          <div className="flex items-center justify-center">
            <ArrowRight className="w-5 h-5 text-gray-300" />
          </div>

          <div className="flex-1 p-4 rounded-xl bg-emerald-50 border border-emerald-100">
            <div className="flex items-center gap-2 text-emerald-700 text-xs font-semibold uppercase tracking-wide mb-2">
              <Users className="w-3.5 h-3.5" /> Your users pay
            </div>
            <p className="text-2xl font-bold text-emerald-700">₹{(localUserPrice || 0).toFixed(2)}/min</p>
            <p className="text-[11px] text-emerald-600 mt-1">Margin: ₹{(localUserPrice - plan.tenant_cost_per_min).toFixed(2)}/min</p>
          </div>
        </div>
      </div>

      {/* Edit your markup */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-indigo-500" /> Your markup (how you make money)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Flat fee per minute (₹)</label>
            <input type="number" min="0" step="0.25" value={fee}
              onChange={(e) => setFee(Number(e.target.value) || 0)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <p className="text-[11px] text-gray-400 mt-1">Minimum ₹0. This is fixed regardless of which LLM/TTS your users pick.</p>
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Extra AI markup %</label>
            <input type="number" min="0" max="200" value={aiMarkup}
              onChange={(e) => setAiMarkup(Number(e.target.value) || 0)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <p className="text-[11px] text-gray-400 mt-1">Applied on top of platform AI markup. Protects you when users pick expensive LLMs.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <label className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 cursor-pointer">
            {lockLlm ? <Lock className="w-4 h-4 text-red-500" /> : <Unlock className="w-4 h-4 text-emerald-500" />}
            <div className="flex-1">
              <p className="text-sm font-medium">Lock LLM for my users</p>
              <p className="text-[11px] text-gray-500">Prevents your users from switching LLMs and surprising you with Opus bills.</p>
            </div>
            <input type="checkbox" checked={lockLlm} onChange={(e) => setLockLlm(e.target.checked)} />
          </label>
          <label className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 cursor-pointer">
            {lockTts ? <Lock className="w-4 h-4 text-red-500" /> : <Unlock className="w-4 h-4 text-emerald-500" />}
            <div className="flex-1">
              <p className="text-sm font-medium">Lock TTS for my users</p>
              <p className="text-[11px] text-gray-500">Your users keep the TTS you picked; they cannot switch.</p>
            </div>
            <input type="checkbox" checked={lockTts} onChange={(e) => setLockTts(e.target.checked)} />
          </label>
        </div>

        {(plan.locks_from_platform?.lock_llm || plan.locks_from_platform?.lock_tts) && (
          <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              Some provider choices are locked by the platform and cannot be changed here.
              Contact your platform admin to change them.
            </div>
          </div>
        )}

        <div className="flex justify-end mt-4">
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save pricing
          </button>
        </div>
      </motion.div>

      {/* Simulator */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Calculator className="w-4 h-4 text-violet-500" /> User-price simulator
          <span className="text-[11px] font-normal text-gray-400 ml-2">Preview what your users would pay on any provider combo</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {['stt', 'llm', 'tts', 'telephony'].map((cat) => (
            <div key={cat}>
              <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{cat}</label>
              <select value={sim[cat]} onChange={(e) => setSim({ ...sim, [cat]: e.target.value })}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                {Object.entries(catalog?.[cat] || {}).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {simResult && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100">
              <p className="text-[11px] uppercase text-indigo-700 font-medium">Your cost</p>
              <p className="text-xl font-bold text-indigo-700 mt-1">₹{simResult.tenant_cost}/min</p>
            </div>
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
              <p className="text-[11px] uppercase text-emerald-700 font-medium">User pays</p>
              <p className="text-xl font-bold text-emerald-700 mt-1">₹{simResult.user_price}/min</p>
            </div>
            <div className="p-4 rounded-xl bg-violet-50 border border-violet-100">
              <p className="text-[11px] uppercase text-violet-700 font-medium">Your margin</p>
              <p className="text-xl font-bold text-violet-700 mt-1">₹{simResult.tenant_margin}/min · {simResult.tenant_margin_pct}%</p>
            </div>
          </div>
        )}
      </motion.div>

      {/* Recommended pricing */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="p-5 bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl border border-indigo-100">
        <h3 className="text-sm font-semibold text-indigo-900 mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Recommended tiers for your end-users
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-indigo-900">
          <div className="p-3 rounded-xl bg-white/60">
            <p className="font-semibold">SMB / Shops</p>
            <p className="text-xs mt-1">Add ₹1.50/min markup — keeps price under ₹5/min for small businesses.</p>
          </div>
          <div className="p-3 rounded-xl bg-white/60">
            <p className="font-semibold">Mid-market</p>
            <p className="text-xs mt-1">Add ₹2.50/min + 20% AI markup — protects margin if they upgrade LLM.</p>
          </div>
          <div className="p-3 rounded-xl bg-white/60">
            <p className="font-semibold">Enterprise</p>
            <p className="text-xs mt-1">Add ₹4/min + lock LLM to Claude Haiku — predictable billing.</p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
