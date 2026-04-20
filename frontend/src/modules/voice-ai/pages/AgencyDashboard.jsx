import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, DollarSign, Users, Clock, TrendingUp,
  Wallet, AlertCircle, ChevronRight,
  RefreshCw, Plus, Bot,
  Settings, ExternalLink, Copy, CheckCircle2,
  Network, Shield, Link2, Hash,
} from 'lucide-react'
import { agencyAPI } from '../../../services/api'
import { useAuth } from '../../../contexts/AuthContext'

/* ─── helpers ─────────────────────────────────────────────────── */

function fmt(v) {
  return `₹${(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function copy(text) {
  navigator.clipboard.writeText(text).catch(() => {})
}

/* ─── stat card ───────────────────────────────────────────────── */

function StatCard({ icon: Icon, label, value, sub, color = 'blue', onClick, loading }) {
  const colors = {
    blue:   'bg-blue-50 text-blue-600',
    green:  'bg-green-50 text-green-600',
    violet: 'bg-violet-50 text-violet-600',
    amber:  'bg-amber-50 text-amber-600',
    rose:   'bg-rose-50 text-rose-600',
    indigo: 'bg-indigo-50 text-indigo-600',
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
        <p className="text-2xl font-bold text-gray-900">{loading ? <span className="inline-block w-16 h-6 bg-gray-100 animate-pulse rounded" /> : value}</p>
        <p className="text-sm text-gray-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

/* ─── transaction row ─────────────────────────────────────────── */

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

/* ─── main dashboard ──────────────────────────────────────────── */

export default function AgencyDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [copiedInvite, setCopiedInvite] = useState(false)

  const load = () => {
    setLoading(true)
    setError('')
    agencyAPI.dashboard()
      .then(r => { setData(r.data); setError('') })
      .catch(e => {
        const status = e?.response?.status
        // Only surface auth/permission errors — server errors show zeros silently
        if (status === 401 || status === 403) {
          setError('Session expired. Please log in again.')
        }
        // 500 / network errors: keep data as null, page renders with zeros
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const w = data?.wallet || {}
  const plan = data?.plan || {}
  const tenant = data?.tenant || {}

  const agencyId = data?.tenant_id || ''
  const loginUrl = `${window.location.origin}/login${tenant.slug ? `?t=${tenant.slug}` : ''}`
  const inviteUrl = agencyId
    ? `${window.location.origin}/login?signup=1&agency=${agencyId}${tenant.slug ? `&t=${tenant.slug}` : ''}`
    : ''

  const handleCopy = () => {
    copy(loginUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCopyInvite = () => {
    copy(inviteUrl)
    setCopiedInvite(true)
    setTimeout(() => setCopiedInvite(false), 2000)
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {tenant.logo_url ? (
            <img src={tenant.logo_url} alt="logo" className="w-9 h-9 rounded-lg object-contain border border-gray-100" />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-violet-600" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-gray-900">{tenant.app_name || tenant.name || 'Agency Dashboard'}</h1>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
              <Shield className="w-3 h-3 text-violet-500" />
              {plan.name || 'Agency Plan'}
              {plan.monthly_fee > 0 && (
                <span className="text-gray-300">· ₹{plan.monthly_fee?.toLocaleString('en-IN')}/mo</span>
              )}
              {plan.wholesale_rate > 0 && (
                <span className="text-gray-300">· ₹{plan.wholesale_rate}/min wholesale</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/voice/agency-settings')}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── Wallet Banner ─────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-violet-200 text-sm font-medium">Available Balance</p>
            <p className="text-4xl font-bold mt-1">
              {loading ? <span className="inline-block w-32 h-8 bg-white/20 animate-pulse rounded" /> : fmt(w.available_balance)}
            </p>
            <p className="text-violet-200 text-xs mt-1.5 space-x-2">
              <span>Earned: {fmt(w.total_earned)}</span>
              <span>·</span>
              <span>Withdrawn: {fmt(w.total_withdrawn)}</span>
              {w.platform_fees_deducted > 0 && (
                <><span>·</span><span>Fees deducted: {fmt(w.platform_fees_deducted)}</span></>
              )}
            </p>
          </div>
          <div className="flex flex-col gap-2 items-end">
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

      {/* ── Agency Stats ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard loading={loading}
          icon={Users} label="Sub-clients" value={data?.sub_clients?.total ?? 0}
          color="blue" onClick={() => navigate('/voice/sub-clients')}
        />
        <StatCard loading={loading}
          icon={Bot} label="Voice Agents" value={data?.agents_count ?? 0}
          color="indigo" onClick={() => navigate('/voice/agents-list')}
        />
        <StatCard loading={loading}
          icon={TrendingUp} label="Total Earned" value={fmt(w.total_earned)}
          color="green"
        />
        <StatCard loading={loading}
          icon={Clock} label="Pending Requests" value={data?.pending_withdrawal_requests ?? 0}
          color={data?.pending_withdrawal_requests > 0 ? 'rose' : 'violet'}
          onClick={() => navigate('/voice/wallet')}
        />
      </div>

      {/* ── Agency ID & Invite Link ───────────────────────────────── */}
      {agencyId && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Hash className="w-4 h-4 text-violet-500" />
            Agency ID &amp; Client Invite
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Agency ID */}
            <div className="bg-gray-50 rounded-lg px-3 py-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] text-gray-400 font-medium mb-0.5">Your Agency ID</p>
                <p className="font-mono text-sm text-gray-800 truncate">{agencyId}</p>
              </div>
              <button
                onClick={() => { copy(agencyId); }}
                className="flex-shrink-0 text-gray-400 hover:text-violet-600 transition-colors"
                title="Copy Agency ID"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            {/* Client Invite Link */}
            <div className="bg-violet-50 rounded-lg px-3 py-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] text-violet-500 font-medium mb-0.5">Client Invite Link</p>
                <p className="font-mono text-xs text-violet-800 truncate">{inviteUrl}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={handleCopyInvite}
                  className="text-violet-400 hover:text-violet-700 transition-colors"
                  title="Copy invite link"
                >
                  {copiedInvite
                    ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                    : <Copy className="w-4 h-4" />}
                </button>
                <a
                  href={inviteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-violet-400 hover:text-violet-700 transition-colors"
                  title="Open invite link"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2.5">
            Share the invite link with clients — when they register, they are automatically linked to your agency.
          </p>
        </div>
      )}

      {/* ── Plan Details ──────────────────────────────────────────── */}
      {plan.id && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-violet-50 p-2 rounded-lg">
                <Shield className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-800">{plan.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {plan.monthly_fee > 0 ? `₹${plan.monthly_fee?.toLocaleString('en-IN')}/month` : 'No monthly fee'}
                  {plan.wholesale_rate > 0 && ` · ₹${plan.wholesale_rate}/min wholesale rate`}
                  {plan.sub_client_limit ? ` · Up to ${plan.sub_client_limit} sub-clients` : ' · Unlimited sub-clients'}
                  {plan.agents_per_client ? ` · ${plan.agents_per_client} agents/client` : ''}
                </p>
              </div>
            </div>
            <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 flex items-center gap-2">
              <span className="text-gray-500 font-medium">Your login URL:</span>
              <span className="font-mono text-gray-600 truncate max-w-48">{loginUrl}</span>
              <button onClick={handleCopy} className="text-indigo-500 hover:text-indigo-700 flex-shrink-0">
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <a href={loginUrl} target="_blank" rel="noreferrer" className="text-indigo-500 hover:text-indigo-700 flex-shrink-0">
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── Recent Transactions ───────────────────────────────────── */}
      {(data?.recent_transactions?.length > 0) && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <h2 className="font-semibold text-gray-800">Recent Transactions</h2>
            <button
              onClick={() => navigate('/voice/wallet')}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
            >
              View all →
            </button>
          </div>
          <div className="px-5">
            {data.recent_transactions.map((t, i) => (
              <TxnRow key={t.id || i} txn={t} />
            ))}
          </div>
        </div>
      )}

      {/* ── No transactions yet ───────────────────────────────────── */}
      {!loading && !data?.recent_transactions?.length && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-10 text-center">
          <Network className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No earnings yet</p>
          <p className="text-gray-400 text-sm mt-1">Add sub-clients and start earning commissions</p>
          <button
            onClick={() => navigate('/voice/sub-clients')}
            className="mt-4 inline-flex items-center gap-2 bg-violet-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-violet-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add your first sub-client
          </button>
        </div>
      )}
    </div>
  )
}
