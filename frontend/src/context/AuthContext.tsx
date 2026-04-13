/**
 * AuthContext — TypeScript Auth Context Provider
 *
 * Provides authentication state and actions to the component tree.
 * Stores JWT tokens in localStorage; auto-refreshes before expiry.
 * Coexists with the existing JSX AuthContext in contexts/AuthContext.jsx.
 *
 * Usage (in new TypeScript components):
 *   import { useTypedAuth } from '../hooks/useAuth';
 *   const { user, login, logout } = useTypedAuth();
 *
 * NOTE: The existing JSX app still uses contexts/AuthContext.jsx.
 * This file will replace it once all pages are migrated to TypeScript (Phase 2).
 */

import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { authApi, setTokens, clearTokens, getAccessToken, getRefreshToken } from '../lib/api';
import type { User } from '../types';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string, fullName: string) => Promise<User>;
  logout: () => void;
  refreshToken: () => Promise<void>;
  demoLogin: () => User;
}

// ─────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────

export const TypedAuthContext = createContext<AuthContextValue | null>(null);

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Parse a JWT payload without a library (base64url decode) */
function parseJwtExpiry(token: string): number | null {
  try {
    const payloadBase64 = token.split('.')[1];
    if (!payloadBase64) return null;
    const payload = JSON.parse(atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

interface AuthProviderProps {
  children: ReactNode;
}

export function TypedAuthProvider({ children }: AuthProviderProps): React.JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Schedule auto-refresh ──
  const scheduleRefresh = useCallback((accessToken: string) => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    const expiry = parseJwtExpiry(accessToken);
    if (!expiry) return;

    // Refresh 2 minutes before expiry, minimum 10 seconds from now
    const refreshIn = Math.max(expiry - Date.now() - 2 * 60 * 1000, 10_000);

    refreshTimerRef.current = setTimeout(async () => {
      try {
        const rt = getRefreshToken();
        if (!rt) return;
        const response = await authApi.refreshToken(rt);
        const { access_token, refresh_token } = response.data;
        setTokens(access_token, refresh_token);
        scheduleRefresh(access_token);
      } catch {
        // Refresh failed — user will be logged out on next 401
        clearTokens();
        setUser(null);
      }
    }, refreshIn);
  }, []);

  // ── Initialize: check existing token on mount ──
  useEffect(() => {
    const token = getAccessToken();
    if (token && token !== 'demo-token-123') {
      authApi
        .getProfile()
        .then((res) => {
          setUser(res.data);
          scheduleRefresh(token);
        })
        .catch(() => {
          clearTokens();
        })
        .finally(() => setIsLoading(false));
    } else if (token === 'demo-token-123') {
      // Restore demo session
      const demoUser: User = {
        id: 'demo-001',
        full_name: 'Swetha Admin',
        name: 'Swetha Admin',
        email: 'admin@swetha.in',
        role: 'admin',
        is_active: true,
        company: 'Swetha Structures',
        plan: 'pro',
        created_at: new Date().toISOString(),
      };
      setUser(demoUser);
      setIsLoading(false);
    } else {
      setIsLoading(false);
    }

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [scheduleRefresh]);

  // ── Login ──
  const login = useCallback(
    async (email: string, password: string): Promise<User> => {
      const response = await authApi.login({ email, password });
      const { token, user: userData, access_token, refresh_token } = response.data;

      // Backend may return either { token } or { access_token, refresh_token }
      const accessToken = access_token || token;
      setTokens(accessToken, refresh_token);
      setUser(userData);
      scheduleRefresh(accessToken);
      return userData;
    },
    [scheduleRefresh],
  );

  // ── Register ──
  const register = useCallback(
    async (email: string, password: string, fullName: string): Promise<User> => {
      const response = await authApi.register({
        email,
        password,
        full_name: fullName,
      });
      const { token, user: userData, access_token, refresh_token } = response.data;

      const accessToken = access_token || token;
      setTokens(accessToken, refresh_token);
      setUser(userData);
      scheduleRefresh(accessToken);
      return userData;
    },
    [scheduleRefresh],
  );

  // ── Logout ──
  const logout = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    clearTokens();
    setUser(null);
  }, []);

  // ── Manual refresh ──
  const refreshTokenFn = useCallback(async (): Promise<void> => {
    const rt = getRefreshToken();
    if (!rt) throw new Error('No refresh token available');
    const response = await authApi.refreshToken(rt);
    const { access_token, refresh_token } = response.data;
    setTokens(access_token, refresh_token);
    scheduleRefresh(access_token);
  }, [scheduleRefresh]);

  // ── Demo login ──
  const demoLogin = useCallback((): User => {
    const demoUser: User = {
      id: 'demo-001',
      full_name: 'Swetha Admin',
      name: 'Swetha Admin',
      email: 'admin@swetha.in',
      role: 'admin',
      is_active: true,
      company: 'Swetha Structures',
      plan: 'pro',
      created_at: new Date().toISOString(),
    };
    setTokens('demo-token-123');
    setUser(demoUser);
    return demoUser;
  }, []);

  // ── Context value ──
  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      register,
      logout,
      refreshToken: refreshTokenFn,
      demoLogin,
    }),
    [user, isLoading, login, register, logout, refreshTokenFn, demoLogin],
  );

  return (
    <TypedAuthContext.Provider value={value}>
      {children}
    </TypedAuthContext.Provider>
  );
}
