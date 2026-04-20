/**
 * Tenants List — Super Admin
 * Premium redesign: indigo accent, skeleton loaders, WCAG 2.1 AA, mobile-first.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Plus, Search, Users, ChevronRight, X, Globe, Phone, Mail, FileText, Tag, Network } from 'lucide-react'
import toast from 'react-hot-toast'
import api, { superAdminAPI } from '../../services/api'

const COMPANY_TYPES = ['Pvt Ltd', 'LLP', 'OPC', 'Partnership', 'Proprietorship', 'Public Ltd', 'NGO', 'Other']
const INDUSTRIES = ['Real Estate', 'Healthcare', 'Education', 'Finance / BFSI', 'Retail / E-Commerce', 'Logistics', 'Hospitality', 'IT / SaaS', 'Manufacturing', 'Legal', 'Government', 'Other']
const FALLBACK_PLANS = [
  { id: 'agency_starter', name: 'Agency Starter', plan_type: 'agency' },
  { id: 'agency_growth',  name: 'Agency Growth',  plan_type: 'agency' },
  { id: 'agency_pro',     name: 'Agency Pro',     plan_type: 'agency' },
]
const PAYMENT_TERMS = ['prepaid', 'NET15', 'NET30', 'NET60']
const ONBOARDING_STATUSES = ['not_started', 'in_progress', 'completed', 'churned']

// ── Design tokens (shared via className conventions) ─────────────────
// Accent:   indigo-600 / indigo-700
// Surface:  white with ring-1 ring-slate-200/70
// Muted bg: slate-50
// Text:     slate-900 / slate-600 / slate-400

// ── Skeleton row ─────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr aria-hidden="true">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-200 animate-pulse flex-shrink-0" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-32 bg-slate-200 animate-pulse rounded" />
            <div className="h-2.5 w-20 bg-slate-100 animate-pulse rounded" />
          </div>
        </div>
      </td>
      <td className="px-6 py-4"><div className="h-6 w-20 bg-slate-100 animate-pulse rounded-full" /></td>
      <td className="px-6 py-4"><div className="h-6 w-16 bg-slate-100 animate-pulse rounded-full" /></td>
      <td className="px-6 py-4"><div className="h-3.5 w-12 bg-slate-100 animate-pulse rounded" /></td>
      <td className="px-6 py-4"><div className="h-6 w-16 bg-slate-100 animate-pulse rounded-full" /></td>
      <td className="px-6 py-4"><div className="h-3 w-20 bg-slate-100 animate-pulse rounded" /></td>
      <td className="px-6 py-4" />
    </tr>
  )
}

function PlanTypeBadge({ plan }) {
  const isAgency = plan?.includes('agency')
  return isAgency ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 ring-1 ring-violet-200">
      <Network className="w-3 h-3" aria-hidden="true" />
      Agency
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
      Direct
    </span>
  )
}

// ── Mobile tenant card ────────────────────────────────────────────────
function TenantCard({ t, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white ring-1 ring-slate-200/70 rounded-xl p-4 hover:ring-indigo-200 hover:shadow-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
      aria-label={`View details for ${t.name}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
            style={{ background: t.primary_color || '#4f46e5' }}
            aria-hidden="true"
          >
            {t.name?.[0] || 'T'}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 tracking-tight truncate">{t.name}</p>
            <p className="text-xs text-slate-500 truncate">{t.slug || t.id}</p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" aria-hidden="true" />
      </div>
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
            t.is_active
              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
              : 'bg-red-50 text-red-700 ring-1 ring-red-200'
          }`}
          role="status"
          aria-label={t.is_active ? 'Active tenant' : 'Suspended tenant'}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${t.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} aria-hidden="true" />
          {t.is_active ? 'Active' : 'Suspended'}
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
          <Users className="w-3 h-3" aria-hidden="true" />
          {t.user_count || 0}/{t.max_users || '∞'}
        </span>
      </div>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────
export default function TenantsListPage() {
  const navigate = useNavigate()
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const searchRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await superAdminAPI.listTenants()
      setTenants(res.data || [])
    } catch (e) {
      toast.error('Failed to load tenants')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = tenants.filter((t) => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      t.name?.toLowerCase().includes(q) ||
      t.slug?.toLowerCase().includes(q) ||
      t.id?.toLowerCase().includes(q)
    )
  })

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50/60 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Agencies</h1>
            <p className="text-sm text-slate-500 mt-1">
              {loading ? 'Loading agencies…' : `${tenants.length} agenc${tenants.length !== 1 ? 'ies' : 'y'} · ${tenants.filter(t => t.plan?.startsWith('agency') || t.plan_type === 'agency').length} agency plan`}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 whitespace-nowrap"
            aria-label="Create new agency"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            New Agency
          </button>
        </div>

        {/* Search bar */}
        <div className="relative max-w-sm">
          <label htmlFor="tenant-search" className="sr-only">Search agencies</label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
          <input
            id="tenant-search"
            ref={searchRef}
            type="search"
            placeholder="Search by name, slug, or ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white ring-1 ring-slate-200/70 hover:ring-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 transition-shadow duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-0"
            aria-label="Search agencies by name, slug, or ID"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); searchRef.current?.focus() }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Mobile card list */}
        <div className="md:hidden space-y-2" role="list" aria-label="Agencies list">
          {loading && (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white ring-1 ring-slate-200/70 rounded-xl p-4 space-y-3 animate-pulse" aria-hidden="true">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-200 rounded-xl" />
                  <div className="space-y-2 flex-1">
                    <div className="h-3.5 bg-slate-200 rounded w-1/2" />
                    <div className="h-2.5 bg-slate-100 rounded w-1/3" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="h-5 w-14 bg-slate-100 rounded-full" />
                  <div className="h-5 w-14 bg-slate-100 rounded-full" />
                </div>
              </div>
            ))
          )}
          {!loading && filtered.length === 0 && (
            <EmptyState hasQuery={!!query} />
          )}
          {!loading && filtered.map((t) => (
            <div key={t.id} role="listitem">
              <TenantCard t={t} onClick={() => navigate(`/admin/tenants/${t.id}`)} />
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block bg-white ring-1 ring-slate-200/70 rounded-2xl overflow-hidden shadow-sm">
          {/* Stats strip */}
          {!loading && tenants.length > 0 && (
            <div className="flex items-center gap-6 px-6 py-3 border-b border-slate-100 bg-slate-50/50">
              <Stat label="Total" value={tenants.length} />
              <Stat label="Active" value={tenants.filter(t => t.is_active).length} accent />
              <Stat label="Suspended" value={tenants.filter(t => !t.is_active).length} />
              {query && <Stat label="Matching" value={filtered.length} />}
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Agencies table" aria-busy={loading}>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-left">
                  <th scope="col" className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Agency</th>
                  <th scope="col" className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Plan</th>
                  <th scope="col" className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Users</th>
                  <th scope="col" className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th scope="col" className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Created</th>
                  <th scope="col" className="px-6 py-3 w-10"><span className="sr-only">View</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}

                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-16">
                      <EmptyState hasQuery={!!query} />
                    </td>
                  </tr>
                )}

                {!loading && filtered.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => navigate(`/admin/tenants/${t.id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/admin/tenants/${t.id}`) }}
                    tabIndex={0}
                    role="row"
                    className="group hover:bg-slate-50/80 cursor-pointer transition-colors duration-100 focus-visible:outline-none focus-visible:bg-indigo-50/40"
                    aria-label={`${t.name} — ${t.is_active ? 'active' : 'suspended'}`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0 transition-transform duration-150 group-hover:scale-105"
                          style={{ background: t.primary_color || '#4f46e5' }}
                          aria-hidden="true"
                        >
                          {t.name?.[0] || 'T'}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 tracking-tight">{t.name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{t.slug || t.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <PlanTypeBadge plan={t.plan || t.plan_id || ''} />
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 text-slate-600 text-sm">
                        <Users className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                        <span aria-label={`${t.user_count || 0} users out of ${t.max_users || 'unlimited'}`}>
                          {t.user_count || 0}<span className="text-slate-400">/{t.max_users || '∞'}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <StatusPill active={t.is_active} />
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {t.created_at ? new Date(t.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors inline" aria-hidden="true" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Create tenant modal */}
      {showCreate && (
        <CreateTenantModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load() }}
        />
      )}
    </main>
  )
}

