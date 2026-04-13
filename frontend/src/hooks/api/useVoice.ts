/**
 * React Query hooks for Voice AI operations
 *
 * Endpoints:
 *   POST   /api/v1/voice/process           — process audio (URL or file)
 *   GET    /api/v1/calls                    — paginated call list
 *   GET    /api/v1/calls/:id               — single call detail
 *   GET    /api/v1/calls/:id/transcript     — call transcript
 *   GET    /api/v1/calls/:id/recording      — call recording URL
 *   GET    /api/v1/calls/live               — live calls
 *   GET    /api/v1/calls/analytics          — call analytics
 *   GET    /api/v1/assistants               — list AI assistants
 *   GET    /api/v1/assistants/:id           — single assistant
 *   POST   /api/v1/assistants               — create assistant
 *   PUT    /api/v1/assistants/:id           — update assistant
 *   DELETE /api/v1/assistants/:id           — delete assistant
 *   POST   /api/v1/assistants/:id/start     — start assistant
 *   POST   /api/v1/assistants/:id/stop      — stop assistant
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { voiceApi, assistantsApi } from '@/lib/api';
import type {
  VoiceAnalysis,
  VoiceProcessRequest,
  Assistant,
  PaginatedResponse,
  ApiQueryParams,
  DashboardStats,
} from '@/types';

// ─────────────────────────────────────────────
// Query Key Factories
// ─────────────────────────────────────────────

export const voiceKeys = {
  all: ['voice'] as const,
  calls: () => [...voiceKeys.all, 'calls'] as const,
  callList: (params: ApiQueryParams) => [...voiceKeys.calls(), 'list', params] as const,
  callDetail: (id: number) => [...voiceKeys.calls(), 'detail', id] as const,
  transcript: (id: number) => [...voiceKeys.calls(), 'transcript', id] as const,
  recording: (id: number) => [...voiceKeys.calls(), 'recording', id] as const,
  live: () => [...voiceKeys.all, 'live'] as const,
  analytics: (params: ApiQueryParams) => [...voiceKeys.all, 'analytics', params] as const,
};

export const assistantKeys = {
  all: ['assistants'] as const,
  list: () => [...assistantKeys.all, 'list'] as const,
  detail: (id: number) => [...assistantKeys.all, 'detail', id] as const,
};

// ─────────────────────────────────────────────
// Payload Types
// ─────────────────────────────────────────────

export interface AssistantCreatePayload {
  name: string;
  description?: string;
  voice_id?: string;
  language?: string;
  system_prompt?: string;
  is_active?: boolean;
}

// ─────────────────────────────────────────────
// Voice Call Queries
// ─────────────────────────────────────────────

/**
 * Fetch paginated voice call analyses.
 */
export function useVoiceAnalyses(params: ApiQueryParams = {}) {
  return useQuery<PaginatedResponse<VoiceAnalysis>>({
    queryKey: voiceKeys.callList(params),
    queryFn: async () => {
      const { data } = await voiceApi.getCalls(params);
      return data;
    },
  });
}

/**
 * Fetch a single voice analysis by ID.
 */
export function useVoiceAnalysis(id: number | undefined) {
  return useQuery<VoiceAnalysis>({
    queryKey: voiceKeys.callDetail(id as number),
    queryFn: async () => {
      const { data } = await voiceApi.getCallById(id as number);
      return data;
    },
    enabled: id !== undefined && id > 0,
  });
}

/**
 * Fetch the transcript for a specific call.
 */
export function useVoiceTranscript(id: number | undefined) {
  return useQuery<{ transcript: string }>({
    queryKey: voiceKeys.transcript(id as number),
    queryFn: async () => {
      const { data } = await voiceApi.getTranscript(id as number);
      return data;
    },
    enabled: id !== undefined && id > 0,
  });
}

/**
 * Fetch the recording URL for a specific call.
 */
export function useVoiceRecording(id: number | undefined) {
  return useQuery<{ url: string }>({
    queryKey: voiceKeys.recording(id as number),
    queryFn: async () => {
      const { data } = await voiceApi.getRecording(id as number);
      return data;
    },
    enabled: id !== undefined && id > 0,
  });
}

/**
 * Fetch live (in-progress) calls. Polls automatically.
 */
export function useLiveCalls(enabled = true) {
  return useQuery<VoiceAnalysis[]>({
    queryKey: voiceKeys.live(),
    queryFn: async () => {
      const { data } = await voiceApi.getLiveCalls();
      return data;
    },
    enabled,
    refetchInterval: 5000, // Poll every 5 seconds
  });
}

/**
 * Fetch voice call analytics / stats.
 */
export function useVoiceStats(params: ApiQueryParams = {}) {
  return useQuery<DashboardStats>({
    queryKey: voiceKeys.analytics(params),
    queryFn: async () => {
      const { data } = await voiceApi.getAnalytics(params);
      return data;
    },
  });
}

// ─────────────────────────────────────────────
// Voice Processing Mutations
// ─────────────────────────────────────────────

/**
 * Process voice audio from a URL.
 */
export function useProcessVoice() {
  const queryClient = useQueryClient();
  return useMutation<VoiceAnalysis, Error, VoiceProcessRequest>({
    mutationFn: async (payload) => {
      const { data } = await voiceApi.process(payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: voiceKeys.calls() });
    },
  });
}

/**
 * Process voice audio from a file upload.
 */
export function useProcessVoiceFile() {
  const queryClient = useQueryClient();
  return useMutation<VoiceAnalysis, Error, { file: File; language?: string }>({
    mutationFn: async ({ file, language }) => {
      const { data } = await voiceApi.processFile(file, language);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: voiceKeys.calls() });
    },
  });
}

// ─────────────────────────────────────────────
// Assistant Queries
// ─────────────────────────────────────────────

/**
 * Fetch all AI assistants.
 */
export function useAssistants() {
  return useQuery<Assistant[]>({
    queryKey: assistantKeys.list(),
    queryFn: async () => {
      const { data } = await assistantsApi.getAll();
      return data;
    },
  });
}

/**
 * Fetch a single assistant by ID.
 */
export function useAssistant(id: number | undefined) {
  return useQuery<Assistant>({
    queryKey: assistantKeys.detail(id as number),
    queryFn: async () => {
      const { data } = await assistantsApi.getById(id as number);
      return data;
    },
    enabled: id !== undefined && id > 0,
  });
}

// ─────────────────────────────────────────────
// Assistant Mutations
// ─────────────────────────────────────────────

/**
 * Create a new AI assistant.
 */
export function useCreateAssistant() {
  const queryClient = useQueryClient();
  return useMutation<Assistant, Error, AssistantCreatePayload>({
    mutationFn: async (payload) => {
      const { data } = await assistantsApi.create(payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assistantKeys.all });
    },
  });
}

/**
 * Update an existing assistant.
 */
export function useUpdateAssistant() {
  const queryClient = useQueryClient();
  return useMutation<Assistant, Error, { id: number; payload: Partial<AssistantCreatePayload> }>({
    mutationFn: async ({ id, payload }) => {
      const { data } = await assistantsApi.update(id, payload);
      return data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: assistantKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: assistantKeys.list() });
    },
  });
}

/**
 * Delete an assistant.
 */
export function useDeleteAssistant() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await assistantsApi.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assistantKeys.all });
    },
  });
}

/**
 * Start an assistant (activate it for calls).
 */
export function useStartAssistant() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await assistantsApi.start(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assistantKeys.all });
    },
  });
}

/**
 * Stop a running assistant.
 */
export function useStopAssistant() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await assistantsApi.stop(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assistantKeys.all });
    },
  });
}
