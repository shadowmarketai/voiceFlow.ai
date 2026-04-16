/**
 * CostCalculator — embedded live cost pill used in Agent Builder's
 * Voice Pipeline section. Reads the pricing catalog + current rate plan
 * from the backend and recalculates whenever the user changes a provider.
 *
 * Props:
 *   stt, llm, tts, telephony — provider keys (e.g. "claude_haiku")
 *   previousLlm, previousTts — for cost-impact warnings
 *   monthlyMinutes           — used to show monthly estimate
 *   onClick                  — optional: open full billing drawer
 */

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, TrendingUp } from 'lucide-react'
import { billingAPI } from '../../../services/api'
import { useAuth } from '../../../contexts/AuthContext'

export default function CostCalculator({ stt, llm, tts, telephony, previousLlm, monthlyMinutes = 1000 }) {
  const { user } = useAuth()
  const isSuperAdmin = !!user?.is_super_admin
  const [catalog, setCatalog] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    billingAPI.catalog().then(({ data }) => setCatalog(data.catalog)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!stt || !llm || !tts || !telephony) return
    setLoading(true)
    billingAPI.calculate({ stt, llm, tts, telephony, monthly_minutes: monthlyMinutes })
      .then(({ data }) => setResult(data))
      .catch(() => setResult(null))
      .finally(() => setLoading(false))
  }, [stt, llm, tts, telephony, monthlyMinutes])

  // Cost impact warning when the LLM changes
  const llmImpact = useMemo(() => {
    if (!catalog || !previousLlm || previousLlm === llm) return null
    const prev = catalog.llm?.[previousLlm]?.cost
    const curr = catalog.llm?.[llm]?.cost
    if (prev == null || curr == null) return null
    const delta = curr - prev
    if (Math.abs(delta) < 0.5) return null
    const monthlyDelta = delta * 1.2 * monthlyMinutes  // 20% markup
    return {
      direction: delta > 0 ? 'up' : 'down',
      perMin: Math.abs(delta * 1.2),
      monthly: Math.abs(monthlyDelta),
    }
  }, [catalog, llm, previousLlm, monthlyMinutes])

  if (!result) {
    return (
      <div className="mt-4 p-3 bg-gray-50 rounded-xl grid grid-cols-4 gap-3 text-xs">
        <div><span className="text-gray-400">Platform Fee</span><p className="font-semibold text-gray-500">—</p></div>
        <div><span className="text-gray-400">AI Model</span><p className="font-semibold text-gray-500">—</p></div>
        <div><span className="text-gray-400">Telephony</span><p className="font-semibold text-gray-500">—</p></div>
        <div><span className="text-gray-400 font-semibold">Total</span><p className="font-bold text-gray-500">{loading ? 'Calculating...' : '—'}</p></div>
      </div>
    )
  }

  const b = result.breakdown
  const perMin = result.per_minute
  const monthly = result.monthly_estimate || (perMin * monthlyMinutes).toFixed(2)
  const aiBilled = b.ai_total_billed || 0
  const telBilled = b.telephony?.billed || 0
  const platformLine = Math.max(0, perMin - aiBilled - telBilled)

  return (
    <>
      {isSuperAdmin ? (
        // Full per-component cost breakdown — super admin only.
        <div className="mt-4 p-3 bg-gray-50 rounded-xl grid grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-gray-400">Platform Fee</span>
            <p className="font-semibold text-gray-900">₹{platformLine.toFixed(2)}/min</p>
          </div>
          <div>
            <span className="text-gray-400">AI (STT+LLM+TTS)</span>
            <p className="font-semibold text-gray-900">₹{aiBilled.toFixed(2)}/min</p>
            <p className="text-[10px] text-gray-400">{b.llm?.label}</p>
          </div>
          <div>
            <span className="text-gray-400">Telephony</span>
            <p className="font-semibold text-gray-900">₹{telBilled.toFixed(2)}/min</p>
            <p className="text-[10px] text-gray-400">{b.telephony?.label}</p>
          </div>
          <div>
            <span className="text-gray-400 font-semibold">Total</span>
            <p className="font-bold text-indigo-600">₹{perMin.toFixed(2)}/min</p>
            <p className="text-[10px] text-gray-400">~₹{Number(monthly).toLocaleString('en-IN')} @ {monthlyMinutes}min/mo</p>
          </div>
        </div>
      ) : (
        // Client-friendly view — only the model name + total per-minute price.
        <div className="mt-4 p-3 bg-gray-50 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-indigo-500" />
            <div>
              <span className="text-gray-400">Active model</span>
              <p className="font-semibold text-gray-900">{b.llm?.label || '—'}</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-gray-400">All-inclusive rate</span>
            <p className="font-bold text-indigo-600 text-base">₹{perMin.toFixed(2)}<span className="text-xs text-gray-500 font-normal">/min</span></p>
            <p className="text-[10px] text-gray-400">~₹{Number(monthly).toLocaleString('en-IN')} at {monthlyMinutes} min/mo</p>
          </div>
        </div>
      )}

      {llmImpact && llmImpact.direction === 'up' && llmImpact.perMin >= 1 && (
        <div className="mt-2 flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">This LLM is ₹{llmImpact.perMin.toFixed(2)}/min more expensive.</p>
            <p>At {monthlyMinutes} min/mo, that's ~₹{Math.round(llmImpact.monthly).toLocaleString('en-IN')} extra per month.</p>
          </div>
        </div>
      )}
      {llmImpact && llmImpact.direction === 'down' && llmImpact.perMin >= 0.5 && (
        <div className="mt-2 flex items-start gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
          <TrendingUp className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-600 rotate-180" />
          <div>
            <p className="font-semibold">This LLM is ₹{llmImpact.perMin.toFixed(2)}/min cheaper.</p>
            <p>You'll save ~₹{Math.round(llmImpact.monthly).toLocaleString('en-IN')}/month at {monthlyMinutes} min/mo.</p>
          </div>
        </div>
      )}
    </>
  )
}
