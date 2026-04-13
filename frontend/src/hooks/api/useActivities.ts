/**
 * React Query hooks for Activity CRUD operations
 *
 * Endpoints:
 *   GET    /api/v1/crm-activities          — paginated list
 *   POST   /api/v1/crm-activities          — create
 *   PUT    /api/v1/crm-activities/:id      — update
 *   DELETE /api/v1/crm-activities/:id      — delete
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { activitiesApi } from '@/lib/api';
import type { Activity, PaginatedResponse, ApiQueryParams } from '@/types';
import type { ActivityType } from '@/types/enums';

// ─────────────────────────────────────────────
// Query Key Factory
// ─────────────────────────────────────────────

export const activityKeys = {
  all: ['activities'] as const,
  lists: () => [...activityKeys.all, 'list'] as const,
  list: (params: UseActivitiesParams) => [...activityKeys.lists(), params] as const,
};

// ─────────────────────────────────────────────
// Param / Payload Types
// ─────────────────────────────────────────────

export interface UseActivitiesParams extends ApiQueryParams {
  type?: ActivityType;
  lead_id?: number;
  deal_id?: number;
  contact_id?: number;
  completed?: boolean;
}

export interface ActivityCreatePayload {
  type: ActivityType;
  title: string;
  description?: string;
  lead_id?: number;
  deal_id?: number;
  contact_id?: number;
  due_date?: string;
  completed?: boolean;
}

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

/**
 * Fetch paginated activities with optional filters.
 */
export function useActivities(params: UseActivitiesParams = {}) {
  return useQuery<PaginatedResponse<Activity>>({
    queryKey: activityKeys.list(params),
    queryFn: async () => {
      const { data } = await activitiesApi.getAll(params);
      return data;
    },
  });
}

// ─────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────

/**
 * Create a new activity.
 */
export function useCreateActivity() {
  const queryClient = useQueryClient();
  return useMutation<Activity, Error, ActivityCreatePayload>({
    mutationFn: async (payload) => {
      const { data } = await activitiesApi.create(payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: activityKeys.all });
    },
  });
}

/**
 * Update an existing activity.
 */
export function useUpdateActivity() {
  const queryClient = useQueryClient();
  return useMutation<Activity, Error, { id: number; payload: Partial<ActivityCreatePayload> }>({
    mutationFn: async ({ id, payload }) => {
      const { data } = await activitiesApi.update(id, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: activityKeys.all });
    },
  });
}

/**
 * Delete an activity.
 */
export function useDeleteActivity() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await activitiesApi.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: activityKeys.all });
    },
  });
}
