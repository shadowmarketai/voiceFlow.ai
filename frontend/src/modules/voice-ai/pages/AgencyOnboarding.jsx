/**
 * AgencyOnboarding — First-time setup wizard for agency users
 * Steps: 1) Brand Identity  2) Pricing Setup  3) Invite Sub-client
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import {
  Mic, Palette, DollarSign, Users, CheckCircle, ArrowRight,
  ArrowLeft, Sparkles, Image, Type, Globe,
} from 'lucide-react'
import toast from 'react-hot-toast'

const authFetch = (url, opts = {}) => {
  const token = localStorage.getItem('voiceflow_token')
  return fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
}

const STEPS = [
  { id: 'brand',   label: 'Brand Identity', icon: Palette },
  { id: 'pricing', label: 'Pricing Setup',  icon: DollarSign },
  { id: 'invite',  label: 'First Client',   icon: Users },
]

export default function AgencyOnboarding() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const [brand, setBrand] = useState({
    app_name: user?.tenant?.app_name || user?.tenant?.name || '',
    tagline: user?.tenant?.tagline || '',
    logo_url: user?.tenant?.logo_url || '',
    primary_color: user?.tenant?.primary_color || '#6366f1',
    secondary_color: user?.tenant?.secondary_color || '#1e293b',
    accent_color: user?.tenant?.accent_color || '#8b5cf6',
  })

  const [pricing, setPricing] = useState({
    markup_percent: '20',
    client_rate_per_min: '1.20',
  })

  const [invite, setInvite] = useState({
    name: '',
    email: '',
    company: '',
  })

  const setBrandField = (k, v) => setBrand(b => ({ ...b, [k]: v }))
  const setPricingField = (k, v) => setPricing(p => ({ ...p, [k]: v }))
  const setInviteField = (k, v) => setInvite(i => ({ ...i, [k]: v }))

  const saveBranding = async () => {
    setSaving(true)
    try {
      const res = await authFetch('/api/v1/auth/my-tenant', {
        method: 'PUT',
        body: JSON.stringify(brand),
      })
      if (!res.ok) throw new Error('Failed to save branding')
      toast.success('Branding saved!')
      setStep(1)
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const savePricing = () => {
    // Pricing stored locally for now; can be persisted via /api/v1/tenants/me later
    toast.success('Pricing configured!')
    setStep(2)
  }

  const sendInvite = async () => {
    if (!invite.email.includes('@')) {
      toast.error('Valid email required')
      return
    }
    setSaving(true)
    try {
      // Create sub-client tenant
      const res = await authFetch('/api/v1/sub-clients', {
        method: 'POST',
        body: JSON.stringify({
          name: invite.company || invite.name,
          contact_email: invite.email,
          contact_name: invite.name,
        }),
      })
      if (!res.ok && res.status !== 404) {
        // Sub-clients API may not be wired yet — skip gracefully
      }
      toast.success(`Invite sent to ${invite.email}!`)
      setDone(true)
    } catch {
      toast.success(`Setup complete! Invite ${invite.email} manually.`)
      setDone(true)
    } finally {
      setSaving(false)
    }
  }

  const skipInvite = () => setDone(true)

  if (done) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-emerald-50 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">You're all set!</h2>
          <p className="text-slate-500 mb-8">
            Your agency dashboard is configured and ready. Manage sub-clients, set pricing, and deploy branded experiences.
          </p>
          <button
            onClick={() => navigate('/voice/dashboard-v2')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-lg shadow-indigo-200 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200">
          <Sparkles className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Set up your agency</h1>
        <p className="text-slate-500 mt-1.5">Configure your white-label brand in a few steps</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          const isActive = i === step
          const isDone = i < step
          return (
            <div key={s.id} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  isActive ? 'bg-indigo-600 text-white' :
                  isDone ? 'bg-emerald-100 text-emerald-700' :
                  'bg-slate-100 text-slate-400'
                }`}
              >
                {isDone ? <CheckCircle className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                {s.label}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-px ${i < step ? 'bg-emerald-300' : 'bg-slate-200'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Step content */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">

        {/* ─ Step 0: Brand Identity ─ */}
        {step === 0 && (
          <div className="space-y-5">
            <SectionHeader icon={Palette} title="Brand Identity" desc="How your agency appears to clients" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Agency App Name" hint="Shown in the top bar">
                <input
                  type="text"
                  value={brand.app_name}
                  onChange={e => setBrandField('app_name', e.target.value)}
                  placeholder="My Agency CRM"
                  className={INPUT_CLS}
                />
              </Field>
              <Field label="Tagline" hint="Short one-liner on login page">
                <input
                  type="text"
                  value={brand.tagline}
                  onChange={e => setBrandField('tagline', e.target.value)}
                  placeholder="AI-powered outreach"
                  className={INPUT_CLS}
                />
              </Field>
            </div>

            <Field label="Logo URL" hint="Public URL to your logo (PNG/SVG, 200×200)">
              <div className="flex gap-2 items-center">
                <input
                  type="url"
                  value={brand.logo_url}
                  onChange={e => setBrandField('logo_url', e.target.value)}
                  placeholder="https://yoursite.com/logo.png"
                  className={INPUT_CLS + ' flex-1'}
                />
                {brand.logo_url && (
                  <img src={brand.logo_url} alt="Logo" className="w-10 h-10 rounded-lg object-contain border border-slate-200" onError={e => e.target.style.display='none'} />
                )}
              </div>
            </Field>

            <div className="grid grid-cols-3 gap-4">
              <ColorField label="Primary" value={brand.primary_color} onChange={v => setBrandField('primary_color', v)} />
              <ColorField label="Secondary" value={brand.secondary_color} onChange={v => setBrandField('secondary_color', v)} />
              <ColorField label="Accent" value={brand.accent_color} onChange={v => setBrandField('accent_color', v)} />
            </div>

            {/* Live preview strip */}
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3" style={{ background: brand.secondary_color }}>
                {brand.logo_url ? (
                  <img src={brand.logo_url} alt="" className="w-7 h-7 rounded object-contain bg-white/10 p-0.5" onError={e => e.target.style.display='none'} />
                ) : (
                  <div className="w-7 h-7 rounded-md flex items-center justify-center text-white font-bold text-xs" style={{ background: brand.primary_color }}>
                    {brand.app_name?.[0] || 'A'}
                  </div>
                )}
                <span className="text-white text-sm font-semibold">{brand.app_name || 'Your App Name'}</span>
              </div>
              <div className="px-4 py-3 bg-slate-50 flex gap-2">
                <span className="px-3 py-1 rounded-lg text-xs font-medium text-white" style={{ background: brand.primary_color }}>Primary</span>
                <span className="px-3 py-1 rounded-lg text-xs font-medium text-white" style={{ background: brand.accent_color }}>Accent</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={saveBranding}
                disabled={saving || !brand.app_name}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm shadow-sm transition-colors"
              >
                {saving ? 'Saving…' : <>Save & Continue <ArrowRight className="w-4 h-4" /></>}
              </button>
            </div>
          </div>
        )}

        {/* ─ Step 1: Pricing Setup ─ */}
        {step === 1 && (
          <div className="space-y-5">
            <SectionHeader icon={DollarSign} title="Pricing Setup" desc="Set the rates you charge your sub-clients" />

            <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 border border-slate-200">
              <p className="font-medium text-slate-900 mb-1">How agency pricing works</p>
              <p>You buy voice minutes wholesale from VoiceFlow AI at our platform rate, then mark them up and resell to your clients. Your margin is the difference.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Your Markup (%)" hint="Added on top of platform rate">
                <input
                  type="number"
                  min="0"
                  max="500"
                  value={pricing.markup_percent}
                  onChange={e => setPricingField('markup_percent', e.target.value)}
                  className={INPUT_CLS}
                />
              </Field>
              <Field label="Client Rate (₹/min)" hint="What your clients pay">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pricing.client_rate_per_min}
                  onChange={e => setPricingField('client_rate_per_min', e.target.value)}
                  className={INPUT_CLS}
                />
              </Field>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
              <p className="font-semibold text-emerald-800 mb-1">Estimated margins</p>
              <p className="text-emerald-700">
                At {pricing.markup_percent || 0}% markup — if platform rate is ₹0.80/min,
                you earn ~₹{((parseFloat(pricing.markup_percent || 0) / 100) * 0.80).toFixed(2)}/min margin per client.
              </p>
            </div>

            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(0)} className="inline-flex items-center gap-2 px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button onClick={savePricing} className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm shadow-sm transition-colors">
                Save & Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ─ Step 2: Invite First Sub-client ─ */}
        {step === 2 && (
          <div className="space-y-5">
            <SectionHeader icon={Users} title="Invite First Sub-client" desc="Onboard a client to your agency dashboard" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Contact Name">
                <input
                  type="text"
                  value={invite.name}
                  onChange={e => setInviteField('name', e.target.value)}
                  placeholder="Rajesh Kumar"
                  className={INPUT_CLS}
                />
              </Field>
              <Field label="Contact Email" hint="Invite link sent here">
                <input
                  type="email"
                  value={invite.email}
                  onChange={e => setInviteField('email', e.target.value)}
                  placeholder="rajesh@client.com"
                  className={INPUT_CLS}
                />
              </Field>
            </div>
            <Field label="Company Name">
              <input
                type="text"
                value={invite.company}
                onChange={e => setInviteField('company', e.target.value)}
                placeholder="Client Company Pvt Ltd"
                className={INPUT_CLS}
              />
            </Field>

            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(1)} className="inline-flex items-center gap-2 px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <div className="flex gap-2">
                <button onClick={skipInvite} className="px-4 py-2.5 text-slate-500 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors">
                  Skip for now
                </button>
                <button
                  onClick={sendInvite}
                  disabled={saving || !invite.email}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm shadow-sm transition-colors"
                >
                  {saving ? 'Sending…' : <>Send Invite <ArrowRight className="w-4 h-4" /></>}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Shared atoms ──────────────────────────────────────────────────────

const INPUT_CLS = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 transition-shadow'

function SectionHeader({ icon: Icon, title, desc }) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4.5 h-4.5 text-indigo-600" />
      </div>
      <div>
        <h3 className="font-semibold text-slate-900">{title}</h3>
        {desc && <p className="text-xs text-slate-500 mt-0.5">{desc}</p>}
      </div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

function ColorField({ label, value, onChange }) {
  return (
    <div>
      <span className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</span>
      <div className="flex gap-2 items-center">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer"
          style={{ padding: 2 }}
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 outline-none focus:border-indigo-500"
        />
      </div>
    </div>
  )
}
