/**
 * React Query hooks for Billing operations (Razorpay)
 *
 * Endpoints:
 *   GET  /api/v1/billing/plans          — list available plans
 *   POST /api/v1/billing/subscribe      — subscribe to a plan
 *   GET  /api/v1/billing/usage          — current usage stats
 *   POST /api/v1/billing/credits/add    — add credits
 *   POST /api/v1/billing/verify-payment — verify Razorpay payment
 *   GET  /api/v1/billing/invoices       — list invoices
 *
 * Note: All amounts are in paisa (Razorpay standard). 49999 = Rs 499.99
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api';

// ─────────────────────────────────────────────
// Types (billing-specific, not in global types)
// ─────────────────────────────────────────────

export interface BillingPlan {
  id: string;
  name: string;
  description: string;
  price: number; // in paisa
  currency: string;
  interval: 'monthly' | 'yearly';
  features: string[];
  is_popular?: boolean;
  max_calls?: number;
  max_leads?: number;
  max_campaigns?: number;
}

export interface Subscription {
  id: string;
  plan_id: string;
  plan_name: string;
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
}

export interface UsageStats {
  calls_used: number;
  calls_limit: number;
  leads_used: number;
  leads_limit: number;
  campaigns_used: number;
  campaigns_limit: number;
  storage_used_mb: number;
  storage_limit_mb: number;
  credits_remaining: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  amount: number; // in paisa
  currency: string;
  status: 'paid' | 'pending' | 'failed' | 'refunded';
  description: string;
  created_at: string;
  paid_at?: string;
  pdf_url?: string;
}

export interface SubscribePayload {
  plan_id: string;
  payment_method?: string;
}

export interface SubscribeResponse {
  subscription_id: string;
  razorpay_order_id: string;
  amount: number;
  currency: string;
  key_id: string;
}

export interface AddCreditsPayload {
  amount: number; // in paisa
  credits: number;
}

export interface VerifyPaymentPayload {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface VerifyPaymentResponse {
  success: boolean;
  subscription_id?: string;
  message: string;
}

// ─────────────────────────────────────────────
// Query Key Factory
// ─────────────────────────────────────────────

export const billingKeys = {
  all: ['billing'] as const,
  plans: () => [...billingKeys.all, 'plans'] as const,
  usage: () => [...billingKeys.all, 'usage'] as const,
  invoices: () => [...billingKeys.all, 'invoices'] as const,
};

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

/**
 * Fetch available billing plans.
 */
export function usePlans() {
  return useQuery<BillingPlan[]>({
    queryKey: billingKeys.plans(),
    queryFn: async () => {
      const { data } = await apiClient.get<BillingPlan[]>('/api/v1/billing/plans');
      return data;
    },
  });
}

/**
 * Fetch current usage stats for the tenant.
 */
export function useUsage() {
  return useQuery<UsageStats>({
    queryKey: billingKeys.usage(),
    queryFn: async () => {
      const { data } = await apiClient.get<UsageStats>('/api/v1/billing/usage');
      return data;
    },
  });
}

/**
 * Fetch billing invoices.
 */
export function useInvoices() {
  return useQuery<Invoice[]>({
    queryKey: billingKeys.invoices(),
    queryFn: async () => {
      const { data } = await apiClient.get<Invoice[]>('/api/v1/billing/invoices');
      return data;
    },
  });
}

// ─────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────

/**
 * Subscribe to a billing plan (initiates Razorpay order).
 */
export function useSubscribe() {
  const queryClient = useQueryClient();
  return useMutation<SubscribeResponse, Error, SubscribePayload>({
    mutationFn: async (payload) => {
      const { data } = await apiClient.post<SubscribeResponse>(
        '/api/v1/billing/subscribe',
        payload,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.all });
    },
  });
}

/**
 * Add credits to the account.
 */
export function useAddCredits() {
  const queryClient = useQueryClient();
  return useMutation<SubscribeResponse, Error, AddCreditsPayload>({
    mutationFn: async (payload) => {
      const { data } = await apiClient.post<SubscribeResponse>(
        '/api/v1/billing/credits/add',
        payload,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.usage() });
    },
  });
}

/**
 * Verify a Razorpay payment after client-side completion.
 */
export function useVerifyPayment() {
  const queryClient = useQueryClient();
  return useMutation<VerifyPaymentResponse, Error, VerifyPaymentPayload>({
    mutationFn: async (payload) => {
      const { data } = await apiClient.post<VerifyPaymentResponse>(
        '/api/v1/billing/verify-payment',
        payload,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.all });
    },
  });
}
