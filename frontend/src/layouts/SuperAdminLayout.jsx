/**
 * SuperAdminLayout — Light enterprise theme
 *
 * Visual language: Linear / Stripe Dashboard / Notion enterprise.
 * - White sidebar with subtle 1px right border
 * - Slate-50 page background
 * - Blue accent for active states (#2563eb)
 * - No backdrop-blur, no glow gradients, no semi-transparent layers
 * → maximum performance, calm reading experience for daily-use console
 *
 * Distinct from the tenant CRM (which uses tenant-branded amber/colors).
 */

import { useState, useEffect } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import ErrorBoundary from '../components/ErrorBoundary'
import {
 LayoutDashboard,
 Building2,
 Ticket,
 Users,
 CreditCard,
 Settings,
 LogOut,
 Shield,
 Menu,
 Bell,
 Search,
 Gauge,
 BarChart3,
 Wallet,
} from 'lucide-react'

const NAV_GROUPS = [
 {
 label: 'Overview',
 items: [
 { path: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
 ],
 },
 {
 label: 'Manage',
 items: [
 { path: '/admin/tenants', label: 'Agencies', icon: Building2 },
 { path: '/admin/users', label: 'Users', icon: Users },
 { path: '/admin/tickets', label: 'Support Tickets', icon: Ticket },
 { path: '/admin/withdrawals', label: 'Withdrawals', icon: Wallet },
 ],
 },
 {
 label: 'Platform Ops',
 items: [
 { path: '/admin/quality',          label: 'Quality Dashboard', icon: Gauge },
 { path: '/admin/combo-benchmark',  label: 'Combo Benchmark',   icon: BarChart3 },
 ],
 },
 {
 label: 'Configure',
 items: [
 { path: '/admin/pricing', label: 'Platform Pricing', icon: CreditCard },
 { path: '/admin/settings', label: 'Settings', icon: Settings },
 ],
 },
]

export default function SuperAdminLayout() {
 const { user, logout } = useAuth()
 const location = useLocation()
 const navigate = useNavigate()
 const [mobileOpen, setMobileOpen] = useState(false)

 useEffect(() => { setMobileOpen(false) }, [location.pathname])

 const handleLogout = () => {
 logout()
 navigate('/login')
 }

 const initials =
 user?.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'SA'

 const isActive = (item) => {
 if (item.exact) return location.pathname === item.path
 return location.pathname.startsWith(item.path)
 }

 return (
 <div className="min-h-screen flex bg-slate-50 text-slate-900">
 {/* ─── Sidebar ─── */}
 <aside
 className={`
 fixed inset-y-0 left-0 z-40 w-60 bg-white border-r border-slate-200
 flex flex-col transform transition-transform duration-200
 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
 lg:translate-x-0 lg:static lg:inset-auto
 `}
 >
 {/* Brand */}
 <div className="px-5 py-4 border-b border-slate-200">
 <div className="flex items-center gap-2.5">
 <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
 <Shield className="w-4 h-4 text-white" />
 </div>
 <div className="min-w-0">
 <p className="text-sm font-semibold text-slate-900 leading-tight truncate">
 VoiceFlow
 </p>
 <p className="text-[10px] uppercase tracking-wider text-slate-500 leading-tight">
 Platform Admin
 </p>
 </div>
 </div>
 </div>

 {/* Nav */}
 <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
 {NAV_GROUPS.map((group) => (
 <div key={group.label}>
 <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
 {group.label}
 </p>
 <div className="space-y-0.5">
 {group.items.map((item) => {
 const Icon = item.icon
 const active = isActive(item)
 return (
 <Link
 key={item.path}
 to={item.path}
 className={`
 flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium
 transition-colors
 ${
 active
 ? 'bg-blue-50 text-blue-700'
 : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
 }
 `}
 >
 <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
 <span className="flex-1">{item.label}</span>
 </Link>
 )
 })}
 </div>
 </div>
 ))}
 </nav>

 {/* User block */}
 <div className="border-t border-slate-200 p-3">
 <div className="flex items-center gap-2.5 px-2 py-2">
 <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-white text-xs font-semibold">
 {initials}
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-xs font-semibold text-slate-900 truncate">
 {user?.name || 'Super Admin'}
 </p>
 <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
 </div>
 </div>
 <button
 onClick={handleLogout}
 className="mt-1 w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors"
 >
 <LogOut className="w-3.5 h-3.5" />
 Sign out
 </button>
 </div>
 </aside>

 {/* Mobile overlay */}
 {mobileOpen && (
 <div
 className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden"
 onClick={() => setMobileOpen(false)}
 />
 )}

 {/* ─── Main column ─── */}
 <div className="flex-1 flex flex-col min-w-0">
 {/* Top bar */}
 <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
 <div className="flex items-center justify-between px-4 lg:px-6 h-14">
 <div className="flex items-center gap-3">
 <button
 onClick={() => setMobileOpen(true)}
 className="lg:hidden p-2 hover:bg-slate-100 rounded text-slate-600"
 >
 <Menu className="w-5 h-5" />
 </button>

 <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold uppercase tracking-wider">
 <Shield className="w-3 h-3" />
 Platform
 </span>

 <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-500">
 <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
 All systems operational
 </span>
 </div>

 <div className="flex items-center gap-1">
 {/* Search (placeholder for future) */}
 <button className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-500 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md">
 <Search className="w-3.5 h-3.5" />
 <span>Search</span>
 <kbd className="ml-2 px-1 py-0.5 text-[9px] bg-white border border-slate-200 rounded text-slate-500 font-mono">⌘K</kbd>
 </button>
 <button className="p-2 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
 <Bell className="w-4 h-4" />
 </button>
 </div>
 </div>
 </header>

 {/* Page content */}
 <main className="flex-1 p-4 lg:p-8">
 <ErrorBoundary>
 <Outlet />
 </ErrorBoundary>
 </main>

 <footer className="px-6 py-3 border-t border-slate-200 bg-white text-center text-[11px] text-slate-400">
 VoiceFlow Marketing AI · Platform Console · &copy; 2026
 </footer>
 </div>
 </div>
 )
}
