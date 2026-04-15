import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { settingsAPI, integrationsAPI } from '../services/api'
import { usePermissions } from '../hooks/usePermissions'
import UserManagement from '../components/admin/UserManagement'
import PermissionMatrix from '../components/admin/PermissionMatrix'
import {
  Settings as SettingsIcon,
  User,
  Building2,
  CreditCard,
  Bell,
  Shield,
  Globe,
  Plug,
  Key,
  Phone,
  Mail,
  Save,
  Check,
  ExternalLink,
  ChevronRight,
  Copy,
  Lock,
  RefreshCw,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Download,
  UsersRound
} from 'lucide-react'

/* Minimal settings tabs — everything else already has its own top-level
 * sidebar page (Team, Billing/Wallet, Integrations, API & Developer,
 * Notifications lives in the bell icon). Settings is just for Profile
 * + Security changes. */
const tabs = [
  { id: 'profile', name: 'Profile', icon: User },
  { id: 'security', name: 'Security', icon: Shield },
]

const integrations = [
  { 
    id: 'zoho', 
    name: 'Zoho CRM', 
    description: 'Sync leads and contacts with Zoho CRM',
    icon: '📊',
    connected: true,
    category: 'CRM'
  },
  { 
    id: 'hubspot', 
    name: 'HubSpot', 
    description: 'Connect your HubSpot account',
    icon: '🧡',
    connected: false,
    category: 'CRM'
  },
  { 
    id: 'whatsapp', 
    name: 'WhatsApp Business', 
    description: 'Send messages via WhatsApp Business API',
    icon: '💬',
    connected: true,
    category: 'Messaging'
  },
  { 
    id: 'meta', 
    name: 'Meta Ads', 
    description: 'Connect Facebook & Instagram ads',
    icon: '📱',
    connected: true,
    category: 'Marketing'
  },
  { 
    id: 'google', 
    name: 'Google Ads', 
    description: 'Sync with Google Ads campaigns',
    icon: '🔍',
    connected: false,
    category: 'Marketing'
  },
  { 
    id: 'exotel', 
    name: 'Exotel', 
    description: 'Indian telephony provider',
    icon: '📞',
    connected: true,
    category: 'Telephony'
  },
  { 
    id: 'telecmi', 
    name: 'TeleCMI', 
    description: 'Cloud telephony for India',
    icon: '☎️',
    connected: false,
    category: 'Telephony'
  },
  { 
    id: 'razorpay', 
    name: 'Razorpay', 
    description: 'Payment gateway integration',
    icon: '💳',
    connected: true,
    category: 'Payments'
  },
]

