/**
 * React Query hooks for Voice Agent API
 * Manages cloned voices, knowledge base, and agent recordings.
 *
 * KB-008: Zero 'any' types.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClonedVoice, KnowledgeDocument, AgentRecording, RecordingStats } from '../../types';

// Lazy import to avoid circular dependency — api.js is plain JS
const getApi = () => import('../../services/api').then(m => m.voiceAgentAPI);

// ── Query Keys ──────────────────────────────────────────────

export const voiceAgentKeys = {
  voices: ['voiceAgent', 'voices'] as const,
  voice: (id: number) => ['voiceAgent', 'voices', id] as const,
  knowledge: ['voiceAgent', 'knowledge'] as const,
  knowledgeFiltered: (params: Record<string, string | undefined>) =>
    ['voiceAgent', 'knowledge', params] as const,
  recordings: ['voiceAgent', 'recordings'] as const,
  recordingStats: ['voiceAgent', 'recordings', 'stats'] as const,
  recording: (id: number) => ['voiceAgent', 'recordings', id] as const,
};

// ── Voice Hooks ─────────────────────────────────────────────

export function useClonedVoices(tenantId = 'default', activeOnly = true) {
  return useQuery<ClonedVoice[]>({
    queryKey: [...voiceAgentKeys.voices, tenantId, activeOnly],
    queryFn: async () => {
      const api = await getApi();
      const { data } = await api.listVoices(tenantId, activeOnly);
      return data;
    },
  });
}

export function useClonedVoice(voiceId: number) {
  return useQuery<ClonedVoice>({
    queryKey: voiceAgentKeys.voice(voiceId),
    queryFn: async () => {
      const api = await getApi();
      const { data } = await api.getVoice(voiceId);
      return data;
    },
    enabled: voiceId > 0,
  });
}

export function useCloneVoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const api = await getApi();
      const { data } = await api.cloneVoice(formData);
      return data as ClonedVoice;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: voiceAgentKeys.voices }),
  });
}

export function useDeleteVoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (voiceId: number) => {
      const api = await getApi();
      await api.deleteVoice(voiceId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: voiceAgentKeys.voices }),
  });
}

export function useTestVoice() {
  return useMutation({
    mutationFn: async ({ voiceId, text }: { voiceId: number; text: string }) => {
      const api = await getApi();
      const { data } = await api.testVoice(voiceId, text);
      return data as { audio_base64: string; format: string };
    },
  });
}

// ── Knowledge Hooks ─────────────────────────────────────────

export function useKnowledgeDocs(
  tenantId = 'default',
  docType?: string,
  agentId?: string,
) {
  return useQuery<KnowledgeDocument[]>({
    queryKey: voiceAgentKeys.knowledgeFiltered({ tenantId, docType, agentId }),
    queryFn: async () => {
      const api = await getApi();
      const { data } = await api.listKnowledge(tenantId, docType, agentId);
      return data;
    },
  });
}

export function useAddKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      title: string;
      content: string;
      doc_type?: string;
      tenant_id?: string;
      question?: string;
      answer?: string;
    }) => {
      const api = await getApi();
      const { data } = await api.addKnowledge(payload);
      return data as KnowledgeDocument[];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: voiceAgentKeys.knowledge }),
  });
}

export function useBulkAddKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      tenant_id?: string;
      items: Record<string, string>[];
    }) => {
      const api = await getApi();
      const { data } = await api.bulkAddKnowledge(payload);
      return data as { created: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: voiceAgentKeys.knowledge }),
  });
}

export function useUpdateKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      docId,
      updates,
    }: {
      docId: number;
      updates: Record<string, string | boolean | undefined>;
    }) => {
      const api = await getApi();
      const { data } = await api.updateKnowledge(docId, updates);
      return data as KnowledgeDocument;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: voiceAgentKeys.knowledge }),
  });
}

export function useDeleteKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (docId: number) => {
      const api = await getApi();
      await api.deleteKnowledge(docId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: voiceAgentKeys.knowledge }),
  });
}

// ── Recording Hooks ─────────────────────────────────────────

export function useAgentRecordings(tenantId?: string, limit = 50) {
  return useQuery<AgentRecording[]>({
    queryKey: [...voiceAgentKeys.recordings, tenantId, limit],
    queryFn: async () => {
      const api = await getApi();
      const { data } = await api.listRecordings(tenantId, limit);
      return data;
    },
  });
}

export function useAgentRecording(recordingId: number) {
  return useQuery<AgentRecording>({
    queryKey: voiceAgentKeys.recording(recordingId),
    queryFn: async () => {
      const api = await getApi();
      const { data } = await api.getRecording(recordingId);
      return data;
    },
    enabled: recordingId > 0,
  });
}

export function useRecordingStats(tenantId?: string) {
  return useQuery<RecordingStats>({
    queryKey: [...voiceAgentKeys.recordingStats, tenantId],
    queryFn: async () => {
      const api = await getApi();
      const { data } = await api.getRecordingStats(tenantId);
      return data;
    },
  });
}

export function useAnalyzeRecording() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recordingId: number) => {
      const api = await getApi();
      const { data } = await api.analyzeRecording(recordingId);
      return data as AgentRecording;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: voiceAgentKeys.recordings }),
  });
}
