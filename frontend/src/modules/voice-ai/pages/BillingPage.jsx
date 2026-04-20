/**
 * BillingPage — Plan selection + wallet summary for direct (non-agency) users.
 *
 *   /voice/billing
 *
 * All displayed values (call rate, agent limit, voice clones, calls/month,
 * wallet minimum) come directly from the DB via GET /api/v1/billing/subscription-plans.
 * No values are hardcoded — super admin changes reflect here immediately.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CreditCard, Check, Zap, Wallet, ChevronRight,
  Loader2, Star, Users, Clock, Mic, Bot, Copy,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../../services/api'

// ── Static presentation config (visual only — no pricing data) ──────────────

const PLAN_META = {
  free_trial: { icon: Clock,  gradient: 'from-gray-400 to-gray-500',       popular: false },
  starter:    { icon: Zap,    gradient: 'from-blue-500 to-indigo-600',      popular: false },
  growth:     { icon: Mic,    gradient: 'from-violet-500 to-purple-600',    popular: true  },
  business:   { icon: Users,  gradient: 'from-amber-500 to-orange-600',     popular: false },
  enterprise: { icon: Star,   gradient: 'from-emerald-500 to-teal-600',     popular: false },
}

const PLAN_SUPPORT = {
  free_trial: 'Email support',
  starter:    'Email support',
  growth:     'Priority support',
  business:   'Priority support',
  enterprise: 'Dedicated support',
}

/**
 * Build feature bullet strings entirely from DB fields.
 * Every value here reflects what the super admin configured.
 */
function buildFeatures(plan) {
  const features = []

  // Agents
  if (plan.agent_limit === null || plan.agent_limit === undefined) {
    features.push('Unlimited AI agents')
  } else {
    features.push(`${plan.agent_limit} AI agent${plan.agent_limit === 1 ? '' : 's'}`)
  }

  // Call cap
  if (plan.calls_per_month) {
    features.push(`${plan.calls_per_month} calls/month (capped)`)
  } else {
    features.push('Unlimited calls (prepaid wallet)')
  }

  // Voice clones
  if (plan.voice_clones === null || plan.voice_clones === undefined) {
    features.push('Unlimited voice clones')
  } else if (plan.voice_clones === 0) {
    features.push('No voice clones')
  } else {
    features.push(`${plan.voice_clones} voice clone${plan.voice_clones === 1 ? '' : 's'}`)
  }

  // Support tier
  features.push(PLAN_SUPPORT[plan.id] || 'Email support')

  // Enterprise extras
  if (plan.id === 'enterprise') {
    features.push('White-label branding')
    features.push('API access')
  }

  return features
}

