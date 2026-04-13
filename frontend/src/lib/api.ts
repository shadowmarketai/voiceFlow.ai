/**
 * Typed Axios API Client for VoiceFlow Marketing AI
 *
 * - Axios instance with baseURL from VITE_API_URL
 * - Request interceptor: attaches Authorization Bearer token
 * - Response interceptor: on 401, attempts token refresh; on failure redirects to /login
 * - Typed API method wrappers for each backend endpoint group
 */

import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import type {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  User,
  AuthTokens,
  Lead,
  LeadCreatePayload,
  Company,
  Contact,
  Deal,
  Activity,
  VoiceAnalysis,
  VoiceProcessRequest,
  Campaign,
  Ticket,
  Survey,
  Assistant,
  PaginatedResponse,
  ApiQueryParams,
  DashboardStats,
} from '../types';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const API_BASE_URL: string =
  import.meta.env.VITE_API_URL || 'http://localhost:8001';

const TOKEN_KEY = 'voiceflow_token';
const REFRESH_TOKEN_KEY = 'voiceflow_refresh_token';

// ─────────────────────────────────────────────
// Axios instance
// ─────────────────────────────────────────────

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// ─────────────────────────────────────────────
// Token helpers
// ─────────────────────────────────────────────

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken?: string): void {
  localStorage.setItem(TOKEN_KEY, accessToken);
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

// ─────────────────────────────────────────────
// Request interceptor — attach Bearer token
// ─────────────────────────────────────────────

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    const token = getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ─────────────────────────────────────────────
// Response interceptor — handle 401 + refresh
// ─────────────────────────────────────────────

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: AxiosResponse) => void;
  reject: (reason: unknown) => void;
  config: AxiosRequestConfig;
}> = [];

function processQueue(error: unknown): void {
  failedQueue.forEach(({ reject }) => reject(error));
  failedQueue = [];
}

async function processQueueWithToken(newToken: string): Promise<void> {
  const queue = [...failedQueue];
  failedQueue = [];
  for (const { resolve, reject, config } of queue) {
    try {
      if (config.headers) {
        (config.headers as Record<string, string>)['Authorization'] =
          `Bearer ${newToken}`;
      }
      const response = await apiClient.request(config);
      resolve(response);
    } catch (err) {
      reject(err);
    }
  }
}

