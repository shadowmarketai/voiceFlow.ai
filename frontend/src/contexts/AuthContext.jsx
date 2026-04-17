import { createContext, useContext, useState, useEffect } from 'react'
import { authAPI } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('swetha_token')
    if (token && token !== 'demo-token-123') {
      authAPI.getProfile()
        .then(res => setUser(res.data))
        .catch(() => localStorage.removeItem('swetha_token'))
        .finally(() => setLoading(false))
    } else if (token === 'demo-token-123') {
      const savedUser = localStorage.getItem('swetha_user')
      if (savedUser) {
        setUser(JSON.parse(savedUser))
      }
      setLoading(false)
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email, password) => {
    localStorage.removeItem('swetha_token')
    localStorage.removeItem('swetha_user')

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
    localStorage.removeItem('swetha_token')
    localStorage.removeItem('swetha_user')

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

    localStorage.setItem('swetha_token', token)
    if (data.refresh_token) {
      localStorage.setItem('swetha_refresh_token', data.refresh_token)
    }

    try {
      const profile = await authAPI.getProfile()
      userData = profile.data
    } catch (_err) {
      // Fallback to login response data
    }

    localStorage.setItem('swetha_user', JSON.stringify(userData))
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
    }
    const res = await authAPI.register(payload)
    const respData = res.data
    const token = respData.access_token || respData.token
    const userData = respData.user || respData
    localStorage.setItem('swetha_token', token)
    localStorage.setItem('swetha_user', JSON.stringify(userData))
    setUser(userData)
    return userData
  }

  const logout = () => {
    localStorage.removeItem('swetha_token')
    localStorage.removeItem('swetha_refresh_token')
    localStorage.removeItem('swetha_user')
    setUser(null)
  }

  const demoLogin = () => {
    const demoUser = {
      id: 'demo-001',
      name: 'Demo User',
      email: 'demo@swetha.in',
      role: 'admin',
      company: 'Swetha Structures PVT LTD',
      plan: 'professional',
      is_super_admin: false,
      tenant_id: 'tenant-swetha',
    }
    localStorage.setItem('swetha_token', 'demo-token-123')
    localStorage.setItem('swetha_user', JSON.stringify(demoUser))
    setUser(demoUser)
    return demoUser
  }

  const demoLoginAs = (role) => {
    const roleNames = {
      admin: 'Swetha Admin',
      manager: 'Swetha Manager',
      agent: 'Swetha Agent',
      user: 'Swetha User',
      viewer: 'Swetha Viewer',
      super_admin: 'Super Admin',
    }
    const isSuperAdmin = role === 'super_admin'
    const demoUser = {
      id: `demo-${role}-001`,
      name: roleNames[role] || 'Swetha User',
      email: `${role}@swetha.in`,
      role: isSuperAdmin ? 'admin' : role,
      company: isSuperAdmin ? 'VoiceFlow Platform' : 'Swetha Structures',
      plan: role === 'admin' || isSuperAdmin ? 'pro' : 'starter',
      is_super_admin: isSuperAdmin,
      tenant_id: isSuperAdmin ? '' : 'tenant-001',
    }
    localStorage.setItem('swetha_token', 'demo-token-123')
    localStorage.setItem('swetha_user', JSON.stringify(demoUser))
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
