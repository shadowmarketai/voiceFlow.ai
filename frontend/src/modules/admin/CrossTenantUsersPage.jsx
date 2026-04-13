/**
 * Cross-Tenant Users — Super Admin
 * Search/filter/manage users across all tenants.
 */

import { useState, useEffect, useMemo } from 'react'
import { Users, Search, Key, Ban, CheckCircle, MoreHorizontal } from 'lucide-react'
import toast from 'react-hot-toast'
import { superAdminAPI } from '../../services/api'

export default function CrossTenantUsersPage() {
 const [users, setUsers] = useState([])
 const [tenants, setTenants] = useState([])
 const [loading, setLoading] = useState(true)
 const [query, setQuery] = useState('')
 const [tenantFilter, setTenantFilter] = useState('')
 const [roleFilter, setRoleFilter] = useState('')
 const [resetTarget, setResetTarget] = useState(null)
 const [newPwd, setNewPwd] = useState('')

 const load = async () => {
 setLoading(true)
 try {
 const params = {}
 if (tenantFilter) params.tenant_id = tenantFilter
 if (roleFilter) params.role = roleFilter
 const [uRes, tRes] = await Promise.all([
 superAdminAPI.listUsers(params),
 superAdminAPI.listTenants(),
 ])
 setUsers(uRes.data || [])
 setTenants(tRes.data || [])
 } catch (e) {
 toast.error(e.response?.data?.detail || 'Failed to load users')
 } finally {
 setLoading(false)
 }
 }

 useEffect(() => { load() }, [tenantFilter, roleFilter])

 const filtered = useMemo(() => {
 if (!query.trim()) return users
 const q = query.toLowerCase()
 return users.filter(
 (u) => u.email?.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q)
 )
 }, [users, query])

 const tenantName = (id) => tenants.find((t) => t.id === id)?.name || id || '—'

 const toggleActive = async (u) => {
 try {
 if (u.is_active) {
 await superAdminAPI.deactivateUser(u.id)
 toast.success(`Deactivated ${u.email}`)
 } else {
 await superAdminAPI.activateUser(u.id)
 toast.success(`Activated ${u.email}`)
 }
 load()
 } catch (e) {
 toast.error(e.response?.data?.detail || 'Failed')
 }
 }

 const submitReset = async (e) => {
 e.preventDefault()
 if (newPwd.length < 8) return toast.error('Password must be at least 8 characters')
 try {
 await superAdminAPI.resetUserPassword(resetTarget.id, newPwd)
 toast.success(`Password reset for ${resetTarget.email}`)
 setResetTarget(null)
 setNewPwd('')
 } catch (e) {
 toast.error(e.response?.data?.detail || 'Failed')
 }
 }

 return (
 <div className="max-w-7xl mx-auto space-y-6">
 <div>
 <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
 <Users className="w-6 h-6 text-blue-600" />
 Users
 </h1>
 <p className="text-slate-500 text-sm mt-1">
 All users across all tenants
 </p>
 </div>

 {/* Filters */}
 <div className="flex flex-col sm:flex-row gap-3">
 <div className="relative flex-1 max-w-md">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
 <input
 type="text"
 placeholder="Search by name or email…"
 value={query}
 onChange={(e) => setQuery(e.target.value)}
 className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 shadow-sm rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
 />
 </div>
 <select
 value={tenantFilter}
 onChange={(e) => setTenantFilter(e.target.value)}
 className="px-3 py-2.5 bg-white border border-slate-200 shadow-sm rounded-xl text-sm text-slate-900"
 >
 <option value="">All tenants</option>
 {tenants.map((t) => (
 <option key={t.id} value={t.id}>{t.name}</option>
 ))}
 </select>
 <select
 value={roleFilter}
 onChange={(e) => setRoleFilter(e.target.value)}
 className="px-3 py-2.5 bg-white border border-slate-200 shadow-sm rounded-xl text-sm text-slate-900"
 >
 <option value="">All roles</option>
 <option value="admin">Admin</option>
 <option value="manager">Manager</option>
 <option value="agent">Agent</option>
 <option value="user">User</option>
 <option value="viewer">Viewer</option>
 </select>
 </div>

 {/* Table */}
 <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
 {loading && <div className="py-16 text-center text-slate-500">Loading…</div>}
 {!loading && filtered.length === 0 && (
 <div className="py-16 text-center text-slate-500">No users match your filters</div>
 )}
 {!loading && filtered.length > 0 && (
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead className="bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wider">
 <tr>
 <th className="px-6 py-3 font-medium">User</th>
 <th className="px-6 py-3 font-medium">Tenant</th>
 <th className="px-6 py-3 font-medium">Role</th>
 <th className="px-6 py-3 font-medium">Status</th>
 <th className="px-6 py-3 font-medium">Actions</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-100">
 {filtered.map((u) => (
 <tr key={u.id}>
 <td className="px-6 py-3">
 <div>
 <p className="font-medium text-slate-900">{u.name || '—'}</p>
 <p className="text-xs text-slate-500">{u.email}</p>
 </div>
 </td>
 <td className="px-6 py-3 text-slate-700 text-xs">
 {tenantName(u.tenant_id)}
 </td>
 <td className="px-6 py-3">
 <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 capitalize">
 {u.role || 'user'}
 </span>
 </td>
 <td className="px-6 py-3">
 <span
 className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
 u.is_active
 ? 'bg-emerald-100 text-emerald-700'
 : 'bg-red-100 text-red-700'
 }`}
 >
 <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} />
 {u.is_active ? 'Active' : 'Inactive'}
 </span>
 </td>
 <td className="px-6 py-3">
 <div className="flex items-center gap-1">
 <button
 onClick={() => setResetTarget(u)}
 className="p-1.5 hover:bg-slate-100 rounded"
 title="Reset password"
 >
 <Key className="w-4 h-4 text-slate-500" />
 </button>
 <button
 onClick={() => toggleActive(u)}
 className="p-1.5 hover:bg-slate-100 rounded"
 title={u.is_active ? 'Deactivate' : 'Activate'}
 >
 {u.is_active ? (
 <Ban className="w-4 h-4 text-red-500" />
 ) : (
 <CheckCircle className="w-4 h-4 text-emerald-500" />
 )}
 </button>
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>

 {/* Reset password modal */}
 {resetTarget && (
 <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
 <div className="bg-white shadow-sm rounded-2xl shadow-xl w-full max-w-sm p-6">
 <h2 className="text-lg font-semibold text-slate-900 mb-1">
 Reset Password
 </h2>
 <p className="text-sm text-slate-500 mb-4">For {resetTarget.email}</p>
 <form onSubmit={submitReset}>
 <input
 type="text"
 value={newPwd}
 onChange={(e) => setNewPwd(e.target.value)}
 placeholder="New password (min 8 chars)"
 autoFocus
 className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-900 text-sm mb-4"
 />
 <div className="flex justify-end gap-2">
 <button
 type="button"
 onClick={() => { setResetTarget(null); setNewPwd('') }}
 className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
 >
 Cancel
 </button>
 <button
 type="submit"
 className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
 >
 Reset Password
 </button>
 </div>
 </form>
 </div>
 </div>
 )}
 </div>
 )
}