// ── Shared UI atoms ───────────────────────────────────────────────────

function Stat({ label, value, accent }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-sm font-bold tabular-nums ${accent ? 'text-emerald-600' : 'text-slate-700'}`}>{value}</span>
      <span className="text-xs text-slate-400">{label}</span>
    </div>
  )
}

function StatusPill({ active }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
        active
          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
          : 'bg-red-50 text-red-700 ring-1 ring-red-200'
      }`}
      role="status"
      aria-label={active ? 'Tenant is active' : 'Tenant is suspended'}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-emerald-500' : 'bg-red-500'}`} aria-hidden="true" />
      {active ? 'Active' : 'Suspended'}
    </span>
  )
}

function EmptyState({ hasQuery }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        {hasQuery
          ? <Search className="w-6 h-6 text-slate-400" aria-hidden="true" />
          : <Building2 className="w-6 h-6 text-slate-400" aria-hidden="true" />
        }
      </div>
      <p className="font-semibold text-slate-700 tracking-tight">
        {hasQuery ? 'No agencies match your search' : 'No agencies yet'}
      </p>
      <p className="text-sm text-slate-500 mt-1.5 max-w-xs">
        {hasQuery
          ? 'Try a different name, slug, or plan keyword.'
          : 'Create your first agency to get started.'}
      </p>
    </div>
  )
}

