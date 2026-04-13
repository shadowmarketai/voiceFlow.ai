/**
 * React Query hooks for Deal CRUD operations
 *
 * Endpoints:
 *   GET    /api/v1/crm-deals          — paginated list
 *   GET    /api/v1/crm-deals/:id      — single deal
 *   POST   /api/v1/crm-deals          — create
 *   PUT    /api/v1/crm-deals/:id      — update
 *   DELETE /api/v1/crm-deals/:id      — delete
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dealsApi } from '@/lib/api';
import type { Deal, PaginatedResponse, ApiQueryParams } from '@/types';
import type { DealStage } from '@/types/enums';

// ─────────────────────────────────────────────
// Query Key Factory
// ─────────────────────────────────────────────

export const dealKeys = {
  all: ['deals'] as const,
  lists: () => [...dealKeys.all, 'list'] as const,
  list: (params: UseDealsParams) => [...dealKeys.lists(), params] as const,
  details: () => [...dealKeys.all, 'detail'] as const,
  detail: (id: number) => [...dealKeys.details(), id] as const,
};

// ─────────────────────────────────────────────
// Param / Payload Types
// ─────────────────────────────────────────────

export interface UseDealsParams extends ApiQueryParams {
  stage?: DealStage;
}

export interface DealCreatePayload {
  name: string;
  value: number;
  currency?: string;
  stage?: DealStage;
  probability?: number;
  expected_close_date?: string;
  lead_id?: number;
  company_id?: number;
  contact_id?: number;
  assigned_to?: number;
  description?: string;
  tags?: string[];
}

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

/**
 * Fetch paginated deals with optional filters.
 */
export function useDeals(params: UseDealsParams = {}) {
  return useQuery<PaginatedResponse<Deal>>({
    queryKey: dealKeys.list(params),
    queryFn: async () => {
      const { data } = await dealsApi.getAll(params);
      return data;
    },
  });
}

/**
 * Fetch a single deal by ID.
 */
export function useDeal(id: number | undefined) {
  return useQuery<Deal>({
    queryKey: dealKeys.detail(id as number),
    queryFn: async () => {
      const { data } = await dealsApi.getById(id as number);
      return data;
    },
    enabled: id !== undefined && id > 0,
  });
}

// ─────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────

/**
 * Create a new deal.
 */
export function useCreateDeal() {
  const queryClient = useQueryClient();
  return useMutation<Deal, Error, DealCreatePayload>({
    mutationFn: async (payload) => {
      const { data } = await dealsApi.create(payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dealKeys.all });
    },
  });
}

/**
 * Update an existing deal.
 */
export function useUpdateDeal() {
  const queryClient = useQueryClient();
  return useMutation<Deal, Error, { id: number; payload: Partial<DealCreatePayload> }>({
    mutationFn: async ({ id, payload }) => {
      const { data } = await dealsApi.update(id, payload);
      return data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: dealKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: dealKeys.lists() });
    },
  });
}

/**
 * Delete a deal.
 */
export function useDeleteDeal() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await dealsApi.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dealKeys.all });
    },
  });
}
