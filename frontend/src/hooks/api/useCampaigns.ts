/**
 * React Query hooks for Campaign CRUD + lifecycle operations
 *
 * Endpoints:
 *   GET    /api/v1/campaigns              — paginated list
 *   GET    /api/v1/campaigns/:id          — single campaign
 *   POST   /api/v1/campaigns              — create
 *   PUT    /api/v1/campaigns/:id          — update
 *   DELETE /api/v1/campaigns/:id          — delete
 *   POST   /api/v1/campaigns/:id/start    — start
 *   POST   /api/v1/campaigns/:id/pause    — pause
 *   POST   /api/v1/campaigns/:id/resume   — resume
 *   POST   /api/v1/campaigns/:id/stop     — stop
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { campaignsApi } from '@/lib/api';
import type { Campaign, PaginatedResponse, ApiQueryParams } from '@/types';
import type { CampaignStatus, CampaignType } from '@/types/enums';

// ─────────────────────────────────────────────
// Query Key Factory
// ─────────────────────────────────────────────

export const campaignKeys = {
  all: ['campaigns'] as const,
  lists: () => [...campaignKeys.all, 'list'] as const,
  list: (params: UseCampaignsParams) => [...campaignKeys.lists(), params] as const,
  details: () => [...campaignKeys.all, 'detail'] as const,
  detail: (id: number) => [...campaignKeys.details(), id] as const,
};

// ─────────────────────────────────────────────
// Param / Payload Types
// ─────────────────────────────────────────────

export interface UseCampaignsParams extends ApiQueryParams {
  status?: CampaignStatus;
  type?: CampaignType;
}

export interface CampaignCreatePayload {
  name: string;
  description?: string;
  type: CampaignType | string;
  audience_criteria?: Record<string, string | number | boolean>;
  budget?: number;
  currency?: string;
  scheduled_at?: string;
}

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

/**
 * Fetch paginated campaigns with optional filters.
 */
export function useCampaigns(params: UseCampaignsParams = {}) {
  return useQuery<PaginatedResponse<Campaign>>({
    queryKey: campaignKeys.list(params),
    queryFn: async () => {
      const { data } = await campaignsApi.getAll(params);
      return data;
    },
  });
}

/**
 * Fetch a single campaign by ID.
 */
export function useCampaign(id: number | undefined) {
  return useQuery<Campaign>({
    queryKey: campaignKeys.detail(id as number),
    queryFn: async () => {
      const { data } = await campaignsApi.getById(id as number);
      return data;
    },
    enabled: id !== undefined && id > 0,
  });
}

// ─────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────

/**
 * Create a new campaign.
 */
export function useCreateCampaign() {
  const queryClient = useQueryClient();
  return useMutation<Campaign, Error, CampaignCreatePayload>({
    mutationFn: async (payload) => {
      const { data } = await campaignsApi.create(payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
    },
  });
}

/**
 * Update an existing campaign.
 */
export function useUpdateCampaign() {
  const queryClient = useQueryClient();
  return useMutation<Campaign, Error, { id: number; payload: Partial<CampaignCreatePayload> }>({
    mutationFn: async ({ id, payload }) => {
      const { data } = await campaignsApi.update(id, payload);
      return data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: campaignKeys.lists() });
    },
  });
}

/**
 * Delete a campaign.
 */
export function useDeleteCampaign() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await campaignsApi.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
    },
  });
}

/**
 * Start a campaign.
 */
export function useStartCampaign() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await campaignsApi.start(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
    },
  });
}

/**
 * Pause a running campaign.
 */
export function usePauseCampaign() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await campaignsApi.pause(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
    },
  });
}

/**
 * Resume a paused campaign.
 */
export function useResumeCampaign() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await campaignsApi.resume(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
    },
  });
}

/**
 * Stop a campaign.
 */
export function useStopCampaign() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await campaignsApi.stop(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
    },
  });
}
