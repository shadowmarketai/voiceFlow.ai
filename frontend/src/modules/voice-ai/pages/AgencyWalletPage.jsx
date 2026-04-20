import { useState, useEffect } from 'react'
import {
  Wallet, ArrowDownCircle, Clock, CheckCircle2, XCircle,
  AlertCircle, RefreshCw, Send, ChevronDown, ChevronUp,
} from 'lucide-react'
import { agencyAPI } from '../../../services/api'

const STATUS_STYLE = {
  pending:  'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-blue-50 text-blue-700 border-blue-200',
  paid:     'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
}

const STATUS_ICON = {
  pending:  <Clock className="w-3 h-3" />,
  approved: <CheckCircle2 className="w-3 h-3" />,
  paid:     <CheckCircle2 className="w-3 h-3" />,
  rejected: <XCircle className="w-3 h-3" />,
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border font-medium ${STATUS_STYLE[status] || 'bg-gray-50 text-gray-600'}`}>
      {STATUS_ICON[status]}
      {status}
    </span>
  )
}

function WithdrawalForm({ available, onSuccess }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('bank_transfer')
  const [details, setDetails] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    if (amt > available) { setError(`Amount exceeds available balance ₹${available.toFixed(2)}`); return }
    setLoading(true)
    try {
      await agencyAPI.requestWithdrawal({ amount: amt, payment_method: method, payment_details: details, notes })
      setAmount(''); setDetails(''); setNotes(''); setOpen(false)
      onSuccess()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to submit request')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
      <button
        className="w-full flex items-center justify-between px-5 py-4 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <Send className="w-5 h-5 text-violet-600" />
          <span className="font-semibold text-gray-800">Request Withdrawal</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <form onSubmit={submit} className="px-5 pb-5 space-y-4 border-t border-gray-50 pt-4">
          {error && (
            <div className="flex items-center gap-2 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg px-3 py-2 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₹)</label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                min="1"
                max={available}
                step="0.01"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                required
              />
              <p className="text-xs text-gray-400 mt-1">Available: ₹{available?.toFixed(2)}</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method</label>
              <select
                value={method}
                onChange={e => setMethod(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
                <option value="neft">NEFT/RTGS</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Payment Details</label>
            <input
              type="text"
              value={details}
              onChange={e => setDetails(e.target.value)}
              placeholder="Account number / UPI ID"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any instructions for admin..."
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-violet-600 text-white font-semibold py-2.5 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors text-sm"
          >
            {loading ? 'Submitting…' : 'Submit Withdrawal Request'}
          </button>
        </form>
      )}
    </div>
  )
}

export default function AgencyWalletPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    agencyAPI.wallet()
      .then(r => setData(r.data))
      .catch(e => setError(e?.response?.data?.detail || 'Failed to load wallet'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const w = data?.wallet || {}
  const fmt = v => `₹${(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const available = parseFloat(w.available_balance || 0)

  const hasPending = data?.withdrawal_requests?.some(r => r.status === 'pending')

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agency Wallet</h1>
          <p className="text-sm text-gray-500 mt-1">Track earnings and request payouts</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Balance cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Available Balance', value: fmt(w.available_balance), color: 'from-violet-600 to-indigo-600', white: true },
          { label: 'Total Earned', value: fmt(w.total_earned), color: 'bg-green-50', textC: 'text-green-700' },
          { label: 'Total Withdrawn', value: fmt(w.total_withdrawn), color: 'bg-blue-50', textC: 'text-blue-700' },
          { label: 'Pending Withdrawal', value: fmt(w.pending_withdrawal), color: 'bg-amber-50', textC: 'text-amber-700' },
        ].map(({ label, value, color, white, textC }) => (
          <div key={label} className={`rounded-xl p-4 ${white ? `bg-gradient-to-r ${color}` : color}`}>
            <p className={`text-xs font-medium ${white ? 'text-white/80' : 'text-gray-500'}`}>{label}</p>
            <p className={`text-xl font-bold mt-1 ${white ? 'text-white' : textC || 'text-gray-800'}`}>
              {loading ? '—' : value}
            </p>
          </div>
        ))}
      </div>

      {/* Monthly plan fee info */}
      {(data?.monthly_plan_fee > 0 || data?.wholesale_rate > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-sm text-amber-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>
            {data?.plan_name && <strong>{data.plan_name}: </strong>}
            {data?.monthly_plan_fee > 0 && <>Monthly plan fee <strong>₹{data.monthly_plan_fee.toFixed(2)}</strong> will be deducted from each withdrawal.</>}
            {data?.wholesale_rate > 0 && <> Your wholesale rate is <strong>₹{data.wholesale_rate}/min</strong>.</>}
          </span>
        </div>
      )}

      {/* Withdrawal form — only if no pending request */}
      {!hasPending ? (
        <WithdrawalForm available={available} onSuccess={load} />
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-center gap-3 text-sm text-amber-700">
          <Clock className="w-5 h-5 flex-shrink-0 text-amber-500" />
          <div>
            <p className="font-medium">Withdrawal request pending</p>
            <p className="text-amber-600 text-xs mt-0.5">You already have a pending request. Wait for admin review before submitting a new one.</p>
          </div>
        </div>
      )}

      {/* Withdrawal requests history */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="font-semibold text-gray-800">Withdrawal Requests</h2>
        </div>
        {!data?.withdrawal_requests?.length ? (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">
            No withdrawal requests yet
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {data.withdrawal_requests.map(req => (
              <div key={req.id} className="px-5 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={req.status} />
                      <span className="text-sm font-semibold text-gray-800">₹{parseFloat(req.amount).toFixed(2)}</span>
                      {req.net_paid > 0 && (
                        <span className="text-xs text-gray-400">
                          → net paid: <span className="text-green-600 font-medium">₹{parseFloat(req.net_paid).toFixed(2)}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {req.payment_method?.replace('_', ' ')} &nbsp;·&nbsp; {req.requested_at?.slice(0, 16)?.replace('T', ' ')}
                    </p>
                    {req.monthly_fee_deducted > 0 && (
                      <p className="text-xs text-gray-400">
                        Deductions: plan ₹{parseFloat(req.monthly_fee_deducted).toFixed(2)} + platform ₹{parseFloat(req.platform_fee_deducted || 0).toFixed(2)}
                      </p>
                    )}
                    {req.admin_notes && (
                      <p className="text-xs text-gray-500 mt-1 italic">"{req.admin_notes}"</p>
                    )}
                  </div>
                  <ArrowDownCircle className="w-5 h-5 text-gray-300 flex-shrink-0 mt-0.5" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transaction ledger */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="font-semibold text-gray-800">Transaction Ledger</h2>
        </div>
        {!data?.transactions?.length ? (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">
            No transactions yet
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {data.transactions.map((t, i) => (
              <div key={t.id || i} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-800 capitalize">
                    {t.type?.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs text-gray-400">{t.description}</p>
                  <p className="text-xs text-gray-300">{t.created_at?.slice(0, 16)?.replace('T', ' ')}</p>
                </div>
                <span className={`font-semibold text-sm ${t.amount > 0 ? 'text-green-600' : 'text-rose-600'}`}>
                  {t.amount > 0 ? '+' : ''}₹{Math.abs(t.amount).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
