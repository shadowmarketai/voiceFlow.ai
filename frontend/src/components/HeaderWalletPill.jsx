/**
 * HeaderWalletPill — compact wallet balance + talk-time indicator for the top bar.
 *
 * Shows: ₹balance · ~N min left
 * Clicking navigates to /voice/wallet.
 * Polls every 60s so post-call deductions show up without a manual refresh.
 * Hidden for users who don't have billing enabled (super admin, unauth).
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet as WalletIcon, AlertTriangle } from 'lucide-react'
import { billingAPI } from '../services/api'

export default function HeaderWalletPill() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(false)

  const load = () => {
    billingAPI.wallet()
      .then(({ data }) => { setData(data); setErr(false) })
      .catch(() => setErr(true))
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 60000)
    return () => clearInterval(id)
  }, [])

  if (err || !data) return null

  const balance = data.balance_inr ?? 0
  const mins = data.minutes_remaining ?? 0
  const isLow = mins < 10 && balance > 0
  const isEmpty = balance <= 0

  const tone = isEmpty
    ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
    : isLow
    ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
    : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'

  return (
    <Link
      to="/voice/wallet"
      className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${tone}`}
      title={`Wallet: ₹${balance.toLocaleString('en-IN')} · ~${Math.round(mins)} min of talk-time remaining`}
    >
      {isLow || isEmpty
        ? <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
        : <WalletIcon className="w-3.5 h-3.5 flex-shrink-0" />}
      <span className="font-bold">₹{balance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
      <span className="opacity-60">·</span>
      <span>{Math.round(mins)} min</span>
    </Link>
  )
}
