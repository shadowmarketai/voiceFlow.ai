/**
 * TeamPage — tenant owner manages their team members.
 *
 *   /voice/team
 *
 * Visible only to tenant users. Tenant owner can add/edit/remove; regular
 * tenant users see the list but no edit controls.
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Users, UserPlus, Trash2, Crown, Loader2, Mail, Phone, Shield,
  AlertTriangle, X, Check, RefreshCw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { tenantTeamAPI } from '../../../services/api'
import { useAuth } from '../../../contexts/AuthContext'

export default function TeamPage() {
  const { user } = useAuth()
  const [info, setInfo] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const isOwner = !!user?.is_tenant_owner || (info?.is_tenant_owner === true)

  const load = async () => {
    setLoading(true)
    try {
      const [i, u] = await Promise.all([tenantTeamAPI.info(), tenantTeamAPI.listUsers()])
      setInfo(i.data)
      setUsers(u.data || [])
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load team')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const removeUser = async (id) => {
    try {
      await tenantTeamAPI.deleteUser(id)
      toast.success('User removed')
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Remove failed')
    } finally {
      setDeleteTarget(null)
    }
  }

  const toggleActive = async (u) => {
    try {
      await tenantTeamAPI.updateUser(u.id, { is_active: !u.is_active })
      toast.success(u.is_active ? 'User deactivated' : 'User activated')
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Update failed')
    }
  }

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Team</h1>
          <p className="text-gray-500 mt-1">
            {info?.name ? `Manage members of ${info.name}` : 'Your tenant team'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm text-gray-700">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          {isOwner && (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
              <UserPlus className="w-4 h-4" /> Invite member
            </button>
          )}
        </div>
      </div>

      {/* Quota / info card */}
      {info && (
        <div className="p-4 bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl border border-indigo-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
              style={{ background: info.primary_color || '#6366f1' }}>
              {info.name?.[0] || 'T'}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{info.app_name || info.name}</p>
              <p className="text-[11px] text-gray-500">tenant · {info.slug}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Members</p>
            <p className="text-lg font-bold text-indigo-700">
              {info.current_users}
              <span className="text-sm font-normal text-gray-400">
                {' / '}{info.unlimited_users ? '∞' : info.max_users}
              </span>
            </p>
            {info.unlimited_users && <p className="text-[10px] text-emerald-600 font-medium">Unlimited</p>}
          </div>
        </div>
      )}

      {!isOwner && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>You can see your teammates but only the tenant owner can add or remove members.</div>
        </div>
      )}

      {/* Members list */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-gray-900">Members ({users.length})</h3>
        </div>
        {users.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No members yet. Click "Invite member" to add one.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between p-4 hover:bg-gray-50/50">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                    {u.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                      {u.is_tenant_owner && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold">
                          <Crown className="w-2.5 h-2.5" /> Owner
                        </span>
                      )}
                      {!u.is_active && (
                        <span className="px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 text-[10px] font-semibold">Inactive</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-0.5">
                      <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {u.email}</span>
                      {u.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {u.phone}</span>}
                    </div>
                  </div>
                </div>

                {isOwner && !u.is_tenant_owner && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => toggleActive(u)}
                      className={`px-2 py-1 rounded-md text-[11px] font-medium ${
                        u.is_active
                          ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                          : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700'
                      }`}>
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => setDeleteTarget(u)}
                      className="p-1.5 rounded-md hover:bg-red-50 text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load() }}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Remove team member?"
          message={`${deleteTarget.name} (${deleteTarget.email}) will lose access to the tenant. This cannot be undone.`}
          confirmLabel="Remove"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => removeUser(deleteTarget.id)}
        />
      )}
    </div>
  )
}

/* ─── Modals ──────────────────────────────────────────────────── */

function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ email: '', name: '', password: '', phone: '' })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.email || !form.name || !form.password) {
      toast.error('Email, name, and password are required')
      return
    }
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setSaving(true)
    try {
      await tenantTeamAPI.createUser(form)
      toast.success(`Invited ${form.email}`)
      onCreated()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Invite a team member</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-3">
          <Field label="Full name">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={INPUT_CLS} placeholder="Priya Sharma" />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={INPUT_CLS} placeholder="priya@company.com" />
          </Field>
          <Field label="Initial password" hint="Share securely. They can change it after first login.">
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              className={INPUT_CLS} placeholder="min 8 characters" />
          </Field>
          <Field label="Phone (optional)">
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className={INPUT_CLS} placeholder="+91 98765 43210" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Invite
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmModal({ title, message, confirmLabel, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-3">
          <div className="p-2 rounded-lg bg-red-50">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500 mt-1">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

const INPUT_CLS = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</label>
      <div className="mt-1">{children}</div>
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}
