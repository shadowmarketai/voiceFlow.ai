/**
 * Login — Light theme redesign with subtle 3D hero scene
 *
 * Layout: Split screen on desktop
 *   - Left: Brand section with lazy-loaded Three.js blob
 *   - Right: Clean white login card on #fafbfe background
 */

import { Suspense, lazy, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { motion } from 'framer-motion'
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, Sparkles, Shield, Zap, Globe2,
} from 'lucide-react'

const ThreeScene = lazy(() => import('../components/login/ThreeScene'))

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.5, ease: 'easeOut' } }),
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isRegister, setIsRegister] = useState(false)
  const [name, setName] = useState('')

  const { login, register, demoLogin } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      let userData
      if (isRegister) {
        userData = await register({ name, email, password })
      } else {
        userData = await login(email, password)
      }
      if (userData?.is_super_admin) {
        navigate('/admin')
      } else {
        navigate('/')
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid credentials. Try the demo login below.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDemoLogin = () => {
    demoLogin()
    navigate('/')
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#fafbfe]">
      {/* Content */}
      <div className="relative z-10 min-h-screen grid lg:grid-cols-2 gap-0">
        {/* ─── LEFT: Brand + 3D ─────────────────────────────── */}
        <div className="hidden lg:flex flex-col justify-between p-12 xl:p-16 relative overflow-hidden bg-gradient-to-br from-indigo-50 via-violet-50 to-fuchsia-50">
          {/* 3D Scene background */}
          <div className="absolute inset-0">
            <Suspense
              fallback={
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-100/60 via-violet-100/40 to-fuchsia-100/30" />
              }
            >
              <ThreeScene />
            </Suspense>
          </div>

          {/* Overlay so text is legible */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-white/30 pointer-events-none" />

          {/* Brand mark */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={0}
            className="relative z-10 flex items-center gap-3"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-200">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-slate-900 font-bold text-lg leading-tight">VoiceFlow</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-indigo-500/70">
                AI&nbsp;Suite
              </p>
            </div>
          </motion.div>

          {/* Hero copy */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={1}
            className="relative z-10 space-y-7"
          >
            <div>
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/70 backdrop-blur-sm border border-indigo-100 text-xs text-slate-600 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                System operational
              </span>
            </div>

            <h1 className="text-5xl xl:text-6xl font-bold leading-[1.05] tracking-tight">
              <span className="text-slate-900">Voice AI for</span>
              <br />
              <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                Every Business.
              </span>
            </h1>

            <p className="text-lg text-slate-500 max-w-md leading-relaxed">
              Multi-tenant SaaS platform with Tamil dialect detection, white-label
              branding, and intelligent automation.
            </p>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-2 pt-1">
              {[
                { icon: Globe2, label: '12+ Languages' },
                { icon: Zap, label: '5 TTS Engines' },
                { icon: Shield, label: 'Sub-500ms' },
              ].map((f) => (
                <span
                  key={f.label}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/70 backdrop-blur-sm border border-gray-200 text-xs text-slate-600 shadow-sm"
                >
                  <f.icon className="w-3.5 h-3.5 text-indigo-500" />
                  {f.label}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Footer */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={2}
            className="relative z-10 text-xs text-slate-400"
          >
            Trusted by 200+ businesses
          </motion.div>
        </div>

        {/* ─── RIGHT: Login card ─────────────────────────────── */}
        <div className="flex items-center justify-center p-6 lg:p-12">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={1}
            className="w-full max-w-md"
          >
            {/* Mobile brand mark */}
            <div className="lg:hidden flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-md">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <p className="text-slate-900 font-bold text-lg">VoiceFlow</p>
            </div>

            {/* Card */}
            <div className="rounded-2xl bg-white border border-gray-100 p-8 shadow-xl shadow-gray-100/50">
              {/* Header */}
              <div className="mb-7">
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                  {isRegister ? 'Create account' : 'Welcome back'}
                </h2>
                <p className="text-sm text-slate-500 mt-2">
                  {isRegister
                    ? 'Start your free trial — no credit card.'
                    : 'Sign in to continue to your workspace.'}
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="mb-5 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {isRegister && (
                  <Field label="Full name">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Smith"
                      required
                      className="login-input-light"
                    />
                  </Field>
                )}

                <Field label="Email address" icon={Mail}>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    autoComplete="email"
                    className="login-input-light login-input-light-icon"
                  />
                </Field>

                <Field label="Password" icon={Lock}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    className="login-input-light login-input-light-icon pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-[34px] text-slate-400 hover:text-slate-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </Field>

                {!isRegister && (
                  <div className="flex items-center justify-between text-xs">
                    <label className="flex items-center gap-2 text-slate-500 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-500 focus:ring-indigo-400/40 focus:ring-offset-0"
                      />
                      Remember me
                    </label>
                    <button type="button" className="text-indigo-600 hover:text-indigo-500 font-medium">
                      Forgot password?
                    </button>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-sm shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {isRegister ? 'Creating account...' : 'Signing in...'}
                    </>
                  ) : (
                    <>
                      {isRegister ? 'Create account' : 'Sign In'}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-100" />
                </div>
                <div className="relative flex justify-center">
                  <span className="px-3 text-[10px] uppercase tracking-widest bg-white text-slate-400">
                    or
                  </span>
                </div>
              </div>

              {/* Demo login */}
              <button
                type="button"
                onClick={handleDemoLogin}
                className="w-full px-6 py-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-gray-200 text-slate-700 hover:text-slate-900 text-sm font-medium transition-all flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-indigo-500" />
                Explore Demo
              </button>

              {/* Toggle */}
              <p className="text-center mt-6 text-xs text-slate-500">
                {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
                <button
                  onClick={() => { setIsRegister(!isRegister); setError('') }}
                  className="text-indigo-600 hover:text-indigo-500 font-medium"
                >
                  {isRegister ? 'Sign in' : 'Start free trial'}
                </button>
              </p>
            </div>

            {/* Footer */}
            <p className="text-center mt-6 text-[10px] text-slate-400">
              Protected by enterprise-grade encryption &middot; &copy; 2026 VoiceFlow
            </p>
          </motion.div>
        </div>
      </div>

      {/* Inline styles for light inputs */}
      <style>{`
        .login-input-light {
          width: 100%;
          padding: 10px 14px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          color: #0f172a;
          font-size: 14px;
          outline: none;
          transition: all 200ms ease;
        }
        .login-input-light::placeholder {
          color: #94a3b8;
        }
        .login-input-light:hover {
          border-color: #cbd5e1;
        }
        .login-input-light:focus {
          border-color: #818cf8;
          box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.12);
        }
        .login-input-light-icon {
          padding-left: 40px;
        }
      `}</style>
    </div>
  )
}

// ── Field wrapper ─────────────────────────────────────────────

function Field({ label, icon: Icon, children }) {
  return (
    <label className="block relative">
      <span className="block text-xs font-medium text-slate-600 mb-1.5">{label}</span>
      <div className="relative">
        {Icon && (
          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        )}
        {children}
      </div>
    </label>
  )
}
