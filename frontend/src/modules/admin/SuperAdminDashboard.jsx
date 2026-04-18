/**
 * Super Admin Dashboard — Platform Overview
 * Premium dark glassmorphism aesthetic, matches SuperAdminLayout.
 */

import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
 Building2, Users, Plus, Ticket, AlertCircle, ChevronRight,
 CreditCard, TrendingUp, Activity, ArrowUpRight, Sparkles,
} from 'lucide-react'
import { superAdminAPI } from '../../services/api'

export default function SuperAdminDashboard() {
 const navigate = useNavigate()
 const [stats, setStats] = useState(null)
 const [tenants, setTenants] = useState([])
 const [tickets, setTickets] = useState({ total: 0, counts_by_status: {}, tickets: [] })
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState(null)

 useEffect(() => {
 let cancelled = false
 ;(async () => {
 try {
 const [statsRes, tenantsRes, ticketsRes] = await Promise.all([
 superAdminAPI.getStats(),
 superAdminAPI.listTenants(),
 superAdminAPI.listTickets(),
 ])
 if (cancelled) return
 setStats(statsRes.data)
 setTenants(tenantsRes.data || [])
 setTickets(ticketsRes.data || { total: 0, counts_by_status: {}, tickets: [] })
 } catch (e) {
 if (!cancelled) setError(e.response?.data?.detail || e.message)
 } finally {
 if (!cancelled) setLoading(false)
 }
 })()
 return () => { cancelled = true }
 }, [])

 if (loading) return <Spinner />
 if (error) return <ErrorCard message={error} />

 const openTickets = tickets.counts_by_status?.open || 0
 const inProgressTickets = tickets.counts_by_status?.in_progress || 0
 const urgentTickets = (tickets.tickets || []).filter(t => t.priority === 'urgent' && t.status !== 'resolved').length

 const statCards = [
 { label: 'Total Tenants', value: stats?.total_tenants || 0, icon: Building2, gradient: 'from-purple-500 via-purple-600 to-indigo-600' },
 { label: 'Active Tenants', value: stats?.active_tenants || 0, icon: Activity, gradient: 'from-emerald-500 via-teal-500 to-cyan-600' },
 { label: 'Total Users', value: stats?.total_users || 0, icon: Users, gradient: 'from-blue-500 via-indigo-500 to-purple-600' },
 { label: 'Open Tickets', value: openTickets, icon: Ticket, gradient: 'from-amber-500 via-orange-500 to-red-500' },
 { label: 'Urgent', value: urgentTickets, icon: AlertCircle,gradient: 'from-rose-500 via-pink-500 to-fuchsia-600' },
 ]

 const recentTickets = (tickets.tickets || []).slice(0, 5)

 return (
 <div className="max-w-7xl mx-auto space-y-6 animate-[fadeIn_0.5s_ease-out]">
 {/* Header */}
 <div className="flex items-start justify-between flex-wrap gap-4">
 <div>
 <div className="flex items-center gap-2 text-xs text-blue-700/70 uppercase tracking-[0.2em] font-semibold mb-2">
 <Sparkles className="w-3 h-3" />
 Platform Overview
 </div>
 <h1 className="text-3xl font-bold tracking-tight">
 <span className="bg-gradient-to-br from-white via-purple-100 to-purple-300 bg-clip-text text-transparent">
 Welcome back
 </span>
 </h1>
 <p className="text-slate-500 mt-1.5 text-sm">
 Here's what's happening across your platform today.
 </p>
 </div>
 <button
 onClick={() => navigate('/admin/tenants')}
 className="group relative overflow-hidden rounded-xl"
 >
 <span className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-700 transition-transform group-hover:scale-110" />
 <span className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-700 opacity-0 group-hover:opacity-50 blur-xl transition-opacity" />
 <span className="relative flex items-center gap-2 px-5 py-2.5 text-slate-900 text-sm font-semibold">
 <Plus className="w-4 h-4" />
 New Agency
 </span>
 </button>
 </div>

 {/* Stats Grid */}
 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
 {statCards.map((s, i) => (
 <StatCard key={s.label} {...s} delay={i * 80} />
 ))}
 </div>

 {/* Two-column body */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
 {/* Recent Tickets — main column */}
 <GlassCard className="lg:col-span-2 p-0 overflow-hidden">
 <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
 <div className="flex items-center gap-3">
 <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-400/30 flex items-center justify-center">
 <Ticket className="w-4 h-4 text-blue-700" />
 </div>
 <div>
 <h2 className="text-base font-semibold text-slate-900">Recent Support Tickets</h2>
 <p className="text-[11px] text-slate-400">Latest issues raised by tenants</p>
 </div>
 </div>
 <Link
 to="/admin/tickets"
 className="text-xs text-blue-700 hover:text-blue-700 font-medium flex items-center gap-1 group"
 >
 View all
 <ArrowUpRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
 </Link>
 </div>

 <div className="divide-y divide-slate-100">
 {recentTickets.length === 0 && (
 <div className="py-16 text-center">
 <Ticket className="w-12 h-12 mx-auto mb-3 text-slate-300" />
 <p className="text-slate-400 text-sm">No support tickets yet</p>
 </div>
 )}
 {recentTickets.map((t) => (
 <Link
 key={t.id}
 to={`/admin/tickets/${t.id}`}
 className="block px-6 py-4 hover:bg-white transition-colors group"
 >
 <div className="flex items-start justify-between gap-4">
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-2 mb-1.5 flex-wrap">
 <PriorityChip value={t.priority} />
 <StatusChip value={t.status} />
 <span className="text-[11px] text-slate-300">·</span>
 <span className="text-[11px] text-slate-400">{t.tenant_name || t.tenant_id}</span>
 </div>
 <p className="font-medium text-slate-900 truncate group-hover:text-blue-700 transition-colors">{t.subject}</p>
 <p className="text-[11px] text-slate-400 mt-1">
 Raised by {t.raised_by_name || t.raised_by_email || 'unknown'}
 {t.reply_count > 0 && ` · ${t.reply_count} ${t.reply_count === 1 ? 'reply' : 'replies'}`}
 </p>
 </div>
 <ChevronRight className="w-4 h-4 text-slate-200 mt-1 transition-all group-hover:text-blue-700 group-hover:translate-x-0.5" />
 </div>
 </Link>
 ))}
 </div>
 </GlassCard>

 {/* Right column */}
 <div className="space-y-5">
 {/* Tenants quick list */}
 <GlassCard className="p-0 overflow-hidden">
 <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
 <div className="flex items-center gap-2">
 <Building2 className="w-4 h-4 text-blue-700" />
 <h3 className="text-sm font-semibold text-slate-900">Agencies</h3>
 </div>
 <Link to="/admin/tenants" className="text-[11px] text-blue-700 hover:text-blue-700">
 Manage →
 </Link>
 </div>
 <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
 {tenants.slice(0, 6).map((tenant) => (
 <Link
 key={tenant.id}
 to={`/admin/tenants/${tenant.id}`}
 className="flex items-center gap-3 px-5 py-3 hover:bg-white transition-colors"
 >
 <div
 className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-900 font-bold text-xs flex-shrink-0"
 style={{ background: tenant.primary_color || '#8b5cf6' }}
 >
 {tenant.name?.[0] || 'T'}
 </div>
 <div className="flex-1 min-w-0">
 <p className="font-medium text-slate-900 truncate text-xs">{tenant.name}</p>
 <p className="text-[10px] text-slate-400">{tenant.user_count || 0} users</p>
 </div>
 <span className={`w-1.5 h-1.5 rounded-full ${tenant.is_active ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-white/20'}`} />
 </Link>
 ))}
 {tenants.length === 0 && (
 <div className="py-8 text-center text-slate-400 text-xs">No tenants yet</div>
 )}
 </div>
 </GlassCard>

 {/* Ticket counts */}
 <GlassCard className="p-0 overflow-hidden">
 <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
 <TrendingUp className="w-4 h-4 text-blue-700" />
 <h3 className="text-sm font-semibold text-slate-900">Ticket Status</h3>
 </div>
 <div className="px-5 py-4 space-y-2.5 text-xs">
 {[
 ['Open', openTickets, 'bg-amber-400'],
 ['In Progress', inProgressTickets, 'bg-blue-400'],
 ['Waiting Tenant', tickets.counts_by_status?.waiting_tenant || 0, 'bg-purple-400'],
 ['Resolved', tickets.counts_by_status?.resolved || 0, 'bg-emerald-400'],
 ].map(([label, count, dot]) => (
 <div key={label} className="flex items-center justify-between">
 <div className="flex items-center gap-2 text-slate-600">
 <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
 {label}
 </div>
 <span className="font-bold text-slate-900 tabular-nums">{count}</span>
 </div>
 ))}
 </div>
 </GlassCard>
 </div>
 </div>

 {/* Inline keyframes for fade-in */}
 <style>{`
 @keyframes fadeIn {
 from { opacity: 0; transform: translateY(8px); }
 to { opacity: 1; transform: translateY(0); }
 }
 `}</style>
 </div>
 )
}

// ── Reusable building blocks ─────────────────────────────────

export function GlassCard({ className = '', children }) {
 return (
 <div className={`relative rounded-2xl bg-white border border-slate-200 shadow-sm shadow-[0_8px_32px_rgba(0,0,0,0.3)] ${className}`}>
 {children}
 </div>
 )
}

function StatCard({ label, value, icon: Icon, gradient, delay = 0 }) {
 return (
 <div
 className="relative group rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm p-4 hover:border-slate-300 transition-all"
 style={{ animation: `fadeIn 0.5s ease-out ${delay}ms both` }}
 >
 {/* Gradient glow on hover */}
 <div className={`absolute -inset-px rounded-2xl bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-20 blur-xl transition-opacity`} />

 {/* Icon */}
 <div className={`relative w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-3 shadow-lg`}>
 <Icon className="w-4 h-4 text-slate-900" />
 </div>

 <p className="relative text-2xl font-bold text-slate-900 tabular-nums">{Number(value).toLocaleString()}</p>
 <p className="relative text-[11px] text-slate-400 mt-0.5">{label}</p>
 </div>
 )
}

function Spinner() {
 return (
 <div className="flex items-center justify-center h-64">
 <div className="relative">
 <div className="w-10 h-10 border-2 border-slate-200 rounded-full" />
 <div className="absolute inset-0 w-10 h-10 border-2 border-transparent border-t-blue-600 rounded-full animate-spin" />
 </div>
 </div>
 )
}

function ErrorCard({ message }) {
 return (
 <div className="max-w-2xl mx-auto rounded-2xl bg-red-500/10 backdrop-blur border border-red-500/30 p-6 text-red-200">
 <div className="flex items-center gap-2 font-semibold mb-2">
 <AlertCircle className="w-5 h-5" /> Failed to load dashboard
 </div>
 <p className="text-sm">{message}</p>
 </div>
 )
}

function PriorityChip({ value }) {
 const styles = {
 urgent: 'bg-red-500/20 text-red-300 border border-red-400/30',
 high: 'bg-orange-500/20 text-orange-300 border border-orange-400/30',
 medium: 'bg-amber-500/20 text-amber-700 border border-amber-400/30',
 low: 'bg-white/5 text-slate-500 border border-slate-200',
 }
 return (
 <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${styles[value] || styles.medium}`}>
 {value}
 </span>
 )
}

function StatusChip({ value }) {
 const styles = {
 open: 'bg-amber-50 text-amber-700 border border-amber-200',
 in_progress: 'bg-blue-50 text-blue-700 border border-blue-200',
 waiting_tenant: 'bg-purple-50 text-purple-700 border border-purple-200',
 resolved: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
 closed: 'bg-white/5 text-slate-400 border border-slate-200',
 }
 return (
 <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${styles[value] || styles.open}`}>
 {value?.replace('_', ' ')}
 </span>
 )
}
