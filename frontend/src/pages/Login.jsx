/**
 * Login — Immersive Voice AI login with custom 3D scene
 *
 * Features:
 *   - Custom 3D Voice Orb scene (lazy loaded, dark left panel)
 *   - Google Sign-In integration
 *   - 2FA verification screen (after password login)
 *   - Forgot password link
 *   - Premium typography (Space Grotesk headings, DM Sans body)
 *   - No demo/admin buttons — production-ready
 */

import { Suspense, lazy, useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, Shield, Zap, Globe2,
  User, Mic, Waves, ShieldCheck, KeyRound,
} from 'lucide-react'

const ThreeScene = lazy(() => import('../components/login/ThreeScene'))

// ── Animation variants ──────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  }),
}

const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1, scale: 1,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
}

// ── Google Sign-In Button ───────────────────────────────────────

function GoogleSignInButton({ onSuccess, disabled }) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) return null

  const handleClick = () => {
    const redirectUri = `${window.location.origin}/auth/google/callback`
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
    })
    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
    const w = 500, h = 600
    const left = window.screenX + (window.outerWidth - w) / 2
    const top = window.screenY + (window.outerHeight - h) / 2
    const popup = window.open(url, 'google-signin', `width=${w},height=${h},left=${left},top=${top}`)

    const handler = (event) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== 'google-auth') return
      window.removeEventListener('message', handler)
      if (event.data.code) {
        onSuccess(event.data.code)
      }
    }
    window.addEventListener('message', handler)

    // Clean up if popup is closed without completing
    const check = setInterval(() => {
      if (popup?.closed) {
        clearInterval(check)
        window.removeEventListener('message', handler)
      }
    }, 500)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className="w-full px-5 py-2.5 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-slate-700 text-sm font-medium transition-all flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      Sign in with Google
    </button>
  )
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

  // 2FA state
  const [show2FA, setShow2FA] = useState(false)
  const [tempToken, setTempToken] = useState('')
  const [twoFAEmail, setTwoFAEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const otpInputRef = useRef(null)

  const { login, register, verify2FALogin, googleLogin } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      let result
      if (isRegister) {
        result = await register({ name, email, password })
      } else {
        result = await login(email, password)
      }

      // Check if 2FA is required
      if (result?.requires_2fa) {
        setTempToken(result.temp_token)
        setTwoFAEmail(result.email || email)
        setShow2FA(true)
        setIsLoading(false)
        return
      }

      if (result?.is_super_admin) {
        navigate('/admin')
      } else {
        navigate('/')
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid credentials. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handle2FASubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      const userData = await verify2FALogin(twoFAEmail, otpCode, tempToken)
      if (userData?.is_super_admin) {
        navigate('/admin')
      } else {
        navigate('/')
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid verification code')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSuccess = useCallback(async (credential) => {
    setError('')
    setIsLoading(true)
    try {
      const userData = await googleLogin(credential)
      if (userData?.is_super_admin) {
        navigate('/admin')
      } else {
        navigate('/')
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Google sign-in failed')
    } finally {
      setIsLoading(false)
    }
  }, [googleLogin, navigate])

  // Auto-focus OTP input
  useEffect(() => {
    if (show2FA && otpInputRef.current) {
      otpInputRef.current.focus()
    }
  }, [show2FA])

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#fafbfe]">
      <div className="relative z-10 min-h-screen grid lg:grid-cols-[55fr_45fr] gap-0">

        {/* ─── LEFT: Dark immersive 3D panel ──────────────────── */}
        <div className="hidden lg:flex flex-col justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#050012] via-[#0f0a24] to-[#130826]" />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[500px] h-[500px] rounded-full bg-indigo-600/10 blur-[120px]" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[300px] h-[300px] rounded-full bg-violet-500/8 blur-[80px] translate-y-12" />
          </div>
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

          <div className="relative z-10 flex flex-col justify-between h-full p-10 xl:p-14">
            {/* Brand */}
            <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={0} className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/25 ring-1 ring-white/10">
                <Mic className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-white font-heading font-bold text-lg leading-tight tracking-tight">VoiceFlow</p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-indigo-300/60 font-medium">AI&nbsp;Platform</p>
              </div>
            </motion.div>

            {/* Hero */}
            <div className="space-y-6">
              <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={2}>
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] backdrop-blur-sm border border-white/[0.08] text-xs text-indigo-200/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Platform online
                </span>
              </motion.div>

              <motion.h1 initial="hidden" animate="visible" variants={fadeUp} custom={3} className="text-4xl xl:text-[3.25rem] font-heading font-bold leading-[1.1] tracking-tight">
                <span className="text-white/95">Voice AI that</span>
                <br />
                <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
                  understands every voice.
                </span>
              </motion.h1>

              <motion.p initial="hidden" animate="visible" variants={fadeUp} custom={4} className="text-[15px] text-slate-400 max-w-md leading-relaxed">
                Multi-tenant SaaS with 12+ Indian language support,
                intelligent voice agents, and sub-500ms response times.
              </motion.p>

              <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={5} className="flex flex-wrap gap-2 pt-1">
                {[
                  { icon: Globe2, label: '12+ Languages' },
                  { icon: Waves, label: '5 TTS Engines' },
                  { icon: Zap, label: 'Sub-500ms' },
                  { icon: Shield, label: 'Enterprise Security' },
                ].map((f) => (
                  <span key={f.label} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-[11px] text-slate-300 font-medium">
                    <f.icon className="w-3 h-3 text-indigo-400" />
                    {f.label}
                  </span>
                ))}
              </motion.div>

              <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={6} className="flex items-center gap-3 pt-4">
                <div className="flex -space-x-2">
                  {['bg-indigo-500', 'bg-violet-500', 'bg-cyan-500', 'bg-fuchsia-500'].map((bg, i) => (
                    <div key={i} className={`w-7 h-7 rounded-full ${bg} border-2 border-[#0f0a24] flex items-center justify-center`}>
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
          <motion.div initial="hidden" animate="visible" variants={scaleIn} className="w-full max-w-[420px]">
            {/* Mobile brand */}
            <div className="lg:hidden flex items-center gap-3 mb-8">
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
              <AnimatePresence mode="wait">
                {show2FA ? (
                  /* ─── 2FA Verification Screen ──────────── */
                  <motion.div
                    key="2fa"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="text-center mb-7">
                      <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-indigo-50 flex items-center justify-center">
                        <ShieldCheck className="w-7 h-7 text-indigo-600" />
                      </div>
                      <h2 className="text-2xl font-heading font-bold text-slate-900 tracking-tight">
                        Two-factor verification
                      </h2>
                      <p className="text-sm text-slate-500 mt-1.5">
                        Enter the 6-digit code from your authenticator app
                      </p>
                    </div>

                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-5 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm flex items-start gap-2"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 flex-shrink-0" />
                        {error}
                      </motion.div>
                    )}

                    <form onSubmit={handle2FASubmit} className="space-y-4">
                      <label className="block">
                        <span className="block text-xs font-medium text-slate-600 mb-1.5">Verification code</span>
                        <div className="relative">
                          <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                          <input
                            ref={otpInputRef}
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="000000"
                            required
                            autoComplete="one-time-code"
                            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-center text-lg font-heading font-semibold tracking-[0.3em] placeholder-slate-300 outline-none transition-all duration-200 hover:border-slate-300 focus:border-indigo-400 focus:ring-[3px] focus:ring-indigo-400/10"
                          />
                        </div>
                      </label>

                      <button
                        type="submit"
                        disabled={isLoading || otpCode.length < 6}
                        className="w-full px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-sm shadow-lg shadow-indigo-200/80 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]"
                      >
                        {isLoading ? (
                          <>
                            <Spinner />
                            Verifying...
                          </>
                        ) : (
                          <>
                            Verify & sign in
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </form>

                    <button
                      onClick={() => { setShow2FA(false); setOtpCode(''); setError('') }}
                      className="mt-5 w-full text-center text-sm text-slate-500 hover:text-slate-700 transition-colors"
                    >
                      Back to sign in
                    </button>
                  </motion.div>
                ) : (
                  /* ─── Login / Register Form ────────────── */
                  <motion.div
                    key={isRegister ? 'register' : 'login'}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="mb-7">
                      <h2 className="text-2xl font-heading font-bold text-slate-900 tracking-tight">
                        {isRegister ? 'Create account' : 'Welcome back'}
                      </h2>
                      <p className="text-sm text-slate-500 mt-1.5">
                        {isRegister
                          ? 'Start your free trial — no credit card required.'
                          : 'Sign in to your VoiceFlow workspace.'}
                      </p>
                    </div>

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

                    {/* Google Sign-In */}
                    <GoogleSignInButton onSuccess={handleGoogleSuccess} disabled={isLoading} />

                    {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
                      <div className="relative my-5">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-gray-100" />
                        </div>
                        <div className="relative flex justify-center">
                          <span className="px-3 text-[10px] uppercase tracking-widest bg-white text-slate-400">
                            or continue with email
                          </span>
                        </div>
                      </div>
                    )}

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

                      <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full mt-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-sm shadow-lg shadow-indigo-200/80 hover:shadow-indigo-300/80 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]"
                      >
                        {isLoading ? (
                          <>
                            <Spinner />
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <p className="text-center mt-6 text-[11px] text-slate-400">
              Protected by enterprise-grade encryption &middot; &copy; 2026 VoiceFlow AI
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

// ── Shared components ───────────────────────────────────────────

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

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
