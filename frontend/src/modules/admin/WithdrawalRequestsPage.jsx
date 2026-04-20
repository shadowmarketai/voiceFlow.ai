import { useState, useEffect } from 'react'
import {
  Wallet, CheckCircle2, XCircle, Clock, RefreshCw,
  AlertCircle, DollarSign, Building2, CreditCard,
} from 'lucide-react'
import { adminWithdrawalsAPI } from '../../services/api'

const STATUS_STYLE = {
  pending:  'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-blue-50 text-blue-700 border-blue-200',
  paid:     'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
}

function StatusBadge({ status }) {
  const icons = { pending: Clock, approved: CheckCircle2, paid: CheckCircle2, rejected: XCircle }
  const Icon = icons[status] || Clock
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border font-medium ${STATUS_STYLE[status] || ''}`}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  )
}

function ApproveModal({ req, onClose, onDone }) {
  const [monthlyFee, setMonthlyFee] = useState('')
  const [platformFee, setPlatformFee] = useState('')
  const [adminNotes, setAdminNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const amount = parseFloat(req.amount || 0)
  const mf = parseFloat(monthlyFee || 0)
  const pf = parseFloat(platformFee || 0)
  const netPaid = Math.max(0, amount - mf - pf)

  const submit = async () => {
    setError('')
    setLoading(true)
    try {
      await adminWithdrawalsAPI.approve(req.id, {
        monthly_fee_deducted: mf,
        platform_fee_deducted: pf,
        admin_notes: adminNotes,
      })
      onDone()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to approve')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 text-lg">Approve Withdrawal</h3>
          <p className="text-sm text-gray-500 mt-1">
            {req.agency_name || req.tenant_id} — ₹{amount.toFixed(2)}
          </p>
        </div>
        <div className="px-6 py-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg px-3 py-2 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Monthly Plan Fee (₹)</label>
              <input
                type="number"
                value={monthlyFee}
                onChange={e => setMonthlyFee(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Platform Fee (₹)</label>
              <input
                type="number"
                value={platformFee}
                onChange={e => setPlatformFee(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2">
            <div className="flex justify-between text-gray-600">
              <span>Requested amount</span>
              <span>₹{amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-rose-600">
              <span>Monthly plan fee</span>
              <span>- ₹{mf.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-rose-600">
              <span>Platform fee</span>
              <span>- ₹{pf.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-green-700 border-t border-gray-200 pt-2">
              <span>Net to agency</span>
              <span>₹{netPaid.toFixed(2)}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Admin Notes</label>
            <textarea
              value={adminNotes}
              onChange={e => setAdminNotes(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              placeholder="Optional notes for agency..."
            />
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 bg-green-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Approving…' : 'Approve & Schedule Payout'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RejectModal({ req, onClose, onDone }) {
  const [adminNotes, setAdminNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    setLoading(true)
    try {
      await adminWithdrawalsAPI.reject(req.id, { admin_notes: adminNotes || 'Rejected by admin' })
      onDone()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to reject')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-6 py-5 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 text-lg">Reject Withdrawal</h3>
          <p className="text-sm text-gray-500">{req.agency_name || req.tenant_id} — ₹{parseFloat(req.amount).toFixed(2)}</p>
        </div>
        <div className="px-6 py-4 space-y-3">
          {error && (
            <div className="text-rose-600 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />{error}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reason (shown to agency)</label>
            <textarea
              value={adminNotes}
              onChange={e => setAdminNotes(e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 resize-none"
              placeholder="Reason for rejection..."
            />
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={submit} disabled={loading} className="flex-1 bg-rose-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-rose-700 disabled:opacity-50 transition-colors">
            {loading ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MarkPaidModal({ req, onClose, onDone }) {
  const [utr, setUtr] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setLoading(true)
    try {
      await adminWithdrawalsAPI.markPaid(req.id, { utr_reference: utr })
      onDone()
    } catch (e) {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-6 py-5 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Mark as Paid</h3>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">UTR / Transaction Reference</label>
            <input
              type="text"
              value={utr}
              onChange={e => setUtr(e.target.value)}
              placeholder="UTR12345..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={submit} disabled={loading} className="flex-1 bg-green-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors">
            {loading ? '…' : 'Confirm Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function WithdrawalRequestsPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [approveReq, setApproveReq] = useState(null)
  const [rejectReq, setRejectReq] = useState(null)
  const [markPaidReq, setMarkPaidReq] = useState(null)
  const [creditForm, setCreditForm] = useState(false)
  const [creditTenant, setCreditTenant] = useState('')
  const [creditAmt, setCreditAmt] = useState('')
  const [creditDesc, setCreditDesc] = useState('')
  const [creditLoading, setCreditLoading] = useState(false)
  const [creditMsg, setCreditMsg] = useState('')

  const load = () => {
    setLoading(true)
    adminWithdrawalsAPI.list(filter || undefined)
      .then(r => setRows(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filter])

  const handleCreditSubmit = async (e) => {
    e.preventDefault()
    setCreditLoading(true); setCreditMsg('')
    try {
      await adminWithdrawalsAPI.creditAgency({ tenant_id: creditTenant, amount: parseFloat(creditAmt), description: creditDesc || 'Manual credit by admin' })
      setCreditMsg('Credited successfully')
      setCreditTenant(''); setCreditAmt(''); setCreditDesc('')
    } catch (e) {
      setCreditMsg(e?.response?.data?.detail || 'Error')
    } finally {
      setCreditLoading(false)
    }
  }

  const pendingCount = rows.filter(r => r.status === 'pending').length
  const totalPending = rows.filter(r => r.status === 'pending').reduce((s, r) => s + parseFloat(r.amount || 0), 0)

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agency Withdrawals</h1>
          <p className="text-sm text-gray-500 mt-1">Review and process agency payout requests</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreditForm(f => !f)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <DollarSign className="w-4 h-4" />
            Credit Agency
          </button>
          <button
            onClick={load}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary */}
      {pendingCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-center gap-3 text-sm text-amber-800">
          <Clock className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <div>
            <p className="font-medium">{pendingCount} pending request{pendingCount > 1 ? 's' : ''} totalling ₹{totalPending.toFixed(2)}</p>
            <p className="text-amber-600 text-xs mt-0.5">Review and approve to release payouts</p>
          </div>
        </div>
      )}

      {/* Credit Agency form */}
      {creditForm && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-5">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-indigo-600" />
            Manually Credit Agency Wallet
          </h2>
          <form onSubmit={handleCreditSubmit} className="grid grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tenant ID</label>
              <input value={creditTenant} onChange={e => setCreditTenant(e.target.value)} required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="tenant-xxx"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₹)</label>
              <input type="number" value={creditAmt} onChange={e => setCreditAmt(e.target.value)} required min="0.01" step="0.01"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <button type="submit" disabled={creditLoading}
              className="bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {creditLoading ? '…' : 'Credit'}
            </button>
          </form>
          {creditMsg && <p className="text-sm mt-2 text-green-600">{creditMsg}</p>}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {['', 'pending', 'approved', 'paid', 'rejected'].map(s => (
          <button
            key={s || 'all'}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
              filter === s ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Agency', 'Amount', 'Status', 'Method', 'Net Paid', 'Requested', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}>
                  {[...Array(7)].map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : !rows.length ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">No withdrawal requests found</td>
              </tr>
            ) : rows.map(req => (
              <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-violet-500" />
                    <div>
                      <p className="font-medium text-gray-800">{req.agency_name || req.tenant_id}</p>
                      <p className="text-xs text-gray-400">{req.tenant_id}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 font-semibold text-gray-800">₹{parseFloat(req.amount).toFixed(2)}</td>
                <td className="px-4 py-3"><StatusBadge status={req.status} /></td>
                <td className="px-4 py-3 text-gray-600 capitalize">{req.payment_method?.replace('_', ' ')}</td>
                <td className="px-4 py-3">
                  {req.net_paid > 0 ? (
                    <span className="text-green-600 font-medium">₹{parseFloat(req.net_paid).toFixed(2)}</span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {req.requested_at?.slice(0, 16)?.replace('T', ' ')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {req.status === 'pending' && (
                      <>
                        <button
                          onClick={() => setApproveReq(req)}
                          className="px-2.5 py-1 bg-green-50 text-green-700 text-xs rounded-lg font-medium hover:bg-green-100 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setRejectReq(req)}
                          className="px-2.5 py-1 bg-rose-50 text-rose-700 text-xs rounded-lg font-medium hover:bg-rose-100 transition-colors"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {req.status === 'approved' && (
                      <button
                        onClick={() => setMarkPaidReq(req)}
                        className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs rounded-lg font-medium hover:bg-blue-100 transition-colors flex items-center gap-1"
                      >
                        <CreditCard className="w-3 h-3" />
                        Mark Paid
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {approveReq && (
        <ApproveModal
          req={approveReq}
          onClose={() => setApproveReq(null)}
          onDone={() => { setApproveReq(null); load() }}
        />
      )}
      {rejectReq && (
        <RejectModal
          req={rejectReq}
          onClose={() => setRejectReq(null)}
          onDone={() => { setRejectReq(null); load() }}
        />
      )}
      {markPaidReq && (
        <MarkPaidModal
          req={markPaidReq}
          onClose={() => setMarkPaidReq(null)}
          onDone={() => { setMarkPaidReq(null); load() }}
        />
      )}
    </div>
  )
}
