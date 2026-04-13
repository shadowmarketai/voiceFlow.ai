/**
 * useAuth Hook — TypeScript wrapper around TypedAuthContext
 *
 * Provides typed access to auth state and actions.
 * Throws a clear error if used outside a TypedAuthProvider.
 *
 * Usage:
 *   import { useTypedAuth } from '../hooks/useAuth';
 *   const { user, login, logout, isAuthenticated } = useTypedAuth();
 */

import { useContext } from 'react';
import { TypedAuthContext } from '../context/AuthContext';
import type { AuthContextValue } from '../context/AuthContext';

/**
 * Hook to access the TypeScript auth context.
 * Named `useTypedAuth` to avoid collision with the existing JSX `useAuth` in contexts/AuthContext.jsx.
 * Once the JSX version is retired in Phase 2, this can be renamed to `useAuth`.
 */
export function useTypedAuth(): AuthContextValue {
  const context = useContext(TypedAuthContext);
  if (!context) {
    throw new Error(
      'useTypedAuth must be used within a <TypedAuthProvider>. ' +
      'Make sure you have wrapped your component tree with TypedAuthProvider.',
    );
  }
  return context;
}

export default useTypedAuth;
