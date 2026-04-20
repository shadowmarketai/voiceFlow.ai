import { createContext, useContext, useState, useEffect } from 'react'
import { authAPI } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('voiceflow_token')
    if (token && token !== 'demo-token-123') {
      authAPI.getProfile()
        .then(res => setUser(res.data))
        .catch(() => localStorage.removeItem('voiceflow_token'))
        .finally(() => setLoading(false))
    } else if (token === 'demo-token-123') {
      const savedUser = localStorage.getItem('voiceflow_user')
      if (savedUser) {
        setUser(JSON.parse(savedUser))
      }
      setLoading(false)
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email, password) => {
    localStorage.removeItem('voiceflow_token')
    localStorage.removeItem('voiceflow_user')

    const res = await authAPI.login({ email, password })
    const data = res.data

    // If 2FA is required, return the flag + temp token (don't set user yet)
    if (data.requires_2fa) {
      return { requires_2fa: true, temp_token: data.temp_token, email }
    }

    return await _completeLogin(data)
  }

  const verify2FALogin = async (email, code, tempToken) => {
    const res = await authAPI.login2FA({ email, code, temp_token: tempToken })
    return await _completeLogin(res.data)
  }

  const googleLogin = async (code) => {
    localStorage.removeItem('voiceflow_token')
    localStorage.removeItem('voiceflow_user')

    const redirectUri = `${window.location.origin}/auth/google/callback`
    const res = await authAPI.googleLogin({ code, redirect_uri: redirectUri })
    return await _completeLogin(res.data)
  }

  const _completeLogin = async (data) => {
    const token = data.access_token || data.token
    let userData = data.user || data

    if (!token) {
      throw new Error('No token received')
    }

    localStorage.setItem('voiceflow_token', token)
    if (data.refresh_token) {
      localStorage.setItem('voiceflow_refresh_token', data.refresh_token)
    }

    try {
      const profile = await authAPI.getProfile()
      userData = profile.data
    } catch (_err) {
      // Fallback to login response data
    }

    // Flag agency users needing onboarding (no branding configured yet)
    const isAgency = userData?.plan?.startsWith?.('agency') ||
      userData?.plan_id?.startsWith?.('agency') ||
      userData?.tenant?.plan_id?.startsWith?.('agency')
    if (isAgency && !userData?.tenant?.app_name && !userData?.tenant?.logo_url) {
      userData._needs_onboarding = true
    }

    localStorage.setItem('voiceflow_user', JSON.stringify(userData))
    setUser(userData)
    return userData
  }

  const register = async (data) => {
    const payload = {
      email: data.email,
      password: data.password,
      full_name: data.full_name || data.name || data.email.split('@')[0],
      company: data.company,
      phone: data.phone,
      ...(data.agency_id ? { agency_id: data.agency_id } : {}),
    }
    const res = await authAPI.register(payload)
    const respData = res.data
    const token = respData.access_token || respData.token
    const userData = respData.user || respData
    localStorage.setItem('voiceflow_token', token)
    localStorage.setItem('voiceflow_user', JSON.stringify(userData))
    setUser(userData)
    return userData
  }

  const logout = () => {
    localStorage.removeItem('voiceflow_token')
    localStorage.removeItem('voiceflow_refresh_token')
    localStorage.removeItem('voiceflow_user')
    setUser(null)
  }

  const demoLogin = () => {
    const demoUser = {
      id: 'demo-001',
      name: 'Demo User',
      email: 'demo@voiceflow.ai',
      role: 'admin',
      company: 'VoiceFlow AI',
      plan: 'professional',
      is_super_admin: false,
      tenant_id: 'tenant-demo',
    }
    localStorage.setItem('voiceflow_token', 'demo-token-123')
    localStorage.setItem('voiceflow_user', JSON.stringify(demoUser))
    setUser(demoUser)
    return demoUser
  }

  const demoLoginAs = (role) => {
    const roleNames = {
      admin: 'Demo Admin',
      manager: 'Demo Manager',
      agent: 'Demo Agent',
      user: 'Demo User',
      viewer: 'Demo Viewer',
      super_admin: 'Super Admin',
    }
    const isSuperAdmin = role === 'super_admin'
    const demoUser = {
      id: `demo-${role}-001`,
      name: roleNames[role] || 'Demo User',
      email: `${role}@voiceflow.ai`,
      role: isSuperAdmin ? 'admin' : role,
      company: isSuperAdmin ? 'VoiceFlow Platform' : 'VoiceFlow AI',
      plan: role === 'admin' || isSuperAdmin ? 'pro' : 'starter',
      is_super_admin: isSuperAdmin,
      tenant_id: isSuperAdmin ? '' : 'tenant-demo',
    }
    localStorage.setItem('voiceflow_token', 'demo-token-123')
    localStorage.setItem('voiceflow_user', JSON.stringify(demoUser))
    setUser(demoUser)
    return demoUser
  }

  return (
    <AuthContext.Provider value={{
      user, loading,
      login, register, logout,
      verify2FALogin, googleLogin,
      demoLogin, demoLoginAs,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
