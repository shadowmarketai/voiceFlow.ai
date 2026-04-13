/**
 * Platform Ticket Detail — Super Admin
 * View ticket + reply thread, post replies, change status/priority/assigned, resolve.
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
 ArrowLeft, Send, CheckCircle, Building2, Mail, Clock, AlertCircle, Shield,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { superAdminAPI } from '../../services/api'
import { useRealtimeEvent } from '../../contexts/RealtimeContext'

const STATUSES = [
 { value: 'open', label: 'Open' },
 { value: 'in_progress', label: 'In Progress' },
 { value: 'waiting_tenant', label: 'Waiting Tenant' },
 { value: 'resolved', label: 'Resolved' },
 { value: 'closed', label: 'Closed' },
]

const PRIORITIES = [
 { value: 'low', label: 'Low' },
 { value: 'medium', label: 'Medium' },
 { value: 'high', label: 'High' },
 { value: 'urgent', label: 'Urgent' },
]

export default function PlatformTicketDetail() {
 const { ticketId } = useParams()
 const navigate = useNavigate()
 const [ticket, setTicket] = useState(null)
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState(null)
 const [replyText, setReplyText] = useState('')
 const [submitting, setSubmitting] = useState(false)

 const load = async () => {
 setLoading(true)
 try {
 const res = await superAdminAPI.getTicket(ticketId)
 setTicket(res.data)
 setError(null)
 } catch (e) {
 setError(e.response?.data?.detail || e.message)
 } finally {
 setLoading(false)
 }
 }

 useEffect(() => { load() }, [ticketId])

 // ── Real-time: append new replies as they arrive ────────
 useRealtimeEvent('ticket.reply.created', (payload) => {
 if (payload.ticket_id !== ticketId) return
 setTicket((prev) => {
 if (!prev) return prev
 // Avoid duplicates
 if ((prev.replies || []).some((r) => r.id === payload.id)) return prev
 return { ...prev, replies: [...(prev.replies || []), payload] }
 })
 })

 // ── Real-time: status / priority change broadcast ───────
 useRealtimeEvent('ticket.updated', (payload) => {
 if (payload.id !== ticketId) return
 setTicket((prev) => (prev ? { ...prev, ...payload } : prev))
 })

 // ── Real-time: resolve event ────────────────────────────
 useRealtimeEvent('ticket.resolved', (payload) => {
 if (payload.id !== ticketId) return
 setTicket((prev) => (prev ? { ...prev, status: 'resolved', resolved_at: payload.resolved_at } : prev))
 })

 const handleStatusChange = async (newStatus) => {
 try {
 await superAdminAPI.updateTicket(ticketId, { status: newStatus })
 toast.success(`Status updated to ${newStatus.replace('_', ' ')}`)
 load()
 } catch (e) {
 toast.error(e.response?.data?.detail || 'Failed to update status')
 }
 }

 const handlePriorityChange = async (newPriority) => {
 try {
 await superAdminAPI.updateTicket(ticketId, { priority: newPriority })
 toast.success(`Priority updated to ${newPriority}`)
 load()
 } catch (e) {
 toast.error(e.response?.data?.detail || 'Failed to update priority')
 }
 }

 const handleResolve = async () => {
 if (!confirm('Mark this ticket as resolved?')) return
 try {
 await superAdminAPI.resolveTicket(ticketId)
 toast.success('Ticket resolved')
 load()
 } catch (e) {
 toast.error(e.response?.data?.detail || 'Failed to resolve ticket')
 }
 }

 const handleReply = async (e) => {
 e.preventDefault()
 if (!replyText.trim()) return
 setSubmitting(true)
 try {
 await superAdminAPI.replyToTicket(ticketId, replyText.trim())
 setReplyText('')
 toast.success('Reply posted')
 load()
 } catch (err) {
 toast.error(err.response?.data?.detail || 'Failed to post reply')
 } finally {
 setSubmitting(false)
 }
 }

 if (loading) {
 return (
 <div className="flex items-center justify-center h-64">
 <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
 </div>
 )
 }

 if (error) {
 return (
 <div className="max-w-2xl mx-auto bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
 <div className="flex items-center gap-2 font-semibold mb-2">
 <AlertCircle className="w-5 h-5" /> Error
 </div>
 <p className="text-sm">{error}</p>
 <Link to="/admin/tickets" className="mt-4 inline-block text-sm underline">← Back to inbox</Link>
 </div>
 )
 }

 if (!ticket) return null

 return (
 <div className="max-w-5xl mx-auto space-y-6">
 {/* Back link */}
 <button
 onClick={() => navigate('/admin/tickets')}
 className="flex items-center gap-2 text-sm text-slate-600 hover:text-blue-700 "
 >
 <ArrowLeft className="w-4 h-4" />
 Back to inbox
 </button>

 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 {/* Main column */}
 <div className="lg:col-span-2 space-y-4">
 {/* Ticket header */}
 <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
 <div className="flex items-start gap-3 mb-3 flex-wrap">
 <StatusChip value={ticket.status} />
 <CategoryChip value={ticket.category} />
 <PriorityChip value={ticket.priority} />
 <span className="text-xs text-slate-500 ml-auto">#{ticket.id.slice(-8)}</span>
 </div>
 <h1 className="text-xl font-bold text-slate-900">{ticket.subject}</h1>
 <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
 <span className="inline-flex items-center gap-1">
 <Building2 className="w-3 h-3" />
 {ticket.tenant_name || ticket.tenant_id}
 </span>
 <span>·</span>
 <span className="inline-flex items-center gap-1">
 <Mail className="w-3 h-3" />
 {ticket.raised_by_name || ticket.raised_by_email}
 </span>
 <span>·</span>
 <span className="inline-flex items-center gap-1">
 <Clock className="w-3 h-3" />
 {formatTime(ticket.created_at)}
 </span>
 </div>
 <div className="mt-5 pt-5 border-t border-slate-100 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
 {ticket.body}
 </div>
 </div>

 {/* Replies */}
 {(ticket.replies || []).length > 0 && (
 <div className="space-y-3">
 <h3 className="text-sm font-medium text-slate-600">
 Replies ({ticket.replies.length})
 </h3>
 {ticket.replies.map((r) => (
 <div
 key={r.id}
 className={`rounded-xl border p-5 ${
 r.is_super_admin
 ? 'bg-purple-50 border-purple-200'
 : 'bg-white shadow-sm border-slate-200'
 }`}
 >
 <div className="flex items-center gap-2 mb-2">
 <div
 className={`w-7 h-7 rounded-full flex items-center justify-center text-slate-900 text-xs font-bold ${
 r.is_super_admin
 ? 'bg-gradient-to-br from-purple-500 to-indigo-600'
 : 'bg-gradient-to-br from-amber-400 to-orange-500'
 }`}
 >
 {r.author_name?.[0] || '?'}
 </div>
 <div className="flex-1">
 <p className="text-sm font-medium text-slate-900">
 {r.author_name || r.author_email}
 {r.is_super_admin && (
 <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase text-blue-700">
 <Shield className="w-2.5 h-2.5" />
 Platform Team
 </span>
 )}
 </p>
 <p className="text-xs text-slate-500">{formatTime(r.created_at)}</p>
 </div>
 </div>
 <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed pl-9">
 {r.body}
 </p>
 </div>
 ))}
 </div>
 )}

 {/* Reply composer */}
 {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
 <form
 onSubmit={handleReply}
 className="bg-white border border-slate-200 shadow-sm rounded-xl p-5"
 >
 <p className="text-sm font-medium text-slate-700 mb-2">Reply as Platform Team</p>
 <textarea
 value={replyText}
 onChange={(e) => setReplyText(e.target.value)}
 rows={4}
 placeholder="Type your reply…"
 className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
 />
 <div className="flex justify-end mt-3">
 <button
 type="submit"
 disabled={submitting || !replyText.trim()}
 className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
 >
 <Send className="w-4 h-4" />
 {submitting ? 'Sending…' : 'Send Reply'}
 </button>
 </div>
 </form>
 )}
 </div>

 {/* Side panel */}
 <aside className="space-y-4">
 <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
 <h3 className="text-sm font-semibold text-slate-700 mb-3">Actions</h3>

 <label className="block mb-3">
 <span className="block text-xs font-medium text-slate-500 mb-1">Status</span>
 <select
 value={ticket.status}
 onChange={(e) => handleStatusChange(e.target.value)}
 className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-900 text-sm"
 >
 {STATUSES.map((s) => (
 <option key={s.value} value={s.value}>{s.label}</option>
 ))}
 </select>
 </label>

 <label className="block mb-4">
 <span className="block text-xs font-medium text-slate-500 mb-1">Priority</span>
 <select
 value={ticket.priority}
 onChange={(e) => handlePriorityChange(e.target.value)}
 className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-900 text-sm"
 >
 {PRIORITIES.map((p) => (
 <option key={p.value} value={p.value}>{p.label}</option>
 ))}
 </select>
 </label>

 {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
 <button
 onClick={handleResolve}
 className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium"
 >
 <CheckCircle className="w-4 h-4" />
 Mark Resolved
 </button>
 )}
 </div>

 <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 text-sm">
 <h3 className="text-sm font-semibold text-slate-700 mb-3">Details</h3>
 <dl className="space-y-2">
 <Detail label="Tenant" value={ticket.tenant_name || ticket.tenant_id} />
 <Detail label="Raised by" value={ticket.raised_by_name} />
 <Detail label="Email" value={ticket.raised_by_email} />
 <Detail label="Category" value={ticket.category?.replace('_', ' ')} />
 <Detail label="Created" value={formatFull(ticket.created_at)} />
 {ticket.resolved_at && (
 <Detail label="Resolved" value={formatFull(ticket.resolved_at)} />
 )}
 {ticket.assigned_to_name && (
 <Detail label="Assigned to" value={ticket.assigned_to_name} />
 )}
 </dl>
 </div>
 </aside>
 </div>
 </div>
 )
}

