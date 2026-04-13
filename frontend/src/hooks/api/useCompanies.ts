/**
 * React Query hooks for Company CRUD operations
 *
 * Endpoints:
 *   GET    /api/v1/crm-companies          — paginated list
 *   GET    /api/v1/crm-companies/:id      — single company
 *   POST   /api/v1/crm-companies          — create
 *   PUT    /api/v1/crm-companies/:id      — update
 *   DELETE /api/v1/crm-companies/:id      — delete
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { companiesApi } from '@/lib/api';
import type { Company, PaginatedResponse, ApiQueryParams } from '@/types';

// ─────────────────────────────────────────────
// Query Key Factory
// ─────────────────────────────────────────────

export const companyKeys = {
  all: ['companies'] as const,
  lists: () => [...companyKeys.all, 'list'] as const,
  list: (params: ApiQueryParams) => [...companyKeys.lists(), params] as const,
  details: () => [...companyKeys.all, 'detail'] as const,
  detail: (id: number) => [...companyKeys.details(), id] as const,
};

// ─────────────────────────────────────────────
// Payload Type
// ─────────────────────────────────────────────

export interface CompanyCreatePayload {
  name: string;
  industry?: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  employee_count?: number;
  annual_revenue?: number;
  description?: string;
}

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

/**
 * Fetch paginated companies with optional filters.
 */
export function useCompanies(params: ApiQueryParams = {}) {
  return useQuery<PaginatedResponse<Company>>({
    queryKey: companyKeys.list(params),
    queryFn: async () => {
      const { data } = await companiesApi.getAll(params);
      return data;
    },
  });
}

/**
 * Fetch a single company by ID.
 */
export function useCompany(id: number | undefined) {
  return useQuery<Company>({
    queryKey: companyKeys.detail(id as number),
    queryFn: async () => {
      const { data } = await companiesApi.getById(id as number);
      return data;
    },
    enabled: id !== undefined && id > 0,
  });
}

// ─────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────

/**
 * Create a new company.
 */
export function useCreateCompany() {
  const queryClient = useQueryClient();
  return useMutation<Company, Error, CompanyCreatePayload>({
    mutationFn: async (payload) => {
      const { data } = await companiesApi.create(payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companyKeys.all });
    },
  });
}

/**
 * Update an existing company.
 */
export function useUpdateCompany() {
  const queryClient = useQueryClient();
  return useMutation<Company, Error, { id: number; payload: Partial<CompanyCreatePayload> }>({
    mutationFn: async ({ id, payload }) => {
      const { data } = await companiesApi.update(id, payload);
      return data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: companyKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: companyKeys.lists() });
    },
  });
}

/**
 * Delete a company.
 */
export function useDeleteCompany() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await companiesApi.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companyKeys.all });
    },
  });
}
