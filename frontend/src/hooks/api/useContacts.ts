/**
 * React Query hooks for Contact CRUD operations
 *
 * Endpoints:
 *   GET    /api/v1/crm-contacts          — paginated list
 *   GET    /api/v1/crm-contacts/:id      — single contact
 *   POST   /api/v1/crm-contacts          — create
 *   PUT    /api/v1/crm-contacts/:id      — update
 *   DELETE /api/v1/crm-contacts/:id      — delete
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contactsApi } from '@/lib/api';
import type { Contact, PaginatedResponse, ApiQueryParams } from '@/types';

// ─────────────────────────────────────────────
// Query Key Factory
// ─────────────────────────────────────────────

export const contactKeys = {
  all: ['contacts'] as const,
  lists: () => [...contactKeys.all, 'list'] as const,
  list: (params: ApiQueryParams) => [...contactKeys.lists(), params] as const,
  details: () => [...contactKeys.all, 'detail'] as const,
  detail: (id: number) => [...contactKeys.details(), id] as const,
};

// ─────────────────────────────────────────────
// Payload Type
// ─────────────────────────────────────────────

export interface ContactCreatePayload {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  mobile?: string;
  company_id?: number;
  company_name?: string;
  designation?: string;
  department?: string;
  address?: string;
  notes?: string;
  tags?: string[];
}

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

/**
 * Fetch paginated contacts with optional filters.
 */
export function useContacts(params: ApiQueryParams = {}) {
  return useQuery<PaginatedResponse<Contact>>({
    queryKey: contactKeys.list(params),
    queryFn: async () => {
      const { data } = await contactsApi.getAll(params);
      return data;
    },
  });
}

/**
 * Fetch a single contact by ID.
 */
export function useContact(id: number | undefined) {
  return useQuery<Contact>({
    queryKey: contactKeys.detail(id as number),
    queryFn: async () => {
      const { data } = await contactsApi.getById(id as number);
      return data;
    },
    enabled: id !== undefined && id > 0,
  });
}

// ─────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────

/**
 * Create a new contact.
 */
export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation<Contact, Error, ContactCreatePayload>({
    mutationFn: async (payload) => {
      const { data } = await contactsApi.create(payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.all });
    },
  });
}

/**
 * Update an existing contact.
 */
export function useUpdateContact() {
  const queryClient = useQueryClient();
  return useMutation<Contact, Error, { id: number; payload: Partial<ContactCreatePayload> }>({
    mutationFn: async ({ id, payload }) => {
      const { data } = await contactsApi.update(id, payload);
      return data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: contactKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() });
    },
  });
}

/**
 * Delete a contact.
 */
export function useDeleteContact() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await contactsApi.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.all });
    },
  });
}
