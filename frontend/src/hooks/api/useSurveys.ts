/**
 * React Query hooks for Survey operations
 *
 * Endpoints:
 *   GET    /api/v1/surveys            — list all surveys
 *   GET    /api/v1/surveys/:id        — single survey
 *   POST   /api/v1/surveys            — create
 *   PUT    /api/v1/surveys/:id        — update
 *   DELETE /api/v1/surveys/:id        — delete
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { surveysApi } from '@/lib/api';
import type { Survey, SurveyQuestion, SurveyResponse } from '@/types';
import apiClient from '@/lib/api';

// ─────────────────────────────────────────────
// Query Key Factory
// ─────────────────────────────────────────────

export const surveyKeys = {
  all: ['surveys'] as const,
  list: () => [...surveyKeys.all, 'list'] as const,
  details: () => [...surveyKeys.all, 'detail'] as const,
  detail: (id: number) => [...surveyKeys.details(), id] as const,
  responses: (id: number) => [...surveyKeys.all, 'responses', id] as const,
};

// ─────────────────────────────────────────────
// Payload Types
// ─────────────────────────────────────────────

export interface SurveyCreatePayload {
  title: string;
  description?: string;
  questions: SurveyQuestion[];
  is_active?: boolean;
}

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

/**
 * Fetch all surveys.
 */
export function useSurveys() {
  return useQuery<Survey[]>({
    queryKey: surveyKeys.list(),
    queryFn: async () => {
      const { data } = await surveysApi.getAll();
      return data;
    },
  });
}

/**
 * Fetch a single survey by ID.
 */
export function useSurvey(id: number | undefined) {
  return useQuery<Survey>({
    queryKey: surveyKeys.detail(id as number),
    queryFn: async () => {
      const { data } = await surveysApi.getById(id as number);
      return data;
    },
    enabled: id !== undefined && id > 0,
  });
}

/**
 * Fetch responses for a given survey.
 */
export function useSurveyResponses(surveyId: number | undefined) {
  return useQuery<SurveyResponse[]>({
    queryKey: surveyKeys.responses(surveyId as number),
    queryFn: async () => {
      const { data } = await apiClient.get<SurveyResponse[]>(
        `/api/v1/surveys/${surveyId}/responses`,
      );
      return data;
    },
    enabled: surveyId !== undefined && surveyId > 0,
  });
}

// ─────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────

/**
 * Create a new survey.
 */
export function useCreateSurvey() {
  const queryClient = useQueryClient();
  return useMutation<Survey, Error, SurveyCreatePayload>({
    mutationFn: async (payload) => {
      const { data } = await surveysApi.create(payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: surveyKeys.all });
    },
  });
}

/**
 * Update an existing survey.
 */
export function useUpdateSurvey() {
  const queryClient = useQueryClient();
  return useMutation<Survey, Error, { id: number; payload: Partial<SurveyCreatePayload> }>({
    mutationFn: async ({ id, payload }) => {
      const { data } = await surveysApi.update(id, payload);
      return data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: surveyKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: surveyKeys.list() });
    },
  });
}

/**
 * Delete a survey.
 */
export function useDeleteSurvey() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await surveysApi.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: surveyKeys.all });
    },
  });
}
