/**
 * PlatformPricingPage — Super Admin
 * /admin/platform-pricing
 *
 * Manage Direct Client Plans, Agency Plans, and Recharge Packs
 * for the entire VoiceFlow AI platform.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Building2, Save, Plus, Trash2, RefreshCw, Loader2, TrendingUp,
  Users, Zap, Package, Edit2, Check, X, ChevronDown, IndianRupee, Settings,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_COST_PER_MIN = 2.50

const DEFAULT_DIRECT_PLANS = [
  { id: 'free_trial',  name: 'Free Trial',  monthly_fee: 0,    call_rate: 4.50, agents: 1,    calls_mo: 100,  voice_clones: 0,    wallet_min: 500,   is_active: true },
  { id: 'starter',     name: 'Starter',     monthly_fee: 0,    call_rate: 4.50, agents: 1,    calls_mo: null, voice_clones: 0,    wallet_min: 1000,  is_active: true },
  { id: 'growth',      name: 'Growth',      monthly_fee: 1500, call_rate: 4.00, agents: 3,    calls_mo: null, voice_clones: 1,    wallet_min: 3000,  is_active: true },
  { id: 'business',    name: 'Business',    monthly_fee: 3000, call_rate: 3.50, agents: 10,   calls_mo: null, voice_clones: 3,    wallet_min: 5000,  is_active: true },
  { id: 'enterprise',  name: 'Enterprise',  monthly_fee: 8000, call_rate: 3.00, agents: null, calls_mo: null, voice_clones: null, wallet_min: 10000, is_active: true },
]

const DEFAULT_AGENCY_PLANS = [
  { id: 'agency_starter', name: 'Agency Starter', monthly_fee: 5000,  wholesale_rate: 3.50, sub_clients: 10,   agents_per_client: 2,    voice_clones: 1,    is_active: true },
  { id: 'agency_growth',  name: 'Agency Growth',  monthly_fee: 10000, wholesale_rate: 3.00, sub_clients: 50,   agents_per_client: 5,    voice_clones: 3,    is_active: true },
  { id: 'agency_pro',     name: 'Agency Pro',     monthly_fee: 20000, wholesale_rate: 2.50, sub_clients: null, agents_per_client: null, voice_clones: null, is_active: true },
]

const DEFAULT_PACKS = [
  { id: 'pack_starter',    name: 'Starter',    price: 1000,  bonus: 0,    is_active: true },
  { id: 'pack_popular',    name: 'Popular',    price: 3000,  bonus: 150,  is_active: true },
  { id: 'pack_growth',     name: 'Growth',     price: 5000,  bonus: 400,  is_active: true },
  { id: 'pack_business',   name: 'Business',   price: 10000, bonus: 1000, is_active: true },
  { id: 'pack_enterprise', name: 'Enterprise', price: 25000, bonus: 3500, is_active: true },
]

// Plan badge colours keyed by plan id prefix
const PLAN_BADGE = {
  free_trial:     'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
  starter:        'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  growth:         'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  business:       'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  enterprise:     'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  agency_starter: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
  agency_growth:  'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
  agency_pro:     'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function planBadgeClass(id) {
  return PLAN_BADGE[id] || 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
}

function formatInr(n) {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('en-IN')
}

/** For a nullable numeric field — display value in a controlled input */
function displayVal(v) {
  if (v === null || v === undefined) return ''
  return String(v)
}

/** Parse an input string back to number or null (empty string → null = Unlimited, "0" → 0 = None) */
function parseNullable(str) {
  const trimmed = str.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return isNaN(n) ? null : n
}

/** Returns true when a nullable capacity field means "Unlimited" */
function isUnlimited(v) {
  return v === null || v === undefined
}

function parsePositive(str) {
  const n = Number(str)
  return isNaN(n) || n < 0 ? 0 : n
}

function effectiveRate(price, bonus) {
  const total = price + bonus
  if (total <= 0) return 0
  return ((price * 4.50) / total).toFixed(2)
}

