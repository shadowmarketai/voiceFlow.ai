/**
 * WalletBilling — prepaid wallet page for clients.
 *
 *   /voice/wallet
 *
 * Shows balance, recharge packs, transaction history, and an interactive
 * cost estimator that lets clients simulate different STT/LLM/TTS combos
 * without changing their active rate plan.
 */

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Wallet as WalletIcon, Plus, Receipt, ArrowDownCircle, ArrowUpCircle,
  Zap, Sparkles, CreditCard, Globe, Crown, Loader2, CheckCircle, Calculator,
  AlertTriangle, TrendingDown, TrendingUp, RefreshCw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { billingAPI } from '../../../services/api'

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.3 } },
}

const PRESET_ICONS = {
  low_latency: Zap, high_quality: Sparkles, budget: CreditCard,
  tamil_native: Globe, premium: Crown,
}

export default function WalletBilling() {
  const [wallet, setWallet]     = useState(null)
  const [txns, setTxns]         = useState([])
  const [catalog, setCatalog]   = useState(null)
  const [presets, setPresets]   = useState([])
  const [packs, setPacks]       = useState([])
  const [plan, setPlan]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [recharging, setRechg]  = useState(false)

  // Estimator config (starts from active rate plan once loaded)
  const [est, setEst] = useState({ stt: '', llm: '', tts: '', telephony: '' })
  const [estResult, setEstResult] = useState(null)
  const [monthlyMins, setMonthlyMins] = useState(1000)

  const loadAll = async () => {
    try {
      const [w, c, t, p] = await Promise.all([
        billingAPI.wallet(),
        billingAPI.catalog(),
        billingAPI.transactions({ limit: 30 }),
        billingAPI.ratePlan(),
      ])
      setWallet(w.data)
      setCatalog(c.data.catalog)
      setPresets(c.data.presets)
      setPacks(c.data.recharge_packs)
      setTxns(t.data.transactions || [])
      setPlan(p.data)
      setEst({ stt: p.data.stt, llm: p.data.llm, tts: p.data.tts, telephony: p.data.telephony })
    } catch (e) {
      toast.error('Failed to load billing data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  // Recalc whenever estimator config changes
  useEffect(() => {
    if (!est.stt || !est.llm || !est.tts || !est.telephony) return
    billingAPI.calculate({ ...est, monthly_minutes: monthlyMins })
      .then(({ data }) => setEstResult(data))
      .catch(() => setEstResult(null))
  }, [est, monthlyMins])

  const recharge = async (amount) => {
    setRechg(true)
    try {
      const { data: order } = await billingAPI.rechargeOrder({ amount_inr: amount })
      if (order.gateway === 'razorpay' && window.Razorpay) {
        // Real Razorpay flow
        const rz = new window.Razorpay({
          key: order.key_id,
          amount: order.amount_paise,
          currency: order.currency,
          order_id: order.order_id,
          name: 'VoiceFlow AI',
          description: `Wallet recharge ₹${amount}`,
          handler: async (resp) => {
            await billingAPI.verifyRecharge({
              order_id: resp.razorpay_order_id,
              payment_id: resp.razorpay_payment_id,
              signature: resp.razorpay_signature,
              amount_inr: amount,
            })
            toast.success(`Wallet credited with ₹${order.summary.credits}`)
            loadAll()
          },
          prefill: {},
          theme: { color: '#6366f1' },
        })
        rz.open()
      } else {
        // Stub / dev — credit directly via verify
        await billingAPI.verifyRecharge({
          order_id: order.order_id, payment_id: '', signature: '',
          amount_inr: amount,
        })
        toast.success(`[DEV] Credited ₹${order.summary.credits}`)
        loadAll()
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Recharge failed')
    } finally {
      setRechg(false)
    }
  }

  const balanceStatus = useMemo(() => {
    if (!wallet) return 'unknown'
    if (wallet.balance_inr === 0) return 'empty'
    if (wallet.minutes_remaining < 10) return 'critical'
    if (wallet.minutes_remaining < 60) return 'low'
    return 'healthy'
  }, [wallet])

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>

  const estCat = catalog || {}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Wallet & Billing</h1>
          <p className="text-gray-500 mt-1">Prepaid balance, recharge, and per-minute cost estimator</p>
        </div>
        <button onClick={loadAll} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm text-gray-700">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Balance card */}
      <motion.div variants={fadeUp} initial="hidden" animate="show"
        className="p-6 rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 text-white shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <WalletIcon className="w-5 h-5" />
              <span className="text-sm font-medium opacity-80">Wallet balance</span>
            </div>
            <p className="text-4xl font-bold">₹{(wallet?.balance_inr || 0).toLocaleString('en-IN')}</p>
            <p className="text-sm opacity-80 mt-2">
              {wallet?.minutes_remaining?.toFixed(1) || 0} min at ₹{wallet?.current_rate_inr_per_min}/min
              &nbsp;·&nbsp; ~{wallet?.calls_remaining_approx || 0} calls left
            </p>
          </div>
          <div className="text-right">
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
              balanceStatus === 'healthy' ? 'bg-emerald-500/30 text-emerald-50' :
              balanceStatus === 'low'     ? 'bg-amber-500/30 text-amber-50' :
              'bg-red-500/30 text-red-50'
            }`}>
              {balanceStatus === 'healthy' ? 'Healthy' : balanceStatus === 'low' ? 'Low balance' : balanceStatus === 'critical' ? 'Critical' : 'Empty'}
            </span>
          </div>
        </div>
        {balanceStatus !== 'healthy' && (
          <div className="relative mt-4 flex items-center gap-2 p-3 rounded-xl bg-white/10 text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>Your balance is running low. Recharge to keep calls active.</span>
          </div>
        )}
      </motion.div>

      {/* Recharge packs */}
      <motion.div variants={fadeUp} initial="hidden" animate="show"
        className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-indigo-500" /> Recharge your wallet
          <span className="text-[11px] font-normal text-gray-400 ml-2">GST inclusive · bonus credits added instantly</span>
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {packs.map((pk) => (
            <button key={pk.amount}
              onClick={() => recharge(pk.amount)}
              disabled={recharging}
              className={`relative p-4 rounded-xl border-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
                pk.popular ? 'border-indigo-500 bg-indigo-50/40' : 'border-gray-200 hover:border-indigo-300'
              }`}>
              {pk.popular && (
                <span className="absolute -top-2 left-3 px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-semibold">
                  Popular
                </span>
              )}
              <p className="text-xs text-gray-400">{pk.label}</p>
              <p className="text-xl font-bold text-gray-900 mt-1">₹{pk.amount.toLocaleString('en-IN')}</p>
              {pk.bonus > 0 && (
                <p className="text-[11px] text-emerald-600 font-medium mt-1">+₹{pk.bonus} bonus</p>
              )}
              <p className="text-[10px] text-gray-500 mt-1">~{Math.round((pk.amount * 0.847 + pk.bonus) / 3.5)} min</p>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-3">
          Prices include 18% GST. Bonus credits are added on top of your net recharge amount.
        </p>
      </motion.div>

      {/* Cost estimator */}
      <motion.div variants={fadeUp} initial="hidden" animate="show"
        className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Calculator className="w-4 h-4 text-violet-500" /> Cost estimator
          <span className="text-[11px] font-normal text-gray-400 ml-2">Simulate provider combos — your active plan stays unchanged</span>
        </h3>

        {/* Presets */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          {presets.map((p) => {
            const Icon = PRESET_ICONS[p.id] || Sparkles
            const active = est.stt === p.stt && est.llm === p.llm && est.tts === p.tts && est.telephony === p.telephony
            return (
              <button key={p.id}
                onClick={() => setEst({ stt: p.stt, llm: p.llm, tts: p.tts, telephony: p.telephony })}
                className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-all ${
                  active ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'
                }`}>
                <Icon className={`w-4 h-4 ${active ? 'text-indigo-600' : 'text-gray-400'}`} />
                <span className="text-xs font-semibold">{p.name}</span>
              </button>
            )
          })}
        </div>

        {/* Provider dropdowns */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {['stt', 'llm', 'tts', 'telephony'].map((cat) => (
            <div key={cat}>
              <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{cat}</label>
              <select value={est[cat]} onChange={(e) => setEst({ ...est, [cat]: e.target.value })}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                {Object.entries(estCat[cat] || {}).map(([key, v]) => (
                  <option key={key} value={key}>{v.label} · ₹{v.cost}/min</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {/* Volume slider */}
        <div className="mt-4">
          <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Expected monthly volume</label>
          <div className="flex items-center gap-4 mt-1">
            <input type="range" min="100" max="10000" step="100" value={monthlyMins}
              onChange={(e) => setMonthlyMins(Number(e.target.value))}
              className="flex-1" />
            <span className="font-mono text-sm text-gray-900 w-24">{monthlyMins.toLocaleString('en-IN')} min</span>
          </div>
        </div>

        {/* Result */}
        {estResult && (
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100">
              <p className="text-[11px] uppercase text-indigo-700 font-medium">Per minute</p>
              <p className="text-2xl font-bold text-indigo-700 mt-1">₹{estResult.per_minute}</p>
            </div>
            <div className="p-4 rounded-xl bg-violet-50 border border-violet-100">
              <p className="text-[11px] uppercase text-violet-700 font-medium">AI stack</p>
              <p className="text-sm font-semibold text-violet-700 mt-1">₹{estResult.breakdown.ai_total_billed}/min</p>
              <p className="text-[10px] text-violet-600 mt-0.5">{estResult.breakdown.llm?.label}</p>
            </div>
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
              <p className="text-[11px] uppercase text-blue-700 font-medium">Telephony</p>
              <p className="text-sm font-semibold text-blue-700 mt-1">₹{estResult.breakdown.telephony?.billed}/min</p>
              <p className="text-[10px] text-blue-600 mt-0.5">{estResult.breakdown.telephony?.label}</p>
            </div>
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
              <p className="text-[11px] uppercase text-emerald-700 font-medium">Monthly estimate</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">
                ₹{estResult.monthly_estimate?.toLocaleString('en-IN')}
              </p>
              <p className="text-[10px] text-emerald-600 mt-0.5">at {monthlyMins} min/mo</p>
            </div>
          </div>
        )}
      </motion.div>

      {/* Transactions */}
      <motion.div variants={fadeUp} initial="hidden" animate="show"
        className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Receipt className="w-4 h-4 text-indigo-500" /> Recent transactions
        </h3>
        {txns.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No transactions yet. Recharge above to get started.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {txns.map((t) => {
              const isCredit = t.type === 'credit' || t.type === 'refund'
              return (
                <div key={t.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isCredit ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                      {isCredit ? <ArrowUpCircle className="w-4 h-4" /> : <ArrowDownCircle className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{t.description || t.type}</p>
                      <p className="text-[11px] text-gray-400">
                        {t.created_at ? new Date(t.created_at).toLocaleString() : ''}
                        {t.reference_id ? ` · ${t.reference_id}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${isCredit ? 'text-emerald-600' : 'text-red-600'}`}>
                      {isCredit ? '+' : '−'}₹{t.amount_inr.toFixed(2)}
                    </p>
                    <p className="text-[11px] text-gray-400">Balance: ₹{t.balance_after_inr.toFixed(2)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </motion.div>
    </div>
  )
}
