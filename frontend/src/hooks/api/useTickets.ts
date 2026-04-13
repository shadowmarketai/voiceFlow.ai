/**
 * React Query hooks for Help Desk Ticket operations
 *
 * Endpoints:
 *   GET    /api/v1/tickets                   — paginated list
 *   GET    /api/v1/tickets/:id               — single ticket
 *   POST   /api/v1/tickets                   — create
 *   PUT    /api/v1/tickets/:id               — update
 *   PATCH  /api/v1/tickets/:id/status        — update status
 *   POST   /api/v1/tickets/:id/assign        — assign to agent
 *   POST   /api/v1/tickets/:id/comments      — add comment/reply
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ticketsApi } from '@/lib/api';
import type { Ticket, PaginatedResponse, ApiQueryParams } from '@/types';
import type { TicketStatus, TicketPriority } from '@/types/enums';

// ─────────────────────────────────────────────
// Query Key Factory
// ─────────────────────────────────────────────

export const ticketKeys = {
  all: ['tickets'] as const,
  lists: () => [...ticketKeys.all, 'list'] as const,
  list: (params: UseTicketsParams) => [...ticketKeys.lists(), params] as const,
  details: () => [...ticketKeys.all, 'detail'] as const,
  detail: (id: number) => [...ticketKeys.details(), id] as const,
};

// ─────────────────────────────────────────────
// Param / Payload Types
// ─────────────────────────────────────────────

export interface UseTicketsParams extends ApiQueryParams {
  status?: TicketStatus;
  priority?: TicketPriority;
  assigned_to?: number;
}

export interface TicketCreatePayload {
  title: string;
  description: string;
  priority?: TicketPriority;
  category?: string;
  contact_id?: number;
  lead_id?: number;
  tags?: string[];
}

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

/**
 * Fetch paginated tickets with optional filters.
 */
export function useTickets(params: UseTicketsParams = {}) {
  return useQuery<PaginatedResponse<Ticket>>({
    queryKey: ticketKeys.list(params),
    queryFn: async () => {
      const { data } = await ticketsApi.getAll(params);
      return data;
    },
  });
}

/**
 * Fetch a single ticket by ID.
 */
export function useTicket(id: number | undefined) {
  return useQuery<Ticket>({
    queryKey: ticketKeys.detail(id as number),
    queryFn: async () => {
      const { data } = await ticketsApi.getById(id as number);
      return data;
    },
    enabled: id !== undefined && id > 0,
  });
}

// ─────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────

/**
 * Create a new ticket.
 */
export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation<Ticket, Error, TicketCreatePayload>({
    mutationFn: async (payload) => {
      const { data } = await ticketsApi.create(payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.all });
    },
  });
}

/**
 * Update an existing ticket.
 */
export function useUpdateTicket() {
  const queryClient = useQueryClient();
  return useMutation<Ticket, Error, { id: number; payload: Partial<TicketCreatePayload> }>({
    mutationFn: async ({ id, payload }) => {
      const { data } = await ticketsApi.update(id, payload);
      return data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
    },
  });
}

/**
 * Update only the status of a ticket.
 */
export function useUpdateTicketStatus() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: number; status: TicketStatus }>({
    mutationFn: async ({ id, status }) => {
      await ticketsApi.updateStatus(id, status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.all });
    },
  });
}

/**
 * Assign a ticket to a support agent.
 */
export function useAssignTicket() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: number; agentId: number }>({
    mutationFn: async ({ id, agentId }) => {
      await ticketsApi.assign(id, agentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.all });
    },
  });
}

/**
 * Add a comment / reply to a ticket.
 */
export function useReplyToTicket() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: number; comment: string }>({
    mutationFn: async ({ id, comment }) => {
      await ticketsApi.addComment(id, comment);
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(id) });
    },
  });
}
