/**
 * Super Admin Settings — Profile only for now.
 */

import { Settings as SettingsIcon, User, Mail, Shield } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

export default function SuperAdminSettingsPage() {
 const { user } = useAuth()

 return (
 <div className="max-w-3xl mx-auto space-y-6">
 <div>
 <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
 <SettingsIcon className="w-6 h-6 text-blue-600" />
 Settings
 </h1>
 <p className="text-slate-500 text-sm mt-1">
 Super admin profile and platform configuration
 </p>
 </div>

 {/* Profile card */}
 <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
 <div className="flex items-center gap-4 mb-6">
 <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-2xl font-bold">
 {user?.name?.[0] || 'S'}
 </div>
 <div>
 <h2 className="text-lg font-semibold text-slate-900">{user?.name}</h2>
 <p className="text-sm text-slate-500">{user?.email}</p>
 <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-purple-100 text-blue-700 text-[10px] font-bold uppercase tracking-wider">
 <Shield className="w-3 h-3" />
 Super Admin
 </span>
 </div>
 </div>

 <dl className="space-y-3 text-sm">
 <Field icon={User} label="Name" value={user?.name} />
 <Field icon={Mail} label="Email" value={user?.email} />
 <Field icon={Shield} label="Role" value="Platform Administrator" />
 </dl>
 </div>

 {/* Future settings placeholder */}
 <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center text-sm text-slate-500">
 <p className="font-medium text-slate-600">Coming soon</p>
 <p className="text-xs mt-1">
 Change password · 2FA · API keys · Notification preferences · Audit log retention
 </p>
 </div>
 </div>
 )
}

function Field({ icon: Icon, label, value }) {
 return (
 <div className="flex items-center gap-3 py-2 border-t border-slate-100">
 <Icon className="w-4 h-4 text-slate-400" />
 <span className="text-slate-500 w-20">{label}</span>
 <span className="text-slate-900 font-medium">{value || '—'}</span>
 </div>
 )
}
