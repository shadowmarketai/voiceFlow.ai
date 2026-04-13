/**
 * React Query hooks for Analytics / Reporting
 *
 * Endpoints:
 *   GET /api/v1/analytics/dashboard       — overall dashboard stats
 *   GET /api/v1/analytics/calls/volume    — call volume over time
 *   GET /api/v1/analytics/emotions        — emotion distribution
 *   GET /api/v1/analytics/conversions     — conversion funnel data
 *   GET /api/v1/analytics/export          — export report as blob
 */

import { useQuery, useMutation } from '@tanstack/react-query';
import { analyticsApi } from '@/lib/api';
import type { DashboardStats, ApiQueryParams } from '@/types';

// ─────────────────────────────────────────────
// Query Key Factory
// ─────────────────────────────────────────────

export const analyticsKeys = {
  all: ['analytics'] as const,
  dashboard: (params: ApiQueryParams) => [...analyticsKeys.all, 'dashboard', params] as const,
  callVolume: (params: ApiQueryParams) => [...analyticsKeys.all, 'callVolume', params] as const,
  emotions: (params: ApiQueryParams) => [...analyticsKeys.all, 'emotions', params] as const,
  conversions: (params: ApiQueryParams) => [...analyticsKeys.all, 'conversions', params] as const,
};

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

/**
 * Fetch the main analytics dashboard summary.
 */
export function useAnalyticsSummary(params: ApiQueryParams = {}) {
  return useQuery<DashboardStats>({
    queryKey: analyticsKeys.dashboard(params),
    queryFn: async () => {
      const { data } = await analyticsApi.getDashboard(params);
      return data;
    },
  });
}

/**
 * Fetch call volume data over time (for line/bar charts).
 */
export function useCallVolumeStats(params: ApiQueryParams = {}) {
  return useQuery<Record<string, number>[]>({
    queryKey: analyticsKeys.callVolume(params),
    queryFn: async () => {
      const { data } = await analyticsApi.getCallVolume(params);
      return data;
    },
  });
}

/**
 * Fetch emotion distribution stats (for pie/donut charts).
 */
export function useEmotionStats(params: ApiQueryParams = {}) {
  return useQuery<Record<string, number>>({
    queryKey: analyticsKeys.emotions(params),
    queryFn: async () => {
      const { data } = await analyticsApi.getEmotions(params);
      return data;
    },
  });
}

/**
 * Fetch conversion funnel/pipeline data.
 */
export function useConversionStats(params: ApiQueryParams = {}) {
  return useQuery<Record<string, number>[]>({
    queryKey: analyticsKeys.conversions(params),
    queryFn: async () => {
      const { data } = await analyticsApi.getConversions(params);
      return data;
    },
  });
}

/**
 * Fetch intent distribution stats.
 * Uses the emotions endpoint with an intent filter as backend serves combined data.
 */
export function useIntentStats(params: ApiQueryParams = {}) {
  const intentParams = { ...params, group_by: 'intent' };
  return useQuery<Record<string, number>>({
    queryKey: [...analyticsKeys.all, 'intents', intentParams] as const,
    queryFn: async () => {
      const { data } = await analyticsApi.getEmotions(intentParams);
      return data;
    },
  });
}

// ─────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────

/**
 * Export an analytics report as a downloadable blob.
 */
export function useExportReport() {
  return useMutation<Blob, Error, ApiQueryParams | undefined>({
    mutationFn: async (params) => {
      const { data } = await analyticsApi.exportReport(params);
      return data;
    },
  });
}
