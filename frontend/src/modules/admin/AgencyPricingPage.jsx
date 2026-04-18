/**
 * AgencyPricingPage — platform fee + rate plan editor for agency admins.
 *
 *   /admin/pricing
 *
 * What it does:
 *   - Select any tenant
 *   - Set platform fee (₹/min), markup %, floor, lock LLM/TTS
 *   - Set the provider stack
 *   - See live "your cost vs client cost vs margin %"
 *   - Credit wallet manually
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Building2, Save, RefreshCw, Lock, Unlock, Plus, Loader2, Calculator,
  TrendingUp, ShieldCheck, AlertTriangle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { billingAPI } from '../../services/api'

const ADMIN_TOKEN_KEY = 'voiceflow_admin_token'

export default function AgencyPricingPage() {
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem(ADMIN_TOKEN_KEY) || '')
  const [tenantId, setTenantId] = useState('default')
  const [plan, setPlan] = useState(null)
  const [catalog, setCatalog] = useState(null)
  const [calc, setCalc] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [creditAmount, setCreditAmount] = useState(1000)
  const [creditNote, setCreditNote] = useState('Agency top-up')

  const saveToken = (t) => {
    localStorage.setItem(ADMIN_TOKEN_KEY, t)
    setAdminToken(t)
  }

  const loadCatalog = async () => {
    try {
      const { data } = await billingAPI.catalog()
      setCatalog(data.catalog)
    } catch (e) { toast.error('Catalog load failed') }
  }

  const loadPlan = async () => {
    if (!tenantId) return
    setLoading(true)
    try {
      const { data } = await billingAPI.adminRatePlan(tenantId, adminToken)
      setPlan(data)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load rate plan')
      setPlan(null)
    } finally {
      setLoading(false)
    }
  }

  const runCalc = async () => {
    if (!plan) return
    try {
      const { data } = await billingAPI.adminCalculate(
        { stt: plan.stt, llm: plan.llm, tts: plan.tts, telephony: plan.telephony },
        tenantId, adminToken,
      )
      setCalc(data)
    } catch (e) {
      setCalc(null)
    }
  }

  useEffect(() => { loadCatalog() }, [])
  useEffect(() => { if (adminToken) loadPlan() }, [tenantId, adminToken])
  useEffect(() => { runCalc() }, [plan])

  const save = async () => {
    if (!plan) return
    setSaving(true)
    try {
      await billingAPI.adminUpdateRatePlan(tenantId, {
        stt: plan.stt, llm: plan.llm, tts: plan.tts, telephony: plan.telephony,
        platform_fee_inr: plan.platform_fee_inr,
        ai_markup_pct: plan.ai_markup_pct,
        telephony_markup_pct: plan.telephony_markup_pct,
        min_floor_inr: plan.min_floor_inr,
        lock_llm: plan.lock_llm, lock_tts: plan.lock_tts, tier: plan.tier,
      }, adminToken)
      toast.success('Rate plan saved')
      runCalc()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const doCredit = async () => {
    try {
      await billingAPI.adminCredit({
        tenant_id: tenantId, amount_inr: creditAmount, note: creditNote,
      }, adminToken)
      toast.success(`Credited ₹${creditAmount} to ${tenantId}`)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Credit failed')
    }
  }

  const update = (k, v) => setPlan((p) => ({ ...p, [k]: v }))

  const expensiveLlm = useMemo(() => {
    if (!plan || !catalog) return false
    return (catalog.llm?.[plan.llm]?.cost || 0) >= 5
  }, [plan, catalog])

  // ── Token gate ──
  if (!adminToken) {
    return (
      <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5 text-indigo-500" />
          <h2 className="text-lg font-semibold">Agency admin access</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Enter the admin token to manage platform fees and rate plans across all tenants.
          Token is set via the <code className="bg-gray-100 px-1 rounded">ADMIN_TOKEN</code> env var on the server.
        </p>
        <input type="password" placeholder="Admin token"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3"
          onKeyDown={(e) => { if (e.key === 'Enter') saveToken(e.target.value) }} />
        <button onClick={(e) => saveToken(e.currentTarget.previousElementSibling.value)}
          className="w-full py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
          Unlock
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Agency Pricing</h1>
          <p className="text-gray-500 mt-1">Set base platform fee, provider stack, and markup. This is the cost floor all plan prices are built on top of.</p>
        </div>
        <button onClick={() => { localStorage.removeItem(ADMIN_TOKEN_KEY); setAdminToken('') }}
          className="text-sm text-gray-500 hover:text-red-600">Log out</button>
      </div>

      {/* Tenant selector */}
      <div className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-indigo-500" />
          <label className="text-sm font-medium text-gray-700">Agency ID</label>
          <input value={tenantId} onChange={(e) => setTenantId(e.target.value)}
            placeholder="tenant-id (e.g. default, clt001, ...)"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
          <button onClick={loadPlan} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Load
          </button>
        </div>
      </div>

      {plan && catalog && (
        <>
          {/* Providers + markup */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Provider stack</h3>
              <div className="grid grid-cols-2 gap-3">
                {['stt', 'llm', 'tts', 'telephony'].map((cat) => (
                  <div key={cat}>
                    <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{cat}</label>
                    <select value={plan[cat]} onChange={(e) => update(cat, e.target.value)}
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                      {Object.entries(catalog[cat] || {}).map(([k, v]) => (
                        <option key={k} value={k}>{v.label} · ₹{v.cost}/min</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <h3 className="text-sm font-semibold text-gray-900 mt-6 mb-3">Pricing controls</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Platform fee ₹/min</label>
                  <input type="number" step="0.25" min="0" value={plan.platform_fee_inr}
                    onChange={(e) => update('platform_fee_inr', Number(e.target.value))}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">AI markup %</label>
                  <input type="number" min="0" max="200" value={plan.ai_markup_pct}
                    onChange={(e) => update('ai_markup_pct', Number(e.target.value))}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Telephony markup %</label>
                  <input type="number" min="0" max="200" value={plan.telephony_markup_pct}
                    onChange={(e) => update('telephony_markup_pct', Number(e.target.value))}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Min floor ₹/min</label>
                  <input type="number" step="0.25" min="0" value={plan.min_floor_inr}
                    onChange={(e) => update('min_floor_inr', Number(e.target.value))}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <label className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 cursor-pointer">
                  {plan.lock_llm ? <Lock className="w-4 h-4 text-red-500" /> : <Unlock className="w-4 h-4 text-emerald-500" />}
                  <span className="text-sm font-medium">Lock LLM (prevent client switching)</span>
                  <input type="checkbox" checked={plan.lock_llm} onChange={(e) => update('lock_llm', e.target.checked)} className="ml-auto" />
                </label>
                <label className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 cursor-pointer">
                  {plan.lock_tts ? <Lock className="w-4 h-4 text-red-500" /> : <Unlock className="w-4 h-4 text-emerald-500" />}
                  <span className="text-sm font-medium">Lock TTS</span>
                  <input type="checkbox" checked={plan.lock_tts} onChange={(e) => update('lock_tts', e.target.checked)} className="ml-auto" />
                </label>
              </div>

              {expensiveLlm && !plan.lock_llm && (
                <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>Client is on an expensive LLM (<b>{catalog.llm[plan.llm].label}</b> — ₹{catalog.llm[plan.llm].cost}/min). Consider locking the LLM to prevent sticker-shock bills.</div>
                </div>
              )}

              <div className="flex justify-end mt-4">
                <button onClick={save} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save rate plan
                </button>
              </div>
            </div>

            {/* Margin card */}
            <div className="p-5 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border border-emerald-100">
              <h3 className="text-sm font-semibold text-emerald-900 mb-3 flex items-center gap-2">
                <Calculator className="w-4 h-4" /> Live margin
              </h3>
              {calc ? (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-emerald-800">Client pays</span>
                    <span className="font-bold text-emerald-900">₹{calc.per_minute}/min</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-emerald-800">Your cost</span>
                    <span className="font-mono text-emerald-900">₹{calc.your_cost_per_min}/min</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-emerald-200">
                    <span className="text-emerald-800 font-medium">Your margin</span>
                    <span className="font-bold text-emerald-900">₹{calc.margin_per_min}/min</span>
                  </div>
                  <div className="flex items-center justify-between bg-white/60 p-2 rounded-lg">
                    <span className="text-emerald-800 text-xs">Margin %</span>
                    <span className="flex items-center gap-1 font-bold text-emerald-700">
                      <TrendingUp className="w-3 h-3" />
                      {calc.margin_pct}%
                    </span>
                  </div>
                  <div className="pt-2 border-t border-emerald-200 text-xs text-emerald-800 space-y-1">
                    <div className="flex justify-between"><span>Platform fee</span><span>₹{calc.breakdown.platform_fee?.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>AI billed</span><span>₹{calc.breakdown.ai_total_billed}</span></div>
                    <div className="flex justify-between"><span>Telephony billed</span><span>₹{calc.breakdown.telephony?.billed}</span></div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-emerald-800">Load an agency to see margin.</p>
              )}
            </div>
          </div>

          {/* Manual credit */}
          <div className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-500" /> Manual wallet credit
            </h3>
            <div className="flex flex-col md:flex-row gap-3 items-end">
              <div className="flex-1">
                <label className="text-[11px] uppercase tracking-wide text-gray-500">Amount (₹)</label>
                <input type="number" min="1" step="100" value={creditAmount}
                  onChange={(e) => setCreditAmount(Number(e.target.value))}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="flex-1">
                <label className="text-[11px] uppercase tracking-wide text-gray-500">Note</label>
                <input value={creditNote} onChange={(e) => setCreditNote(e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <button onClick={doCredit}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 whitespace-nowrap">
                Credit ₹{creditAmount.toLocaleString('en-IN')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