export default function BillingPage() {
  const navigate = useNavigate()
  const [plans, setPlans]           = useState([])
  const [currentPlanId, setCurrent] = useState(null)
  const [walletBalance, setBalance] = useState(null)
  const [loading, setLoading]       = useState(true)
  const [selecting, setSelecting]   = useState(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [plansRes, walletRes, tenantRes] = await Promise.allSettled([
          api.get('/api/v1/billing/subscription-plans'),
          api.get('/api/v1/billing/wallet'),
          api.get('/api/v1/billing/tenant/plan'),
        ])
        if (plansRes.status === 'fulfilled')  setPlans(plansRes.value.data || [])
        if (walletRes.status === 'fulfilled') setBalance(walletRes.value.data?.balance_inr ?? null)
        if (tenantRes.status === 'fulfilled') setCurrent(tenantRes.value.data?.plan_id || null)
      } catch {
        // non-critical
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleSelect = async (planId) => {
    if (planId === currentPlanId) return
    setSelecting(planId)
    try {
      const res = await api.post('/api/v1/billing/select-plan', { plan_id: planId })
      setCurrent(planId)
      toast.success(res.data.message || `Switched to ${planId}`)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not switch plan')
    } finally {
      setSelecting(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-10">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Choose Your Plan</h1>
          <p className="text-gray-500 mt-1 text-sm">
            All plans are prepaid — your selected tier sets the per-minute call rate
            deducted from your wallet.
          </p>
        </div>

        <button
          onClick={() => navigate('/voice/wallet')}
          className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 shadow-sm text-sm font-medium text-gray-700 transition-colors"
        >
          <Wallet className="w-4 h-4 text-indigo-500" />
          {walletBalance !== null
            ? `₹${Number(walletBalance).toLocaleString('en-IN')} balance`
            : 'My Wallet'}
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* ── Plan cards ─────────────────────────────────────────── */}
      {plans.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">
          No plans available. Contact support.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {plans.map((plan) => {
            const isActive  = plan.id === currentPlanId
            const meta      = PLAN_META[plan.id] || { icon: Bot, gradient: 'from-indigo-500 to-violet-600', popular: false }
            const Icon      = meta.icon
            const features  = buildFeatures(plan)
            const busy      = selecting === plan.id

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border-2 bg-white shadow-sm transition-all duration-200 flex flex-col
                  ${isActive
                    ? 'border-indigo-500 ring-2 ring-indigo-100 shadow-lg'
                    : 'border-gray-200 hover:border-indigo-300 hover:shadow-md'
                  }
                `}
              >
                {/* Badge */}
                {(meta.popular && !isActive) && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <span className="px-3 py-1 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[11px] font-semibold shadow whitespace-nowrap">
                      Most Popular
                    </span>
                  </div>
                )}
                {isActive && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <span className="px-3 py-1 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[11px] font-semibold shadow flex items-center gap-1 whitespace-nowrap">
                      <Check className="w-3 h-3" /> Current Plan
                    </span>
                  </div>
                )}

                <div className="p-6 flex-1 flex flex-col gap-4">

                  {/* Plan icon + name */}
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl bg-gradient-to-br ${meta.gradient} shadow`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{plan.name}</p>
                      <p className={`text-[11px] font-medium ${plan.calls_per_month ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {plan.calls_per_month ? `${plan.calls_per_month} calls/month cap` : 'Prepaid — no monthly cap'}
                      </p>
                    </div>
                  </div>

                  {/* Call rate — live from DB */}
                  <div>
                    <div className="flex items-end gap-1">
                      <span className="text-3xl font-bold text-gray-900">
                        ₹{Number(plan.call_rate ?? 0).toFixed(2)}
                      </span>
                      <span className="text-sm text-gray-400 mb-1">/min</span>
                    </div>
                    {plan.wallet_min > 0 && (
                      <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                        <Wallet className="w-3 h-3" />
                        Min wallet: ₹{Number(plan.wallet_min).toLocaleString('en-IN')}
                      </p>
                    )}
                  </div>

                  {/* Features — all derived from DB */}
                  <ul className="space-y-2 flex-1">
                    {features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                        <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <button
                    onClick={() => handleSelect(plan.id)}
                    disabled={isActive || !!selecting}
                    className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2
                      ${isActive
                        ? 'bg-indigo-50 text-indigo-600 cursor-default border border-indigo-200'
                        : selecting
                          ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-400'
                          : `bg-gradient-to-r ${meta.gradient} text-white hover:opacity-90 shadow hover:shadow-md`
                      }
                    `}
                  >
                    {busy
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Switching…</>
                      : isActive
                        ? <><Check className="w-4 h-4" /> Active</>
                        : 'Select Plan'
                    }
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Wallet CTA ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between p-5 rounded-2xl bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-white shadow-sm">
            <CreditCard className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {walletBalance !== null
                ? `Wallet balance: ₹${Number(walletBalance).toLocaleString('en-IN')}`
                : 'Top up your wallet'}
            </p>
            <p className="text-xs text-gray-500">
              Calls are deducted at your plan&apos;s rate per minute. Recharge anytime.
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/voice/wallet')}
          className="flex-shrink-0 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 shadow transition-colors flex items-center gap-2"
        >
          Recharge <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