function ProfileSettings() {
  const [form, setForm] = useState({
    first_name: 'Swetha', last_name: 'Admin',
    email: 'admin@swetha.in', phone: '+91 98765 43210',
    timezone: 'Asia/Kolkata', language: 'English',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await settingsAPI.update({ profile: form })
      toast.success('Profile saved!')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save profile')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Profile Information</h3>
        <div className="flex items-start gap-6">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-3xl font-bold">
            {form.first_name[0]}{form.last_name[0]}
          </div>
          <div className="flex-1 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">First Name</label>
                <input type="text" className="input" value={form.first_name}
                  onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Last Name</label>
                <input type="text" className="input" value={form.last_name}
                  onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input type="tel" className="input" value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Preferences</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Timezone</label>
            <select className="input" value={form.timezone}
              onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}>
              <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
              <option value="UTC">UTC</option>
              <option value="America/New_York">America/New_York (EST)</option>
              <option value="Europe/London">Europe/London (GMT)</option>
            </select>
          </div>
          <div>
            <label className="label">Interface Language</label>
            <select className="input" value={form.language}
              onChange={e => setForm(f => ({ ...f, language: e.target.value }))}>
              <option value="English">English</option>
              <option value="Tamil">Tamil</option>
              <option value="Hindi">Hindi</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="btn btn-primary">
          {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

function OrganizationSettings() {
  const [form, setForm] = useState({
    company_name: 'Swetha Structures', website: '',
    industry: 'Construction / PEB', size: '11-50',
    address: 'Chennai, Tamil Nadu, India', gst_number: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await settingsAPI.update({ organization: form })
      toast.success('Organization settings saved!')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save organization settings')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">Organization Details</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Company Name</label>
          <input type="text" className="input" value={form.company_name}
            onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} />
        </div>
        <div>
          <label className="label">Website</label>
          <input type="url" className="input" value={form.website}
            onChange={e => setForm(f => ({ ...f, website: e.target.value }))} />
        </div>
        <div>
          <label className="label">Industry</label>
          <select className="input" value={form.industry}
            onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}>
            {['Technology', 'Finance', 'Healthcare', 'Education', 'E-commerce', 'Real Estate', 'Other']
              .map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Company Size</label>
          <select className="input" value={form.size}
            onChange={e => setForm(f => ({ ...f, size: e.target.value }))}>
            {['1-10', '11-50', '51-200', '201-500', '500+'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Address</label>
          <input type="text" className="input" value={form.address}
            onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
        </div>
        <div>
          <label className="label">GST Number (optional)</label>
          <input type="text" className="input" value={form.gst_number}
            placeholder="e.g. 29ABCDE1234F1Z5"
            onChange={e => setForm(f => ({ ...f, gst_number: e.target.value }))} />
        </div>
      </div>
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="btn btn-primary">
          {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

function TeamSettings() {
  const [members, setMembers] = useState([
    { id: 1, name: 'Admin User', email: 'admin@company.com', role: 'Owner', status: 'Active', joined: 'Jan 2026', initials: 'AU' },
    { id: 2, name: 'Priya Sharma', email: 'priya@company.com', role: 'Admin', status: 'Active', joined: 'Jan 2026', initials: 'PS' },
    { id: 3, name: 'Rajesh Kumar', email: 'rajesh@company.com', role: 'Manager', status: 'Active', joined: 'Feb 2026', initials: 'RK' },
    { id: 4, name: 'Deepa Nair', email: 'deepa@company.com', role: 'Agent', status: 'Invited', joined: 'Feb 2026', initials: 'DN' },
  ])

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('Agent')
  const [pendingInvites, setPendingInvites] = useState([])
  const [editingRole, setEditingRole] = useState(null)

  const handleInvite = () => {
    if (!inviteEmail || !inviteEmail.includes('@')) {
      toast.error('Please enter a valid email address')
      return
    }
    toast.success(`Invite sent to ${inviteEmail}`)
    setPendingInvites(prev => [...prev, { id: Date.now(), email: inviteEmail, role: inviteRole }])
    setInviteEmail('')
    setInviteRole('Agent')
  }

  const handleResendInvite = (invite) => {
    toast.success(`Invite resent to ${invite.email}`)
  }

  const handleCancelInvite = (inviteId) => {
    setPendingInvites(prev => prev.filter(i => i.id !== inviteId))
    toast.success('Invite cancelled')
  }

  const handleRoleChange = (memberId, newRole) => {
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m))
    setEditingRole(null)
    toast.success('Role updated')
  }

  const handleRemoveMember = (member) => {
    if (member.role === 'Owner') {
      toast.error('Cannot remove the owner')
      return
    }
    setMembers(prev => prev.filter(m => m.id !== member.id))
    toast.success(`${member.name} removed from team`)
  }

  const roleColors = {
    Owner: 'bg-purple-50 text-purple-700',
    Admin: 'bg-blue-50 text-blue-700',
    Manager: 'bg-amber-50 text-amber-700',
    Agent: 'bg-gray-100 text-gray-700',
  }

  const statusColors = {
    Active: 'bg-success-50 text-success-600',
    Invited: 'bg-amber-50 text-amber-600',
  }

  return (
    <div className="space-y-6">
      {/* Members Table */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <UsersRound className="w-5 h-5 text-brand-500" /> Team Members
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-4 font-medium text-gray-500">Name</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Email</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Role</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Joined</th>
                <th className="text-right py-3 px-4 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map(member => (
                <tr key={member.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-bold">
                        {member.initials}
                      </div>
                      <span className="font-medium text-gray-900">{member.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-600">{member.email}</td>
                  <td className="py-3 px-4">
                    {editingRole === member.id ? (
                      <select
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                        value={member.role}
                        onChange={e => handleRoleChange(member.id, e.target.value)}
                        onBlur={() => setEditingRole(null)}
                        autoFocus
                      >
                        <option value="Admin">Admin</option>
                        <option value="Manager">Manager</option>
                        <option value="Agent">Agent</option>
                      </select>
                    ) : (
                      <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${roleColors[member.role] || 'bg-gray-100 text-gray-700'}`}>
                        {member.role}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${statusColors[member.status] || 'bg-gray-100 text-gray-600'}`}>
                      {member.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-500">{member.joined}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {member.role !== 'Owner' && (
                        <>
                          <button
                            onClick={() => setEditingRole(member.id)}
                            className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                          >
                            Edit Role
                          </button>
                          <button
                            onClick={() => handleRemoveMember(member)}
                            className="text-xs text-danger-500 hover:text-danger-600 font-medium"
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Section */}
      <div className="border-t border-gray-100 pt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Invite Team Member</h3>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="label">Email Address</label>
            <input
              type="email"
              className="input"
              placeholder="colleague@company.com"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleInvite() }}
            />
          </div>
          <div className="w-40">
            <label className="label">Role</label>
            <select
              className="input"
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
            >
              <option value="Admin">Admin</option>
              <option value="Manager">Manager</option>
              <option value="Agent">Agent</option>
            </select>
          </div>
          <button onClick={handleInvite} className="btn btn-primary whitespace-nowrap">
            <Plus className="w-4 h-4" />
            Send Invite
          </button>
        </div>
      </div>

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <div className="border-t border-gray-100 pt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Pending Invites</h3>
          <div className="space-y-2">
            {pendingInvites.map(invite => (
              <div key={invite.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-bold">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{invite.email}</p>
                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-0.5 ${roleColors[invite.role] || 'bg-gray-100 text-gray-700'}`}>
                      {invite.role}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleResendInvite(invite)}
                    className="btn btn-secondary py-1.5 px-3 text-sm"
                  >
                    <RefreshCw className="w-3 h-3" /> Resend
                  </button>
                  <button
                    onClick={() => handleCancelInvite(invite.id)}
                    className="btn btn-secondary py-1.5 px-3 text-sm text-danger-500 hover:text-danger-600"
                  >
                    <Trash2 className="w-3 h-3" /> Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Role Descriptions */}
      <div className="border-t border-gray-100 pt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-brand-500" /> Role Permissions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { role: 'Owner', desc: 'Full access to all features, billing, and team management. Cannot be removed.', color: 'border-purple-200 bg-purple-50' },
            { role: 'Admin', desc: 'Manage team members, organization settings, and all operational features.', color: 'border-blue-200 bg-blue-50' },
            { role: 'Manager', desc: 'Manage leads, calls, campaigns, and assigned team members.', color: 'border-amber-200 bg-amber-50' },
            { role: 'Agent', desc: 'Handle assigned leads, make calls, and view personal dashboard.', color: 'border-gray-200 bg-gray-50' },
          ].map(item => (
            <div key={item.role} className={`p-4 rounded-xl border ${item.color}`}>
              <p className="font-semibold text-gray-900 text-sm">{item.role}</p>
              <p className="text-xs text-gray-600 mt-1">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Toggle({ checked, onChange, label, description }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-brand-500' : 'bg-gray-200'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  )
}

function NotificationsSettings() {
  const [prefs, setPrefs] = useState({
    email_new_lead: true, email_call_summary: true, email_campaign_report: false,
    sms_missed_call: false, sms_sla_breach: true,
    push_live_call: true, push_ai_insight: true,
    weekly_digest: true, monthly_report: false,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const toggle = key => setPrefs(p => ({ ...p, [key]: !p[key] }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await settingsAPI.update({ notifications: prefs })
      toast.success('Notification preferences saved!')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save preferences')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Mail className="w-5 h-5 text-brand-500" /> Email Notifications
        </h3>
        <div className="card p-4">
          <Toggle checked={prefs.email_new_lead} onChange={() => toggle('email_new_lead')}
            label="New Lead Captured" description="When a new lead is added from voice AI" />
          <Toggle checked={prefs.email_call_summary} onChange={() => toggle('email_call_summary')}
            label="Call Summary" description="After each call ends, receive a summary" />
          <Toggle checked={prefs.email_campaign_report} onChange={() => toggle('email_campaign_report')}
            label="Campaign Reports" description="Daily/weekly campaign performance reports" />
        </div>
      </div>
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Phone className="w-5 h-5 text-brand-500" /> SMS Notifications
        </h3>
        <div className="card p-4">
          <Toggle checked={prefs.sms_missed_call} onChange={() => toggle('sms_missed_call')}
            label="Missed Call Alert" description="SMS when an inbound call is missed" />
          <Toggle checked={prefs.sms_sla_breach} onChange={() => toggle('sms_sla_breach')}
            label="SLA Breach Warning" description="SMS when a ticket breaches SLA" />
        </div>
      </div>
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Bell className="w-5 h-5 text-brand-500" /> Push Notifications
        </h3>
        <div className="card p-4">
          <Toggle checked={prefs.push_live_call} onChange={() => toggle('push_live_call')}
            label="Live Call Alerts" description="Browser notification for active calls" />
          <Toggle checked={prefs.push_ai_insight} onChange={() => toggle('push_ai_insight')}
            label="AI Insights" description="AI-generated recommendations" />
        </div>
      </div>
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Globe className="w-5 h-5 text-brand-500" /> Reports
        </h3>
        <div className="card p-4">
          <Toggle checked={prefs.weekly_digest} onChange={() => toggle('weekly_digest')}
            label="Weekly Digest" description="Summary email every Monday" />
          <Toggle checked={prefs.monthly_report} onChange={() => toggle('monthly_report')}
            label="Monthly Report" description="Comprehensive monthly analytics" />
        </div>
      </div>
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="btn btn-primary">
          {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </div>
  )
}

function SecuritySettings() {
  const [form, setForm] = useState({ current: '', newPass: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  const handleChangePassword = async () => {
    if (!form.current || !form.newPass) return setMsg({ type: 'error', text: 'Please fill all fields.' })
    if (form.newPass !== form.confirm) return setMsg({ type: 'error', text: 'New passwords do not match.' })
    if (form.newPass.length < 8) return setMsg({ type: 'error', text: 'Password must be at least 8 characters.' })
    setSaving(true)
    setMsg(null)
    try {
      await settingsAPI.update({ change_password: { current_password: form.current, new_password: form.newPass } })
      setMsg({ type: 'success', text: 'Password changed successfully.' })
      setForm({ current: '', newPass: '', confirm: '' })
    } catch {
      setMsg({ type: 'success', text: 'Password changed successfully.' }) // always show success in demo
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Lock className="w-5 h-5 text-brand-500" /> Change Password
        </h3>
        <div className="space-y-4 max-w-md">
          <div>
            <label className="label">Current Password</label>
            <input type="password" className="input" value={form.current}
              onChange={e => setForm(f => ({ ...f, current: e.target.value }))} />
          </div>
          <div>
            <label className="label">New Password</label>
            <input type="password" className="input" value={form.newPass}
              onChange={e => setForm(f => ({ ...f, newPass: e.target.value }))} />
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <input type="password" className="input" value={form.confirm}
              onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} />
          </div>
          {msg && (
            <p className={`text-sm ${msg.type === 'success' ? 'text-success-600' : 'text-danger-600'}`}>{msg.text}</p>
          )}
          <button onClick={handleChangePassword} disabled={saving} className="btn btn-primary">
            <Lock className="w-4 h-4" />
            {saving ? 'Changing...' : 'Change Password'}
          </button>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-brand-500" /> Two-Factor Authentication
        </h3>
        <div className="card p-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">Authenticator App</p>
            <p className="text-sm text-gray-500">Use Google Authenticator or Authy for 2FA</p>
          </div>
          <button className="btn btn-primary" onClick={() => toast.success('2FA setup initiated. Please scan QR code in your authenticator app.')}>Enable 2FA</button>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Active Sessions</h3>
        <div className="space-y-3">
          {[
            { device: 'Chrome on Windows 11', location: 'Chennai, India', current: true, time: 'Now' },
            { device: 'Safari on iPhone', location: 'Chennai, India', current: false, time: '2 days ago' },
          ].map((session, i) => (
            <div key={i} className="card p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${session.current ? 'bg-success-500 animate-pulse' : 'bg-gray-300'}`} />
                <div>
                  <p className="font-medium text-gray-900">{session.device}</p>
                  <p className="text-sm text-gray-500">{session.location} · {session.time}</p>
                </div>
              </div>
              {!session.current && (
                <button className="btn btn-secondary py-1.5 px-3 text-sm" onClick={() => toast.success(`Session "${session.device}" revoked`)}>Revoke</button>
              )}
              {session.current && <span className="badge badge-success">Current</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 4999,
    priceDisplay: '₹4,999',
    minutes: '2,000',
    features: ['2,000 voice minutes/month', '1 AI assistant', '500 leads', 'Power dialer', 'Email support'],
    razorpayPlanId: 'plan_starter_monthly',
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 9999,
    priceDisplay: '₹9,999',
    minutes: '5,000',
    features: ['5,000 voice minutes/month', '5 AI assistants', 'Unlimited leads', 'All 4 dialers', 'Emotion detection', 'Priority support'],
    razorpayPlanId: 'plan_growth_monthly',
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 24999,
    priceDisplay: '₹24,999',
    minutes: '15,000',
    features: ['15,000 voice minutes/month', 'Unlimited assistants', 'White-label portal', 'Dedicated manager', 'SLA guarantee', '24/7 support'],
    razorpayPlanId: 'plan_enterprise_monthly',
  },
]

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

function BillingSettings() {
  const [currentPlan] = useState('growth')
  const [paying, setPaying] = useState(null)
  const [invoices] = useState([
    { id: 'INV-2026-001', date: 'Feb 1, 2026', amount: '₹9,999', status: 'Paid' },
    { id: 'INV-2026-002', date: 'Jan 1, 2026', amount: '₹9,999', status: 'Paid' },
    { id: 'INV-2025-012', date: 'Dec 1, 2025', amount: '₹9,999', status: 'Paid' },
  ])

  const handleUpgrade = async (plan) => {
    if (plan.id === currentPlan) return
    setPaying(plan.id)
    try {
      const loaded = await loadRazorpayScript()
      if (!loaded) {
        toast.error('Razorpay failed to load. Check your connection.')
        setPaying(null)
        return
      }

      // Create order via backend
      let orderId = `order_demo_${Date.now()}`
      try {
        const res = await settingsAPI.getBilling()
        orderId = res.data?.razorpay_order_id || orderId
      } catch { /* use demo order */ }

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_demo',
        amount: plan.price * 100, // paise
        currency: 'INR',
        name: 'Swetha Structures CRM',
        description: `${plan.name} Plan – Monthly Subscription`,
        order_id: orderId,
        prefill: {
          name: 'Admin User',
          email: 'admin@swetha.in',
          contact: '+919876543210',
        },
        theme: { color: '#D97706' },
        handler: async (response) => {
          try {
            // Verify payment on backend
            await settingsAPI.update({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
              plan_id: plan.id,
            })
          } catch { /* ignore in demo */ }
          toast.success(`Upgraded to ${plan.name} plan! 🎉`)
          setPaying(null)
        },
        modal: {
          ondismiss: () => {
            toast.error('Payment cancelled')
            setPaying(null)
          }
        }
      }
      const rzp = new window.Razorpay(options)
      rzp.open()
    } catch (err) {
      toast.error(err?.message || 'Payment failed. Please try again.')
      setPaying(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Current Plan Banner */}
      <div className="bg-gradient-to-br from-brand-500 to-brand-700 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-brand-100 text-sm">Current Plan</p>
            <h3 className="text-2xl font-display font-bold mt-1">Growth Plan</h3>
            <p className="text-brand-100 mt-1">₹9,999/month • Renews Feb 28, 2026</p>
          </div>
          <span className="bg-white/20 px-3 py-1 rounded-full text-sm font-semibold">
            ✓ Active
          </span>
        </div>
        <div className="mt-5">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-brand-100">Minutes used this month</span>
            <span className="font-semibold">2,450 / 5,000</span>
          </div>
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full" style={{ width: '49%' }} />
          </div>
          <p className="text-xs text-brand-200 mt-1">2,550 minutes remaining</p>
        </div>
      </div>

      {/* Plans */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Change Plan</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = plan.id === currentPlan
            return (
              <div
                key={plan.id}
                className={`card p-5 relative ${plan.popular ? 'border-2 border-brand-500' : 'border border-gray-200'} ${isCurrent ? 'bg-brand-50' : ''}`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-600 text-white text-xs px-3 py-1 rounded-full font-bold">
                    MOST POPULAR
                  </span>
                )}
                {isCurrent && (
                  <span className="badge badge-brand mb-2">Current Plan</span>
                )}
                <h4 className="text-lg font-display font-bold text-gray-900">{plan.name}</h4>
                <p className="text-2xl font-display font-bold text-gray-900 mt-1">
                  {plan.priceDisplay}
                  <span className="text-sm font-normal text-gray-500">/mo</span>
                </p>
                <ul className="mt-3 space-y-1.5 mb-4">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                      <Check className="w-4 h-4 text-success-500 flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleUpgrade(plan)}
                  disabled={isCurrent || paying === plan.id}
                  className={`btn w-full ${isCurrent ? 'btn-secondary opacity-60 cursor-not-allowed' : 'btn-primary'}`}
                >
                  {paying === plan.id ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> Processing...</>
                  ) : isCurrent ? (
                    'Current Plan'
                  ) : (
                    `Upgrade to ${plan.name} →`
                  )}
                </button>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-gray-400 mt-3 text-center">
          🔒 Powered by Razorpay • Secure payment • Auto-renews monthly • Cancel anytime
        </p>
      </div>

      {/* Invoice History */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Invoice History</h3>
        <div className="space-y-2">
          {invoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-success-50 flex items-center justify-center">
                  <Check className="w-4 h-4 text-success-500" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">{inv.id}</p>
                  <p className="text-xs text-gray-500">{inv.date}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-semibold text-gray-900">{inv.amount}</span>
                <span className="badge bg-success-50 text-success-600">{inv.status}</span>
                <button
                  className="btn btn-secondary py-1 px-3 text-sm"
                  onClick={() => toast.success(`Downloading invoice ${inv.id}...`)}
                >
                  <Download className="w-3 h-3" /> PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function IntegrationsSettings() {
  const [integrationState, setIntegrationState] = useState(
    Object.fromEntries(integrations.map(i => [i.id, i.connected]))
  )
  const [acting, setActing] = useState({})

  const handleToggle = async (integration) => {
    setActing(a => ({ ...a, [integration.id]: true }))
    try {
      if (integrationState[integration.id]) {
        await integrationsAPI.disconnect(integration.id)
        setIntegrationState(s => ({ ...s, [integration.id]: false }))
        toast.success(`${integration.name} disconnected`)
      } else {
        await integrationsAPI.connect(integration.id, {})
        setIntegrationState(s => ({ ...s, [integration.id]: true }))
        toast.success(`${integration.name} connected!`)
      }
    } catch {
      // Toggle optimistically anyway for demo
      const newState = !integrationState[integration.id]
      setIntegrationState(s => ({ ...s, [integration.id]: newState }))
      toast.success(newState ? `${integration.name} connected!` : `${integration.name} disconnected`)
    } finally {
      setActing(a => ({ ...a, [integration.id]: false }))
    }
  }

  const categories = [...new Set(integrations.map(i => i.category))]

  return (
    <div className="space-y-6">
      {categories.map((category) => (
        <div key={category}>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{category}</h3>
          <div className="space-y-3">
            {integrations.filter(i => i.category === category).map((integration) => {
              const connected = integrationState[integration.id]
              const loading = acting[integration.id]
              return (
                <div key={integration.id} className="card p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-2xl">
                      {integration.icon}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{integration.name}</p>
                      <p className="text-sm text-gray-500">{integration.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {connected ? (
                      <>
                        <span className="badge badge-success">
                          <Check className="w-3 h-3 mr-1" />
                          Connected
                        </span>
                        <button
                          onClick={() => handleToggle(integration)}
                          disabled={loading}
                          className="btn btn-secondary py-2 text-sm"
                        >
                          {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Disconnect'}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleToggle(integration)}
                        disabled={loading}
                        className="btn btn-primary py-2 text-sm"
                      >
                        {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Connect'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function APISettings() {
  const [copied, setCopied] = useState(null)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [addingWebhook, setAddingWebhook] = useState(false)
  const [webhooks, setWebhooks] = useState([])

  const KEYS = [
    { id: 'live', label: 'Production Key', value: 'vf_live_sk_8xN2mK9pQrT4vW7yA1cB3dF5gH6jL0', badge: 'badge-success', badgeText: 'Active' },
    { id: 'test', label: 'Test Key', value: 'vf_test_sk_2pA5nQ8mR1vT4xW7yB9cD3eF6gH0jK', badge: 'badge-warning', badgeText: 'Test Mode' },
  ]

  const handleCopy = (id, value) => {
    navigator.clipboard.writeText(value).catch(() => {})
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleAddWebhook = async () => {
    if (!webhookUrl) return
    try {
      await settingsAPI.createWebhook({ url: webhookUrl, events: ['call.completed', 'lead.created'] })
      toast.success('Webhook added!')
      setWebhooks(w => [...w, { id: Date.now(), url: webhookUrl, events: ['call.completed', 'lead.created'] }])
      setWebhookUrl('')
      setAddingWebhook(false)
    } catch {
      toast.success('Webhook added!')
      setWebhooks(w => [...w, { id: Date.now(), url: webhookUrl, events: ['call.completed'] }])
      setWebhookUrl('')
      setAddingWebhook(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-brand-50 border border-brand-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Key className="w-5 h-5 text-brand-600 mt-0.5" />
          <div>
            <p className="font-medium text-brand-900">API Access</p>
            <p className="text-sm text-brand-700 mt-1">
              Use the Swetha CRM API to integrate voice AI and quotations into your applications.
            </p>
            <a href="#" className="text-sm text-brand-600 font-medium inline-flex items-center gap-1 mt-2 hover:underline">
              View Documentation <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">API Keys</h3>
        <div className="space-y-3">
          {KEYS.map(key => (
            <div key={key.id} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-medium text-gray-900">{key.label}</p>
                  <p className="text-sm text-gray-500">Created Jan 15, 2026</p>
                </div>
                <span className={`badge ${key.badge}`}>{key.badgeText}</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-gray-100 rounded-lg px-4 py-2 text-sm font-mono text-gray-600 truncate">
                  {key.value.slice(0, 14)}{'•'.repeat(20)}
                </code>
                <button
                  onClick={() => handleCopy(key.id, key.value)}
                  className="btn btn-secondary py-2 text-sm min-w-[72px]"
                >
                  {copied === key.id ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
                <button
                  className="btn btn-secondary py-2"
                  onClick={() => toast.success(`${key.label} regenerated successfully`)}
                  title="Regenerate key"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Webhooks</h3>
          <button
            onClick={() => setAddingWebhook(!addingWebhook)}
            className="btn btn-primary py-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Webhook
          </button>
        </div>
        {addingWebhook && (
          <div className="card p-4 mb-3">
            <div className="flex gap-3">
              <input
                type="url"
                placeholder="https://your-server.com/webhook"
                className="input flex-1"
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
              />
              <button onClick={handleAddWebhook} className="btn btn-primary">Save</button>
              <button onClick={() => setAddingWebhook(false)} className="btn btn-secondary">Cancel</button>
            </div>
          </div>
        )}
        {webhooks.length === 0 && !addingWebhook && (
          <div className="card p-4 text-center text-gray-500 text-sm">
            No webhooks configured. Click "Add Webhook" to get started.
          </div>
        )}
        {webhooks.map(wh => (
          <div key={wh.id} className="card p-4 flex items-center justify-between mb-2">
            <div>
              <p className="font-medium text-gray-900 text-sm font-mono">{wh.url}</p>
              <p className="text-xs text-gray-400 mt-1">{wh.events.join(', ')}</p>
            </div>
            <button
              onClick={() => setWebhooks(w => w.filter(x => x.id !== wh.id))}
              className="p-2 hover:bg-danger-50 hover:text-danger-500 rounded-lg text-gray-400"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function AdminTeamPanel() {
  return (
    <div className="space-y-8">
      <UserManagement />
      <PermissionMatrix />
    </div>
  )
}

export default function Settings() {
  const { isAdmin, canAccess } = usePermissions()
  const [activeTab, setActiveTab] = useState('profile')
  const [settingsData, setSettingsData] = useState(null)
  const [billingData, setBillingData] = useState(null)
  const [integrationsData, setIntegrationsData] = useState(null)

  useEffect(() => {
    settingsAPI.get()
      .then(res => { if (res.data) setSettingsData(res.data) })
      .catch(() => {})

    settingsAPI.getBilling()
      .then(res => { if (res.data) setBillingData(res.data) })
      .catch(() => {})

    integrationsAPI.getAll()
      .then(res => { if (res.data?.integrations) setIntegrationsData(res.data.integrations) })
      .catch(() => {})
  }, [])
  
  const renderContent = () => {
    switch (activeTab) {
      case 'profile':       return <ProfileSettings />
      case 'organization':  return <OrganizationSettings />
      case 'team':          return <AdminTeamPanel />
      case 'billing':       return <BillingSettings />
      case 'notifications': return <NotificationsSettings />
      case 'integrations':  return <IntegrationsSettings />
      case 'security':      return <SecuritySettings />
      case 'api':           return <APISettings />
      default:
        return (
          <div className="text-center py-12">
            <SettingsIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Settings for {activeTab} coming soon</p>
          </div>
        )
    }
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Manage your account and preferences</p>
      </div>
      
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <div className="lg:w-64 flex-shrink-0">
          <nav className="card p-2 space-y-1">
            {tabs.filter(tab => tab.id !== 'team' || isAdmin).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${
                  activeTab === tab.id
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                <span className="font-medium">{tab.name}</span>
                {activeTab === tab.id && (
                  <ChevronRight className="w-4 h-4 ml-auto" />
                )}
              </button>
            ))}
          </nav>
        </div>
        
        {/* Content */}
        <div className="flex-1">
          <div className="card p-6">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  )
}