function snapshot(obj) {
  return JSON.stringify(obj)
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function UnlimitedBadge() {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
      Unlimited
    </span>
  )
}

function NoneBadge() {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 ring-1 ring-red-200">
      None (0)
    </span>
  )
}

/** Compact number input for inline table editing */
function NumInput({ value, onChange, step, min, placeholder, className }) {
  return (
    <input
      type="number"
      value={value}
      onChange={onChange}
      step={step || 1}
      min={min !== undefined ? min : 0}
      placeholder={placeholder || ''}
      className={[
        'w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-900',
        'focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400',
        'bg-white placeholder:text-slate-300',
        className || '',
      ].join(' ')}
    />
  )
}

/** Toggle switch */
function Toggle({ checked, onChange, ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel || 'Toggle'}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent',
        'transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:ring-offset-1',
        checked ? 'bg-indigo-600' : 'bg-slate-200',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className={[
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow',
          'transform transition duration-200 ease-in-out',
          checked ? 'translate-x-4' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  )
}

/** Loading skeleton row for tables */
function SkeletonRow({ cols }) {
  return (
    <tr aria-hidden="true">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-7 bg-slate-100 animate-pulse rounded-lg" />
        </td>
      ))}
    </tr>
  )
}

/** Tab button */
function TabButton({ active, onClick, children, dirty }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'relative flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2',
        active
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
      ].join(' ')}
    >
      {children}
      {dirty && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0"
          aria-label="Unsaved changes"
          title="Unsaved changes"
        />
      )}
    </button>
  )
}

