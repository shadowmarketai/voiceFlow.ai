/**
 * React Query hooks for PEB Quotation API
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { quotationAPI } from '../../services/api';
import type { Quotation, QuotationLog, BOQResult, PEBInput } from '../../types';

export const quotationKeys = {
  all: ['quotations'] as const,
  lists: () => [...quotationKeys.all, 'list'] as const,
  list: (params: Record<string, unknown>) => [...quotationKeys.lists(), params] as const,
  details: () => [...quotationKeys.all, 'detail'] as const,
  detail: (id: number) => [...quotationKeys.details(), id] as const,
  stats: () => [...quotationKeys.all, 'stats'] as const,
  logs: (id: number) => [...quotationKeys.all, 'logs', id] as const,
  byLead: (leadId: number) => [...quotationKeys.all, 'by-lead', leadId] as const,
};

// ── Queries ──

export function useQuotations(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: quotationKeys.list(params),
    queryFn: () => quotationAPI.getAll(params).then(r => r.data),
  });
}

export function useQuotation(id: number) {
  return useQuery({
    queryKey: quotationKeys.detail(id),
    queryFn: () => quotationAPI.get(id).then(r => r.data as Quotation),
    enabled: !!id,
  });
}

export function useQuotationStats() {
  return useQuery({
    queryKey: quotationKeys.stats(),
    queryFn: () => quotationAPI.getStats().then(r => r.data),
  });
}

export function useQuotationLogs(id: number) {
  return useQuery({
    queryKey: quotationKeys.logs(id),
    queryFn: () => quotationAPI.getLogs(id).then(r => r.data?.items as QuotationLog[]),
    enabled: !!id,
  });
}

export function useQuotationsByLead(leadId: number) {
  return useQuery({
    queryKey: quotationKeys.byLead(leadId),
    queryFn: () => quotationAPI.getByLead(leadId).then(r => r.data),
    enabled: !!leadId,
  });
}

// ── Mutations ──

export function useCalculateBOQ() {
  return useMutation({
    mutationFn: (params: PEBInput) => quotationAPI.calculate(params).then(r => r.data as BOQResult),
  });
}

export function useCreateQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      lead_id: number;
      project_name: string;
      client_name?: string;
      client_location?: string;
      building_params: PEBInput;
    }) => quotationAPI.create(data).then(r => r.data as Quotation),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: quotationKeys.all });
    },
  });
}

export function useUpdateQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      quotationAPI.update(id, data).then(r => r.data as Quotation),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: quotationKeys.detail(id) });
      qc.invalidateQueries({ queryKey: quotationKeys.lists() });
    },
  });
}

export function useDeleteQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => quotationAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: quotationKeys.all });
    },
  });
}

export function useGeneratePdf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => quotationAPI.generatePdf(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: quotationKeys.detail(id) });
    },
  });
}

export function useReviseQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => quotationAPI.revise(id).then(r => r.data as Quotation),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: quotationKeys.all });
    },
  });
}

export function useChangeQuotationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      quotationAPI.changeStatus(id, status).then(r => r.data as Quotation),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: quotationKeys.detail(id) });
      qc.invalidateQueries({ queryKey: quotationKeys.lists() });
      qc.invalidateQueries({ queryKey: quotationKeys.stats() });
    },
  });
}