// ── Helpers / chips ─────────────────────────────────────────────

function Detail({ label, value }) {
 if (!value) return null
 return (
 <div className="flex justify-between text-xs">
 <dt className="text-slate-500">{label}</dt>
 <dd className="text-slate-900 font-medium text-right">{value}</dd>
 </div>
 )
}

function formatTime(iso) {
 if (!iso) return ''
 try {
 const d = new Date(iso)
 const now = Date.now()
 const diffMin = Math.floor((now - d.getTime()) / 60000)
 if (diffMin < 1) return 'just now'
 if (diffMin < 60) return `${diffMin}m ago`
 const diffHr = Math.floor(diffMin / 60)
 if (diffHr < 24) return `${diffHr}h ago`
 return `${Math.floor(diffHr / 24)}d ago`
 } catch { return '' }
}

function formatFull(iso) {
 if (!iso) return ''
 try { return new Date(iso).toLocaleString() } catch { return iso }
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
 <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[value] || styles.open}`}>
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
 <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[value] || styles.other}`}>
 {value?.replace('_', ' ')}
 </span>
 )
}

function PriorityChip({ value }) {
 const styles = {
 urgent: 'bg-red-100 text-red-700',
 high: 'bg-orange-50 text-orange-700 border border-orange-200',
 medium: 'bg-amber-50 text-amber-700 border border-amber-200',
 low: 'bg-slate-100 text-slate-400 border border-slate-200',
 }
 return (
 <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide ${styles[value] || styles.medium}`}>
 {value}
 </span>
 )
}
