/**
 * TenantSubclientsPage — Tenant Admin
 * /voice/sub-clients
 *
 * Allows agency tenants to manage their sub-clients:
 *   Tab 1 — Sub-clients list with inline markup slider and actions
 *   Tab 2 — Tenant's own platform plan (read-only, with upgrade CTA)
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Users, Building2, Plus, Settings, Loader2, RefreshCw, Edit2,
  UserX, Eye, ChevronRight, IndianRupee, Zap, Crown, AlertCircle,
  CheckCircle, XCircle, BarChart2, X, Save,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../../services/api'

// ─── Design tokens ────────────────────────────────────────────────────────────

const PLAN_BADGE = {
  agency_starter: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
  agency_growth:  'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  agency_pro:     'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
}

// No hardcoded defaults — all plan data comes from /billing/tenant/plan API

// ─── Helpers ──────────────────────────────────────────────────────────────────

function planBadgeClass(id) {
  return PLAN_BADGE[id] || 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
}

function formatInr(n) {
  if (n === null || n === undefined) return '—'
  return Number(n).toLocaleString('en-IN')
}

function limitDisplay(v) {
  return v === null || v === undefined ? '∞' : String(v)
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2',
        active
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function StatusDot({ active }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${active ? 'bg-emerald-500' : 'bg-slate-400'}`}
      aria-hidden="true"
    />
  )
}

function MarkupSlider({ value, min, onChange }) {
  const safeMin = min && min > 0 ? min : 3.00
  return (
    <div className="flex items-center gap-2 w-full">
      <input
        type="range"
        min={safeMin}
        max={10.00}
        step={0.25}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-24 accent-indigo-600"
        aria-label="Markup rate per minute"
      />
      <span className="text-sm font-mono font-semibold text-indigo-700 whitespace-nowrap">
        ₹{Number(value).toFixed(2)}/min
      </span>
    </div>
  )
}

function EmptySubclients({ onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <Users className="w-6 h-6 text-slate-400" aria-hidden="true" />
      </div>
      <p className="font-semibold text-slate-700">No sub-clients yet</p>
      <p className="text-sm text-slate-500 mt-1.5 max-w-xs">
        Add your first client to start billing.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
      >
        <Plus className="w-4 h-4" aria-hidden="true" />
        Add Sub-client
      </button>
    </div>
  )
}

// ─── Upgrade Plan Modal ──────────────────────────────────────────────────────

function UpgradePlanModal({ currentPlanId, plans, onClose }) {
  const PLAN_ORDER = ['agency_starter', 'agency_growth', 'agency_pro']
  const currentIdx = PLAN_ORDER.indexOf(currentPlanId)

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-plan-title"
        className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl ring-1 ring-slate-200/70 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 id="upgrade-plan-title" className="text-base font-semibold text-slate-900">Choose Your Agency Plan</h2>
            <p className="text-xs text-slate-500 mt-0.5">All plans include white-label branding and sub-client management</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Plans grid */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {plans.map((plan, idx) => {
            const isCurrent = plan.id === currentPlanId
            const isUpgrade = PLAN_ORDER.indexOf(plan.id) > currentIdx
            const isTop = plan.id === 'agency_pro'

            return (
              <div
                key={plan.id}
                className={[
                  'relative rounded-2xl p-5 flex flex-col gap-3 ring-2 transition-all',
                  isCurrent
                    ? 'ring-indigo-500 bg-indigo-50'
                    : isTop
                    ? 'ring-amber-400 bg-amber-50'
                    : 'ring-slate-200 bg-white',
                ].join(' ')}
              >
                {isCurrent && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-2.5 py-0.5 bg-indigo-600 text-white text-[10px] font-bold rounded-full uppercase tracking-wide">
                    <CheckCircle className="w-3 h-3" /> Current Plan
                  </span>
                )}
                {isTop && !isCurrent && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-500 text-white text-[10px] font-bold rounded-full uppercase tracking-wide">
                    <Crown className="w-3 h-3" /> Best Value
                  </span>
                )}

                <div>
                  <p className="font-bold text-slate-900">{plan.name}</p>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-2xl font-extrabold text-slate-900">₹{formatInr(plan.monthly_fee)}</span>
                    <span className="text-xs text-slate-500">/month</span>
                  </div>
                </div>

                <div className="space-y-1.5 text-sm text-slate-700 flex-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    <span>
                      {plan.sub_client_limit === null || plan.sub_client_limit === undefined
                        ? 'Unlimited sub-clients'
                        : `Up to ${plan.sub_client_limit} sub-clients`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    <span>
                      {plan.agents_per_client === null || plan.agents_per_client === undefined
                        ? 'Unlimited agents/client'
                        : `${plan.agents_per_client} agents per client`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    <span>
                      {plan.voice_clones === null || plan.voice_clones === undefined
                        ? 'Unlimited voice clones'
                        : `${plan.voice_clones} voice clone${plan.voice_clones !== 1 ? 's' : ''}/client`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-100 mt-2">
                    <IndianRupee className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                    <span className="font-semibold text-indigo-700">
                      ₹{Number(plan.wholesale_rate).toFixed(2)}/min wholesale
                    </span>
                  </div>
                </div>

                {isCurrent ? (
                  <div className="text-center text-xs text-indigo-600 font-medium py-2">Active</div>
                ) : isUpgrade ? (
                  <button
                    type="button"
                    onClick={() => {
                      toast.success(`To upgrade to ${plan.name}, contact support@voiceflow.ai`)
                      onClose()
                    }}
                    className={[
                      'w-full py-2 rounded-xl text-sm font-semibold transition-colors',
                      isTop
                        ? 'bg-amber-500 hover:bg-amber-600 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white',
                    ].join(' ')}
                  >
                    Upgrade
                  </button>
                ) : (
                  <div className="text-center text-xs text-slate-400 font-medium py-2">Lower tier</div>
                )}
              </div>
            )
          })}
        </div>

        <div className="px-6 pb-5 text-center text-xs text-slate-400">
          To change your plan, email <a href="mailto:support@voiceflow.ai" className="text-indigo-600 hover:underline">support@voiceflow.ai</a>
        </div>
      </div>
    </div>
  )
}

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

