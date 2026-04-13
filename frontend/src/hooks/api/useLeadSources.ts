/**
 * React Query hooks for Lead Source integrations
 * (IndiaMart, JustDial, Facebook Lead Ads)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leadSourcesApi } from '../../lib/api';
import type {
  LeadSourceConfigCreate,
  LeadSourceConfigResponse,
  LeadIngestionResult,
  LeadSourceStats,
} from '../../types';

export const leadSourceKeys = {
  all: ['lead-sources'] as const,
  configs: () => [...leadSourceKeys.all, 'configs'] as const,
  stats: () => [...leadSourceKeys.all, 'stats'] as const,
};

export function useLeadSourceConfigs() {
  return useQuery<LeadSourceConfigResponse[]>({
    queryKey: leadSourceKeys.configs(),
    queryFn: () => leadSourcesApi.getConfigs().then((r) => r.data),
  });
}

export function useLeadSourceStats() {
  return useQuery<LeadSourceStats[]>({
    queryKey: leadSourceKeys.stats(),
    queryFn: () => leadSourcesApi.getStats().then((r) => r.data),
  });
}

export function useCreateLeadSourceConfig() {
  const qc = useQueryClient();
  return useMutation<LeadSourceConfigResponse, Error, LeadSourceConfigCreate>({
    mutationFn: (data) => leadSourcesApi.createConfig(data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: leadSourceKeys.configs() });
    },
  });
}

export function useUpdateLeadSourceConfig() {
  const qc = useQueryClient();
  return useMutation<
    LeadSourceConfigResponse,
    Error,
    { id: number; data: Partial<LeadSourceConfigCreate> }
  >({
    mutationFn: ({ id, data }) =>
      leadSourcesApi.updateConfig(id, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: leadSourceKeys.configs() });
    },
  });
}

export function useDeleteLeadSourceConfig() {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (id) => leadSourcesApi.deleteConfig(id).then(() => undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: leadSourceKeys.configs() });
    },
  });
}

export function usePollIndiamart() {
  const qc = useQueryClient();
  return useMutation<LeadIngestionResult, Error>({
    mutationFn: () => leadSourcesApi.pollIndiamart().then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: leadSourceKeys.stats() });
      qc.invalidateQueries({ queryKey: leadSourceKeys.configs() });
    },
  });
}
