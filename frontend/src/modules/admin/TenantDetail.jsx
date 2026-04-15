/**
 * Tenant Detail — Granular sub-feature toggles, branding, users
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
 ArrowLeft, Users, Palette, Save, Crown, ChevronDown, ChevronRight,
 ToggleLeft, ToggleRight, Globe, Mail, Key, UserCog, Ban, CheckCircle,
 Trash2, MoreVertical, X, Phone, Plus, UserPlus,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api, { superAdminAPI } from '../../services/api'

/* Feature list — ONLY what VoiceFlow AI actually ships.
 * Mirrors the left-sidebar items in DashboardLayout (MAIN / BUILD / DEPLOY /
 * MONITOR / CONNECT / ACCOUNT). Each row maps 1:1 to a page the tenant
 * can reach, so toggling it off truly removes access.
 */
const DEMO_FEATURES = [
 // ── Voice AI (parent) ────────────────────────────────────────────────────
 { key: 'voice_ai', name: 'Voice AI', parent_key: null, category: 'Voice AI', enabled: true, is_premium: 0, description: 'The full voice AI platform', route: '/voice/dashboard-v2' },

 // MAIN
 { key: 'voice.dashboard', name: 'Dashboard', parent_key: 'voice_ai', category: 'Voice AI', enabled: true, is_premium: 0, description: 'Voice AI overview & KPIs', route: '/voice/dashboard-v2' },
 { key: 'voice.agents', name: 'Agents', parent_key: 'voice_ai', category: 'Voice AI', enabled: true, is_premium: 0, description: 'Create & manage AI voice agents', route: '/voice/agents-list' },

 // BUILD
 { key: 'voice.knowledge', name: 'Knowledge Base', parent_key: 'voice_ai', category: 'Voice AI', enabled: true, is_premium: 0, description: 'Upload docs your agents use', route: '/voice/knowledge' },
 { key: 'voice.studio', name: 'Voice Library & Studio', parent_key: 'voice_ai', category: 'Voice AI', enabled: true, is_premium: 1, description: 'Voice cloning & library (54+ voices)', route: '/voice/studio' },

 // DEPLOY
 { key: 'voice.phone_numbers', name: 'Phone Numbers', parent_key: 'voice_ai', category: 'Voice AI', enabled: true, is_premium: 0, description: 'Inbound / outbound numbers across 7 providers', route: '/voice/phone-numbers' },
 { key: 'voice.channels', name: 'Channels', parent_key: 'voice_ai', category: 'Voice AI', enabled: true, is_premium: 0, description: 'Web widget, WhatsApp, phone, API', route: '/voice/channels' },
 { key: 'voice.campaigns', name: 'Campaigns', parent_key: 'voice_ai', category: 'Voice AI', enabled: true, is_premium: 0, description: 'Outbound dialer campaigns', route: '/voice/campaigns' },

 // MONITOR
 { key: 'voice.call_logs', name: 'Conversations', parent_key: 'voice_ai', category: 'Voice AI', enabled: true, is_premium: 0, description: 'Call logs & transcripts', route: '/voice/call-logs' },
 { key: 'voice.live_calls', name: 'Live Calls', parent_key: 'voice_ai', category: 'Voice AI', enabled: true, is_premium: 0, description: 'Real-time active call monitoring', route: '/voice/live-calls' },
 { key: 'voice.analytics', name: 'Analytics', parent_key: 'voice_ai', category: 'Voice AI', enabled: true, is_premium: 0, description: 'Call + sentiment + conversion analytics', route: '/voice/analytics-dashboard' },
 { key: 'voice.recordings', name: 'Recordings', parent_key: 'voice_ai', category: 'Voice AI', enabled: true, is_premium: 0, description: 'Audio recordings of every call', route: '/voice/recordings' },
 { key: 'voice.testing', name: 'Testing', parent_key: 'voice_ai', category: 'Voice AI', enabled: true, is_premium: 0, description: 'Testing playground for agents', route: '/voice/testing' },
 { key: 'voice.quality', name: 'Quality Dashboard', parent_key: 'voice_ai', category: 'Voice AI', enabled: true, is_premium: 0, description: 'Latency / uptime / accuracy / competitor benchmark', route: '/voice/quality' },

 // CONNECT
 { key: 'voice.integrations', name: 'Integrations', parent_key: 'voice_ai', category: 'Voice AI', enabled: true, is_premium: 0, description: 'CRM / webhook / Zapier integrations', route: '/voice/integrations' },
 { key: 'voice.api', name: 'API & Developer', parent_key: 'voice_ai', category: 'Voice AI', enabled: true, is_premium: 0, description: 'REST + WebSocket API keys', route: '/voice/api' },

 // ACCOUNT (billing group — prepaid wallet model, no subscriptions)
 { key: 'billing', name: 'Billing & Wallet', parent_key: null, category: 'Billing', enabled: true, is_premium: 0, description: 'Prepaid wallet + recharge', route: '/voice/wallet' },
 { key: 'billing.wallet', name: 'Wallet', parent_key: 'billing', category: 'Billing', enabled: true, is_premium: 0, description: 'Prepaid balance + recharge', route: '/voice/wallet' },
 { key: 'billing.tenant_pricing', name: 'My Pricing', parent_key: 'billing', category: 'Billing', enabled: true, is_premium: 0, description: 'White-label markup (tenant only)', route: '/voice/tenant-pricing' },
]

