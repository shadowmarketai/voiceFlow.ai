/**
 * React Query hooks for Dialer operations
 *
 * Endpoints:
 *   GET    /api/v1/dialer/campaigns           — list campaigns
 *   POST   /api/v1/dialer/campaigns           — create campaign
 *   PUT    /api/v1/dialer/campaigns/:id       — update campaign
 *   DELETE /api/v1/dialer/campaigns/:id       — delete campaign
 *   GET    /api/v1/dialer/campaigns/:id/stats — campaign stats
 *   POST   /api/v1/dialer/campaigns/:id/contacts — add contacts
 *   POST   /api/v1/dialer/campaigns/:id/calls/:cid/initiate — initiate call
 *   POST   /api/v1/dialer/calls/:id/complete  — complete call
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dialerApi } from '@/lib/api';
import type { ApiQueryParams } from '@/types';

// ── Query Key Factories ──

export const dialerKeys = {
  all: ['dialer'] as const,
  campaigns: () => [...dialerKeys.all, 'campaigns'] as const,
  campaignList: (params: ApiQueryParams) => [...dialerKeys.campaigns(), 'list', params] as const,
  campaignDetail: (id: number) => [...dialerKeys.campaigns(), 'detail', id] as const,
  campaignStats: (id: number) => [...dialerKeys.campaigns(), 'stats', id] as const,
  contacts: (campaignId: number) => [...dialerKeys.all, 'contacts', campaignId] as const,
  calls: (campaignId: number) => [...dialerKeys.all, 'calls', campaignId] as const,
  dnc: () => [...dialerKeys.all, 'dnc'] as const,
};

// ── Payload Types ──

export interface DialerCampaignCreatePayload {
  name: string;
  description?: string;
  mode?: string;
  caller_id?: string;
  start_time?: string;
  end_time?: string;
  max_attempts_per_contact?: number;
  max_concurrent_calls?: number;
  script_template?: string;
}

export interface DialerContactPayload {
  phone: string;
  name?: string;
  email?: string;
  priority?: number;
  lead_id?: number;
}

export interface DialerCallCompletePayload {
  disposition: string;
  notes?: string;
  duration_seconds?: number;
  recording_url?: string;
}

// ── Campaign Queries ──

export function useDialerCampaigns(params: ApiQueryParams = {}) {
  return useQuery({
    queryKey: dialerKeys.campaignList(params),
    queryFn: async () => {
      const { data } = await dialerApi.getCampaigns(params);
      return data;
    },
  });
}

export function useDialerCampaign(id: number | undefined) {
  return useQuery({
    queryKey: dialerKeys.campaignDetail(id as number),
    queryFn: async () => {
      const { data } = await dialerApi.getCampaign(id as number);
      return data;
    },
    enabled: id !== undefined && id > 0,
  });
}

export function useDialerCampaignStats(id: number | undefined) {
  return useQuery({
    queryKey: dialerKeys.campaignStats(id as number),
    queryFn: async () => {
      const { data } = await dialerApi.getCampaignStats(id as number);
      return data;
    },
    enabled: id !== undefined && id > 0,
  });
}

export function useDialerContacts(campaignId: number, params: ApiQueryParams = {}) {
  return useQuery({
    queryKey: dialerKeys.contacts(campaignId),
    queryFn: async () => {
      const { data } = await dialerApi.getContacts(campaignId, params);
      return data;
    },
    enabled: campaignId > 0,
  });
}

export function useDialerCalls(campaignId: number, params: ApiQueryParams = {}) {
  return useQuery({
    queryKey: dialerKeys.calls(campaignId),
    queryFn: async () => {
      const { data } = await dialerApi.getCalls(campaignId, params);
      return data;
    },
    enabled: campaignId > 0,
  });
}

export function useDNCList(params: ApiQueryParams = {}) {
  return useQuery({
    queryKey: dialerKeys.dnc(),
    queryFn: async () => {
      const { data } = await dialerApi.getDNC(params);
      return data;
    },
  });
}

// ── Campaign Mutations ──

export function useCreateDialerCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: DialerCampaignCreatePayload) => {
      const { data } = await dialerApi.createCampaign(payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dialerKeys.campaigns() }),
  });
}

export function useUpdateDialerCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Partial<DialerCampaignCreatePayload> }) => {
      const { data } = await dialerApi.updateCampaign(id, payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dialerKeys.campaigns() }),
  });
}

export function useDeleteDialerCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await dialerApi.deleteCampaign(id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dialerKeys.campaigns() }),
  });
}

// ── Contact & Call Mutations ──

export function useAddDialerContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, contacts }: { campaignId: number; contacts: DialerContactPayload[] }) => {
      const { data } = await dialerApi.addContacts(campaignId, contacts);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dialerKeys.all }),
  });
}

export function useInitiateDialerCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, contactId }: { campaignId: number; contactId: number }) => {
      const { data } = await dialerApi.initiateCall(campaignId, contactId);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dialerKeys.all }),
  });
}

export function useCompleteDialerCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ callId, payload }: { callId: number; payload: DialerCallCompletePayload }) => {
      const { data } = await dialerApi.completeCall(callId, payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dialerKeys.all }),
  });
}

export function useAddDNC() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ phone, reason }: { phone: string; reason?: string }) => {
      const { data } = await dialerApi.addDNC(phone, reason);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dialerKeys.dnc() }),
  });
}

export function useRemoveDNC() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (phone: string) => {
      await dialerApi.removeDNC(phone);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dialerKeys.dnc() }),
  });
}
