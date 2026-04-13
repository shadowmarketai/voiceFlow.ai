/**
 * TypedProtectedRoute — TypeScript Route Guard Component
 *
 * Checks authentication state and redirects unauthenticated users to /login.
 * Shows a loading spinner while auth state is being resolved.
 *
 * Named TypedProtectedRoute to coexist with ProtectedRoute.jsx during migration.
 *
 * Usage:
 *   import TypedProtectedRoute from '../components/TypedProtectedRoute';
 *   <Route element={<TypedProtectedRoute><DashboardLayout /></TypedProtectedRoute>} />
 */

import React from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useTypedAuth } from '../hooks/useAuth';
import LoadingSpinner from './ui/LoadingSpinner';

interface TypedProtectedRouteProps {
  children: ReactNode;
  /** Optional: redirect path when not authenticated (default: /login) */
  redirectTo?: string;
  /** Optional: required role(s) for access */
  requiredRoles?: string[];
}

export default function TypedProtectedRoute({
  children,
  redirectTo = '/login',
  requiredRoles,
}: TypedProtectedRouteProps): React.JSX.Element {
  const { user, isAuthenticated, isLoading } = useTypedAuth();
  const location = useLocation();

  // Show loading spinner while auth state is being resolved
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="text-center">
          <LoadingSpinner size="xl" />
          <p className="mt-4 text-slate-500 dark:text-slate-400 text-sm">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  // Not authenticated: redirect to login with return path
  if (!isAuthenticated) {
    return (
      <Navigate
        to={redirectTo}
        state={{ from: location.pathname }}
        replace
      />
    );
  }

  // Role check (if required)
  if (requiredRoles && requiredRoles.length > 0 && user) {
    const userRole = typeof user.role === 'string' ? user.role : String(user.role);
    if (!requiredRoles.includes(userRole)) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
          <div className="text-center max-w-md px-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"
                />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              Access Denied
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              You do not have permission to access this page.
              Required role: {requiredRoles.join(' or ')}.
            </p>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}
