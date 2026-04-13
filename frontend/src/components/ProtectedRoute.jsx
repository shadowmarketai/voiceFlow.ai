import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Spinner } from './common'

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <Spinner size="xl" />
        <p className="mt-4 text-gray-500">Loading...</p>
      </div>
    </div>
  )
}

/**
 * ProtectedRoute — base auth guard.
 * Requires the user to be logged in. Used for any authenticated page.
 */
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  return children
}

/**
 * SuperAdminRoute — gate for the platform console (/admin/*).
 * - Logged out → /login
 * - Tenant user (not super admin) → bounce to / (their tenant dashboard)
 * - Super admin → render
 */
export function SuperAdminRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (!user.is_super_admin) return <Navigate to="/" replace />
  return children
}

/**
 * TenantRoute — gate for Voice AI dashboard pages (/, /voice, …).
 * - Logged out → /login
 * - Any logged-in user (including super admins) → render
 */
export function TenantRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  return children
}