// ── Create Tenant Modal ───────────────────────────────────────────────

const TABS = [
  { id: 'basic',    label: 'Basic',    icon: Building2 },
  { id: 'contact',  label: 'Contact',  icon: Phone },
  { id: 'business', label: 'Business', icon: FileText },
  { id: 'contract', label: 'Contract', icon: Tag },
]

function CreateTenantModal({ onClose, onCreated }) {
  const [tab, setTab] = useState('basic')
  const [planOptions, setPlanOptions] = useState([])
  const [form, setForm] = useState({
    // Basic
    name: '', slug: '', plan: 'agency_starter', industry: '', max_users: 0,
    max_voice_minutes: 1000, onboarding_status: 'not_started',
    // Contact
    owner_name: '', owner_email: '', owner_phone: '',
    contact_email: '', contact_phone: '',
    // Business
    company_type: '', gstin: '', pan_number: '', website_url: '',
    address: '', tags: '',
    // Contract
    billing_email: '', billing_address: '',
    contract_start_date: '', contract_end_date: '',
    monthly_billing_amount: '', payment_terms: 'prepaid',
    internal_notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const firstInputRef = useRef(null)
  const modalRef = useRef(null)

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  // Load agency plan options from API; fall back to hardcoded list on error
  useEffect(() => {
    api.get('/api/v1/admin/pricing/plans')
      .then((res) => {
        const agency = (res.data?.agency_plans || []).filter((p) => p.is_active !== false)
        if (agency.length > 0) {
          setPlanOptions(agency)
        } else {
          setPlanOptions(FALLBACK_PLANS.filter(p => p.plan_type === 'agency'))
        }
      })
      .catch(() => {
        setPlanOptions(FALLBACK_PLANS.filter(p => p.plan_type === 'agency'))
      })
  }, [])

  useEffect(() => {
    firstInputRef.current?.focus()
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll(
          'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        const first = focusable[0]; const last = focusable[focusable.length - 1]
        if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus() } }
        else { if (document.activeElement === last) { e.preventDefault(); first.focus() } }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setTab('basic'); return toast.error('Agency name is required') }
    setSubmitting(true)
    try {
      const payload = {
        ...form,
        slug: form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        max_users: parseInt(form.max_users) || 0,
        max_voice_minutes: parseInt(form.max_voice_minutes) || 1000,
        monthly_billing_amount: form.monthly_billing_amount ? parseFloat(form.monthly_billing_amount) : null,
        contract_start_date: form.contract_start_date || null,
        contract_end_date: form.contract_end_date || null,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : null,
        gstin: form.gstin.toUpperCase() || null,
        pan_number: form.pan_number.toUpperCase() || null,
      }
      await superAdminAPI.createTenant(payload)
      toast.success(`Agency "${form.name}" created`)
      onCreated()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create tenant')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-tenant-title"
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl ring-1 ring-slate-200/70 flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 ring-1 ring-indigo-200/60 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-indigo-600" />
            </div>
            <h2 id="create-tenant-title" className="text-base font-semibold text-slate-900 tracking-tight">New Agency</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-slate-100 flex-shrink-0 px-2">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-3 text-xs font-semibold border-b-2 transition-colors -mb-px focus-visible:outline-none ${
                tab === id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Scrollable form body */}
        <form onSubmit={submit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

            {/* ── Basic tab ── */}
            {tab === 'basic' && (
              <>
                <FormField id="ct-name" label="Agency / Company Name" required>
                  <input id="ct-name" ref={firstInputRef} type="text" value={form.name}
                    onChange={e => set('name', e.target.value)} className={INPUT_CLS}
                    placeholder="Acme Corporation" autoComplete="organization" required />
                </FormField>
                <FormField id="ct-slug" label="Slug" hint="URL-safe identifier — auto-generated from name if left blank">
                  <input id="ct-slug" type="text" value={form.slug}
                    onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    className={INPUT_CLS} placeholder="acme-corporation" />
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField id="ct-plan" label="Agency Plan">
                    <select id="ct-plan" value={form.plan} onChange={e => set('plan', e.target.value)} className={INPUT_CLS}>
                      {planOptions.length === 0 ? (
                        <>
                          <option value="agency_starter">Agency Starter</option>
                          <option value="agency_growth">Agency Growth</option>
                          <option value="agency_pro">Agency Pro</option>
                        </>
                      ) : (
                        planOptions.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name || p.id}
                          </option>
                        ))
                      )}
                    </select>
                  </FormField>
                  <FormField id="ct-industry" label="Industry">
                    <select id="ct-industry" value={form.industry} onChange={e => set('industry', e.target.value)} className={INPUT_CLS}>
                      <option value="">— Select —</option>
                      {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </FormField>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField id="ct-maxusers" label="Max Users" hint="0 = unlimited">
                    <input id="ct-maxusers" type="number" min="0" value={form.max_users}
                      onChange={e => set('max_users', e.target.value)} className={INPUT_CLS} />
                  </FormField>
                  <FormField id="ct-maxmins" label="Max Voice Minutes">
                    <input id="ct-maxmins" type="number" min="0" value={form.max_voice_minutes}
                      onChange={e => set('max_voice_minutes', e.target.value)} className={INPUT_CLS} />
                  </FormField>
                </div>
                <FormField id="ct-onboarding" label="Onboarding Status">
                  <select id="ct-onboarding" value={form.onboarding_status} onChange={e => set('onboarding_status', e.target.value)} className={INPUT_CLS}>
                    {ONBOARDING_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </FormField>
              </>
            )}

            {/* ── Contact tab ── */}
            {tab === 'contact' && (
              <>
                <p className="text-xs text-slate-500 -mt-1">Primary point of contact at the client's organization.</p>
                <FormField id="ct-ownername" label="Owner / POC Name">
                  <input id="ct-ownername" type="text" value={form.owner_name}
                    onChange={e => set('owner_name', e.target.value)} className={INPUT_CLS} placeholder="Rajesh Kumar" />
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField id="ct-owneremail" label="Owner Email">
                    <input id="ct-owneremail" type="email" value={form.owner_email}
                      onChange={e => set('owner_email', e.target.value)} className={INPUT_CLS} placeholder="rajesh@acme.in" />
                  </FormField>
                  <FormField id="ct-ownerphone" label="Owner Phone">
                    <input id="ct-ownerphone" type="tel" value={form.owner_phone}
                      onChange={e => set('owner_phone', e.target.value)} className={INPUT_CLS} placeholder="+91 98765 43210" />
                  </FormField>
                </div>
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs text-slate-500 mb-3">Support / general contact (can be different from owner).</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField id="ct-cemail" label="Support Email">
                      <input id="ct-cemail" type="email" value={form.contact_email}
                        onChange={e => set('contact_email', e.target.value)} className={INPUT_CLS} placeholder="support@acme.in" />
                    </FormField>
                    <FormField id="ct-cphone" label="Support Phone">
                      <input id="ct-cphone" type="tel" value={form.contact_phone}
                        onChange={e => set('contact_phone', e.target.value)} className={INPUT_CLS} placeholder="+91 80 1234 5678" />
                    </FormField>
                  </div>
                  <FormField id="ct-address" label="Office Address">
                    <textarea id="ct-address" rows={2} value={form.address}
                      onChange={e => set('address', e.target.value)}
                      className={INPUT_CLS + ' resize-none'} placeholder="123 MG Road, Bengaluru, Karnataka 560001" />
                  </FormField>
                </div>
              </>
            )}

            {/* ── Business tab ── */}
            {tab === 'business' && (
              <>
                <FormField id="ct-ctype" label="Company Type">
                  <select id="ct-ctype" value={form.company_type} onChange={e => set('company_type', e.target.value)} className={INPUT_CLS}>
                    <option value="">— Select —</option>
                    {COMPANY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField id="ct-gstin" label="GSTIN" hint="15-char GST number">
                    <input id="ct-gstin" type="text" value={form.gstin} maxLength={15}
                      onChange={e => set('gstin', e.target.value.toUpperCase())} className={INPUT_CLS}
                      placeholder="29AABCT1332L1ZT" />
                  </FormField>
                  <FormField id="ct-pan" label="PAN Number" hint="10-char PAN">
                    <input id="ct-pan" type="text" value={form.pan_number} maxLength={10}
                      onChange={e => set('pan_number', e.target.value.toUpperCase())} className={INPUT_CLS}
                      placeholder="AABCT1332L" />
                  </FormField>
                </div>
                <FormField id="ct-website" label="Website URL">
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    <input id="ct-website" type="url" value={form.website_url}
                      onChange={e => set('website_url', e.target.value)}
                      className={INPUT_CLS + ' pl-8'} placeholder="https://acme.in" />
                  </div>
                </FormField>
                <FormField id="ct-tags" label="CRM Tags" hint="Comma-separated: vip, pilot, upsell">
                  <input id="ct-tags" type="text" value={form.tags}
                    onChange={e => set('tags', e.target.value)} className={INPUT_CLS}
                    placeholder="vip, q2-2026, real-estate" />
                </FormField>
              </>
            )}

            {/* ── Contract tab ── */}
            {tab === 'contract' && (
              <>
                <FormField id="ct-billemail" label="Billing Email" hint="Who receives invoices">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    <input id="ct-billemail" type="email" value={form.billing_email}
                      onChange={e => set('billing_email', e.target.value)}
                      className={INPUT_CLS + ' pl-8'} placeholder="accounts@acme.in" />
                  </div>
                </FormField>
                <FormField id="ct-billaddr" label="Billing Address" hint="Leave blank to use office address">
                  <textarea id="ct-billaddr" rows={2} value={form.billing_address}
                    onChange={e => set('billing_address', e.target.value)}
                    className={INPUT_CLS + ' resize-none'} placeholder="Same as office / GST registered address" />
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField id="ct-cstart" label="Contract Start">
                    <input id="ct-cstart" type="date" value={form.contract_start_date}
                      onChange={e => set('contract_start_date', e.target.value)} className={INPUT_CLS} />
                  </FormField>
                  <FormField id="ct-cend" label="Contract End">
                    <input id="ct-cend" type="date" value={form.contract_end_date}
                      onChange={e => set('contract_end_date', e.target.value)} className={INPUT_CLS} />
                  </FormField>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField id="ct-mrr" label="Monthly Amount (₹)" hint="Contracted MRR">
                    <input id="ct-mrr" type="number" min="0" step="0.01" value={form.monthly_billing_amount}
                      onChange={e => set('monthly_billing_amount', e.target.value)} className={INPUT_CLS} placeholder="9999" />
                  </FormField>
                  <FormField id="ct-pterms" label="Payment Terms">
                    <select id="ct-pterms" value={form.payment_terms} onChange={e => set('payment_terms', e.target.value)} className={INPUT_CLS}>
                      {PAYMENT_TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </FormField>
                </div>
                <FormField id="ct-notes" label="Internal Notes" hint="Not visible to the tenant">
                  <textarea id="ct-notes" rows={3} value={form.internal_notes}
                    onChange={e => set('internal_notes', e.target.value)}
                    className={INPUT_CLS + ' resize-none'} placeholder="Referred by XYZ. Special pricing agreed." />
                </FormField>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-slate-100 flex-shrink-0 bg-slate-50/50">
            <p className="text-[11px] text-slate-400">
              {tab !== 'contract' ? 'Fill remaining tabs or ' : ''}
              <button type="button" onClick={() => setTab(TABS[TABS.findIndex(t => t.id === tab) + 1]?.id || 'basic')}
                className={`text-indigo-500 underline underline-offset-2 hover:text-indigo-700 ${tab === 'contract' ? 'hidden' : ''}`}>
                continue →
              </button>
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                Cancel
              </button>
              <button type="submit" disabled={submitting}
                className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                {submitting
                  ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating…</>
                  : <><Plus className="w-4 h-4" />Create Agency</>
                }
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Shared form primitives ────────────────────────────────────────────

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
