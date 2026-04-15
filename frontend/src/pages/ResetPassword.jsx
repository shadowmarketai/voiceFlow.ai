/**
 * ResetPassword — Set new password using token from email link.
 */

import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Lock, ArrowRight, Mic, CheckCircle, Eye, EyeOff } from 'lucide-react'
import { authAPI } from '../services/api'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setError('')
    setIsLoading(true)
    try {
      await authAPI.resetPassword({ token, new_password: password })
      setDone(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Reset link is invalid or expired. Request a new one.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen w-full bg-[#fafbfe] flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-slate-500 text-sm">Invalid reset link. Please request a new one.</p>
          <button onClick={() => navigate('/forgot-password')} className="mt-4 text-indigo-600 font-medium text-sm">
            Request new link
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full bg-[#fafbfe] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[420px]"
      >
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-200">
            <Mic className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-slate-900 font-heading font-bold text-lg">VoiceFlow</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-indigo-500/60">AI Platform</p>
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-gray-100 p-8 shadow-xl shadow-gray-100/60">
          {done ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-emerald-500" />
              </div>
              <h2 className="text-xl font-heading font-bold text-slate-900">Password reset</h2>
              <p className="text-sm text-slate-500">Your password has been updated. You can now sign in.</p>
              <button
                onClick={() => navigate('/login')}
                className="mt-4 w-full px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold text-sm shadow-lg shadow-indigo-200/80 transition-all hover:from-indigo-500 hover:to-violet-500 flex items-center justify-center gap-2"
              >
                Sign in <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-heading font-bold text-slate-900 tracking-tight">Set new password</h2>
                <p className="text-sm text-slate-500 mt-1.5">Must be at least 8 characters with 1 uppercase and 1 digit.</p>
              </div>
              {error && (
                <div className="mb-5 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 flex-shrink-0" />
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <label className="block relative">
                  <span className="block text-xs font-medium text-slate-600 mb-1.5">New password</span>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter new password"
                      required
                      minLength={8}
                      className="w-full pl-10 pr-11 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm placeholder-slate-400 outline-none transition-all duration-200 hover:border-slate-300 focus:border-indigo-400 focus:ring-[3px] focus:ring-indigo-400/10"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-600 mb-1.5">Confirm password</span>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      required
                      minLength={8}
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm placeholder-slate-400 outline-none transition-all duration-200 hover:border-slate-300 focus:border-indigo-400 focus:ring-[3px] focus:ring-indigo-400/10"
                    />
                  </div>
                </label>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-sm shadow-lg shadow-indigo-200/80 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isLoading ? 'Resetting...' : <>Reset password <ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
