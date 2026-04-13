/**
 * Platform Tickets Inbox — Super Admin
 * Inbox of support tickets raised by tenant admins.
 */

import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Ticket, Search, Filter, AlertCircle, Building2, Clock, Wifi, WifiOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { superAdminAPI } from '../../services/api'
import { useRealtime, useRealtimeEvent } from '../../contexts/RealtimeContext'

const STATUS_FILTERS = [
 { value: '', label: 'All' },
 { value: 'open', label: 'Open' },
 { value: 'in_progress', label: 'In Progress' },
 { value: 'waiting_tenant', label: 'Waiting Tenant' },
 { value: 'resolved', label: 'Resolved' },
 { value: 'closed', label: 'Closed' },
]

export default function PlatformTicketsInbox() {
 const [data, setData] = useState({ tickets: [], total: 0, counts_by_status: {} })
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState(null)
 const [statusFilter, setStatusFilter] = useState('')
 const [priorityFilter, setPriorityFilter] = useState('')
 const [query, setQuery] = useState('')

 const load = async () => {
 setLoading(true)
 try {
 const params = {}
 if (statusFilter) params.status = statusFilter
 if (priorityFilter) params.priority = priorityFilter
 const res = await superAdminAPI.listTickets(params)
 setData(res.data || { tickets: [], total: 0, counts_by_status: {} })
 setError(null)
 } catch (e) {
 setError(e.response?.data?.detail || e.message)
 } finally {
 setLoading(false)
 }
 }

 useEffect(() => { load() }, [statusFilter, priorityFilter])

 const { connected } = useRealtime()

 // ── Real-time: prepend new tickets as they arrive ────────
 useRealtimeEvent('ticket.created', (payload) => {
 setData((prev) => {
 // Don't dupe if already in list (e.g. on a fresh page reload race)
 if (prev.tickets?.some((t) => t.id === payload.id)) return prev
 const newCounts = { ...(prev.counts_by_status || {}) }
 const status = payload.status || 'open'
 newCounts[status] = (newCounts[status] || 0) + 1
 return {
 ...prev,
 tickets: [payload, ...(prev.tickets || [])],
 total: (prev.total || 0) + 1,
 counts_by_status: newCounts,
 }
 })
 toast.success(`New ticket: ${payload.subject}`, { duration: 4000, icon: '🎫' })
 })

 // ── Real-time: status / priority changes ─────────────────
 useRealtimeEvent('ticket.updated', (payload) => {
 setData((prev) => ({
 ...prev,
 tickets: (prev.tickets || []).map((t) => (t.id === payload.id ? { ...t, ...payload } : t)),
 }))
 })

 // ── Real-time: ticket resolved → update status in list ───
 useRealtimeEvent('ticket.resolved', (payload) => {
 setData((prev) => ({
 ...prev,
 tickets: (prev.tickets || []).map((t) =>
 t.id === payload.id ? { ...t, status: 'resolved', resolved_at: payload.resolved_at } : t
 ),
 }))
 })

 // ── Real-time: bump reply_count when a reply lands ───────
 useRealtimeEvent('ticket.reply.created', (payload) => {
 setData((prev) => ({
 ...prev,
 tickets: (prev.tickets || []).map((t) =>
 t.id === payload.ticket_id ? { ...t, reply_count: (t.reply_count || 0) + 1 } : t
 ),
 }))
 })

 const filteredTickets = useMemo(() => {
 if (!query.trim()) return data.tickets
 const q = query.toLowerCase()
 return (data.tickets || []).filter((t) =>
 t.subject?.toLowerCase().includes(q) ||
 t.body?.toLowerCase().includes(q) ||
 t.tenant_name?.toLowerCase().includes(q) ||
 t.raised_by_email?.toLowerCase().includes(q)
 )
 }, [data.tickets, query])

 return (
 <div className="max-w-7xl mx-auto space-y-6">
 {/* Header */}
 <div className="flex items-start justify-between flex-wrap gap-3">
 <div>
 <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
 <Ticket className="w-6 h-6 text-blue-600" />
 Support Tickets
 </h1>
 <p className="text-slate-500 text-sm mt-1">
 Tickets raised by tenant admins to the platform team
 </p>
 </div>
 <span
 className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${
 connected
 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
 : 'bg-slate-50 text-slate-400 border-slate-200'
 }`}
 title={connected ? 'Real-time updates active' : 'Disconnected'}
 >
 {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
 {connected ? 'Live' : 'Offline'}
 </span>
 </div>

 {/* Status counts row */}
 <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
 {[
 { key: 'open', label: 'Open', dot: 'bg-amber-400', text: 'text-amber-700', glow: 'shadow-[0_0_20px_rgba(251,191,36,0.15)]' },
 { key: 'in_progress', label: 'In Progress', dot: 'bg-blue-400', text: 'text-blue-700', glow: 'shadow-[0_0_20px_rgba(96,165,250,0.15)]' },
 { key: 'waiting_tenant', label: 'Waiting Tenant', dot: 'bg-purple-400', text: 'text-blue-700', glow: 'shadow-[0_0_20px_rgba(192,132,252,0.15)]' },
 { key: 'resolved', label: 'Resolved', dot: 'bg-emerald-400', text: 'text-emerald-700', glow: 'shadow-[0_0_20px_rgba(52,211,153,0.15)]' },
 { key: 'closed', label: 'Closed', dot: 'bg-white/30', text: 'text-slate-500', glow: '' },
 ].map(({ key, label, dot, text, glow }) => {
 const count = data.counts_by_status?.[key] || 0
 const active = statusFilter === key
 return (
 <button
 key={key}
 onClick={() => setStatusFilter(active ? '' : key)}
 className={`text-left bg-white shadow-sm border rounded-xl p-4 transition-all ${
 active
 ? `border-blue-500 ring-2 ring-blue-500/20 ${glow}`
 : 'border-slate-200 hover:border-slate-300'
 }`}
 >
 <p className="text-2xl font-bold text-slate-900 tabular-nums">{count}</p>
 <div className={`flex items-center gap-1.5 mt-1 ${text}`}>
 <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
 <span className="text-xs">{label}</span>
 </div>
 </button>
 )
 })}
 </div>

 {/* Search + filters */}
 <div className="flex flex-col sm:flex-row gap-3">
 <div className="relative flex-1 max-w-md">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
 <input
 type="text"
 placeholder="Search by subject, tenant, email…"
 value={query}
 onChange={(e) => setQuery(e.target.value)}
 className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 shadow-sm rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
 />
 </div>
 <div className="flex items-center gap-2">
 <Filter className="w-4 h-4 text-slate-400" />
 <select
 value={priorityFilter}
 onChange={(e) => setPriorityFilter(e.target.value)}
 className="px-3 py-2.5 bg-white border border-slate-200 shadow-sm rounded-xl text-sm text-slate-900"
 >
 <option value="">All priorities</option>
 <option value="urgent">Urgent</option>
 <option value="high">High</option>
 <option value="medium">Medium</option>
 <option value="low">Low</option>
 </select>
 </div>
 </div>

 {/* Tickets list */}
 <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
 {loading && (
 <div className="py-16 text-center text-slate-500">Loading tickets…</div>
 )}
 {error && (
 <div className="p-6 text-red-600 flex items-center gap-2">
 <AlertCircle className="w-5 h-5" /> {error}
 </div>
 )}
 {!loading && !error && filteredTickets.length === 0 && (
 <div className="py-16 text-center">
 <Ticket className="w-12 h-12 mx-auto mb-3 text-slate-200" />
 <p className="text-slate-500">No tickets match your filters</p>
 </div>
 )}
 {!loading && !error && filteredTickets.length > 0 && (
 <ul className="divide-y divide-slate-100">
 {filteredTickets.map((t) => (
 <li key={t.id}>
 <Link
 to={`/admin/tickets/${t.id}`}
 className="block px-6 py-4 hover:bg-slate-50 transition-colors"
 >
 <div className="flex items-start gap-4">
 {/* Priority bar */}
 <PriorityBar value={t.priority} />

 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1 flex-wrap">
 <StatusChip value={t.status} />
 <CategoryChip value={t.category} />
 {t.priority === 'urgent' && (
 <span className="text-[10px] font-bold uppercase text-red-600 flex items-center gap-0.5">
 <AlertCircle className="w-3 h-3" />
 Urgent
 </span>
 )}
 </div>
 <p className="font-semibold text-slate-900 truncate">{t.subject}</p>
 <p className="text-sm text-slate-500 truncate mt-0.5">{t.body}</p>
 <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
 <span className="inline-flex items-center gap-1">
 <Building2 className="w-3 h-3" />
 {t.tenant_name || t.tenant_id}
 </span>
 <span>·</span>
 <span>{t.raised_by_name || t.raised_by_email}</span>
 <span>·</span>
 <span className="inline-flex items-center gap-1">
 <Clock className="w-3 h-3" />
 {formatTime(t.created_at)}
 </span>
 {t.reply_count > 0 && (
 <>
 <span>·</span>
 <span className="font-medium text-blue-700">
 {t.reply_count} {t.reply_count === 1 ? 'reply' : 'replies'}
 </span>
 </>
 )}
 </div>
 </div>
 </div>
 </Link>
 </li>
 ))}
 </ul>
 )}
 </div>
 </div>
 )
}

// ── helpers ─────────────────────────────────────────────────────

function formatTime(iso) {
 if (!iso) return ''
 try {
 const d = new Date(iso)
 const now = Date.now()
 const diffMs = now - d.getTime()
 const diffMin = Math.floor(diffMs / 60000)
 if (diffMin < 1) return 'just now'
 if (diffMin < 60) return `${diffMin}m ago`
 const diffHr = Math.floor(diffMin / 60)
 if (diffHr < 24) return `${diffHr}h ago`
 const diffDay = Math.floor(diffHr / 24)
 if (diffDay < 7) return `${diffDay}d ago`
 return d.toLocaleDateString()
 } catch { return '' }
}

function PriorityBar({ value }) {
 const colors = {
 urgent: 'bg-red-500',
 high: 'bg-orange-500',
 medium: 'bg-amber-500',
 low: 'bg-slate-300',
 }
 return <div className={`w-1 self-stretch rounded-full ${colors[value] || colors.medium}`} />
}

function StatusChip({ value }) {
 const styles = {
 open: 'bg-amber-50 text-amber-700 border border-amber-200',
 in_progress: 'bg-blue-50 text-blue-700 border border-blue-200',
 waiting_tenant: 'bg-slate-100 text-slate-400 border border-slate-200',
 resolved: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
 closed: 'bg-slate-100 text-slate-400 border border-slate-200',
 }
 return (
 <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${styles[value] || styles.open}`}>
 {value?.replace('_', ' ')}
 </span>
 )
}

function CategoryChip({ value }) {
 const styles = {
 billing: 'bg-purple-50 text-purple-700 border border-purple-200',
 bug: 'bg-rose-50 text-rose-700 border border-rose-200',
 feature_request: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
 access: 'bg-cyan-50 text-cyan-700 border border-cyan-200',
 other: 'bg-slate-100 text-slate-400 border border-slate-200',
 }
 return (
 <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${styles[value] || styles.other}`}>
 {value?.replace('_', ' ')}
 </span>
 )
}
