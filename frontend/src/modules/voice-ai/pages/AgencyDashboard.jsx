import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, DollarSign, Users, Clock, TrendingUp,
  ArrowUpRight, Wallet, AlertCircle, ChevronRight,
  RefreshCw, Plus,
} from 'lucide-react'
import { agencyAPI } from '../../../services/api'
import { useAuth } from '../../../contexts/AuthContext'

function StatCard({ icon: Icon, label, value, sub, color = 'blue', onClick }) {
  const colors = {
    blue:   'bg-blue-50 text-blue-600',
    green:  'bg-green-50 text-green-600',
    violet: 'bg-violet-50 text-violet-600',
    amber:  'bg-amber-50 text-amber-600',
    rose:   'bg-rose-50 text-rose-600',
  }
  return (
    <div
      className={`bg-white rounded-xl border border-gray-100 p-5 shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className={`p-2 rounded-lg ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        {onClick && <ChevronRight className="w-4 h-4 text-gray-400 mt-1" />}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

function TxnRow({ txn }) {
  const isCredit = txn.amount > 0
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-800 capitalize">
          {txn.type?.replace(/_/g, ' ')}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">{txn.description}</p>
        <p className="text-xs text-gray-300">{txn.created_at?.slice(0, 16)?.replace('T', ' ')}</p>
      </div>
      <span className={`font-semibold text-sm ${isCredit ? 'text-green-600' : 'text-rose-600'}`}>
        {isCredit ? '+' : ''}₹{Math.abs(txn.amount).toFixed(2)}
      </span>
    </div>
  )
}

export default function AgencyDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    agencyAPI.dashboard()
      .then(r => setData(r.data))
      .catch(e => setError(e?.response?.data?.detail || 'Failed to load dashboard'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const w = data?.wallet || {}
  const fmt = (v) => `₹${(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agency Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Welcome back, {user?.full_name || user?.name || 'Agency Admin'}
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
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

      {/* Wallet summary banner */}
      <div className="bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-violet-200 text-sm font-medium">Available Balance</p>
            <p className="text-4xl font-bold mt-1">
              {loading ? '—' : fmt(w.available_balance)}
            </p>
            <p className="text-violet-200 text-xs mt-1">
              Total earned: {fmt(w.total_earned)} &nbsp;·&nbsp; Withdrawn: {fmt(w.total_withdrawn)}
            </p>
          </div>
          <div className="flex flex-col gap-3 items-end">
            <button
              onClick={() => navigate('/voice/wallet')}
              className="flex items-center gap-2 bg-white text-violet-700 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-violet-50 transition-colors"
            >
              <Wallet className="w-4 h-4" />
              Manage Wallet
            </button>
            {w.pending_withdrawal > 0 && (
              <span className="text-xs text-amber-200 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {fmt(w.pending_withdrawal)} pending approval
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Sub-clients"
          value={loading ? '—' : (data?.sub_clients?.total ?? 0)}
          color="blue"
          onClick={() => navigate('/voice/sub-clients')}
        />
        <StatCard
          icon={TrendingUp}
          label="Total Earned"
          value={loading ? '—' : fmt(w.total_earned)}
          color="green"
        />
        <StatCard
          icon={DollarSign}
          label="Platform Fees"
          value={loading ? '—' : fmt(w.platform_fees_deducted)}
          sub="deducted from payouts"
          color="amber"
        />
        <StatCard
          icon={Clock}
          label="Pending Requests"
          value={loading ? '—' : (data?.pending_withdrawal_requests ?? 0)}
          color={data?.pending_withdrawal_requests > 0 ? 'rose' : 'violet'}
          onClick={() => navigate('/voice/wallet')}
        />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => navigate('/voice/sub-clients')}
          className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-all group text-left"
        >
          <div className="bg-blue-50 p-2 rounded-lg">
            <Plus className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-800 text-sm">Add Sub-client</p>
            <p className="text-xs text-gray-400">Onboard a new client</p>
          </div>
          <ArrowUpRight className="w-4 h-4 text-gray-300 ml-auto group-hover:text-blue-500 transition-colors" />
        </button>

        <button
          onClick={() => navigate('/voice/wallet')}
          className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-all group text-left"
        >
          <div className="bg-violet-50 p-2 rounded-lg">
            <Wallet className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-800 text-sm">Request Withdrawal</p>
            <p className="text-xs text-gray-400">Withdraw your earnings</p>
          </div>
          <ArrowUpRight className="w-4 h-4 text-gray-300 ml-auto group-hover:text-violet-500 transition-colors" />
        </button>

        <button
          onClick={() => navigate('/voice/tenant-pricing')}
          className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-all group text-left"
        >
          <div className="bg-green-50 p-2 rounded-lg">
            <Building2 className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-800 text-sm">My Pricing</p>
            <p className="text-xs text-gray-400">Manage client pricing</p>
          </div>
          <ArrowUpRight className="w-4 h-4 text-gray-300 ml-auto group-hover:text-green-500 transition-colors" />
        </button>
      </div>

      {/* Recent transactions */}
      {data?.recent_transactions?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <h2 className="font-semibold text-gray-800">Recent Transactions</h2>
            <button
              onClick={() => navigate('/voice/wallet')}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
            >
              View all
            </button>
          </div>
          <div className="px-5">
            {data.recent_transactions.map((t, i) => (
              <TxnRow key={t.id || i} txn={t} />
            ))}
          </div>
        </div>
      )}

      {loading && !data && (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      )}
    </div>
  )
}
