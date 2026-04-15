/**
 * ForgotPassword — Request password reset link via email.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, ArrowLeft, ArrowRight, Mic, CheckCircle } from 'lucide-react'
import { authAPI } from '../services/api'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      await authAPI.forgotPassword(email)
      setSent(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#fafbfe] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[420px]"
      >
        {/* Brand */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-200">
            <Mic className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-slate-900 font-heading font-bold text-lg">VoiceFlow</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-indigo-500/60">AI Platform</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white border border-gray-100 p-8 shadow-xl shadow-gray-100/60">
          {sent ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center space-y-4"
            >
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-emerald-500" />
              </div>
              <h2 className="text-xl font-heading font-bold text-slate-900">Check your email</h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                If an account exists for <span className="font-medium text-slate-700">{email}</span>,
                we've sent a password reset link. Check your inbox.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="mt-4 w-full px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold text-sm shadow-lg shadow-indigo-200/80 transition-all hover:from-indigo-500 hover:to-violet-500 flex items-center justify-center gap-2"
              >
                Back to sign in
                <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-heading font-bold text-slate-900 tracking-tight">Reset password</h2>
                <p className="text-sm text-slate-500 mt-1.5">
                  Enter your email and we'll send you a reset link.
                </p>
              </div>

              {error && (
                <div className="mb-5 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 flex-shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <label className="block">
                  <span className="block text-xs font-medium text-slate-600 mb-1.5">Email address</span>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      required
                      autoComplete="email"
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm placeholder-slate-400 outline-none transition-all duration-200 hover:border-slate-300 focus:border-indigo-400 focus:ring-[3px] focus:ring-indigo-400/10"
                    />
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-sm shadow-lg shadow-indigo-200/80 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Sending...
                    </>
                  ) : (
                    <>
                      Send reset link
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {!sent && (
            <button
              onClick={() => navigate('/login')}
              className="mt-6 w-full flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to sign in
            </button>
          )}
        </div>

        <p className="text-center mt-6 text-[11px] text-slate-400">
          Protected by enterprise-grade encryption &middot; &copy; 2026 VoiceFlow AI
        </p>
      </motion.div>
    </div>
  )
}
