/**
 * React Query hooks for the main Dashboard
 *
 * Endpoints:
 *   GET /api/v1/analytics/dashboard   — overall dashboard stats
 *   GET /api/v1/crm-stats             — CRM-specific dashboard data
 */

import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@/lib/api';
import apiClient from '@/lib/api';
import type { DashboardStats, ApiQueryParams } from '@/types';

// ─────────────────────────────────────────────
// Query Key Factory
// ─────────────────────────────────────────────

export const dashboardKeys = {
  all: ['dashboard'] as const,
  stats: (params: ApiQueryParams) => [...dashboardKeys.all, 'stats', params] as const,
  crmStats: () => [...dashboardKeys.all, 'crm-stats'] as const,
};

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface CRMDashboardStats {
  total_leads: number;
  leads_by_status: Record<string, number>;
  total_deals: number;
  deals_value: number;
  total_companies: number;
  total_contacts: number;
  recent_activities: Array<{
    id: number;
    type: string;
    title: string;
    created_at: string;
  }>;
  conversion_rate: number;
}

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

/**
 * Fetch the main dashboard stats (calls, revenue, campaigns, etc.).
 */
export function useDashboardStats(params: ApiQueryParams = {}) {
  return useQuery<DashboardStats>({
    queryKey: dashboardKeys.stats(params),
    queryFn: async () => {
      const { data } = await analyticsApi.getDashboard(params);
      return data;
    },
  });
}

/**
 * Fetch CRM-specific dashboard stats (leads by status, deals value, etc.).
 */
export function useCRMDashboardStats() {
  return useQuery<CRMDashboardStats>({
    queryKey: dashboardKeys.crmStats(),
    queryFn: async () => {
      const { data } = await apiClient.get<CRMDashboardStats>('/api/v1/crm-stats');
      return data;
    },
  });
}
