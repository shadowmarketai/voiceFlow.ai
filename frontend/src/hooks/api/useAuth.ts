/**
 * React Query hooks for Auth-specific API operations
 *
 * These complement the AuthContext (which manages login/logout/token flow)
 * by providing React Query-based hooks for profile read/update.
 *
 * Endpoints:
 *   GET /api/v1/auth/me     — fetch current user profile
 *   PUT /api/v1/auth/me     — update current user profile
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/lib/api';
import apiClient from '@/lib/api';
import type { User } from '@/types';

// ─────────────────────────────────────────────
// Query Key Factory
// ─────────────────────────────────────────────

export const authKeys = {
  all: ['auth'] as const,
  currentUser: () => [...authKeys.all, 'currentUser'] as const,
};

// ─────────────────────────────────────────────
// Payload Type
// ─────────────────────────────────────────────

export interface UpdateProfilePayload {
  full_name?: string;
  phone?: string;
  avatar_url?: string;
  company?: string;
}

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

/**
 * Fetch the currently authenticated user's profile.
 * Only enabled when a token exists (not for unauthenticated users).
 */
export function useCurrentUser(enabled = true) {
  return useQuery<User>({
    queryKey: authKeys.currentUser(),
    queryFn: async () => {
      const { data } = await authApi.getProfile();
      return data;
    },
    enabled,
    staleTime: 10 * 60 * 1000, // 10 minutes — profile doesn't change often
  });
}

// ─────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────

/**
 * Update the current user's profile.
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation<User, Error, UpdateProfilePayload>({
    mutationFn: async (payload) => {
      const { data } = await apiClient.put<User>('/api/v1/auth/me', payload);
      return data;
    },
    onSuccess: (updatedUser) => {
      // Optimistically update the cached user data
      queryClient.setQueryData(authKeys.currentUser(), updatedUser);
    },
  });
}