apiClient.interceptors.response.use(
  (response: AxiosResponse): AxiosResponse => response,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & {
      _retry?: boolean;
    };

    // Only handle 401 Unauthorized
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // If already refreshing, queue the request
    if (isRefreshing) {
      return new Promise<AxiosResponse>((resolve, reject) => {
        failedQueue.push({ resolve, reject, config: originalRequest });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      // No refresh token — redirect to login
      clearTokens();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    try {
      const refreshResponse = await axios.post<AuthTokens>(
        `${API_BASE_URL}/api/v1/auth/refresh`,
        { refresh_token: refreshToken },
      );

      const { access_token, refresh_token: newRefresh } =
        refreshResponse.data;
      setTokens(access_token, newRefresh);

      // Retry the original request
      if (originalRequest.headers) {
        (originalRequest.headers as Record<string, string>)['Authorization'] =
          `Bearer ${access_token}`;
      }

      // Process queued requests with new token
      await processQueueWithToken(access_token);

      isRefreshing = false;
      return apiClient.request(originalRequest);
    } catch (refreshError) {
      isRefreshing = false;
      processQueue(refreshError);
      clearTokens();
      window.location.href = '/login';
      return Promise.reject(refreshError);
    }
  },
);

// ─────────────────────────────────────────────
// Typed API Methods
// ─────────────────────────────────────────────

// ── Auth ──

export const authApi = {
  login: (data: LoginRequest): Promise<AxiosResponse<LoginResponse>> =>
    apiClient.post('/api/v1/auth/login', data),

  register: (
    data: RegisterRequest,
  ): Promise<AxiosResponse<LoginResponse>> =>
    apiClient.post('/api/v1/auth/register', data),

  logout: (): Promise<AxiosResponse<void>> =>
    apiClient.post('/api/v1/auth/logout'),

  getProfile: (): Promise<AxiosResponse<User>> =>
    apiClient.get('/api/v1/auth/me'),

  refreshToken: (
    refreshToken: string,
  ): Promise<AxiosResponse<AuthTokens>> =>
    apiClient.post('/api/v1/auth/refresh', {
      refresh_token: refreshToken,
    }),
};

// ── Leads ──

export const leadsApi = {
  getAll: (
    params?: ApiQueryParams,
  ): Promise<AxiosResponse<PaginatedResponse<Lead>>> =>
    apiClient.get('/api/v1/leads', { params }),

  getById: (id: number): Promise<AxiosResponse<Lead>> =>
    apiClient.get(`/api/v1/leads/${id}`),

  create: (data: LeadCreatePayload): Promise<AxiosResponse<Lead>> =>
    apiClient.post('/api/v1/leads', data),

  update: (
    id: number,
    data: Partial<LeadCreatePayload>,
  ): Promise<AxiosResponse<Lead>> =>
    apiClient.put(`/api/v1/leads/${id}`, data),

  delete: (id: number): Promise<AxiosResponse<void>> =>
    apiClient.delete(`/api/v1/leads/${id}`),

  import: (file: File): Promise<AxiosResponse<{ imported: number }>> => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/api/v1/leads/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  export: (params?: ApiQueryParams): Promise<AxiosResponse<Blob>> =>
    apiClient.get('/api/v1/leads/export', {
      params,
      responseType: 'blob',
    }),

  getPipeline: (): Promise<
    AxiosResponse<Record<string, number>>
  > => apiClient.get('/api/v1/leads/pipeline'),
};

// ── Companies ──

export const companiesApi = {
  getAll: (
    params?: ApiQueryParams,
  ): Promise<AxiosResponse<PaginatedResponse<Company>>> =>
    apiClient.get('/api/v1/crm-companies', { params }),

  getById: (id: number): Promise<AxiosResponse<Company>> =>
    apiClient.get(`/api/v1/crm-companies/${id}`),

  create: (data: Partial<Company>): Promise<AxiosResponse<Company>> =>
    apiClient.post('/api/v1/crm-companies', data),

  update: (
    id: number,
    data: Partial<Company>,
  ): Promise<AxiosResponse<Company>> =>
    apiClient.put(`/api/v1/crm-companies/${id}`, data),

  delete: (id: number): Promise<AxiosResponse<void>> =>
    apiClient.delete(`/api/v1/crm-companies/${id}`),
};

// ── Contacts ──

export const contactsApi = {
  getAll: (
    params?: ApiQueryParams,
  ): Promise<AxiosResponse<PaginatedResponse<Contact>>> =>
    apiClient.get('/api/v1/crm-contacts', { params }),

  getById: (id: number): Promise<AxiosResponse<Contact>> =>
    apiClient.get(`/api/v1/crm-contacts/${id}`),

  create: (data: Partial<Contact>): Promise<AxiosResponse<Contact>> =>
    apiClient.post('/api/v1/crm-contacts', data),

  update: (
    id: number,
    data: Partial<Contact>,
  ): Promise<AxiosResponse<Contact>> =>
    apiClient.put(`/api/v1/crm-contacts/${id}`, data),

  delete: (id: number): Promise<AxiosResponse<void>> =>
    apiClient.delete(`/api/v1/crm-contacts/${id}`),
};

// ── Deals ──

export const dealsApi = {
  getAll: (
    params?: ApiQueryParams,
  ): Promise<AxiosResponse<PaginatedResponse<Deal>>> =>
    apiClient.get('/api/v1/crm-deals', { params }),

  getById: (id: number): Promise<AxiosResponse<Deal>> =>
    apiClient.get(`/api/v1/crm-deals/${id}`),

  create: (data: Partial<Deal>): Promise<AxiosResponse<Deal>> =>
    apiClient.post('/api/v1/crm-deals', data),

  update: (
    id: number,
    data: Partial<Deal>,
  ): Promise<AxiosResponse<Deal>> =>
    apiClient.put(`/api/v1/crm-deals/${id}`, data),

  delete: (id: number): Promise<AxiosResponse<void>> =>
    apiClient.delete(`/api/v1/crm-deals/${id}`),
};

// ── Activities ──

export const activitiesApi = {
  getAll: (
    params?: ApiQueryParams,
  ): Promise<AxiosResponse<PaginatedResponse<Activity>>> =>
    apiClient.get('/api/v1/crm-activities', { params }),

  create: (data: Partial<Activity>): Promise<AxiosResponse<Activity>> =>
    apiClient.post('/api/v1/crm-activities', data),

  update: (
    id: number,
    data: Partial<Activity>,
  ): Promise<AxiosResponse<Activity>> =>
    apiClient.put(`/api/v1/crm-activities/${id}`, data),

  delete: (id: number): Promise<AxiosResponse<void>> =>
    apiClient.delete(`/api/v1/crm-activities/${id}`),
};

// ── Voice Calls ──

export const voiceApi = {
  process: (
    data: VoiceProcessRequest,
  ): Promise<AxiosResponse<VoiceAnalysis>> =>
    apiClient.post('/api/v1/voice/process-url', data),

  processFile: (file: File, language?: string): Promise<AxiosResponse<VoiceAnalysis>> => {
    const formData = new FormData();
    formData.append('file', file);
    if (language) formData.append('language', language);
    return apiClient.post('/api/v1/voice/process', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  getCalls: (
    params?: ApiQueryParams,
  ): Promise<AxiosResponse<PaginatedResponse<VoiceAnalysis>>> =>
    apiClient.get('/api/v1/voice/analyses', { params }),

  getCallById: (id: number): Promise<AxiosResponse<VoiceAnalysis>> =>
    apiClient.get(`/api/v1/voice/analyses/${id}`),

  getTranscript: (
    id: number,
  ): Promise<AxiosResponse<{ transcript: string }>> =>
    apiClient.get(`/api/v1/voice/analyses/${id}`),

  getRecording: (
    id: number,
  ): Promise<AxiosResponse<{ url: string }>> =>
    apiClient.get(`/api/v1/voice/analyses/${id}`),

  getLiveCalls: (): Promise<AxiosResponse<VoiceAnalysis[]>> =>
    apiClient.get('/api/v1/voice/analyses', { params: { limit: 10, source: 'telephony' } }),

  getAnalytics: (
    params?: ApiQueryParams,
  ): Promise<AxiosResponse<DashboardStats>> =>
    apiClient.get('/api/v1/voice/analyses/stats', { params }),
};

// ── Dialer ──

export const dialerApi = {
  getCampaigns: (params?: ApiQueryParams): Promise<AxiosResponse> =>
    apiClient.get('/api/v1/dialer/campaigns', { params }),

  getCampaign: (id: number): Promise<AxiosResponse> =>
    apiClient.get(`/api/v1/dialer/campaigns/${id}`),

  createCampaign: (data: Record<string, unknown>): Promise<AxiosResponse> =>
    apiClient.post('/api/v1/dialer/campaigns', data),

  updateCampaign: (id: number, data: Record<string, unknown>): Promise<AxiosResponse> =>
    apiClient.put(`/api/v1/dialer/campaigns/${id}`, data),

  deleteCampaign: (id: number): Promise<AxiosResponse<void>> =>
    apiClient.delete(`/api/v1/dialer/campaigns/${id}`),

  getCampaignStats: (id: number): Promise<AxiosResponse> =>
    apiClient.get(`/api/v1/dialer/campaigns/${id}/stats`),

  getContacts: (campaignId: number, params?: ApiQueryParams): Promise<AxiosResponse> =>
    apiClient.get(`/api/v1/dialer/campaigns/${campaignId}/contacts`, { params }),

  addContacts: (campaignId: number, contacts: Array<Record<string, unknown>>): Promise<AxiosResponse> =>
    apiClient.post(`/api/v1/dialer/campaigns/${campaignId}/contacts`, { contacts }),

  initiateCall: (campaignId: number, contactId: number): Promise<AxiosResponse> =>
    apiClient.post(`/api/v1/dialer/campaigns/${campaignId}/calls/${contactId}/initiate`),

  completeCall: (callId: number, data: Record<string, unknown>): Promise<AxiosResponse> =>
    apiClient.post(`/api/v1/dialer/calls/${callId}/complete`, data),

  getCalls: (campaignId: number, params?: ApiQueryParams): Promise<AxiosResponse> =>
    apiClient.get(`/api/v1/dialer/campaigns/${campaignId}/calls`, { params }),

  getDNC: (params?: ApiQueryParams): Promise<AxiosResponse> =>
    apiClient.get('/api/v1/dialer/dnc', { params }),

  addDNC: (phone: string, reason?: string): Promise<AxiosResponse> =>
    apiClient.post('/api/v1/dialer/dnc', { phone, reason }),

  removeDNC: (phone: string): Promise<AxiosResponse<void>> =>
    apiClient.delete(`/api/v1/dialer/dnc/${phone}`),
};

// ── Assistants ──

export const assistantsApi = {
  getAll: (): Promise<AxiosResponse<Assistant[]>> =>
    apiClient.get('/api/v1/assistants'),

  getById: (id: number): Promise<AxiosResponse<Assistant>> =>
    apiClient.get(`/api/v1/assistants/${id}`),

  create: (data: Partial<Assistant>): Promise<AxiosResponse<Assistant>> =>
    apiClient.post('/api/v1/assistants', data),

  update: (
    id: number,
    data: Partial<Assistant>,
  ): Promise<AxiosResponse<Assistant>> =>
    apiClient.put(`/api/v1/assistants/${id}`, data),

  delete: (id: number): Promise<AxiosResponse<void>> =>
    apiClient.delete(`/api/v1/assistants/${id}`),

  start: (id: number): Promise<AxiosResponse<void>> =>
    apiClient.post(`/api/v1/assistants/${id}/start`),

  stop: (id: number): Promise<AxiosResponse<void>> =>
    apiClient.post(`/api/v1/assistants/${id}/stop`),
};

// ── Campaigns ──

export const campaignsApi = {
  getAll: (
    params?: ApiQueryParams,
  ): Promise<AxiosResponse<PaginatedResponse<Campaign>>> =>
    apiClient.get('/api/v1/campaigns', { params }),

  getById: (id: number): Promise<AxiosResponse<Campaign>> =>
    apiClient.get(`/api/v1/campaigns/${id}`),

  create: (data: Partial<Campaign>): Promise<AxiosResponse<Campaign>> =>
    apiClient.post('/api/v1/campaigns', data),

  update: (
    id: number,
    data: Partial<Campaign>,
  ): Promise<AxiosResponse<Campaign>> =>
    apiClient.put(`/api/v1/campaigns/${id}`, data),

  delete: (id: number): Promise<AxiosResponse<void>> =>
    apiClient.delete(`/api/v1/campaigns/${id}`),

  start: (id: number): Promise<AxiosResponse<void>> =>
    apiClient.post(`/api/v1/campaigns/${id}/start`),

  pause: (id: number): Promise<AxiosResponse<void>> =>
    apiClient.post(`/api/v1/campaigns/${id}/pause`),

  resume: (id: number): Promise<AxiosResponse<void>> =>
    apiClient.post(`/api/v1/campaigns/${id}/resume`),

  stop: (id: number): Promise<AxiosResponse<void>> =>
    apiClient.post(`/api/v1/campaigns/${id}/stop`),
};

// ── Tickets ──

export const ticketsApi = {
  getAll: (
    params?: ApiQueryParams,
  ): Promise<AxiosResponse<PaginatedResponse<Ticket>>> =>
    apiClient.get('/api/v1/tickets', { params }),

  getById: (id: number): Promise<AxiosResponse<Ticket>> =>
    apiClient.get(`/api/v1/tickets/${id}`),

  create: (data: Partial<Ticket>): Promise<AxiosResponse<Ticket>> =>
    apiClient.post('/api/v1/tickets', data),

  update: (
    id: number,
    data: Partial<Ticket>,
  ): Promise<AxiosResponse<Ticket>> =>
    apiClient.put(`/api/v1/tickets/${id}`, data),

  updateStatus: (
    id: number,
    status: string,
  ): Promise<AxiosResponse<void>> =>
    apiClient.patch(`/api/v1/tickets/${id}/status`, { status }),

  assign: (id: number, agentId: number): Promise<AxiosResponse<void>> =>
    apiClient.post(`/api/v1/tickets/${id}/assign`, {
      agent_id: agentId,
    }),

  addComment: (
    id: number,
    comment: string,
  ): Promise<AxiosResponse<void>> =>
    apiClient.post(`/api/v1/tickets/${id}/comments`, { comment }),
};

// ── Surveys ──

export const surveysApi = {
  getAll: (): Promise<AxiosResponse<Survey[]>> =>
    apiClient.get('/api/v1/surveys'),

  getById: (id: number): Promise<AxiosResponse<Survey>> =>
    apiClient.get(`/api/v1/surveys/${id}`),

  create: (data: Partial<Survey>): Promise<AxiosResponse<Survey>> =>
    apiClient.post('/api/v1/surveys', data),

  update: (
    id: number,
    data: Partial<Survey>,
  ): Promise<AxiosResponse<Survey>> =>
    apiClient.put(`/api/v1/surveys/${id}`, data),

  delete: (id: number): Promise<AxiosResponse<void>> =>
    apiClient.delete(`/api/v1/surveys/${id}`),
};

// ── Analytics ──

export const analyticsApi = {
  getDashboard: (
    params?: ApiQueryParams,
  ): Promise<AxiosResponse<DashboardStats>> =>
    apiClient.get('/api/v1/analytics/dashboard', { params }),

  getCallVolume: (
    params?: ApiQueryParams,
  ): Promise<AxiosResponse<Record<string, number>[]>> =>
    apiClient.get('/api/v1/analytics/calls/volume', { params }),

  getEmotions: (
    params?: ApiQueryParams,
  ): Promise<AxiosResponse<Record<string, number>>> =>
    apiClient.get('/api/v1/analytics/emotions', { params }),

  getConversions: (
    params?: ApiQueryParams,
  ): Promise<AxiosResponse<Record<string, number>[]>> =>
    apiClient.get('/api/v1/analytics/conversions', { params }),

  exportReport: (
    params?: ApiQueryParams,
  ): Promise<AxiosResponse<Blob>> =>
    apiClient.get('/api/v1/analytics/export', {
      params,
      responseType: 'blob',
    }),
};

// ── Settings ──

export const settingsApi = {
  get: (): Promise<AxiosResponse<Record<string, string | number | boolean>>> =>
    apiClient.get('/api/v1/settings'),

  update: (
    data: Record<string, string | number | boolean>,
  ): Promise<AxiosResponse<void>> =>
    apiClient.put('/api/v1/settings', data),

  getApiKeys: (): Promise<
    AxiosResponse<Array<{ id: number; name: string; key_prefix: string; created_at: string }>>
  > => apiClient.get('/api/v1/settings/api-keys'),

  createApiKey: (
    name: string,
  ): Promise<AxiosResponse<{ id: number; name: string; key: string }>> =>
    apiClient.post('/api/v1/settings/api-keys', { name }),

  deleteApiKey: (id: number): Promise<AxiosResponse<void>> =>
    apiClient.delete(`/api/v1/settings/api-keys/${id}`),
};

// ── Billing (Razorpay) ──

export const billingApi = {
  getPlans: (): Promise<AxiosResponse<Array<{
    id: string;
    name: string;
    description: string;
    price: number;
    currency: string;
    interval: string;
    features: string[];
  }>>> =>
    apiClient.get('/api/v1/billing/plans'),

  subscribe: (
    data: { plan_id: string; payment_method?: string },
  ): Promise<AxiosResponse<{
    subscription_id: string;
    razorpay_order_id: string;
    amount: number;
    currency: string;
    key_id: string;
  }>> =>
    apiClient.post('/api/v1/billing/subscribe', data),

  getUsage: (): Promise<AxiosResponse<{
    calls_used: number;
    calls_limit: number;
    leads_used: number;
    leads_limit: number;
    credits_remaining: number;
  }>> =>
    apiClient.get('/api/v1/billing/usage'),

  addCredits: (
    data: { amount: number; credits: number },
  ): Promise<AxiosResponse<{
    razorpay_order_id: string;
    amount: number;
    currency: string;
    key_id: string;
  }>> =>
    apiClient.post('/api/v1/billing/credits/add', data),

  verifyPayment: (
    data: {
      razorpay_payment_id: string;
      razorpay_order_id: string;
      razorpay_signature: string;
    },
  ): Promise<AxiosResponse<{ success: boolean; message: string }>> =>
    apiClient.post('/api/v1/billing/verify-payment', data),

  getInvoices: (): Promise<AxiosResponse<Array<{
    id: string;
    invoice_number: string;
    amount: number;
    currency: string;
    status: string;
    description: string;
    created_at: string;
    paid_at?: string;
    pdf_url?: string;
  }>>> =>
    apiClient.get('/api/v1/billing/invoices'),
};

// ── Lead Sources ──

import type {
  LeadSourceConfigCreate,
  LeadSourceConfigResponse,
  LeadIngestionResult,
  LeadSourceStats,
} from '../types';

export const leadSourcesApi = {
  getConfigs: (): Promise<AxiosResponse<LeadSourceConfigResponse[]>> =>
    apiClient.get('/api/v1/lead-sources/configs'),

  createConfig: (
    data: LeadSourceConfigCreate,
  ): Promise<AxiosResponse<LeadSourceConfigResponse>> =>
    apiClient.post('/api/v1/lead-sources/configs', data),

  updateConfig: (
    id: number,
    data: Partial<LeadSourceConfigCreate>,
  ): Promise<AxiosResponse<LeadSourceConfigResponse>> =>
    apiClient.put(`/api/v1/lead-sources/configs/${id}`, data),

  deleteConfig: (id: number): Promise<AxiosResponse<void>> =>
    apiClient.delete(`/api/v1/lead-sources/configs/${id}`),

  pollIndiamart: (): Promise<AxiosResponse<LeadIngestionResult>> =>
    apiClient.post('/api/v1/lead-sources/indiamart/poll'),

  getStats: (): Promise<AxiosResponse<LeadSourceStats[]>> =>
    apiClient.get('/api/v1/lead-sources/stats'),
};

// Export the raw axios instance — named export for hooks, default for legacy imports
export { apiClient };
export default apiClient;
