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
      // Restore demo user from localStorage
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
    // Clear any stale demo tokens first
    localStorage.removeItem('swetha_token')
    localStorage.removeItem('swetha_user')

    const res = await authAPI.login({ email, password })
    const data = res.data
    // API returns { access_token, refresh_token, user }
    const token = data.access_token || data.token
    let userData = data.user || data

    if (!token) {
      throw new Error('No token received')
    }

    localStorage.setItem('swetha_token', token)

    // Fetch full profile (includes tenant branding) — the bare login response
    // omits the tenant object, which the dashboard layout needs for branding.
    try {
      const profile = await authAPI.getProfile()
      userData = profile.data
    } catch (err) {
      // Fallback to login user data if /me fails
      console.warn('getProfile after login failed, using login response', err)
    }

    localStorage.setItem('swetha_user', JSON.stringify(userData))
    setUser(userData)
    return userData
  }

  const register = async (data) => {
    // Backend expects full_name, frontend may send name
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
    localStorage.removeItem('swetha_user')
    setUser(null)
  }

  // Demo login - bypasses API for exploring the platform
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

  // Demo login as a specific role - for testing RBAC
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
    <AuthContext.Provider value={{ user, loading, login, register, logout, demoLogin, demoLoginAs }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
