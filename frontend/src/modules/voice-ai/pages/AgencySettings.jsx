/**
 * AgencySettings — /voice/agency-settings
 *
 * Full agency profile management: branding, domain, contact details, account.
 * Reads from GET /api/v1/auth/my-tenant and saves to PUT /api/v1/auth/my-tenant.
 */

import { useState, useEffect, useRef } from 'react'
import {
  Building2, Save, RefreshCw, AlertCircle, CheckCircle2,
  Globe, Mail, Phone, MapPin, Palette, Upload, ExternalLink,
  Copy, Eye, EyeOff, Image, Link, User, Shield,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../../contexts/AuthContext'

const API_BASE = import.meta.env.VITE_API_URL || ''

function authFetch(path, opts = {}) {
  const token = localStorage.getItem('voiceflow_token')
  return fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  }).then(async r => {
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.detail || `HTTP ${r.status}`)
    return data
  })
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
        <Icon className="w-4 h-4 text-indigo-500" />
        <h2 className="font-semibold text-gray-800">{title}</h2>
      </div>
      <div className="px-5 py-5 space-y-4">
        {children}
      </div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text', readOnly }) {
  return (
    <input
      type={type}
      value={value || ''}
      onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${readOnly ? 'bg-gray-50 text-gray-500' : 'bg-white text-gray-800'}`}
    />
  )
}

function ColorPicker({ label, value, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={value || '#6366f1'}
        onChange={e => onChange(e.target.value)}
        className="w-9 h-9 rounded-lg border border-gray-200 cursor-pointer p-0.5"
      />
      <div className="flex-1">
        <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
        <Input value={value} onChange={onChange} placeholder="#6366f1" />
      </div>
    </div>
  )
}

export default function AgencySettings() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  const [form, setForm] = useState({
    app_name: '',
    tagline: '',
    logo_url: '',
    favicon_url: '',
    primary_color: '#6366f1',
    secondary_color: '#1e1b4b',
    accent_color: '#f59e0b',
    font_family: '',
    sidebar_style: 'light',
    support_email: '',
    support_phone: '',
    website: '',
    address: '',
  })

  const [tenantSlug, setTenantSlug] = useState('')
  const [tenantName, setTenantName] = useState('')

  const load = () => {
    setLoading(true)
    authFetch('/api/v1/auth/my-tenant')
      .then(data => {
        setTenantSlug(data.slug || '')
        setTenantName(data.name || '')
        setForm(prev => ({
          ...prev,
          app_name:        data.app_name        || '',
          tagline:         data.tagline         || '',
          logo_url:        data.logo_url        || '',
          favicon_url:     data.favicon_url     || '',
          primary_color:   data.primary_color   || '#6366f1',
          secondary_color: data.secondary_color || '#1e1b4b',
          accent_color:    data.accent_color    || '#f59e0b',
          font_family:     data.font_family     || '',
          sidebar_style:   data.sidebar_style   || 'light',
          support_email:   data.support_email   || '',
          support_phone:   data.support_phone   || '',
          website:         data.website         || '',
          address:         data.address         || '',
        }))
      })
      .catch(e => toast.error(e.message || 'Failed to load settings'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    setSaving(true)
    try {
      await authFetch('/api/v1/auth/my-tenant', {
        method: 'PUT',
        body: JSON.stringify(form),
      })
      toast.success('Settings saved successfully')
    } catch (e) {
      toast.error(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const set = (field) => (val) => setForm(prev => ({ ...prev, [field]: val }))

  const loginUrl = `${window.location.origin}/login${tenantSlug ? `?t=${tenantSlug}` : ''}`

  const handleCopy = () => {
    navigator.clipboard.writeText(loginUrl).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4 max-w-3xl mx-auto">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agency Settings</h1>
          <p className="text-sm text-gray-500 mt-1">{tenantName} — Manage your white-label profile</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* ── Domain / Login URL ──────────────────────────────────── */}
      <Section title="Domain & Login URL" icon={Globe}>
        <Field label="Tenant Slug (Identifier)" hint="This is your unique identifier — cannot be changed here. Contact support to update.">
          <Input value={tenantSlug} readOnly />
        </Field>
        <Field label="Client Login URL" hint="Share this URL with your sub-clients so they land on your branded login page.">
          <div className="flex items-center gap-2">
            <div className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600 font-mono truncate">
              {loginUrl}
            </div>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors flex-shrink-0"
            >
              {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-500" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <a
              href={loginUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors flex-shrink-0"
            >
              <ExternalLink className="w-4 h-4 text-gray-500" />
            </a>
          </div>
        </Field>
        <Field label="Website URL" hint="Your agency/company website">
          <Input value={form.website} onChange={set('website')} placeholder="https://youragency.com" type="url" />
        </Field>
      </Section>

      {/* ── Brand Identity ────────────────────────────────────── */}
      <Section title="Brand Identity" icon={Image}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="App Name" hint="Shown to your sub-clients on their login page">
            <Input value={form.app_name} onChange={set('app_name')} placeholder="My Agency AI" />
          </Field>
          <Field label="Tagline" hint="Short description under your app name">
            <Input value={form.tagline} onChange={set('tagline')} placeholder="AI-powered voice agents" />
          </Field>
        </div>
        <Field label="Logo URL" hint="Direct URL to your logo image (PNG/SVG, recommended 200×50px)">
          <div className="flex items-center gap-3">
            <Input value={form.logo_url} onChange={set('logo_url')} placeholder="https://..." />
            {form.logo_url && (
              <img src={form.logo_url} alt="logo preview" className="h-9 w-auto rounded border border-gray-100 object-contain flex-shrink-0" onError={e => e.target.style.display='none'} />
            )}
          </div>
        </Field>
        <Field label="Favicon URL" hint="Small icon (32×32px) shown in browser tab">
          <Input value={form.favicon_url} onChange={set('favicon_url')} placeholder="https://..." />
        </Field>
      </Section>

      {/* ── Brand Colors ──────────────────────────────────────── */}
      <Section title="Brand Colors" icon={Palette}>
        <div className="grid grid-cols-1 gap-4">
          <ColorPicker label="Primary Color" value={form.primary_color} onChange={set('primary_color')} />
          <ColorPicker label="Secondary Color (Login background)" value={form.secondary_color} onChange={set('secondary_color')} />
          <ColorPicker label="Accent Color" value={form.accent_color} onChange={set('accent_color')} />
        </div>
        <Field label="Sidebar Style">
          <select
            value={form.sidebar_style || 'light'}
            onChange={e => set('sidebar_style')(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="colored">Colored (brand primary)</option>
          </select>
        </Field>
        {/* Live preview */}
        <div className="mt-2 rounded-xl overflow-hidden border border-gray-200">
          <div className="text-xs font-medium text-gray-500 px-3 py-2 border-b border-gray-100 bg-gray-50">Preview</div>
          <div
            className="h-16 flex items-center px-4 gap-3"
            style={{ background: form.secondary_color || '#1e1b4b' }}
          >
            {form.logo_url ? (
              <img src={form.logo_url} alt="" className="h-7 w-auto object-contain" onError={e => e.target.style.display='none'} />
            ) : (
              <span className="font-bold text-white text-sm">{form.app_name || 'Your App'}</span>
            )}
            <div
              className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: form.primary_color || '#6366f1', color: '#fff' }}
            >
              Sign In
            </div>
          </div>
        </div>
      </Section>

      {/* ── Contact & Support ─────────────────────────────────── */}
      <Section title="Contact & Support" icon={Mail}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Support Email">
            <Input value={form.support_email} onChange={set('support_email')} placeholder="support@youragency.com" type="email" />
          </Field>
          <Field label="Support Phone">
            <Input value={form.support_phone} onChange={set('support_phone')} placeholder="+91 98765 43210" />
          </Field>
        </div>
        <Field label="Address" hint="Your agency's registered address">
          <textarea
            value={form.address || ''}
            onChange={e => set('address')(e.target.value)}
            rows={3}
            placeholder="123 Business Street, City, State, PIN"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          />
        </Field>
      </Section>

      {/* ── Account Info (read-only) ──────────────────────────── */}
      <Section title="Account Info" icon={Shield}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Account Name">
            <Input value={tenantName} readOnly />
          </Field>
          <Field label="Your Email">
            <Input value={user?.email || ''} readOnly />
          </Field>
        </div>
        <p className="text-xs text-gray-400">
          To change your account name or plan, contact your platform administrator.
        </p>
      </Section>

      {/* Save button at bottom */}
      <div className="flex justify-end pb-4">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save All Changes'}
        </button>
      </div>
    </div>
  )
}
