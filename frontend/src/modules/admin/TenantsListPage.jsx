/**
 * Tenants List — Super Admin
 * Premium redesign: indigo accent, skeleton loaders, WCAG 2.1 AA, mobile-first.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building2, Plus, Search, Users, ChevronRight, X, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { superAdminAPI } from '../../services/api'

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
      <td className="px-6 py-4"><div className="h-6 w-16 bg-slate-100 animate-pulse rounded-full" /></td>
      <td className="px-6 py-4"><div className="h-3.5 w-12 bg-slate-100 animate-pulse rounded" /></td>
      <td className="px-6 py-4"><div className="h-6 w-16 bg-slate-100 animate-pulse rounded-full" /></td>
      <td className="px-6 py-4"><div className="h-3 w-20 bg-slate-100 animate-pulse rounded" /></td>
      <td className="px-6 py-4" />
    </tr>
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
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tenants</h1>
            <p className="text-sm text-slate-500 mt-1">
              {loading ? 'Loading tenants…' : `${tenants.length} organization${tenants.length !== 1 ? 's' : ''} on the platform`}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 whitespace-nowrap"
            aria-label="Create new tenant"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            New Tenant
          </button>
        </div>

        {/* Search bar */}
        <div className="relative max-w-sm">
          <label htmlFor="tenant-search" className="sr-only">Search tenants</label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
          <input
            id="tenant-search"
            ref={searchRef}
            type="search"
            placeholder="Search by name, slug, or plan…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white ring-1 ring-slate-200/70 hover:ring-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 transition-shadow duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-0"
            aria-label="Search tenants by name, slug, or plan"
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
        <div className="md:hidden space-y-2" role="list" aria-label="Tenants list">
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
            <table className="w-full text-sm" aria-label="Tenants table" aria-busy={loading}>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-left">
                  <th scope="col" className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Tenant</th>
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
        {hasQuery ? 'No tenants match your search' : 'No tenants yet'}
      </p>
      <p className="text-sm text-slate-500 mt-1.5 max-w-xs">
        {hasQuery
          ? 'Try a different name, slug, or plan keyword.'
          : 'Create your first tenant organization to get started.'}
      </p>
    </div>
  )
}

// ── Create Tenant Modal ───────────────────────────────────────────────

function CreateTenantModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '', slug: '', max_users: 5, primary_color: '#4f46e5',
  })
  const [submitting, setSubmitting] = useState(false)
  const firstInputRef = useRef(null)
  const modalRef = useRef(null)

  // Focus trap + Escape key
  useEffect(() => {
    firstInputRef.current?.focus()

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()

      // Focus trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll(
          'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus() }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus() }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('Name is required')
    setSubmitting(true)
    try {
      await superAdminAPI.createTenant({
        ...form,
        slug: form.slug || form.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      })
      toast.success(`Tenant "${form.name}" created`)
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
      aria-hidden="false"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-tenant-title"
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl ring-1 ring-slate-200/70 overflow-hidden"
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 ring-1 ring-indigo-200/60 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-indigo-600" aria-hidden="true" />
            </div>
            <h2 id="create-tenant-title" className="text-base font-semibold text-slate-900 tracking-tight">
              New Tenant
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <FormField id="ct-name" label="Tenant Name" required>
            <input
              id="ct-name"
              ref={firstInputRef}
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={INPUT_CLS}
              placeholder="Acme Corporation"
              autoComplete="organization"
              required
            />
          </FormField>

          <FormField id="ct-slug" label="Slug" hint="URL-safe identifier (auto-generated from name if left blank)">
            <input
              id="ct-slug"
              type="text"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              className={INPUT_CLS}
              placeholder="acme"
            />
          </FormField>

          <FormField id="ct-maxusers" label="Max Users">
            <input
              id="ct-maxusers"
              type="number"
              min="1"
              value={form.max_users}
              onChange={(e) => setForm({ ...form, max_users: parseInt(e.target.value) || 1 })}
              className={INPUT_CLS}
            />
          </FormField>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              {submitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                  Creating…
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  Create Tenant
                </>
              )}
            </button>
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
