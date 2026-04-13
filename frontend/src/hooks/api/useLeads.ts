/**
 * React Query hooks for Lead CRUD operations
 *
 * Endpoints:
 *   GET    /api/v1/crm-leads          — paginated list
 *   GET    /api/v1/crm-leads/:id      — single lead
 *   POST   /api/v1/crm-leads          — create
 *   PUT    /api/v1/crm-leads/:id      — update
 *   DELETE /api/v1/crm-leads/:id      — delete
 *   GET    /api/v1/leads/pipeline      — pipeline counts
 *   POST   /api/v1/leads/import        — CSV import
 *   GET    /api/v1/leads/export        — CSV export
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leadsApi } from '@/lib/api';
import type { Lead, LeadCreatePayload, PaginatedResponse, ApiQueryParams } from '@/types';

// ─────────────────────────────────────────────
// Query Key Factory
// ─────────────────────────────────────────────

export const leadKeys = {
  all: ['leads'] as const,
  lists: () => [...leadKeys.all, 'list'] as const,
  list: (params: UseLeadsParams) => [...leadKeys.lists(), params] as const,
  details: () => [...leadKeys.all, 'detail'] as const,
  detail: (id: number) => [...leadKeys.details(), id] as const,
  pipeline: () => [...leadKeys.all, 'pipeline'] as const,
};

// ─────────────────────────────────────────────
// Param Types
// ─────────────────────────────────────────────

export interface UseLeadsParams extends ApiQueryParams {
  status?: string;
}

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

/**
 * Fetch paginated leads with optional filters.
 */
export function useLeads(params: UseLeadsParams = {}) {
  return useQuery<PaginatedResponse<Lead>>({
    queryKey: leadKeys.list(params),
    queryFn: async () => {
      const { data } = await leadsApi.getAll(params);
      return data;
    },
  });
}

/**
 * Fetch a single lead by ID.
 */
export function useLead(id: number | undefined) {
  return useQuery<Lead>({
    queryKey: leadKeys.detail(id as number),
    queryFn: async () => {
      const { data } = await leadsApi.getById(id as number);
      return data;
    },
    enabled: id !== undefined && id > 0,
  });
}

/**
 * Fetch lead pipeline stage counts.
 */
export function useLeadPipeline() {
  return useQuery<Record<string, number>>({
    queryKey: leadKeys.pipeline(),
    queryFn: async () => {
      const { data } = await leadsApi.getPipeline();
      return data;
    },
  });
}

// ─────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────

/**
 * Create a new lead.
 */
export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation<Lead, Error, LeadCreatePayload>({
    mutationFn: async (payload) => {
      const { data } = await leadsApi.create(payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadKeys.all });
    },
  });
}

/**
 * Update an existing lead.
 */
export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation<Lead, Error, { id: number; payload: Partial<LeadCreatePayload> }>({
    mutationFn: async ({ id, payload }) => {
      const { data } = await leadsApi.update(id, payload);
      return data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: leadKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
      queryClient.invalidateQueries({ queryKey: leadKeys.pipeline() });
    },
  });
}

/**
 * Delete a lead.
 */
export function useDeleteLead() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await leadsApi.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadKeys.all });
    },
  });
}

/**
 * Import leads from a CSV file.
 */
export function useImportLeads() {
  const queryClient = useQueryClient();
  return useMutation<{ imported: number }, Error, File>({
    mutationFn: async (file) => {
      const { data } = await leadsApi.import(file);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadKeys.all });
    },
  });
}

/**
 * Export leads as a downloadable blob.
 */
export function useExportLeads() {
  return useMutation<Blob, Error, ApiQueryParams | undefined>({
    mutationFn: async (params) => {
      const { data } = await leadsApi.export(params);
      return data;
    },
  });
}
