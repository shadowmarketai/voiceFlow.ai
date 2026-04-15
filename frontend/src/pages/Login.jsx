/**
 * Login — Immersive Voice AI login with custom 3D scene
 *
 * Layout:
 *   Desktop: Dark left panel (3D Voice Orb scene) + Clean white right panel (login card)
 *   Mobile:  Full-width card with gradient background (no 3D for performance)
 *
 * Features: Login, Register, Demo login, Forgot Password link (placeholder for Step 3)
 */

import { Suspense, lazy, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, Sparkles, Shield, Zap, Globe2,
  User, Mic, Waves, ChevronRight,
} from 'lucide-react'

const ThreeScene = lazy(() => import('../components/login/ThreeScene'))

// ── Animation variants ──────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  }),
}

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5 } },
}

const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
}

// ── Main Component ──────────────────────────────────────────────

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
      <div className="relative z-10 min-h-screen grid lg:grid-cols-[55fr_45fr] gap-0">

        {/* ─── LEFT: Dark immersive 3D panel ──────────────────── */}
        <div className="hidden lg:flex flex-col justify-between relative overflow-hidden">
          {/* Dark gradient base */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#050012] via-[#0f0a24] to-[#130826]" />

          {/* Subtle grid overlay */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }}
          />

          {/* Radial glow behind orb */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[500px] h-[500px] rounded-full bg-indigo-600/10 blur-[120px]" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[300px] h-[300px] rounded-full bg-violet-500/8 blur-[80px] translate-y-12" />
          </div>

          {/* 3D Scene */}
          <div className="absolute inset-0">
            <Suspense
              fallback={
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-20 h-20 rounded-full border-2 border-indigo-500/30 border-t-indigo-400 animate-spin" />
                </div>
              }
            >
              <ThreeScene />
            </Suspense>
          </div>

          {/* Content overlay */}
          <div className="relative z-10 flex flex-col justify-between h-full p-10 xl:p-14">
            {/* Brand */}
            <motion.div
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              custom={0}
              className="flex items-center gap-3"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/25 ring-1 ring-white/10">
                <Mic className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-lg leading-tight tracking-tight">VoiceFlow</p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-indigo-300/60 font-medium">
                  AI&nbsp;Platform
                </p>
              </div>
            </motion.div>

            {/* Hero content — bottom area */}
            <div className="space-y-6">
              <motion.div
                initial="hidden"
                animate="visible"
                variants={fadeUp}
                custom={2}
              >
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] backdrop-blur-sm border border-white/[0.08] text-xs text-indigo-200/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Platform online
                </span>
              </motion.div>

              <motion.h1
                initial="hidden"
                animate="visible"
                variants={fadeUp}
                custom={3}
                className="text-4xl xl:text-5xl font-bold leading-[1.1] tracking-tight"
              >
                <span className="text-white/95">Voice AI that</span>
                <br />
                <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
                  understands every voice.
                </span>
              </motion.h1>

              <motion.p
                initial="hidden"
                animate="visible"
                variants={fadeUp}
                custom={4}
                className="text-[15px] text-slate-400 max-w-md leading-relaxed"
              >
                Multi-tenant SaaS with 12+ Indian language support,
                intelligent voice agents, and sub-500ms response times.
              </motion.p>

              {/* Feature chips */}
              <motion.div
                initial="hidden"
                animate="visible"
                variants={fadeUp}
                custom={5}
                className="flex flex-wrap gap-2 pt-1"
              >
                {[
                  { icon: Globe2, label: '12+ Languages' },
                  { icon: Waves, label: '5 TTS Engines' },
                  { icon: Zap, label: 'Sub-500ms' },
                  { icon: Shield, label: 'Enterprise Security' },
                ].map((f) => (
                  <span
                    key={f.label}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-[11px] text-slate-300 font-medium"
                  >
                    <f.icon className="w-3 h-3 text-indigo-400" />
                    {f.label}
                  </span>
                ))}
              </motion.div>

              {/* Trust line */}
              <motion.div
                initial="hidden"
                animate="visible"
                variants={fadeUp}
                custom={6}
                className="flex items-center gap-3 pt-4"
              >
                <div className="flex -space-x-2">
                  {['bg-indigo-500', 'bg-violet-500', 'bg-cyan-500', 'bg-fuchsia-500'].map((bg, i) => (
                    <div
                      key={i}
                      className={`w-7 h-7 rounded-full ${bg} border-2 border-[#0f0a24] flex items-center justify-center`}
                    >
                      <User className="w-3 h-3 text-white/80" />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500">
                  Trusted by <span className="text-slate-300 font-medium">200+</span> businesses
                </p>
              </motion.div>
            </div>
          </div>
        </div>

        {/* ─── RIGHT: Login card ─────────────────────────────── */}
        <div className="flex items-center justify-center p-6 sm:p-8 lg:p-12">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={scaleIn}
            className="w-full max-w-[420px]"
          >
            {/* Mobile brand */}
            <div className="lg:hidden flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-200">
                <Mic className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-slate-900 font-bold text-lg">VoiceFlow</p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-indigo-500/60">AI Platform</p>
              </div>
            </div>

            {/* Card */}
            <div className="rounded-2xl bg-white border border-gray-100 p-8 shadow-xl shadow-gray-100/60">
              {/* Header */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={isRegister ? 'register' : 'login'}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                  className="mb-7"
                >
                  <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                    {isRegister ? 'Create account' : 'Welcome back'}
                  </h2>
                  <p className="text-sm text-slate-500 mt-1.5">
                    {isRegister
                      ? 'Start your free trial — no credit card required.'
                      : 'Sign in to your VoiceFlow workspace.'}
                  </p>
                </motion.div>
              </AnimatePresence>

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="mb-5 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm flex items-start gap-2"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 flex-shrink-0" />
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <AnimatePresence>
                  {isRegister && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <InputField
                        label="Full name"
                        icon={User}
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Jane Smith"
                        required
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <InputField
                  label="Email address"
                  icon={Mail}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                />

                <div className="relative">
                  <InputField
                    label="Password"
                    icon={Lock}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    className="pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-[34px] p-1 text-slate-400 hover:text-slate-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {!isRegister && (
                  <div className="flex items-center justify-between text-xs pt-0.5">
                    <label className="flex items-center gap-2 text-slate-500 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-500 focus:ring-indigo-400/40 focus:ring-offset-0"
                      />
                      Remember me
                    </label>
                    <button
                      type="button"
                      onClick={() => navigate('/forgot-password')}
                      className="text-indigo-600 hover:text-indigo-500 font-medium transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-sm shadow-lg shadow-indigo-200/80 hover:shadow-indigo-300/80 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]"
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
                      {isRegister ? 'Create account' : 'Sign in'}
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
                    or continue with
                  </span>
                </div>
              </div>

              {/* Quick actions */}
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => { setEmail('admin@swetha.in'); setPassword('Swetha123!') }}
                  className="w-full px-5 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-gray-200 text-slate-700 hover:text-slate-900 text-sm font-medium transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  <Shield className="w-4 h-4 text-indigo-500" />
                  Admin Login
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 ml-auto" />
                </button>
                <button
                  type="button"
                  onClick={handleDemoLogin}
                  className="w-full px-5 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 text-indigo-700 text-sm font-medium transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  <Sparkles className="w-4 h-4" />
                  Explore Demo
                  <ChevronRight className="w-3.5 h-3.5 text-indigo-400 ml-auto" />
                </button>
              </div>

              {/* Toggle */}
              <p className="text-center mt-6 text-sm text-slate-500">
                {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
                <button
                  onClick={() => { setIsRegister(!isRegister); setError('') }}
                  className="text-indigo-600 hover:text-indigo-500 font-semibold transition-colors"
                >
                  {isRegister ? 'Sign in' : 'Start free trial'}
                </button>
              </p>
            </div>

            {/* Footer */}
            <p className="text-center mt-6 text-[11px] text-slate-400">
              Protected by enterprise-grade encryption &middot; &copy; 2026 VoiceFlow AI
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

// ── Input field component ───────────────────────────────────────

function InputField({ label, icon: Icon, className = '', ...props }) {
  return (
    <label className="block relative">
      <span className="block text-xs font-medium text-slate-600 mb-1.5">{label}</span>
      <div className="relative">
        {Icon && (
          <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        )}
        <input
          {...props}
          className={`w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm placeholder-slate-400 outline-none transition-all duration-200 hover:border-slate-300 focus:border-indigo-400 focus:ring-[3px] focus:ring-indigo-400/10 ${Icon ? 'pl-10' : ''} ${className}`}
        />
      </div>
    </label>
  )
}