/** Margin insight card used below both plan tables */
function MarginCard({ cost, clientRate, label }) {
  const margin = clientRate - cost
  const pct = cost > 0 ? ((margin / clientRate) * 100).toFixed(1) : 0
  return (
    <div className="flex flex-wrap items-center gap-4 p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-100">
      <TrendingUp className="w-4 h-4 text-emerald-600 flex-shrink-0" aria-hidden="true" />
      <div className="flex items-center gap-1.5 text-sm text-emerald-800">
        <span className="font-medium">Your cost</span>
        <span className="font-mono">≈ ₹{cost.toFixed(2)}/min</span>
      </div>
      <span className="text-emerald-300" aria-hidden="true">·</span>
      <div className="flex items-center gap-1.5 text-sm text-emerald-800">
        <span className="font-medium">{label} pays</span>
        <span className="font-mono">₹{Number(clientRate).toFixed(2)}/min</span>
      </div>
      <span className="text-emerald-300" aria-hidden="true">·</span>
      <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-900">
        <span>Margin</span>
        <span className="font-mono">₹{margin.toFixed(2)}/min</span>
        <span className="text-xs text-emerald-700">({pct}%)</span>
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function PlatformPricingPage() {
  const [activeTab, setActiveTab] = useState('direct')
  const [loading, setLoading] = useState(true)

  // Plan data
  const [directPlans, setDirectPlans] = useState(DEFAULT_DIRECT_PLANS)
  const [agencyPlans, setAgencyPlans] = useState(DEFAULT_AGENCY_PLANS)
  const [packs, setPacks] = useState(DEFAULT_PACKS)

  // Save state
  const [savingPlans, setSavingPlans] = useState(false)
  const [savingAgency, setSavingAgency] = useState(false)
  const [savingPacks, setSavingPacks] = useState(false)

  // Dirty tracking (snapshot of last-saved state)
  const savedDirectRef = useRef(snapshot(DEFAULT_DIRECT_PLANS))
  const savedAgencyRef = useRef(snapshot(DEFAULT_AGENCY_PLANS))
  const savedPacksRef  = useRef(snapshot(DEFAULT_PACKS))

  const isDirtyDirect = snapshot(directPlans) !== savedDirectRef.current
  const isDirtyAgency = snapshot(agencyPlans) !== savedAgencyRef.current
  const isDirtyPacks  = snapshot(packs)       !== savedPacksRef.current

  // Focused row for margin display (direct plans)
  const [focusedDirectIdx, setFocusedDirectIdx] = useState(0)
  const [focusedAgencyIdx, setFocusedAgencyIdx] = useState(0)

  // ── Load ─────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [plansRes, packsRes] = await Promise.allSettled([
        api.get('/api/v1/admin/pricing/plans'),
        api.get('/api/v1/admin/pricing/recharge-packs'),
      ])

      if (plansRes.status === 'fulfilled') {
        const d = plansRes.value.data
        const dp = d?.direct_plans ?? d?.direct
        const ap = d?.agency_plans ?? d?.agency

        const normalizePlan = (p) => ({
          ...p,
          agents:      p.agents      ?? p.agent_limit      ?? null,
          calls_mo:    p.calls_mo    ?? p.calls_per_month  ?? null,
          monthly_fee: p.monthly_fee ?? p.price            ?? 0,
          call_rate:   p.call_rate   ?? 4.50,
          voice_clones: p.voice_clones ?? null,
          wallet_min:  p.wallet_min  ?? 0,
        })

        const normalizeAgency = (p) => ({
          ...p,
          monthly_fee:       p.monthly_fee       ?? p.price             ?? 0,
          wholesale_rate:    p.wholesale_rate    ?? 3.00,
          sub_clients:       p.sub_clients       ?? p.sub_client_limit  ?? null,
          agents_per_client: p.agents_per_client ?? null,
          voice_clones:      p.voice_clones      ?? null,
        })

        if (Array.isArray(dp) && dp.length > 0) {
          const normalized = dp.map(normalizePlan)
          setDirectPlans(normalized)
          savedDirectRef.current = snapshot(normalized)
        }
        if (Array.isArray(ap) && ap.length > 0) {
          const normalized = ap.map(normalizeAgency)
          setAgencyPlans(normalized)
          savedAgencyRef.current = snapshot(normalized)
        }
      }

      if (packsRes.status === 'fulfilled') {
        const p = packsRes.value.data
        if (Array.isArray(p) && p.length > 0) {
          setPacks(p)
          savedPacksRef.current = snapshot(p)
        }
      }
    } catch {
      // Fall through — defaults already set
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Save handlers ────────────────────────────────────────────────────────

  // Map frontend field names back to DB column names for PUT requests
  function serializeDirect(p) {
    return {
      ...p,
      plan_type:       'direct',
      agent_limit:     p.agents,
      calls_per_month: p.calls_mo,
      price:           p.monthly_fee,
    }
  }

  function serializeAgency(p) {
    return {
      ...p,
      plan_type:       'agency',
      price:           p.monthly_fee,
      sub_client_limit: p.sub_clients,
    }
  }

  const savePlans = async () => {
    setSavingPlans(true)
    try {
      await api.put('/api/v1/admin/pricing/plans', {
        direct_plans: directPlans.map(serializeDirect),
        agency_plans: agencyPlans.map(serializeAgency),
      })
      savedDirectRef.current = snapshot(directPlans)
      toast.success('Direct client plans saved')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save plans')
    } finally {
      setSavingPlans(false)
    }
  }

  const saveAgencyPlans = async () => {
    setSavingAgency(true)
    try {
      await api.put('/api/v1/admin/pricing/plans', {
        direct_plans: directPlans.map(serializeDirect),
        agency_plans: agencyPlans.map(serializeAgency),
      })
      savedAgencyRef.current = snapshot(agencyPlans)
      toast.success('Agency plans saved')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save agency plans')
    } finally {
      setSavingAgency(false)
    }
  }

  const savePacks = async () => {
    setSavingPacks(true)
    try {
      await api.put('/api/v1/admin/pricing/recharge-packs', { packs })
      savedPacksRef.current = snapshot(packs)
      toast.success('Recharge packs saved')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save packs')
    } finally {
      setSavingPacks(false)
    }
  }

  // ── Direct plan field updater ─────────────────────────────────────────────

  function updateDirect(idx, field, value) {
    setDirectPlans((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)))
  }

  function updateAgency(idx, field, value) {
    setAgencyPlans((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)))
  }

  function updatePack(idx, field, value) {
    setPacks((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)))
  }

  function deletePack(idx) {
    setPacks((prev) => prev.filter((_, i) => i !== idx))
  }

  function addPack() {
    const newPack = {
      id: `pack_${Date.now()}`,
      name: 'New Pack',
      price: 0,
      bonus: 0,
      is_active: true,
    }
    setPacks((prev) => [...prev, newPack])
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const focusedDirect = directPlans[focusedDirectIdx] || directPlans[0]
  const focusedAgency = agencyPlans[focusedAgencyIdx] || agencyPlans[0]

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-indigo-600 uppercase tracking-[0.15em] font-semibold mb-2">
            <Settings className="w-3 h-3" aria-hidden="true" />
            Platform Configuration
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Platform Pricing</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Manage call rates, plan fees, and recharge packs across all tiers
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          aria-label="Reload pricing data"
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
          )}
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <nav
        role="tablist"
        aria-label="Pricing sections"
        className="flex items-center gap-1 p-1 bg-slate-100 rounded-2xl w-fit"
      >
        <TabButton
          active={activeTab === 'direct'}
          onClick={() => setActiveTab('direct')}
          dirty={isDirtyDirect}
        >
          <Users className="w-3.5 h-3.5" aria-hidden="true" />
          Direct Client Plans
        </TabButton>
        <TabButton
          active={activeTab === 'agency'}
          onClick={() => setActiveTab('agency')}
          dirty={isDirtyAgency}
        >
          <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
          Agency Plans
        </TabButton>
        <TabButton
          active={activeTab === 'packs'}
          onClick={() => setActiveTab('packs')}
          dirty={isDirtyPacks}
        >
          <Package className="w-3.5 h-3.5" aria-hidden="true" />
          Recharge Packs
        </TabButton>
      </nav>

      {/* ── Direct Client Plans ──────────────────────────────────────────────── */}
      {activeTab === 'direct' && (
        <section aria-label="Direct Client Plans">
          <div className="bg-white ring-1 ring-slate-200/70 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Direct Client Plans</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Rates charged to individual business clients
                </p>
              </div>
              {isDirtyDirect && (
                <span className="flex items-center gap-1.5 text-xs text-amber-600 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-hidden="true" />
                  Unsaved changes
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm" role="grid" aria-label="Direct client plan editor">
                <thead>
                  <tr className="text-left border-b border-slate-100">
                    <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-36">Plan</th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Monthly Fee ₹</th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Call Rate ₹/min</th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Max Agents</th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Calls/Month</th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Voice Clones</th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Wallet Min ₹</th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={8} />)
                  ) : (
                    directPlans.map((plan, idx) => (
                      <tr
                        key={plan.id}
                        onClick={() => setFocusedDirectIdx(idx)}
                        className={[
                          'cursor-pointer transition-colors duration-100',
                          focusedDirectIdx === idx
                            ? 'bg-indigo-50/60'
                            : 'hover:bg-slate-50/70',
                        ].join(' ')}
                        aria-selected={focusedDirectIdx === idx}
                      >
                        {/* Plan name badge */}
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${planBadgeClass(plan.id)}`}>
                            {plan.name}
                          </span>
                        </td>

                        {/* Monthly fee */}
                        <td className="px-4 py-3">
                          <div className="relative w-28">
                            <IndianRupee className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" aria-hidden="true" />
                            <NumInput
                              value={plan.monthly_fee}
                              onChange={(e) => updateDirect(idx, 'monthly_fee', parsePositive(e.target.value))}
                              min={0}
                              step={100}
                              className="pl-6"
                            />
                          </div>
                        </td>

                        {/* Call rate */}
                        <td className="px-4 py-3">
                          <div className="relative w-28">
                            <IndianRupee className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" aria-hidden="true" />
                            <NumInput
                              value={plan.call_rate}
                              onChange={(e) => updateDirect(idx, 'call_rate', parsePositive(e.target.value))}
                              min={0}
                              step={0.25}
                              className="pl-6"
                            />
                          </div>
                        </td>

                        {/* Max agents (null = unlimited, 0 = none, n = limit) */}
                        <td className="px-4 py-3">
                          {isUnlimited(plan.agents) ? (
                            <div className="flex items-center gap-1.5">
                              <UnlimitedBadge />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); updateDirect(idx, 'agents', 1) }}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                                aria-label="Set a limit for agents"
                                title="Set limit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : plan.agents === 0 ? (
                            <div className="flex items-center gap-1.5">
                              <NoneBadge />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); updateDirect(idx, 'agents', 1) }}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                                aria-label="Set agents limit"
                                title="Set limit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 w-28">
                              <NumInput
                                value={displayVal(plan.agents)}
                                onChange={(e) => updateDirect(idx, 'agents', parseNullable(e.target.value))}
                                min={0}
                                placeholder="∞"
                              />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); updateDirect(idx, 'agents', null) }}
                                className="text-slate-400 hover:text-emerald-600 transition-colors flex-shrink-0"
                                aria-label="Set to unlimited"
                                title="Set unlimited"
                              >
                                <Zap className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Calls/month (null = unlimited, 0 = none, n = limit) */}
                        <td className="px-4 py-3">
                          {isUnlimited(plan.calls_mo) ? (
                            <div className="flex items-center gap-1.5">
                              <UnlimitedBadge />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); updateDirect(idx, 'calls_mo', 100) }}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                                aria-label="Set a calls per month limit"
                                title="Set limit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : plan.calls_mo === 0 ? (
                            <div className="flex items-center gap-1.5">
                              <NoneBadge />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); updateDirect(idx, 'calls_mo', 100) }}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                                aria-label="Set calls per month limit"
                                title="Set limit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 w-28">
                              <NumInput
                                value={displayVal(plan.calls_mo)}
                                onChange={(e) => updateDirect(idx, 'calls_mo', parseNullable(e.target.value))}
                                min={0}
                                placeholder="∞"
                              />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); updateDirect(idx, 'calls_mo', null) }}
                                className="text-slate-400 hover:text-emerald-600 transition-colors flex-shrink-0"
                                aria-label="Set to unlimited"
                                title="Set unlimited"
                              >
                                <Zap className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Voice clones (null = unlimited, 0 = none, n = limit) */}
                        <td className="px-4 py-3">
                          {isUnlimited(plan.voice_clones) ? (
                            <div className="flex items-center gap-1.5">
                              <UnlimitedBadge />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); updateDirect(idx, 'voice_clones', 1) }}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                                aria-label="Set a voice clones limit"
                                title="Set limit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : plan.voice_clones === 0 ? (
                            <div className="flex items-center gap-1.5">
                              <NoneBadge />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); updateDirect(idx, 'voice_clones', 1) }}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                                aria-label="Set voice clones limit"
                                title="Set limit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 w-24">
                              <NumInput
                                value={displayVal(plan.voice_clones)}
                                onChange={(e) => updateDirect(idx, 'voice_clones', parseNullable(e.target.value))}
                                min={0}
                                placeholder="∞"
                              />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); updateDirect(idx, 'voice_clones', null) }}
                                className="text-slate-400 hover:text-emerald-600 transition-colors flex-shrink-0"
                                aria-label="Set to unlimited"
                                title="Set unlimited"
                              >
                                <Zap className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Wallet min */}
                        <td className="px-4 py-3">
                          <div className="relative w-28">
                            <IndianRupee className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" aria-hidden="true" />
                            <NumInput
                              value={plan.wallet_min}
                              onChange={(e) => updateDirect(idx, 'wallet_min', parsePositive(e.target.value))}
                              min={0}
                              step={500}
                              className="pl-6"
                            />
                          </div>
                        </td>

                        {/* Active toggle */}
                        <td className="px-4 py-3 text-center">
                          <Toggle
                            checked={plan.is_active}
                            onChange={(v) => updateDirect(idx, 'is_active', v)}
                            ariaLabel={`Toggle active for ${plan.name}`}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Margin insight + save */}
            <div className="px-5 py-4 border-t border-slate-100 space-y-4">
              {!loading && focusedDirect && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">
                    Your cost vs client margin — <span className="text-indigo-600">{focusedDirect.name}</span>
                  </p>
                  <MarginCard
                    cost={PLATFORM_COST_PER_MIN}
                    clientRate={focusedDirect.call_rate}
                    label="Client"
                  />
                </div>
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={savePlans}
                  disabled={savingPlans}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                  aria-label="Save all direct plans"
                >
                  {savingPlans ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="w-4 h-4" aria-hidden="true" />
                  )}
                  Save All Plans
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Agency Plans ─────────────────────────────────────────────────────── */}
      {activeTab === 'agency' && (
        <section aria-label="Agency Plans">
          <div className="bg-white ring-1 ring-slate-200/70 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Agency Plans</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Wholesale rates for white-label agency tenants
                </p>
              </div>
              {isDirtyAgency && (
                <span className="flex items-center gap-1.5 text-xs text-amber-600 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-hidden="true" />
                  Unsaved changes
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm" role="grid" aria-label="Agency plan editor">
                <thead>
                  <tr className="text-left border-b border-slate-100">
                    <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-40">Plan</th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Platform Fee ₹/mo</th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Wholesale Rate ₹/min</th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Max Sub-clients</th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Agents/Client</th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Voice Clones</th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={7} />)
                  ) : (
                    agencyPlans.map((plan, idx) => (
                      <tr
                        key={plan.id}
                        onClick={() => setFocusedAgencyIdx(idx)}
                        className={[
                          'cursor-pointer transition-colors duration-100',
                          focusedAgencyIdx === idx
                            ? 'bg-teal-50/50'
                            : 'hover:bg-slate-50/70',
                        ].join(' ')}
                        aria-selected={focusedAgencyIdx === idx}
                      >
                        {/* Plan badge */}
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${planBadgeClass(plan.id)}`}>
                            {plan.name}
                          </span>
                        </td>

                        {/* Monthly platform fee */}
                        <td className="px-4 py-3">
                          <div className="relative w-32">
                            <IndianRupee className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" aria-hidden="true" />
                            <NumInput
                              value={plan.monthly_fee}
                              onChange={(e) => updateAgency(idx, 'monthly_fee', parsePositive(e.target.value))}
                              min={0}
                              step={500}
                              className="pl-6"
                            />
                          </div>
                        </td>

                        {/* Wholesale rate */}
                        <td className="px-4 py-3">
                          <div className="relative w-28">
                            <IndianRupee className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" aria-hidden="true" />
                            <NumInput
                              value={plan.wholesale_rate}
                              onChange={(e) => updateAgency(idx, 'wholesale_rate', parsePositive(e.target.value))}
                              min={0}
                              step={0.25}
                              className="pl-6"
                            />
                          </div>
                        </td>

                        {/* Sub-clients (null = unlimited, 0 = none, n = limit) */}
                        <td className="px-4 py-3">
                          {isUnlimited(plan.sub_clients) ? (
                            <div className="flex items-center gap-1.5">
                              <UnlimitedBadge />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); updateAgency(idx, 'sub_clients', 10) }}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                                aria-label="Set a sub-clients limit"
                                title="Set limit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : plan.sub_clients === 0 ? (
                            <div className="flex items-center gap-1.5">
                              <NoneBadge />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); updateAgency(idx, 'sub_clients', 10) }}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                                aria-label="Set sub-clients limit"
                                title="Set limit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 w-28">
                              <NumInput
                                value={displayVal(plan.sub_clients)}
                                onChange={(e) => updateAgency(idx, 'sub_clients', parseNullable(e.target.value))}
                                min={0}
                                placeholder="∞"
                              />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); updateAgency(idx, 'sub_clients', null) }}
                                className="text-slate-400 hover:text-emerald-600 transition-colors flex-shrink-0"
                                aria-label="Set to unlimited"
                                title="Set unlimited"
                              >
                                <Zap className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Agents per client (null = unlimited, 0 = none, n = limit) */}
                        <td className="px-4 py-3">
                          {isUnlimited(plan.agents_per_client) ? (
                            <div className="flex items-center gap-1.5">
                              <UnlimitedBadge />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); updateAgency(idx, 'agents_per_client', 2) }}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                                aria-label="Set agents per client limit"
                                title="Set limit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : plan.agents_per_client === 0 ? (
                            <div className="flex items-center gap-1.5">
                              <NoneBadge />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); updateAgency(idx, 'agents_per_client', 2) }}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                                aria-label="Set agents per client limit"
                                title="Set limit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 w-24">
                              <NumInput
                                value={displayVal(plan.agents_per_client)}
                                onChange={(e) => updateAgency(idx, 'agents_per_client', parseNullable(e.target.value))}
                                min={0}
                                placeholder="∞"
                              />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); updateAgency(idx, 'agents_per_client', null) }}
                                className="text-slate-400 hover:text-emerald-600 transition-colors flex-shrink-0"
                                aria-label="Set to unlimited"
                                title="Set unlimited"
                              >
                                <Zap className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Voice clones (null = unlimited, 0 = none, n = limit) */}
                        <td className="px-4 py-3">
                          {isUnlimited(plan.voice_clones) ? (
                            <div className="flex items-center gap-1.5">
                              <UnlimitedBadge />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); updateAgency(idx, 'voice_clones', 1) }}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                                aria-label="Set voice clones limit"
                                title="Set limit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : plan.voice_clones === 0 ? (
                            <div className="flex items-center gap-1.5">
                              <NoneBadge />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); updateAgency(idx, 'voice_clones', 1) }}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                                aria-label="Set voice clones limit"
                                title="Set limit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 w-24">
                              <NumInput
                                value={displayVal(plan.voice_clones)}
                                onChange={(e) => updateAgency(idx, 'voice_clones', parseNullable(e.target.value))}
                                min={0}
                                placeholder="∞"
                              />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); updateAgency(idx, 'voice_clones', null) }}
                                className="text-slate-400 hover:text-emerald-600 transition-colors flex-shrink-0"
                                aria-label="Set to unlimited"
                                title="Set unlimited"
                              >
                                <Zap className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Active toggle */}
                        <td className="px-4 py-3 text-center">
                          <Toggle
                            checked={plan.is_active}
                            onChange={(v) => updateAgency(idx, 'is_active', v)}
                            ariaLabel={`Toggle active for ${plan.name}`}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Margin insight + save */}
            <div className="px-5 py-4 border-t border-slate-100 space-y-4">
              {!loading && focusedAgency && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">
                    Your margin on agency calls — <span className="text-teal-600">{focusedAgency.name}</span>
                  </p>
                  <MarginCard
                    cost={PLATFORM_COST_PER_MIN}
                    clientRate={focusedAgency.wholesale_rate}
                    label="Agency"
                  />
                </div>
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={saveAgencyPlans}
                  disabled={savingAgency}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                  aria-label="Save agency plans"
                >
                  {savingAgency ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="w-4 h-4" aria-hidden="true" />
                  )}
                  Save Agency Plans
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Recharge Packs ───────────────────────────────────────────────────── */}
      {activeTab === 'packs' && (
        <section aria-label="Recharge Packs">
          <div className="bg-white ring-1 ring-slate-200/70 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Recharge Packs</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Wallet top-up options available to clients
                </p>
              </div>
              <div className="flex items-center gap-3">
                {isDirtyPacks && (
                  <span className="flex items-center gap-1.5 text-xs text-amber-600 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-hidden="true" />
                    Unsaved changes
                  </span>
                )}
                <button
                  type="button"
                  onClick={addPack}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
                  aria-label="Add new recharge pack"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  Add Pack
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm" role="grid" aria-label="Recharge pack editor">
                <thead>
                  <tr className="text-left border-b border-slate-100">
                    <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Pack Name</th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Price ₹</th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Bonus ₹</th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Credits</th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Eff. Rate ₹/min</th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Active</th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">
                      <span className="sr-only">Delete</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={7} />)
                  ) : packs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-slate-400 text-sm">
                        No packs yet.{' '}
                        <button
                          type="button"
                          onClick={addPack}
                          className="text-indigo-600 hover:underline font-medium"
                        >
                          Add one
                        </button>
                      </td>
                    </tr>
                  ) : (
                    packs.map((pack, idx) => {
                      const totalCredits = pack.price + pack.bonus
                      const effRate = effectiveRate(pack.price, pack.bonus)
                      return (
                        <tr key={pack.id} className="hover:bg-slate-50/70 transition-colors duration-100">
                          {/* Name */}
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={pack.name}
                              onChange={(e) => updatePack(idx, 'name', e.target.value)}
                              className="w-36 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 bg-white"
                              aria-label={`Name for pack ${idx + 1}`}
                            />
                          </td>

                          {/* Price */}
                          <td className="px-4 py-3">
                            <div className="relative w-28">
                              <IndianRupee className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" aria-hidden="true" />
                              <NumInput
                                value={pack.price}
                                onChange={(e) => updatePack(idx, 'price', parsePositive(e.target.value))}
                                min={0}
                                step={500}
                                className="pl-6"
                              />
                            </div>
                          </td>

                          {/* Bonus */}
                          <td className="px-4 py-3">
                            <div className="relative w-28">
                              <IndianRupee className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" aria-hidden="true" />
                              <NumInput
                                value={pack.bonus}
                                onChange={(e) => updatePack(idx, 'bonus', parsePositive(e.target.value))}
                                min={0}
                                step={50}
                                className="pl-6"
                              />
                            </div>
                          </td>

                          {/* Total credits (computed, readonly) */}
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700">
                              <IndianRupee className="w-3 h-3 text-slate-400" aria-hidden="true" />
                              {formatInr(totalCredits)}
                            </span>
                            {pack.bonus > 0 && (
                              <span className="ml-1.5 text-[10px] text-emerald-600 font-medium">
                                +{formatInr(pack.bonus)} bonus
                              </span>
                            )}
                          </td>

                          {/* Effective rate (computed, readonly) */}
                          <td className="px-4 py-3">
                            <span className={[
                              'inline-flex items-center gap-0.5 text-sm font-mono',
                              Number(effRate) < 3.50 ? 'text-emerald-700 font-semibold' : 'text-slate-700',
                            ].join(' ')}>
                              ₹{effRate}
                            </span>
                          </td>

                          {/* Active toggle */}
                          <td className="px-4 py-3 text-center">
                            <Toggle
                              checked={pack.is_active}
                              onChange={(v) => updatePack(idx, 'is_active', v)}
                              ariaLabel={`Toggle active for pack ${pack.name}`}
                            />
                          </td>

                          {/* Delete */}
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => deletePack(idx)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                              aria-label={`Delete pack ${pack.name}`}
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pricing note + save */}
            <div className="px-5 py-4 border-t border-slate-100 space-y-4">
              <div className="flex flex-wrap items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <Zap className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div className="text-xs text-slate-600 space-y-1">
                  <p className="font-medium text-slate-700">Effective rate formula</p>
                  <p className="font-mono text-slate-500">
                    Effective ₹/min = (Price × 4.50) ÷ (Price + Bonus)
                  </p>
                  <p className="text-slate-500">
                    Lower effective rate = better value for clients. Bonus credits reduce the per-minute cost.
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={savePacks}
                  disabled={savingPacks}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                  aria-label="Save recharge packs"
                >
                  {savingPacks ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="w-4 h-4" aria-hidden="true" />
                  )}
                  Save Packs
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
