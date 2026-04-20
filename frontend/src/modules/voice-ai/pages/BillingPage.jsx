/**
 * BillingPage — Plan selection + wallet summary for direct (non-agency) users.
 *
 *   /voice/billing
 *
 * Users see all active plans with call rates, pick one, then recharge
 * their wallet on the /voice/wallet page.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CreditCard, Check, Zap, Wallet, ChevronRight,
  Loader2, Star, Users, Clock, Mic,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../../services/api'

// Feature bullets per plan (display-only — values come from DB call_rate/limits)
const PLAN_FEATURES = {
  free_trial:  ['1 AI agent', '100 calls/month cap', 'All voice providers', 'Email support'],
  starter:     ['1 AI agent', 'Unlimited calls (prepaid)', 'All voice providers', 'Email support'],
  growth:      ['3 AI agents', 'Unlimited calls (prepaid)', '1 voice clone', 'Priority support'],
  business:    ['10 AI agents', 'Unlimited calls (prepaid)', '3 voice clones', 'Priority support', 'Analytics'],
  enterprise:  ['Unlimited agents', 'Unlimited calls (prepaid)', 'Unlimited clones', 'Dedicated support', 'White-label'],
}

const PLAN_ICONS = {
  free_trial: Clock,
  starter:    Zap,
  growth:     Mic,
  business:   Users,
  enterprise: Star,
}

const PLAN_COLORS = {
  free_trial: 'from-gray-400 to-gray-500',
  starter:    'from-blue-500 to-indigo-600',
  growth:     'from-violet-500 to-purple-600',
  business:   'from-amber-500 to-orange-600',
  enterprise: 'from-emerald-500 to-teal-600',
}

const POPULAR = new Set(['growth'])

export default function BillingPage() {
  const navigate = useNavigate()
  const [plans, setPlans]           = useState([])
  const [currentPlanId, setCurrent] = useState(null)
  const [walletBalance, setBalance] = useState(null)
  const [loading, setLoading]       = useState(true)
  const [selecting, setSelecting]   = useState(null) // plan id being selected

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
        // non-critical — page still renders with empty state
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Choose Your Plan</h1>
          <p className="text-gray-500 mt-1">
            All plans are prepaid — select a tier that sets your per-minute call rate.
            Recharge your wallet anytime.
          </p>
        </div>

        {/* Wallet shortcut */}
        <button
          onClick={() => navigate('/voice/wallet')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 shadow-sm text-sm font-medium text-gray-700 transition-colors"
        >
          <Wallet className="w-4 h-4 text-indigo-500" />
          {walletBalance !== null ? `₹${Number(walletBalance).toLocaleString('en-IN')} balance` : 'My Wallet'}
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* ── Plan cards ─────────────────────────────────────────── */}
      {plans.length === 0 ? (
        <div className="text-center py-20 text-gray-400">No plans available. Contact support.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {plans.map((plan) => {
            const isActive  = plan.id === currentPlanId
            const isPopular = POPULAR.has(plan.id)
            const Icon      = PLAN_ICONS[plan.id] || Zap
            const gradient  = PLAN_COLORS[plan.id] || 'from-indigo-500 to-violet-600'
            const features  = PLAN_FEATURES[plan.id] || []
            const busy      = selecting === plan.id

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border-2 bg-white shadow-sm transition-all duration-200 flex flex-col
                  ${isActive
                    ? 'border-indigo-500 shadow-indigo-100 shadow-lg'
                    : 'border-gray-200 hover:border-indigo-300 hover:shadow-md'
                  }
                `}
              >
                {/* Popular badge */}
                {isPopular && !isActive && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[11px] font-semibold shadow">
                      Most Popular
                    </span>
                  </div>
                )}

                {/* Active badge */}
                {isActive && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[11px] font-semibold shadow flex items-center gap-1">
                      <Check className="w-3 h-3" /> Current Plan
                    </span>
                  </div>
                )}

                <div className="p-6 flex-1 flex flex-col gap-5">
                  {/* Plan name + icon */}
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl bg-gradient-to-br ${gradient} shadow`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{plan.name}</p>
                      {plan.calls_per_month
                        ? <p className="text-[11px] text-amber-600 font-medium">{plan.calls_per_month} calls/month limit</p>
                        : <p className="text-[11px] text-emerald-600 font-medium">Unlimited calls (prepaid)</p>
                      }
                    </div>
                  </div>

                  {/* Call rate — the headline number */}
                  <div className="flex items-end gap-1">
                    <span className="text-3xl font-bold text-gray-900">
                      ₹{Number(plan.call_rate || 0).toFixed(2)}
                    </span>
                    <span className="text-sm text-gray-400 mb-1">/min</span>
                  </div>

                  {/* Min wallet */}
                  {plan.wallet_min > 0 && (
                    <p className="text-[11px] text-gray-400 flex items-center gap-1 -mt-3">
                      <Wallet className="w-3 h-3" />
                      Min wallet balance: ₹{Number(plan.wallet_min).toLocaleString('en-IN')}
                    </p>
                  )}

                  {/* Feature list */}
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
                    disabled={isActive || busy}
                    className={`mt-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2
                      ${isActive
                        ? 'bg-indigo-50 text-indigo-600 cursor-default border border-indigo-200'
                        : `bg-gradient-to-r ${gradient} text-white hover:opacity-90 shadow hover:shadow-md`
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

      {/* ── Wallet CTA banner ──────────────────────────────────── */}
      <div className="flex items-center justify-between p-5 rounded-2xl bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-white shadow-sm">
            <CreditCard className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {walletBalance !== null
                ? `Your wallet: ₹${Number(walletBalance).toLocaleString('en-IN')}`
                : 'Top up your wallet'}
            </p>
            <p className="text-xs text-gray-500">Recharge anytime — calls are deducted from balance</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/voice/wallet')}
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 shadow transition-colors flex items-center gap-2"
        >
          Recharge <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