// ─── Add Sub-client Modal ────────────────────────────────────────────────────

const INPUT_CLS =
  'w-full px-3 py-2.5 bg-slate-50 ring-1 ring-slate-200 hover:ring-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 transition-shadow focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white'

function FormField({ id, label, required, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-slate-600 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1.5 leading-snug">{hint}</p>}
    </div>
  )
}

function AddSubclientModal({ onClose, onCreated, planOptions, wholesaleRate }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    plan: planOptions[0]?.id || 'starter',
    agent_limit: '',
    markup_rate: wholesaleRate ? wholesaleRate + 0.50 : 4.00,
  })
  const [submitting, setSubmitting] = useState(false)
  const firstRef = useRef(null)
  const modalRef = useRef(null)

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }))

  useEffect(() => {
    firstRef.current?.focus()
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && modalRef.current) {
        const els = modalRef.current.querySelectorAll(
          'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        const first = els[0]
        const last = els[els.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus() }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus() }
        }
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('Name is required')
    setSubmitting(true)
    try {
      await api.post('/api/v1/billing/tenant/sub-clients', {
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        plan: form.plan,
        agent_limit: form.agent_limit ? parseInt(form.agent_limit) : undefined,
        markup_rate: form.markup_rate,
      })
      toast.success(`Sub-client "${form.name}" created`)
      onCreated()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create sub-client')
    } finally {
      setSubmitting(false)
    }
  }

  const safeMin = wholesaleRate && wholesaleRate > 0 ? wholesaleRate : 3.00

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-subclient-title"
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl ring-1 ring-slate-200/70 flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 ring-1 ring-indigo-200/60 flex items-center justify-center">
              <Users className="w-4 h-4 text-indigo-600" aria-hidden="true" />
            </div>
            <h2 id="add-subclient-title" className="text-base font-semibold text-slate-900 tracking-tight">
              Add Sub-client
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label="Close"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
            <FormField id="sc-name" label="Client Name" required>
              <input
                id="sc-name"
                ref={firstRef}
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                className={INPUT_CLS}
                placeholder="Acme Realty"
                required
              />
            </FormField>

            <FormField id="sc-email" label="Contact Email" hint="Optional — used for invoices and notifications">
              <input
                id="sc-email"
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                className={INPUT_CLS}
                placeholder="admin@acme.in"
              />
            </FormField>

            <FormField id="sc-plan" label="Plan">
              <select
                id="sc-plan"
                value={form.plan}
                onChange={(e) => set('plan', e.target.value)}
                className={INPUT_CLS}
              >
                {planOptions.length === 0 ? (
                  <option value="starter">Starter</option>
                ) : (
                  planOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || p.id}
                    </option>
                  ))
                )}
              </select>
            </FormField>

            <FormField id="sc-agents" label="Agent Limit Override" hint="Leave blank to use plan default">
              <input
                id="sc-agents"
                type="number"
                min="1"
                value={form.agent_limit}
                onChange={(e) => set('agent_limit', e.target.value)}
                className={INPUT_CLS}
                placeholder="e.g. 3"
              />
            </FormField>

            <FormField id="sc-markup" label="Markup Rate (₹/min)">
              <div className="space-y-2">
                <MarkupSlider
                  value={form.markup_rate}
                  min={safeMin}
                  onChange={(v) => set('markup_rate', v)}
                />
                <p className="text-[11px] text-slate-400">
                  Your wholesale cost: ₹{safeMin.toFixed(2)}/min.
                  Margin: ₹{(form.markup_rate - safeMin).toFixed(2)}/min
                </p>
              </div>
            </FormField>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 flex-shrink-0 bg-slate-50/50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              {submitting ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />Creating…</>
              ) : (
                <><Plus className="w-4 h-4" aria-hidden="true" />Add Client</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Sub-clients Tab ─────────────────────────────────────────────────────────

function SubclientsTab({ subclients, loading, wholesaleRate, planOptions, onRefresh }) {
  const [showAdd, setShowAdd] = useState(false)
  const [markupMap, setMarkupMap] = useState({})
  const [savingId, setSavingId] = useState(null)

  // Initialize markup map from subclients data
  useEffect(() => {
    const m = {}
    subclients.forEach((sc) => {
      m[sc.id] = sc.markup_rate ?? (wholesaleRate ? wholesaleRate + 0.50 : 4.00)
    })
    setMarkupMap(m)
  }, [subclients, wholesaleRate])

  const handleMarkupSave = async (scId) => {
    setSavingId(scId)
    try {
      await api.put(`/api/v1/billing/tenant/sub-clients/${scId}`, {
        markup_rate: markupMap[scId],
      })
      toast.success('Markup rate updated')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update markup')
    } finally {
      setSavingId(null)
    }
  }

  const handleDeactivate = async (scId, name) => {
    if (!window.confirm(`Deactivate "${name}"? They will lose access immediately.`)) return
    try {
      await api.patch(`/api/v1/billing/tenant/sub-clients/${scId}`, { is_active: false })
      toast.success(`${name} deactivated`)
      onRefresh()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to deactivate')
    }
  }

  const safeMin = wholesaleRate && wholesaleRate > 0 ? wholesaleRate : 3.00

  return (
    <>
      {/* Table header with add button */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Sub-clients</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage your white-label clients and their per-minute billing rates
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          aria-label="Add new sub-client"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Add Sub-client
        </button>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm" aria-label="Sub-clients table">
          <thead>
            <tr className="text-left border-b border-slate-100">
              <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-48">Client</th>
              <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Plan</th>
              <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Agents</th>
              <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Calls (mo)</th>
              <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Markup Rate</th>
              <th scope="col" className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
            ) : subclients.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptySubclients onAdd={() => setShowAdd(true)} />
                </td>
              </tr>
            ) : (
              subclients.map((sc) => {
                const markup = markupMap[sc.id] ?? safeMin + 0.50
                const isDirtyMarkup = markup !== (sc.markup_rate ?? safeMin + 0.50)
                return (
                  <tr key={sc.id} className="hover:bg-slate-50/70 transition-colors duration-100">
                    {/* Client name + status */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StatusDot active={sc.is_active !== false} />
                        <div>
                          <p className="font-medium text-slate-900 truncate max-w-[160px]">{sc.name}</p>
                          {sc.email && (
                            <p className="text-[11px] text-slate-400 truncate max-w-[160px]">{sc.email}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Plan badge */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold ${planBadgeClass(sc.plan)}`}>
                        {sc.plan_name || sc.plan || '—'}
                      </span>
                    </td>

                    {/* Agents used / limit */}
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-700 font-medium tabular-nums">
                        {sc.agents_used ?? 0}
                        <span className="text-slate-400">/{limitDisplay(sc.agent_limit)}</span>
                      </span>
                    </td>

                    {/* Call minutes this month */}
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-700 tabular-nums">
                        {sc.minutes_used != null ? `${sc.minutes_used.toFixed(0)} min` : '—'}
                      </span>
                    </td>

                    {/* Markup slider */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <MarkupSlider
                          value={markup}
                          min={safeMin}
                          onChange={(v) =>
                            setMarkupMap((prev) => ({ ...prev, [sc.id]: v }))
                          }
                        />
                        {isDirtyMarkup && (
                          <button
                            type="button"
                            onClick={() => handleMarkupSave(sc.id)}
                            disabled={savingId === sc.id}
                            className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                            aria-label="Save markup rate"
                            title="Save"
                          >
                            {savingId === sc.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Save className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <a
                          href={`/voice/sub-clients/${sc.id}/users`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                          aria-label={`View users for ${sc.name}`}
                        >
                          <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                          Users
                        </a>
                        <a
                          href={`/voice/sub-clients/${sc.id}/edit`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                          aria-label={`Edit ${sc.name}`}
                        >
                          <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                          Edit
                        </a>
                        {sc.is_active !== false && (
                          <button
                            type="button"
                            onClick={() => handleDeactivate(sc.id, sc.name)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                            aria-label={`Deactivate ${sc.name}`}
                          >
                            <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                            Deactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden p-4 space-y-3">
        {loading && (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-xl" aria-hidden="true" />
          ))
        )}
        {!loading && subclients.length === 0 && (
          <EmptySubclients onAdd={() => setShowAdd(true)} />
        )}
        {!loading && subclients.map((sc) => {
          const markup = markupMap[sc.id] ?? safeMin + 0.50
          const isDirtyMarkup = markup !== (sc.markup_rate ?? safeMin + 0.50)
          return (
            <div
              key={sc.id}
              className="bg-white ring-1 ring-slate-200/70 rounded-xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <StatusDot active={sc.is_active !== false} />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{sc.name}</p>
                    {sc.email && (
                      <p className="text-[11px] text-slate-400 truncate">{sc.email}</p>
                    )}
                  </div>
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold ${planBadgeClass(sc.plan)}`}>
                  {sc.plan_name || sc.plan || '—'}
                </span>
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span>Agents: <strong className="text-slate-700">{sc.agents_used ?? 0}/{limitDisplay(sc.agent_limit)}</strong></span>
                <span>Calls: <strong className="text-slate-700">{sc.minutes_used != null ? `${sc.minutes_used.toFixed(0)} min` : '—'}</strong></span>
              </div>

              <div className="flex items-center gap-2">
                <MarkupSlider
                  value={markup}
                  min={safeMin}
                  onChange={(v) =>
                    setMarkupMap((prev) => ({ ...prev, [sc.id]: v }))
                  }
                />
                {isDirtyMarkup && (
                  <button
                    type="button"
                    onClick={() => handleMarkupSave(sc.id)}
                    disabled={savingId === sc.id}
                    className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors"
                    aria-label="Save markup rate"
                  >
                    {savingId === sc.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Save className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 pt-1 border-t border-slate-100">
                <a
                  href={`/voice/sub-clients/${sc.id}/users`}
                  className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                  Users
                </a>
                <a
                  href={`/voice/sub-clients/${sc.id}/edit`}
                  className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Edit
                </a>
                {sc.is_active !== false && (
                  <button
                    type="button"
                    onClick={() => handleDeactivate(sc.id, sc.name)}
                    className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                    Deactivate
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Add Sub-client Modal */}
      {showAdd && (
        <AddSubclientModal
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); onRefresh() }}
          planOptions={planOptions}
          wholesaleRate={safeMin}
        />
      )}
    </>
  )
}

// ─── My Plan Tab ─────────────────────────────────────────────────────────────

function MyPlanTab({ tenantPlan, subclients }) {
  const [showUpgrade, setShowUpgrade] = useState(false)

  if (!tenantPlan) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <BarChart2 className="w-6 h-6 text-slate-400" aria-hidden="true" />
        </div>
        <p className="font-semibold text-slate-700">Plan information unavailable</p>
        <p className="text-sm text-slate-500 mt-1.5">Contact your platform administrator for plan details.</p>
      </div>
    )
  }

  const planId = tenantPlan.plan_id || 'agency_starter'
  const isAgencyPro = planId === 'agency_pro'
  const usedSubclients = tenantPlan.sub_client_count ?? subclients.length
  const maxSubclients = tenantPlan.sub_client_limit
  const isAtMax = maxSubclients !== null && maxSubclients !== undefined && usedSubclients >= maxSubclients
  const allPlans = tenantPlan.all_agency_plans || []

  return (
    <div className="px-5 py-5 space-y-5">
      {/* Plan header card */}
      <div className="flex items-start justify-between gap-4 p-5 bg-gradient-to-br from-slate-50 to-white ring-1 ring-slate-200/70 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 ring-1 ring-indigo-200/60 flex items-center justify-center flex-shrink-0">
            <Crown className="w-5 h-5 text-indigo-600" aria-hidden="true" />
          </div>
          <div>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${planBadgeClass(planId)}`}>
              {tenantPlan.plan_name}
            </span>
            <p className="text-xs text-slate-500 mt-1.5">
              Platform fee: <strong className="text-slate-700">₹{formatInr(tenantPlan.monthly_fee)}/month</strong>
            </p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          {isAgencyPro ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 text-xs font-medium">
              Highest plan
            </span>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              onClick={() => setShowUpgrade(true)}
            >
              <Zap className="w-3.5 h-3.5" aria-hidden="true" />
              Upgrade Plan
            </button>
          )}
        </div>
      </div>

      {/* Plan metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Sub-clients */}
        <div className="p-4 bg-white ring-1 ring-slate-200/70 rounded-xl">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Sub-clients</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">{usedSubclients}</span>
            <span className="text-sm text-slate-400 mb-0.5">/ {limitDisplay(maxSubclients)}</span>
          </div>
          {maxSubclients != null && (
            <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isAtMax ? 'bg-red-500' : 'bg-indigo-500'}`}
                style={{ width: `${Math.min((usedSubclients / maxSubclients) * 100, 100)}%` }}
                role="progressbar"
                aria-valuenow={usedSubclients}
                aria-valuemin={0}
                aria-valuemax={maxSubclients}
              />
            </div>
          )}
          {isAtMax && (
            <p className="text-[11px] text-red-600 font-medium mt-1.5 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" aria-hidden="true" />
              Sub-client limit reached
            </p>
          )}
        </div>

        {/* Agents per client */}
        <div className="p-4 bg-white ring-1 ring-slate-200/70 rounded-xl">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Agents / Client</p>
          <span className="text-2xl font-bold text-slate-900">
            {limitDisplay(tenantPlan.agents_per_client)}
          </span>
          <p className="text-[11px] text-slate-500 mt-1">Max agents per sub-client</p>
        </div>

        {/* Wholesale rate — live from API */}
        <div className="p-4 bg-white ring-1 ring-slate-200/70 rounded-xl">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Wholesale Rate</p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-900">
              ₹{Number(tenantPlan.wholesale_rate).toFixed(2)}
            </span>
            <span className="text-sm text-slate-400">/min</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Your cost per call minute</p>
        </div>

        {/* Voice clones */}
        <div className="p-4 bg-white ring-1 ring-slate-200/70 rounded-xl">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Voice Clones / Client</p>
          <span className="text-2xl font-bold text-slate-900">
            {limitDisplay(tenantPlan.voice_clones)}
          </span>
          <p className="text-[11px] text-slate-500 mt-1">Custom voice clones per sub-client</p>
        </div>
      </div>

      {/* Upgrade hint */}
      {!isAgencyPro && (
        <div className="flex items-center justify-between gap-3 p-4 bg-indigo-50 rounded-xl ring-1 ring-indigo-100">
          <div className="flex items-start gap-3">
            <Zap className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-xs text-indigo-800">
              <p className="font-semibold">Want more capacity?</p>
              <p className="mt-0.5">Upgrade to a higher plan for more sub-clients, agents per client, and a lower wholesale rate.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowUpgrade(true)}
            className="flex-shrink-0 text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline underline-offset-2"
          >
            View plans
          </button>
        </div>
      )}

      {/* Upgrade modal */}
      {showUpgrade && allPlans.length > 0 && (
        <UpgradePlanModal
          currentPlanId={planId}
          plans={allPlans}
          onClose={() => setShowUpgrade(false)}
        />
      )}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function TenantSubclientsPage() {
  const [activeTab, setActiveTab] = useState('subclients')
  const [subclients, setSubclients] = useState([])
  const [tenantPlan, setTenantPlan] = useState(null)  // from /billing/tenant/plan
  const [directPlans, setDirectPlans] = useState([])  // for sub-client modal dropdown
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [scRes, planRes, directRes] = await Promise.allSettled([
        api.get('/api/v1/billing/tenant/sub-clients'),
        api.get('/api/v1/billing/tenant/plan'),
        api.get('/api/v1/billing/subscription-plans'),  // public — direct plans for sub-client modal
      ])

      if (scRes.status === 'fulfilled') {
        setSubclients(scRes.value.data?.sub_clients || scRes.value.data || [])
      }
      if (planRes.status === 'fulfilled') {
        setTenantPlan(planRes.value.data)
      }
      if (directRes.status === 'fulfilled') {
        const plans = directRes.value.data
        if (Array.isArray(plans) && plans.length > 0) setDirectPlans(plans)
      }
    } catch {
      // Individual failures handled via allSettled
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Wholesale rate comes directly from the tenant plan API — no hardcoded fallback
  const wholesaleRate = tenantPlan?.wholesale_rate ?? 0

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-indigo-600 uppercase tracking-[0.15em] font-semibold mb-2">
            <Building2 className="w-3 h-3" aria-hidden="true" />
            Agency Management
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sub-clients</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Manage your white-label clients and billing configuration
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          aria-label="Reload sub-clients"
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
        aria-label="Sub-client sections"
        className="flex items-center gap-1 p-1 bg-slate-100 rounded-2xl w-fit"
      >
        <TabButton
          active={activeTab === 'subclients'}
          onClick={() => setActiveTab('subclients')}
        >
          <Users className="w-3.5 h-3.5" aria-hidden="true" />
          Sub-clients
          {!loading && subclients.length > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/20 text-[10px] font-bold">
              {subclients.length}
            </span>
          )}
        </TabButton>
        <TabButton
          active={activeTab === 'plan'}
          onClick={() => setActiveTab('plan')}
        >
          <Crown className="w-3.5 h-3.5" aria-hidden="true" />
          My Plan
        </TabButton>
      </nav>

      {/* Tab content */}
      <div className="bg-white ring-1 ring-slate-200/70 rounded-2xl shadow-sm overflow-hidden">
        {activeTab === 'subclients' && (
          <section aria-label="Sub-clients">
            <SubclientsTab
              subclients={subclients}
              loading={loading}
              wholesaleRate={wholesaleRate}
              planOptions={directPlans.length > 0 ? directPlans : [{ id: 'starter', name: 'Starter' }]}
              onRefresh={load}
            />
          </section>
        )}

        {activeTab === 'plan' && (
          <section aria-label="My Plan">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">My Platform Plan</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Your agency plan limits and wholesale rates set by the platform
              </p>
            </div>
            <MyPlanTab
              tenantPlan={tenantPlan}
              subclients={subclients}
            />
          </section>
        )}
      </div>
    </div>
  )
}