export default function TenantDetail() {
 const { tenantId } = useParams()
 const navigate = useNavigate()
 const [tenant, setTenant] = useState(null)
 const [features, setFeatures] = useState([])
 const [loading, setLoading] = useState(true)
 const [activeTab, setActiveTab] = useState('features')
 const [expandedModules, setExpandedModules] = useState({})

 useEffect(() => { loadData() }, [tenantId])

 const loadData = async () => {
 const token = localStorage.getItem('swetha_token')
 if (token === 'demo-token-123') {
 setTenant({
 id: tenantId, name: 'Swetha Structures PVT LTD', slug: 'swetha',
 plan_id: 'professional', is_active: 1, max_users: 25,
 primary_color: '#f59e0b', secondary_color: '#1e293b', accent_color: '#8b5cf6',
 app_name: 'Swetha Structures CRM', font_family: 'Inter',
 users: [
 { id: 'sw-admin', email: 'admin@swetha.in', name: 'Swetha Kumar', role: 'admin', is_active: 1, phone: '+91 98765 43210' },
 { id: 'sw-manager', email: 'manager@swetha.in', name: 'Priya Sharma', role: 'manager', is_active: 1, phone: '+91 98765 43211' },
 { id: 'sw-agent', email: 'agent@swetha.in', name: 'Rajesh Nair', role: 'agent', is_active: 1, phone: '+91 98765 43212' },
 ],
 })
 setFeatures(DEMO_FEATURES)
 // Auto-expand modules with children
 const expanded = {}
 DEMO_FEATURES.filter(f => !f.parent_key).forEach(f => { expanded[f.key] = true })
 setExpandedModules(expanded)
 setLoading(false)
 return
 }
 try {
 const [tenantRes, featuresRes] = await Promise.all([
 api.get(`/api/v1/admin/tenants/${tenantId}`),
 api.get(`/api/v1/admin/tenants/${tenantId}/features`),
 ])
 setTenant(tenantRes.data)
 setFeatures(featuresRes.data)
 const expanded = {}
 featuresRes.data.filter(f => !f.parent_key).forEach(f => { expanded[f.key] = true })
 setExpandedModules(expanded)
 } catch (err) { /* handle */ }
 finally { setLoading(false) }
 }

 const toggleFeature = async (featureKey) => {
 const feat = features.find(f => f.key === featureKey)
 const newEnabled = !feat.enabled

 // If toggling a parent module OFF, also disable all children
 // If toggling a parent module ON, also enable all children
 const isParent = !feat.parent_key
 let updatedFeatures = features.map(f => {
 if (f.key === featureKey) return { ...f, enabled: newEnabled }
 if (isParent && f.parent_key === featureKey) return { ...f, enabled: newEnabled }
 return f
 })
 setFeatures(updatedFeatures)

 const token = localStorage.getItem('swetha_token')
 if (token !== 'demo-token-123') {
 await api.put(`/api/v1/admin/tenants/${tenantId}/features/${featureKey}`, { enabled: newEnabled })
 if (isParent) {
 const children = features.filter(f => f.parent_key === featureKey)
 await Promise.all(children.map(c =>
 api.put(`/api/v1/admin/tenants/${tenantId}/features/${c.key}`, { enabled: newEnabled })
 ))
 }
 }
 }

 const toggleExpand = (key) => {
 setExpandedModules(prev => ({ ...prev, [key]: !prev[key] }))
 }

 if (loading) {
 return (
 <div className="flex items-center justify-center h-64">
 <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
 </div>
 )
 }

 // Group: parent modules
 const parentModules = features.filter(f => !f.parent_key)
 const getChildren = (parentKey) => features.filter(f => f.parent_key === parentKey)
 const enabledCount = features.filter(f => f.enabled).length
 const totalCount = features.length

 const roleColors = {
 admin: 'bg-amber-50 text-amber-700 border border-amber-200',
 manager: 'bg-blue-50 text-blue-700 border border-blue-200',
 agent: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
 user: 'bg-slate-100 text-slate-600 border border-slate-200',
 viewer: 'bg-violet-50 text-violet-700 border border-violet-200',
 }

 const tabs = [
 { id: 'features', label: 'Features', count: `${enabledCount}/${totalCount}` },
 { id: 'branding', label: 'Branding' },
 { id: 'users', label: 'Users', count: tenant?.users?.length || 0 },
 ]

 return (
 <div className="max-w-5xl mx-auto">
 {/* Header */}
 <div className="flex items-start gap-4 mb-6">
 <button onClick={() => navigate('/admin/tenants')} className="mt-1 p-2 hover:bg-slate-100 rounded-lg transition-colors">
 <ArrowLeft className="w-5 h-5 text-slate-500" />
 </button>
 <div className="flex items-center gap-4">
 <div
 className="w-14 h-14 rounded-2xl flex items-center justify-center text-slate-900 font-bold text-xl shadow-lg"
 style={{ background: `linear-gradient(135deg, ${tenant?.primary_color || '#f59e0b'}, ${tenant?.primary_color || '#f59e0b'}cc)` }}
 >
 {tenant?.name?.[0] || 'T'}
 </div>
 <div>
 <h1 className="text-2xl font-bold text-slate-900">{tenant?.name}</h1>
 <div className="flex items-center gap-3 mt-1">
 <span className="flex items-center gap-1 text-sm text-slate-500"><Globe className="w-3.5 h-3.5" /> {tenant?.slug}</span>
 </div>
 </div>
 </div>
 </div>

 {/* Tabs */}
 <div className="flex gap-1 mb-6 border-b border-slate-200">
 {tabs.map(tab => (
 <button
 key={tab.id}
 onClick={() => setActiveTab(tab.id)}
 className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
 activeTab === tab.id
 ? 'border-blue-500 text-blue-700'
 : 'border-transparent text-slate-500 hover:text-slate-700'
 }`}
 >
 {tab.label}
 {tab.count !== undefined && (
 <span className="ml-2 px-1.5 py-0.5 bg-slate-100 rounded text-xs">{tab.count}</span>
 )}
 </button>
 ))}
 </div>

 {/* Features Tab — Hierarchical */}
 {activeTab === 'features' && (
 <div className="space-y-3">
 {parentModules.map(parent => {
 const children = getChildren(parent.key)
 const hasChildren = children.length > 0
 const isExpanded = expandedModules[parent.key]
 const enabledChildren = children.filter(c => c.enabled).length

 return (
 <div key={parent.key} className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
 {/* Parent Module Header */}
 <div className="flex items-center justify-between px-5 py-4">
 <div className="flex items-center gap-3 flex-1">
 {hasChildren ? (
 <button onClick={() => toggleExpand(parent.key)} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
 {isExpanded
 ? <ChevronDown className="w-4 h-4 text-slate-400" />
 : <ChevronRight className="w-4 h-4 text-slate-400" />
 }
 </button>
 ) : (
 <div className="w-6" />
 )}
 <div className="flex-1">
 <div className="flex items-center gap-2">
 <span className="font-semibold text-slate-900">{parent.name}</span>
 {hasChildren && (
 <span className="text-xs text-slate-400 font-normal">
 {enabledChildren}/{children.length} sub-features
 </span>
 )}
 {parent.is_premium ? (
 <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-xs rounded-full font-semibold">
 <Crown className="w-3 h-3" /> Premium
 </span>
 ) : null}
 </div>
 <p className="text-sm text-slate-500 mt-0.5">{parent.description}</p>
 </div>
 </div>
 <button onClick={() => toggleFeature(parent.key)} className="ml-4 focus:outline-none">
 {parent.enabled
 ? <ToggleRight className="w-11 h-11 text-emerald-500 hover:text-emerald-600 transition-colors" />
 : <ToggleLeft className="w-11 h-11 text-slate-300 hover:text-slate-400 transition-colors" />
 }
 </button>
 </div>

 {/* Children Sub-features */}
 {hasChildren && isExpanded && parent.enabled && (
 <div className="border-t border-slate-100/50 bg-slate-50/50/50">
 {children.map((child, idx) => (
 <div
 key={child.key}
 className={`flex items-center justify-between px-5 py-3 pl-14 hover:bg-slate-100/50/20 transition-colors ${
 idx < children.length - 1 ? 'border-b border-slate-100/30' : ''
 }`}
 >
 <div className="flex-1">
 <div className="flex items-center gap-2">
 <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
 <span className="text-sm font-medium text-slate-700">{child.name}</span>
 {child.is_premium ? (
 <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-600 text-[10px] rounded-full font-semibold">
 <Crown className="w-2.5 h-2.5" /> PRO
 </span>
 ) : null}
 </div>
 <p className="text-xs text-slate-400 mt-0.5 ml-3.5">{child.description}</p>
 </div>
 <button onClick={() => toggleFeature(child.key)} className="ml-4 focus:outline-none">
 {child.enabled
 ? <ToggleRight className="w-9 h-9 text-emerald-500 hover:text-emerald-600 transition-colors" />
 : <ToggleLeft className="w-9 h-9 text-slate-300 hover:text-slate-400 transition-colors" />
 }
 </button>
 </div>
 ))}
 </div>
 )}

 {/* Collapsed indicator */}
 {hasChildren && !isExpanded && parent.enabled && (
 <div className="border-t border-slate-100/50 px-5 py-2 bg-slate-50/50/50">
 <button onClick={() => toggleExpand(parent.key)} className="text-xs text-amber-600 hover:underline">
 Show {children.length} sub-features →
 </button>
 </div>
 )}
 </div>
 )
 })}
 </div>
 )}

 {/* Branding Tab */}
 {activeTab === 'branding' && tenant && (
 <BrandingPanel tenant={tenant} onSaved={loadData} />
 )}

 {/* Users Tab — Full Management */}
 {activeTab === 'users' && (
 <UsersManager tenantId={tenantId} users={tenant?.users || []} onRefresh={loadData} />
 )}
 </div>
 )
}


// ═══════════════════════════════════════════════════════════════════
// Users Manager — Reset password, change role, activate/deactivate
// ═══════════════════════════════════════════════════════════════════

function UsersManager({ tenantId, users, onRefresh }) {
 const [actionMenu, setActionMenu] = useState(null)
 const [resetModal, setResetModal] = useState(null)
 const [newPassword, setNewPassword] = useState('')
 const [roleModal, setRoleModal] = useState(null)
 const [selectedRole, setSelectedRole] = useState('')
 const [saving, setSaving] = useState(false)
 const [message, setMessage] = useState('')
 const [createOpen, setCreateOpen] = useState(false)

 const isDemo = localStorage.getItem('swetha_token') === 'demo-token-123'

 const roleColors = {
 admin: 'bg-purple-50 text-purple-700 border border-purple-200',
 manager: 'bg-blue-50 text-blue-700 border border-blue-200',
 agent: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
 user: 'bg-slate-100 text-slate-600 border border-slate-200',
 viewer: 'bg-violet-50 text-violet-700 border border-violet-200',
 }

 const showMsg = (text) => {
 setMessage(text)
 setTimeout(() => setMessage(''), 3000)
 }

 const handleResetPassword = async () => {
 if (newPassword.length < 8) return
 setSaving(true)
 if (!isDemo) {
 await api.post(`/api/v1/admin/users/${resetModal.id}/reset-password`, { new_password: newPassword })
 }
 showMsg(`Password reset for ${resetModal.email}`)
 setResetModal(null)
 setNewPassword('')
 setSaving(false)
 }

 const handleChangeRole = async () => {
 if (!selectedRole) return
 setSaving(true)
 if (!isDemo) {
 await api.put(`/api/v1/admin/users/${roleModal.id}`, { role: selectedRole })
 }
 showMsg(`Role changed to ${selectedRole} for ${roleModal.email}`)
 setRoleModal(null)
 setSelectedRole('')
 setSaving(false)
 if (!isDemo) onRefresh()
 }

 const handleToggleActive = async (u) => {
 const newStatus = u.is_active ? 0 : 1
 if (!isDemo) {
 await api.post(`/api/v1/admin/users/${u.id}/${newStatus ? 'activate' : 'deactivate'}`)
 }
 showMsg(`${u.name || u.email} ${newStatus ? 'activated' : 'deactivated'}`)
 if (!isDemo) onRefresh()
 }

 const handleDeleteUser = async (u) => {
 if (!confirm(`Delete user ${u.email}? This cannot be undone.`)) return
 if (!isDemo) {
 await api.delete(`/api/v1/admin/users/${u.id}`)
 }
 showMsg(`User ${u.email} deleted`)
 if (!isDemo) onRefresh()
 }

 return (
 <div>
 {/* Success message */}
 {message && (
 <div className="mb-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-2">
 <CheckCircle className="w-4 h-4" /> {message}
 </div>
 )}

 <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
 {/* Header */}
 <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
 <div className="flex items-center gap-2">
 <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center">
 <Users className="w-4.5 h-4.5 text-blue-700" />
 </div>
 <div>
 <h3 className="font-semibold text-slate-900">Tenant Users</h3>
 <p className="text-xs text-slate-500">{users.length} {users.length === 1 ? 'user' : 'users'} in this tenant</p>
 </div>
 </div>
 <button
 onClick={() => setCreateOpen(true)}
 className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg text-sm font-medium shadow-sm"
 >
 <UserPlus className="w-4 h-4" />
 New User
 </button>
 </div>

 {/* User table */}
 {users.length === 0 ? (
 <div className="py-16 text-center">
 <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-slate-100/50 flex items-center justify-center">
 <Users className="w-6 h-6 text-slate-400" />
 </div>
 <p className="text-slate-600 font-medium">No users in this tenant yet</p>
 <p className="text-sm text-slate-500 mt-1">Click "New User" above to add the first one</p>
 </div>
 ) : (
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
 <tr>
 <th className="px-6 py-3 font-semibold">User</th>
 <th className="px-6 py-3 font-semibold">Contact</th>
 <th className="px-6 py-3 font-semibold">Role</th>
 <th className="px-6 py-3 font-semibold">Status</th>
 <th className="px-6 py-3 font-semibold w-16 text-right">Actions</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-100">
 {users.map((u) => (
 <tr key={u.id} className="hover:bg-slate-50/70/20 transition-colors">
 <td className="px-6 py-4">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
 {(u.name || u.email)?.[0]?.toUpperCase() || 'U'}
 </div>
 <div className="min-w-0">
 <p className="font-medium text-slate-900 truncate">{u.name || 'Unnamed'}</p>
 <p className="text-xs text-slate-500 truncate">{u.id}</p>
 </div>
 </div>
 </td>
 <td className="px-6 py-4">
 <div className="space-y-0.5 text-xs text-slate-600">
 <div className="flex items-center gap-1.5">
 <Mail className="w-3 h-3 text-slate-400 flex-shrink-0" />
 <span className="truncate">{u.email}</span>
 </div>
 {u.phone && (
 <div className="flex items-center gap-1.5">
 <Phone className="w-3 h-3 text-slate-400 flex-shrink-0" />
 <span>{u.phone}</span>
 </div>
 )}
 </div>
 </td>
 <td className="px-6 py-4">
 <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-semibold capitalize ${roleColors[u.role] || roleColors.user}`}>
 {u.role || 'user'}
 </span>
 </td>
 <td className="px-6 py-4">
 <span
 className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
 u.is_active
 ? 'bg-emerald-50 text-emerald-700'
 : 'bg-red-50 text-red-600'
 }`}
 >
 <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} />
 {u.is_active ? 'Active' : 'Inactive'}
 </span>
 </td>
 <td className="px-6 py-4 text-right">
 <div className="relative inline-block">
 <button
 onClick={(e) => { e.stopPropagation(); setActionMenu(actionMenu === u.id ? null : u.id) }}
 className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
 >
 <MoreVertical className="w-4 h-4 text-slate-400" />
 </button>

 {actionMenu === u.id && (
 <>
 <div className="fixed inset-0 z-40" onClick={() => setActionMenu(null)} />
 <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-slate-200 shadow-sm rounded-xl shadow-xl z-50 py-1.5 overflow-hidden">
 <button
 onClick={() => { setResetModal(u); setActionMenu(null) }}
 className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 text-left"
 >
 <Key className="w-4 h-4 text-blue-600" /> Reset Password
 </button>
 <button
 onClick={() => { setRoleModal(u); setSelectedRole(u.role); setActionMenu(null) }}
 className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 text-left"
 >
 <UserCog className="w-4 h-4 text-blue-500" /> Change Role
 </button>
 <button
 onClick={() => { handleToggleActive(u); setActionMenu(null) }}
 className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 text-left"
 >
 {u.is_active
 ? <><Ban className="w-4 h-4 text-orange-500" /> Deactivate</>
 : <><CheckCircle className="w-4 h-4 text-emerald-500" /> Activate</>
 }
 </button>
 <div className="border-t border-slate-100 my-1" />
 <button
 onClick={() => { handleDeleteUser(u); setActionMenu(null) }}
 className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 text-left"
 >
 <Trash2 className="w-4 h-4" /> Delete User
 </button>
 </div>
 </>
 )}
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>

 {/* Create User Modal */}
 {createOpen && (
 <CreateUserModal
 tenantId={tenantId}
 onClose={() => setCreateOpen(false)}
 onCreated={() => { setCreateOpen(false); showMsg('User created successfully'); onRefresh && onRefresh() }}
 />
 )}

 {/* Reset Password Modal */}
 {resetModal && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setResetModal(null)}>
 <div className="bg-white shadow-sm rounded-2xl shadow-2xl w-full max-w-md mx-4 border border-slate-200" onClick={e => e.stopPropagation()}>
 <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
 <div className="flex items-center gap-2">
 <Key className="w-5 h-5 text-blue-600" />
 <h3 className="font-semibold text-slate-900">Reset Password</h3>
 </div>
 <button onClick={() => setResetModal(null)} className="p-1 hover:bg-slate-100 rounded-lg">
 <X className="w-4 h-4 text-slate-400" />
 </button>
 </div>
 <div className="p-6">
 <p className="text-sm text-slate-500 mb-4">
 Set a new password for <strong className="text-slate-900">{resetModal.email}</strong>
 </p>
 <input
 type="text"
 value={newPassword}
 onChange={e => setNewPassword(e.target.value)}
 placeholder="New password (min 8 characters)"
 className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-blue-500"
 autoFocus
 />
 {newPassword && newPassword.length < 8 && (
 <p className="text-xs text-red-500 mt-1">Must be at least 8 characters</p>
 )}
 </div>
 <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
 <button onClick={() => setResetModal(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
 <button
 onClick={handleResetPassword}
 disabled={newPassword.length < 8 || saving}
 className="px-4 py-2 text-sm font-medium text-slate-900 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
 >
 {saving ? 'Resetting...' : 'Reset Password'}
 </button>
 </div>
 </div>
 </div>
 )}

 {/* Change Role Modal */}
 {roleModal && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setRoleModal(null)}>
 <div className="bg-white shadow-sm rounded-2xl shadow-2xl w-full max-w-md mx-4 border border-slate-200" onClick={e => e.stopPropagation()}>
 <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
 <div className="flex items-center gap-2">
 <UserCog className="w-5 h-5 text-blue-500" />
 <h3 className="font-semibold text-slate-900">Change Role</h3>
 </div>
 <button onClick={() => setRoleModal(null)} className="p-1 hover:bg-slate-100 rounded-lg">
 <X className="w-4 h-4 text-slate-400" />
 </button>
 </div>
 <div className="p-6">
 <p className="text-sm text-slate-500 mb-4">
 Select new role for <strong className="text-slate-900">{roleModal.email}</strong>
 </p>
 <div className="space-y-2">
 {['admin', 'manager', 'agent', 'user', 'viewer'].map(role => (
 <button
 key={role}
 onClick={() => setSelectedRole(role)}
 className={`flex items-center justify-between w-full px-4 py-3 rounded-xl border-2 transition-all ${
 selectedRole === role
 ? 'border-purple-500 bg-purple-50'
 : 'border-slate-200 hover:border-slate-300'
 }`}
 >
 <div>
 <p className={`font-medium capitalize ${selectedRole === role ? 'text-blue-700' : 'text-slate-900'}`}>{role}</p>
 <p className="text-xs text-slate-500 mt-0.5">
 {role === 'admin' && 'Full access to all features'}
 {role === 'manager' && 'Manage team, no billing/settings'}
 {role === 'agent' && 'Create & edit, no delete/admin'}
 {role === 'user' && 'View access with limited actions'}
 {role === 'viewer' && 'Read-only access'}
 </p>
 </div>
 {selectedRole === role && <CheckCircle className="w-5 h-5 text-blue-600" />}
 </button>
 ))}
 </div>
 </div>
 <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
 <button onClick={() => setRoleModal(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
 <button
 onClick={handleChangeRole}
 disabled={!selectedRole || saving}
 className="px-4 py-2 text-sm font-medium text-slate-900 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
 >
 {saving ? 'Saving...' : 'Update Role'}
 </button>
 </div>
 </div>
 </div>
 )}
 </div>
 )
}


// ═══════════════════════════════════════════════════════════════════
// Create User Modal
// ═══════════════════════════════════════════════════════════════════

function CreateUserModal({ tenantId, onClose, onCreated }) {
 const [form, setForm] = useState({
 name: '',
 email: '',
 password: '',
 role: 'agent',
 phone: '',
 })
 const [submitting, setSubmitting] = useState(false)
 const [error, setError] = useState('')

 const submit = async (e) => {
 e.preventDefault()
 setError('')
 if (!form.name.trim()) return setError('Name is required')
 if (!form.email.trim() || !form.email.includes('@')) return setError('Valid email is required')
 if (form.password.length < 8) return setError('Password must be at least 8 characters')

 setSubmitting(true)
 try {
 await superAdminAPI.createUser({
 ...form,
 tenant_id: tenantId,
 })
 toast.success(`User ${form.email} created`)
 onCreated()
 } catch (err) {
 const msg = err.response?.data?.detail || err.message || 'Failed to create user'
 setError(msg)
 toast.error(msg)
 } finally {
 setSubmitting(false)
 }
 }

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
 <div className="bg-white shadow-sm rounded-2xl shadow-2xl w-full max-w-md border border-slate-200" onClick={(e) => e.stopPropagation()}>
 {/* Header */}
 <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
 <div className="flex items-center gap-2">
 <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
 <UserPlus className="w-4 h-4 text-blue-700" />
 </div>
 <h3 className="font-semibold text-slate-900">Create New User</h3>
 </div>
 <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg">
 <X className="w-4 h-4 text-slate-400" />
 </button>
 </div>

 {/* Form */}
 <form onSubmit={submit} className="p-6 space-y-4">
 <Field label="Full Name" required>
 <input
 type="text"
 value={form.name}
 onChange={(e) => setForm({ ...form, name: e.target.value })}
 placeholder="Jane Smith"
 autoFocus
 className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
 />
 </Field>

 <Field label="Email Address" required>
 <input
 type="email"
 value={form.email}
 onChange={(e) => setForm({ ...form, email: e.target.value })}
 placeholder="jane@swetha.in"
 className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
 />
 </Field>

 <Field label="Initial Password" required hint="Min 8 characters. User can change it later.">
 <input
 type="text"
 value={form.password}
 onChange={(e) => setForm({ ...form, password: e.target.value })}
 placeholder="Min 8 characters"
 className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm font-mono outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
 />
 </Field>

 <div className="grid grid-cols-2 gap-3">
 <Field label="Role">
 <select
 value={form.role}
 onChange={(e) => setForm({ ...form, role: e.target.value })}
 className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm outline-none"
 >
 <option value="admin">Admin</option>
 <option value="manager">Manager</option>
 <option value="agent">Agent</option>
 <option value="user">User</option>
 <option value="viewer">Viewer</option>
 </select>
 </Field>

 <Field label="Phone (optional)">
 <input
 type="tel"
 value={form.phone}
 onChange={(e) => setForm({ ...form, phone: e.target.value })}
 placeholder="+91 98765 43210"
 className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
 />
 </Field>
 </div>

 {error && (
 <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
 {error}
 </div>
 )}
 </form>

 {/* Footer */}
 <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
 <button
 type="button"
 onClick={onClose}
 className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
 >
 Cancel
 </button>
 <button
 type="button"
 onClick={submit}
 disabled={submitting}
 className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium shadow-sm"
 >
 <UserPlus className="w-4 h-4" />
 {submitting ? 'Creating…' : 'Create User'}
 </button>
 </div>
 </div>
 </div>
 )
}

function Field({ label, required, hint, children }) {
 return (
 <label className="block">
 <span className="block text-xs font-medium text-slate-600 mb-1.5">
 {label}
 {required && <span className="text-red-500 ml-0.5">*</span>}
 </span>
 {children}
 {hint && <span className="block text-[10px] text-slate-400 mt-1">{hint}</span>}
 </label>
 )
}


// ═══════════════════════════════════════════════════════════════════
// Branding Panel — interactive editor with live preview & presets
// ═══════════════════════════════════════════════════════════════════

const FONT_OPTIONS = ['Inter', 'Poppins', 'DM Sans', 'Plus Jakarta Sans', 'Roboto', 'Manrope']

const THEME_PRESETS = [
 { name: 'Sunset', primary: '#f59e0b', secondary: '#1e293b', accent: '#8b5cf6' },
 { name: 'Ocean', primary: '#0ea5e9', secondary: '#0c4a6e', accent: '#06b6d4' },
 { name: 'Forest', primary: '#10b981', secondary: '#064e3b', accent: '#84cc16' },
 { name: 'Royal', primary: '#8b5cf6', secondary: '#1e1b4b', accent: '#ec4899' },
 { name: 'Crimson', primary: '#ef4444', secondary: '#450a0a', accent: '#f97316' },
 { name: 'Midnight', primary: '#6366f1', secondary: '#0f172a', accent: '#a855f7' },
]

function BrandingPanel({ tenant, onSaved }) {
 // Editable form state — initialized from current tenant
 const [form, setForm] = useState(() => ({
 app_name: tenant.app_name || tenant.name || '',
 name: tenant.name || '',
 tagline: tenant.tagline || '',
 primary_color: tenant.primary_color || '#8b5cf6',
 secondary_color: tenant.secondary_color || '#1e293b',
 accent_color: tenant.accent_color || '#a855f7',
 login_bg_color: tenant.login_bg_color || '#f1f5f9',
 font_family: tenant.font_family || 'Inter',
 sidebar_style: tenant.sidebar_style || 'light',
 logo_url: tenant.logo_url || '',
 favicon_url: tenant.favicon_url || '',
 website: tenant.website || '',
 support_email: tenant.support_email || '',
 support_phone: tenant.support_phone || '',
 address: tenant.address || '',
 custom_css: tenant.custom_css || '',
 }))
 const [saving, setSaving] = useState(false)
 const [logoError, setLogoError] = useState(false)

 const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

 const isDirty = Object.keys(form).some((k) => (form[k] || '') !== (tenant[k] || (k === 'app_name' && tenant.name) || ''))

 const applyPreset = (preset) => {
 setForm((f) => ({
 ...f,
 primary_color: preset.primary,
 secondary_color: preset.secondary,
 accent_color: preset.accent,
 }))
 toast.success(`Applied "${preset.name}" theme`, { duration: 1500 })
 }

 const reset = () => {
 setForm({
 app_name: tenant.app_name || tenant.name || '',
 name: tenant.name || '',
 tagline: tenant.tagline || '',
 primary_color: tenant.primary_color || '#8b5cf6',
 secondary_color: tenant.secondary_color || '#1e293b',
 accent_color: tenant.accent_color || '#a855f7',
 login_bg_color: tenant.login_bg_color || '#f1f5f9',
 font_family: tenant.font_family || 'Inter',
 sidebar_style: tenant.sidebar_style || 'light',
 logo_url: tenant.logo_url || '',
 favicon_url: tenant.favicon_url || '',
 website: tenant.website || '',
 support_email: tenant.support_email || '',
 support_phone: tenant.support_phone || '',
 address: tenant.address || '',
 custom_css: tenant.custom_css || '',
 })
 }

 const handleSave = async () => {
 setSaving(true)
 try {
 await superAdminAPI.updateTenant(tenant.id, form)
 toast.success('Branding saved')
 onSaved && onSaved()
 } catch (err) {
 toast.error(err.response?.data?.detail || 'Failed to save')
 } finally {
 setSaving(false)
 }
 }

 return (
 <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
 {/* ── Form column ── */}
 <div className="lg:col-span-3 space-y-5">
 {/* Identity */}
 <Section title="Identity" subtitle="Display name and tagline shown in the tenant's app">
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <Field label="Tenant Name" required>
 <TextInput value={form.name} onChange={(v) => set('name', v)} placeholder="Acme Corp" />
 </Field>
 <Field label="App Name" hint="Shown in the top bar inside the tenant dashboard">
 <TextInput value={form.app_name} onChange={(v) => set('app_name', v)} placeholder="Acme CRM" />
 </Field>
 </div>
 <Field label="Tagline" hint="Optional one-liner shown on login screen">
 <TextInput value={form.tagline} onChange={(v) => set('tagline', v)} placeholder="The smartest CRM for builders" />
 </Field>
 </Section>

 {/* Theme */}
 <Section title="Color Theme" subtitle="Pick a preset or customize each color">
 {/* Presets */}
 <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
 {THEME_PRESETS.map((p) => {
 const active =
 form.primary_color === p.primary &&
 form.secondary_color === p.secondary &&
 form.accent_color === p.accent
 return (
 <button
 key={p.name}
 onClick={() => applyPreset(p)}
 className={`p-2 rounded-lg border-2 transition-all ${
 active
 ? 'border-blue-500 ring-2 ring-blue-500/20'
 : 'border-slate-200 hover:border-slate-400'
 }`}
 title={p.name}
 >
 <div className="flex items-center gap-1 mb-1">
 <div className="w-4 h-4 rounded-full" style={{ background: p.primary }} />
 <div className="w-4 h-4 rounded-full" style={{ background: p.secondary }} />
 <div className="w-4 h-4 rounded-full" style={{ background: p.accent }} />
 </div>
 <p className="text-[10px] text-slate-600 text-center">{p.name}</p>
 </button>
 )
 })}
 </div>

 {/* Color pickers */}
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
 <ColorField label="Primary" value={form.primary_color} onChange={(v) => set('primary_color', v)} />
 <ColorField label="Secondary" value={form.secondary_color} onChange={(v) => set('secondary_color', v)} />
 <ColorField label="Accent" value={form.accent_color} onChange={(v) => set('accent_color', v)} />
 </div>
 </Section>

 {/* Logo & assets */}
 <Section title="Logo & Assets" subtitle="URLs to public images. File upload coming soon.">
 <Field label="Logo URL" hint="Recommended: square PNG/SVG, 200×200">
 <TextInput
 value={form.logo_url}
 onChange={(v) => { set('logo_url', v); setLogoError(false) }}
 placeholder="https://your-domain.com/logo.png"
 />
 </Field>
 {form.logo_url && (
 <div className="mt-2 inline-flex items-center gap-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
 {logoError ? (
 <span className="text-xs text-red-500">⚠ Could not load image</span>
 ) : (
 <img
 src={form.logo_url}
 alt="Logo preview"
 onError={() => setLogoError(true)}
 className="w-12 h-12 object-contain rounded"
 />
 )}
 <span className="text-xs text-slate-500">Logo preview</span>
 </div>
 )}
 <Field label="Favicon URL" hint="Browser tab icon (16×16 or 32×32 ICO/PNG)">
 <TextInput value={form.favicon_url} onChange={(v) => set('favicon_url', v)} placeholder="https://your-domain.com/favicon.ico" />
 </Field>
 </Section>

 {/* Typography */}
 <Section title="Typography & Layout" subtitle="Font family and sidebar style">
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <Field label="Font Family">
 <select
 value={form.font_family}
 onChange={(e) => set('font_family', e.target.value)}
 className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm outline-none focus:border-blue-500"
 style={{ fontFamily: form.font_family }}
 >
 {FONT_OPTIONS.map((f) => (
 <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
 ))}
 </select>
 </Field>
 <Field label="Sidebar Style">
 <select
 value={form.sidebar_style}
 onChange={(e) => set('sidebar_style', e.target.value)}
 className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm outline-none focus:border-blue-500"
 >
 <option value="light">Light</option>
 <option value="dark">Dark</option>
 <option value="brand">Brand color</option>
 </select>
 </Field>
 </div>
 </Section>

 {/* Company info */}
 <Section title="Company Info" subtitle="Contact details shown on invoices and footers">
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <Field label="Website">
 <TextInput value={form.website} onChange={(v) => set('website', v)} placeholder="https://acme.com" />
 </Field>
 <Field label="Support Email">
 <TextInput value={form.support_email} onChange={(v) => set('support_email', v)} placeholder="support@acme.com" />
 </Field>
 <Field label="Support Phone">
 <TextInput value={form.support_phone} onChange={(v) => set('support_phone', v)} placeholder="+91 98765 43210" />
 </Field>
 <Field label="Address">
 <TextInput value={form.address} onChange={(v) => set('address', v)} placeholder="Coimbatore, Tamil Nadu" />
 </Field>
 </div>
 </Section>

 {/* Save bar */}
 <div className="sticky bottom-4 flex items-center justify-between gap-3 px-5 py-3 bg-white border border-slate-200 shadow-sm rounded-xl shadow-lg">
 <p className="text-xs text-slate-500">
 {isDirty ? <span className="text-amber-600 font-medium">● Unsaved changes</span> : 'No changes'}
 </p>
 <div className="flex gap-2">
 <button
 onClick={reset}
 disabled={!isDirty || saving}
 className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-40"
 >
 Reset
 </button>
 <button
 onClick={handleSave}
 disabled={!isDirty || saving}
 className="inline-flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium shadow-sm"
 >
 <Save className="w-4 h-4" />
 {saving ? 'Saving…' : 'Save Branding'}
 </button>
 </div>
 </div>
 </div>

 {/* ── Live preview column ── */}
 <div className="lg:col-span-2">
 <div className="sticky top-4 space-y-3">
 <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">Live Preview</p>

 {/* Top bar mock */}
 <div
 className="rounded-xl border border-slate-200 overflow-hidden shadow-sm"
 style={{ fontFamily: form.font_family }}
 >
 {/* Header */}
 <div
 className="flex items-center justify-between px-4 py-3"
 style={{ backgroundColor: form.secondary_color }}
 >
 <div className="flex items-center gap-2">
 {form.logo_url && !logoError ? (
 <img src={form.logo_url} alt="" className="w-7 h-7 rounded object-contain bg-white" />
 ) : (
 <div
 className="w-7 h-7 rounded-md flex items-center justify-center text-slate-900 font-bold text-xs"
 style={{ backgroundColor: form.primary_color }}
 >
 {(form.name || form.app_name)?.[0]?.toUpperCase() || 'T'}
 </div>
 )}
 <span className="text-slate-900 text-sm font-semibold">{form.app_name || form.name || 'App Name'}</span>
 </div>
 <div className="w-7 h-7 rounded-full" style={{ backgroundColor: form.accent_color }} />
 </div>

 {/* Body */}
 <div className="bg-slate-50 p-4 space-y-3">
 {form.tagline && (
 <p className="text-xs text-slate-500">{form.tagline}</p>
 )}

 {/* Buttons sample */}
 <div className="flex gap-2 flex-wrap">
 <button
 className="px-3 py-1.5 rounded-lg text-slate-900 text-xs font-medium"
 style={{ backgroundColor: form.primary_color }}
 >
 Primary
 </button>
 <button
 className="px-3 py-1.5 rounded-lg text-slate-900 text-xs font-medium"
 style={{ backgroundColor: form.accent_color }}
 >
 Accent
 </button>
 <button className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-700">
 Secondary
 </button>
 </div>

 {/* Stat card sample */}
 <div className="rounded-lg border border-slate-200 p-3">
 <div className="flex items-center gap-2 mb-1">
 <div
 className="w-7 h-7 rounded-md flex items-center justify-center"
 style={{ backgroundColor: `${form.primary_color}22` }}
 >
 <div className="w-3 h-3 rounded-full" style={{ backgroundColor: form.primary_color }} />
 </div>
 <span className="text-xs font-medium text-slate-500">Active Leads</span>
 </div>
 <p className="text-xl font-bold text-slate-900">1,284</p>
 </div>

 {/* Badge samples */}
 <div className="flex gap-1.5">
 <span
 className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
 style={{
 backgroundColor: `${form.primary_color}22`,
 color: form.primary_color,
 }}
 >
 Hot
 </span>
 <span
 className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
 style={{
 backgroundColor: `${form.accent_color}22`,
 color: form.accent_color,
 }}
 >
 New
 </span>
 </div>
 </div>
 </div>

 {/* Color swatches */}
 <div className="grid grid-cols-3 gap-2">
 {[
 ['Primary', form.primary_color],
 ['Secondary', form.secondary_color],
 ['Accent', form.accent_color],
 ].map(([label, color]) => (
 <div key={label} className="bg-white border border-slate-200 shadow-sm rounded-lg overflow-hidden">
 <div className="h-12" style={{ backgroundColor: color }} />
 <div className="px-2 py-1.5">
 <p className="text-[10px] text-slate-500 uppercase font-medium">{label}</p>
 <p className="text-[10px] font-mono text-slate-700">{color}</p>
 </div>
 </div>
 ))}
 </div>

 <p className="text-[10px] text-slate-400 px-1 leading-relaxed">
 Live preview reflects unsaved changes. Click <span className="font-semibold">Save Branding</span> to apply these to the tenant's actual login and dashboard pages.
 </p>
 </div>
 </div>
 </div>
 )
}

function Section({ title, subtitle, children }) {
 return (
 <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
 <div className="mb-4">
 <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
 {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
 </div>
 <div className="space-y-4">{children}</div>
 </div>
 )
}

function TextInput({ value, onChange, placeholder, type = 'text' }) {
 return (
 <input
 type={type}
 value={value || ''}
 onChange={(e) => onChange(e.target.value)}
 placeholder={placeholder}
 className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
 />
 )
}

function ColorField({ label, value, onChange }) {
 return (
 <div>
 <span className="block text-xs font-medium text-slate-600 mb-1.5">{label}</span>
 <div className="flex items-center gap-2">
 <input
 type="color"
 value={value}
 onChange={(e) => onChange(e.target.value)}
 className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200 bg-transparent flex-shrink-0"
 style={{ padding: 2 }}
 />
 <input
 type="text"
 value={value}
 onChange={(e) => onChange(e.target.value)}
 className="flex-1 px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 outline-none focus:border-blue-500"
 />
 </div>
 </div>
 )
}
