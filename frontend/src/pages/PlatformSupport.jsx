/**
 * Platform Support — Tenant side
 * Tenant admins use this page to raise tickets to the platform team
 * (super admin) and view their tenant's ticket history.
 *
 * Lives inside the tenant DashboardLayout (path: /platform-support).
 */

import { useState, useEffect } from 'react'
import {
  Shield, Plus, Send, MessageSquare, ArrowLeft, Clock, CheckCircle,
  AlertCircle, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { platformSupportAPI } from '../services/api'
import { useRealtimeEvent } from '../contexts/RealtimeContext'

export default function PlatformSupport() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [showCreate, setShowCreate] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await platformSupportAPI.listMyTickets()
      setTickets(res.data?.tickets || [])
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load tickets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (selectedTicket) {
    return (
      <TicketDetail
        ticketId={selectedTicket}
        onBack={() => { setSelectedTicket(null); load() }}
      />
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-purple-500" />
            Platform Support
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Contact the VoiceFlow platform team for billing, bugs, feature requests, or access issues
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-sm font-medium shadow-sm"
        >
          <Plus className="w-4 h-4" />
          New Support Ticket
        </button>
      </div>

      {/* Tickets list */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {loading && <div className="py-16 text-center text-slate-500">Loading…</div>}
        {!loading && tickets.length === 0 && (
          <div className="py-16 text-center">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
            <p className="text-slate-500">No support tickets yet</p>
            <p className="text-sm text-slate-400 mt-1">Click "New Support Ticket" to contact the platform team</p>
          </div>
        )}
        {!loading && tickets.length > 0 && (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {tickets.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => setSelectedTicket(t.id)}
                  className="block w-full text-left px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <PriorityDot value={t.priority} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <StatusChip value={t.status} />
                        <span className="text-[10px] text-slate-400">·</span>
                        <span className="text-[10px] text-slate-500 capitalize">{t.category?.replace('_', ' ')}</span>
                      </div>
                      <p className="font-medium text-slate-900 dark:text-white">{t.subject}</p>
                      <p className="text-xs text-slate-500 mt-1 truncate">{t.body}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {formatTime(t.created_at)}
                        {t.reply_count > 0 && ` · ${t.reply_count} ${t.reply_count === 1 ? 'reply' : 'replies'}`}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showCreate && (
        <CreateTicketModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load() }}
        />
      )}
    </div>
  )
}

// ── Ticket detail (inline view) ─────────────────────────────────

function TicketDetail({ ticketId, onBack }) {
  const [ticket, setTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [replyText, setReplyText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    try {
      const res = await platformSupportAPI.getMyTicket(ticketId)
      setTicket(res.data)
    } catch (e) {
      toast.error('Failed to load ticket')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [ticketId])

  // ── Real-time: append super-admin replies ────────
  useRealtimeEvent('ticket.reply.created', (payload) => {
    if (payload.ticket_id !== ticketId) return
    setTicket((prev) => {
      if (!prev) return prev
      if ((prev.replies || []).some((r) => r.id === payload.id)) return prev
      return { ...prev, replies: [...(prev.replies || []), payload] }
    })
    if (payload.is_super_admin) {
      toast.success('Platform team replied', { duration: 3000 })
    }
  })

  // ── Real-time: status / resolved ────────
  useRealtimeEvent('ticket.updated', (payload) => {
    if (payload.id !== ticketId) return
    setTicket((prev) => (prev ? { ...prev, ...payload } : prev))
  })
  useRealtimeEvent('ticket.resolved', (payload) => {
    if (payload.id !== ticketId) return
    setTicket((prev) => (prev ? { ...prev, status: 'resolved', resolved_at: payload.resolved_at } : prev))
  })

  const handleReply = async (e) => {
    e.preventDefault()
    if (!replyText.trim()) return
    setSubmitting(true)
    try {
      await platformSupportAPI.replyToTicket(ticketId, replyText.trim())
      setReplyText('')
      toast.success('Reply sent')
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send reply')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="py-16 text-center text-slate-500">Loading…</div>
  if (!ticket) return null

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-slate-600 hover:text-purple-600"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to my tickets
      </button>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <StatusChip value={ticket.status} />
          <span className="text-xs text-slate-500 capitalize">{ticket.category?.replace('_', ' ')}</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{ticket.subject}</h2>
        <p className="text-xs text-slate-500 mt-1">
          {formatTime(ticket.created_at)} · You raised this ticket
        </p>
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
          {ticket.body}
        </div>
      </div>

      {(ticket.replies || []).map((r) => (
        <div
          key={r.id}
          className={`rounded-xl border p-5 ${
            r.is_super_admin
              ? 'bg-purple-50 dark:bg-purple-900/10 border-purple-200 dark:border-purple-900/40'
              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
          }`}
        >
          <div className="flex items-center gap-2 mb-2 text-xs">
            <span className="font-semibold text-slate-900 dark:text-white">
              {r.is_super_admin ? 'Platform Team' : (r.author_name || 'You')}
            </span>
            <span className="text-slate-500">· {formatTime(r.created_at)}</span>
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{r.body}</p>
        </div>
      ))}

      {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
        <form
          onSubmit={handleReply}
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5"
        >
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows={3}
            placeholder="Reply to the platform team…"
            className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40"
          />
          <div className="flex justify-end mt-3">
            <button
              type="submit"
              disabled={submitting || !replyText.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
            >
              <Send className="w-4 h-4" />
              {submitting ? 'Sending…' : 'Send Reply'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// ── Create modal ────────────────────────────────────────────────

function CreateTicketModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    subject: '', body: '', category: 'other', priority: 'medium',
  })
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (form.subject.trim().length < 3) return toast.error('Subject must be at least 3 characters')
    if (form.body.trim().length < 5) return toast.error('Please describe your issue (min 5 characters)')
    setSubmitting(true)
    try {
      await platformSupportAPI.createTicket(form)
      toast.success('Support ticket raised — the platform team will reply soon')
      onCreated()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to raise ticket')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">New Support Ticket</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Category</span>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
              >
                <option value="billing">Billing</option>
                <option value="bug">Bug Report</option>
                <option value="feature_request">Feature Request</option>
                <option value="access">Access / Login Issue</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Priority</span>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Subject</span>
            <input
              type="text"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="Brief summary of the issue"
              autoFocus
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Description</span>
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={6}
              placeholder="Describe what's happening, what you expected, any error messages, etc."
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
            >
              {submitting ? 'Raising…' : 'Raise Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────

function formatTime(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60000)
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    return `${Math.floor(diffHr / 24)}d ago`
  } catch { return '' }
}

function PriorityDot({ value }) {
  const colors = {
    urgent: 'bg-red-500',
    high: 'bg-orange-500',
    medium: 'bg-amber-500',
    low: 'bg-slate-300',
  }
  return <span className={`w-2 h-2 rounded-full mt-2 ${colors[value] || colors.medium}`} />
}

function StatusChip({ value }) {
  const styles = {
    open: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    waiting_tenant: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    resolved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    closed: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-500',
  }
  const labels = {
    waiting_tenant: 'Action needed',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${styles[value] || styles.open}`}>
      {labels[value] || value?.replace('_', ' ')}
    </span>
  )
}
