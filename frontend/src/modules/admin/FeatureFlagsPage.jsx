/**
 * Feature Flags — Super Admin
 * Per-tenant feature toggle matrix.
 *
 * The user explicitly asked for this: "i need the access to give the list of
 * features what they using the toggle button which we already have in this".
 *
 * Layout: tenant selector (dropdown) → list of features grouped by category,
 * each with a toggle switch. Toggling a feature calls the backend immediately.
 */

import { useState, useEffect, useMemo } from 'react'
import { ToggleLeft, ToggleRight, Building2, Crown, ChevronDown, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { superAdminAPI } from '../../services/api'

export default function FeatureFlagsPage() {
 const [tenants, setTenants] = useState([])
 const [selectedTenantId, setSelectedTenantId] = useState('')
 const [features, setFeatures] = useState([])
 const [loading, setLoading] = useState(true)
 const [savingKey, setSavingKey] = useState(null)
 const [expanded, setExpanded] = useState({})

 // Load tenants on mount
 useEffect(() => {
 superAdminAPI.listTenants()
 .then((res) => {
 const list = res.data || []
 setTenants(list)
 if (list.length && !selectedTenantId) setSelectedTenantId(list[0].id)
 })
 .catch(() => toast.error('Failed to load tenants'))
 }, [])

 // Load features whenever tenant changes
 useEffect(() => {
 if (!selectedTenantId) return
 setLoading(true)
 superAdminAPI.getTenantFeatures(selectedTenantId)
 .then((res) => {
 setFeatures(res.data || [])
 // Auto-expand parent modules on first load
 const exp = {}
 ;(res.data || []).forEach((f) => {
 if (!f.parent_key) exp[f.key] = true
 })
 setExpanded(exp)
 })
 .catch(() => toast.error('Failed to load features'))
 .finally(() => setLoading(false))
 }, [selectedTenantId])

 // Group features into modules (parent → children)
 const grouped = useMemo(() => {
 const parents = features.filter((f) => !f.parent_key)
 return parents.map((parent) => ({
 ...parent,
 children: features.filter((f) => f.parent_key === parent.key),
 }))
 }, [features])

 const toggleFeature = async (feature) => {
 const newEnabled = !feature.enabled
 setSavingKey(feature.key)
 try {
 await superAdminAPI.toggleTenantFeature(selectedTenantId, feature.key, newEnabled)
 setFeatures((prev) =>
 prev.map((f) => (f.key === feature.key ? { ...f, enabled: newEnabled, is_overridden: true } : f))
 )
 toast.success(`${feature.name} ${newEnabled ? 'enabled' : 'disabled'}`, { duration: 1500 })
 } catch (e) {
 toast.error(e.response?.data?.detail || 'Failed to toggle feature')
 } finally {
 setSavingKey(null)
 }
 }

 const toggleExpand = (key) => {
 setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
 }

 const enabledCount = features.filter((f) => f.enabled && !f.parent_key).length
 const totalParents = features.filter((f) => !f.parent_key).length

 return (
 <div className="max-w-6xl mx-auto space-y-6">
 <div>
 <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
 <ToggleLeft className="w-6 h-6 text-blue-600" />
 Feature Flags
 </h1>
 <p className="text-slate-500 text-sm mt-1">
 Toggle features on/off for each tenant. Changes take effect immediately.
 </p>
 </div>

 {/* Tenant selector */}
 <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
 <label className="block">
 <span className="block text-xs font-medium text-slate-600 mb-2 flex items-center gap-1">
 <Building2 className="w-3.5 h-3.5" />
 Select tenant to manage features
 </span>
 <select
 value={selectedTenantId}
 onChange={(e) => setSelectedTenantId(e.target.value)}
 className="w-full max-w-md px-3 py-2.5 border border-slate-200 rounded-lg bg-slate-50 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
 >
 <option value="">— Select a tenant —</option>
 {tenants.map((t) => (
 <option key={t.id} value={t.id}>
 {t.name} ({t.plan_id})
 </option>
 ))}
 </select>
 </label>
 {selectedTenantId && (
 <p className="text-xs text-slate-500 mt-3">
 <span className="font-semibold text-slate-700">{enabledCount}</span>
 {' '}of <span className="font-semibold">{totalParents}</span> modules enabled
 </p>
 )}
 </div>

 {/* Feature matrix */}
 {loading && (
 <div className="py-16 text-center text-slate-500">Loading features…</div>
 )}

 {!loading && selectedTenantId && grouped.length > 0 && (
 <div className="space-y-3">
 {grouped.map((mod) => (
 <div
 key={mod.key}
 className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden"
 >
 {/* Module header (parent feature) */}
 <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
 <button
 onClick={() => toggleExpand(mod.key)}
 className="text-slate-400 hover:text-slate-700 /30"
 >
 {expanded[mod.key] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
 </button>
 <div className="flex-1 min-w-0">
 <p className="font-semibold text-slate-900">
 {mod.name}
 {mod.is_premium === 1 && (
 <Crown className="inline w-3.5 h-3.5 text-amber-500 ml-1.5" title="Premium" />
 )}
 </p>
 <p className="text-xs text-slate-500">{mod.description}</p>
 </div>
 {mod.is_overridden && (
 <span className="text-[10px] uppercase font-semibold text-blue-700">
 Overridden
 </span>
 )}
 <Toggle
 enabled={mod.enabled}
 saving={savingKey === mod.key}
 onClick={() => toggleFeature(mod)}
 />
 </div>

 {/* Sub-features */}
 {expanded[mod.key] && mod.children.length > 0 && (
 <div className="divide-y divide-slate-100 bg-slate-50">
 {mod.children.map((child) => (
 <div key={child.key} className="flex items-center gap-3 px-5 py-2.5 pl-12">
 <div className="flex-1 min-w-0">
 <p className="text-sm text-slate-700">
 {child.name}
 {child.is_premium === 1 && (
 <Crown className="inline w-3 h-3 text-amber-500 ml-1" />
 )}
 </p>
 <p className="text-xs text-slate-400">{child.description}</p>
 </div>
 {child.is_overridden && (
 <span className="text-[10px] uppercase font-semibold text-blue-600">
 ●
 </span>
 )}
 <Toggle
 enabled={child.enabled}
 saving={savingKey === child.key}
 onClick={() => toggleFeature(child)}
 size="sm"
 />
 </div>
 ))}
 </div>
 )}
 </div>
 ))}
 </div>
 )}

 {!loading && !selectedTenantId && (
 <div className="py-16 text-center text-slate-500">
 Select a tenant above to view its feature flags
 </div>
 )}
 </div>
 )
}

// ── Toggle switch ──────────────────────────────────────────────

function Toggle({ enabled, saving, onClick, size = 'md' }) {
 const w = size === 'sm' ? 'w-9 h-5' : 'w-11 h-6'
 const dot = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
 const translate = size === 'sm' ? 'translate-x-4' : 'translate-x-5'
 return (
 <button
 onClick={onClick}
 disabled={saving}
 className={`relative inline-flex ${w} items-center rounded-full transition-colors flex-shrink-0 ${
 enabled ? 'bg-purple-600' : 'bg-slate-300'
 } ${saving ? 'opacity-50' : ''}`}
 >
 <span
 className={`inline-block ${dot} transform rounded-full bg-white shadow transition-transform ${
 enabled ? translate : 'translate-x-0.5'
 }`}
 />
 </button>
 )
}
