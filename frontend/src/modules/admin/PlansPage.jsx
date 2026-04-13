/**
 * Plans — Super Admin
 * Read-only view of subscription plans (backend GET-only currently).
 */

import { useState, useEffect } from 'react'
import { CreditCard, Check } from 'lucide-react'
import { superAdminAPI } from '../../services/api'

export default function PlansPage() {
 const [plans, setPlans] = useState([])
 const [loading, setLoading] = useState(true)

 useEffect(() => {
 superAdminAPI.listPlans()
 .then((res) => setPlans(res.data || []))
 .finally(() => setLoading(false))
 }, [])

 return (
 <div className="max-w-6xl mx-auto space-y-6">
 <div>
 <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
 <CreditCard className="w-6 h-6 text-blue-600" />
 Subscription Plans
 </h1>
 <p className="text-slate-500 text-sm mt-1">
 Plans available to tenants on the platform
 </p>
 </div>

 {loading && <div className="py-16 text-center text-slate-500">Loading…</div>}

 {!loading && (
 <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
 {plans.map((plan) => {
 const popular = plan.slug === 'professional'
 return (
 <div
 key={plan.id}
 className={`relative bg-white shadow-sm border rounded-2xl p-6 ${
 popular
 ? 'border-blue-500 ring-2 ring-blue-500/20'
 : 'border-slate-200'
 }`}
 >
 {popular && (
 <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-purple-600 text-slate-900 text-xs font-bold rounded-full uppercase tracking-wider">
 Most Popular
 </span>
 )}
 <h2 className="text-lg font-bold text-slate-900">{plan.name}</h2>
 <p className="text-xs text-slate-500 mt-1">{plan.description}</p>

 <div className="mt-4">
 <span className="text-3xl font-bold text-slate-900">
 ₹{(plan.price / 100).toLocaleString('en-IN')}
 </span>
 <span className="text-sm text-slate-500">/{plan.interval}</span>
 </div>

 <ul className="mt-5 space-y-2 text-sm text-slate-600">
 <li className="flex items-center gap-2">
 <Check className="w-4 h-4 text-emerald-500" />
 Up to {plan.max_users} users
 </li>
 <li className="flex items-center gap-2">
 <Check className="w-4 h-4 text-emerald-500" />
 {plan.is_active ? 'Active plan' : 'Inactive'}
 </li>
 </ul>

 <div className="mt-5 pt-5 border-t border-slate-100">
 <p className="text-xs text-slate-400 font-mono">{plan.slug}</p>
 </div>
 </div>
 )
 })}
 </div>
 )}

 <div className="text-xs text-slate-400 text-center">
 Plans are read-only. Edit functionality coming soon.
 </div>
 </div>
 )
}
