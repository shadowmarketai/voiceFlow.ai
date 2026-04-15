import axios from 'axios';

// Base API configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('swetha_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Don't redirect on 401 during login/register calls
    const url = error.config?.url || '';
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/register');

    if (error.response?.status === 401 && !isAuthCall) {
      localStorage.removeItem('swetha_token');
      localStorage.removeItem('swetha_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ============================================
// AUTH API
// ============================================
export const authAPI = {
  login: (credentials) => api.post('/api/v1/auth/login', credentials),
  register: (data) => api.post('/api/v1/auth/register', data),
  logout: () => api.post('/api/v1/auth/logout'),
  getProfile: () => api.get('/api/v1/auth/me'),
  // Google OAuth
  googleLogin: (data) => api.post('/api/v1/auth/google', data),
  // 2FA
  setup2FA: () => api.post('/api/v1/auth/2fa/setup'),
  verify2FA: (code) => api.post('/api/v1/auth/2fa/verify', { code }),
  disable2FA: (code) => api.post('/api/v1/auth/2fa/disable', { code }),
  login2FA: (data) => api.post('/api/v1/auth/2fa/login', data),
  // Forgot / Reset Password
  forgotPassword: (email) => api.post('/api/v1/auth/forgot-password', { email }),
  resetPassword: (data) => api.post('/api/v1/auth/reset-password', data),
};

// ============================================
// VOICE CALLS API
// ============================================
export const callsAPI = {
  // Get all calls with filters
  getAll: (params) => api.get('/api/v1/calls', { params }),
  
  // Get single call details
  getById: (id) => api.get(`/api/v1/calls/${id}`),
  
  // Get call transcript
  getTranscript: (id) => api.get(`/api/v1/calls/${id}/transcript`),
  
  // Get call recording URL
  getRecording: (id) => api.get(`/api/v1/calls/${id}/recording`),
  
  // Make outbound call
  makeCall: (data) => api.post('/api/v1/calls/outbound', data),
  
  // Get call analytics
  getAnalytics: (params) => api.get('/api/v1/calls/analytics', { params }),
  
  // Get live calls
  getLiveCalls: () => api.get('/api/v1/calls/live'),
};

// ============================================
// LEADS API
// ============================================
export const leadsAPI = {
  // Get all leads with filters
  getAll: (params) => api.get('/api/v1/leads', { params }),
  
  // Get single lead
  getById: (id) => api.get(`/api/v1/leads/${id}`),
  
  // Create lead
  create: (data) => api.post('/api/v1/leads', data),
  
  // Update lead
  update: (id, data) => api.put(`/api/v1/leads/${id}`, data),
  
  // Delete lead
  delete: (id) => api.delete(`/api/v1/leads/${id}`),
  
  // Import leads from CSV
  import: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/api/v1/leads/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  
  // Export leads to CSV
  export: (params) => api.get('/api/v1/leads/export', { params, responseType: 'blob' }),
  
  // Get pipeline stats
  getPipeline: () => api.get('/api/v1/leads/pipeline'),
};

// ============================================
// AI ASSISTANTS API
// ============================================
export const assistantsAPI = {
  // Get all assistants
  getAll: () => api.get('/api/v1/assistants'),
  
  // Get single assistant
  getById: (id) => api.get(`/api/v1/assistants/${id}`),
  
  // Create assistant
  create: (data) => api.post('/api/v1/assistants', data),
  
  // Update assistant
  update: (id, data) => api.put(`/api/v1/assistants/${id}`, data),
  
  // Delete assistant
  delete: (id) => api.delete(`/api/v1/assistants/${id}`),
  
  // Start/Stop assistant
  start: (id) => api.post(`/api/v1/assistants/${id}/start`),
  stop: (id) => api.post(`/api/v1/assistants/${id}/stop`),
  
  // Get assistant stats
  getStats: (id) => api.get(`/api/v1/assistants/${id}/stats`),
  
  // Get available voices
  getVoices: () => api.get('/api/v1/assistants/voices'),
};

// ============================================
// CAMPAIGNS (AUTO-DIALER) API
// ============================================
export const campaignsAPI = {
  // Get all campaigns
  getAll: (params) => api.get('/api/v1/campaigns', { params }),

  // Get single campaign
  getById: (id) => api.get(`/api/v1/campaigns/${id}`),

  // Create campaign
  create: (data) => api.post('/api/v1/campaigns', data),

  // Update campaign
  update: (id, data) => api.put(`/api/v1/campaigns/${id}`, data),

  // Delete campaign
  delete: (id) => api.delete(`/api/v1/campaigns/${id}`),

  // Campaign controls
  start: (id) => api.post(`/api/v1/campaigns/${id}/start`),
  pause: (id) => api.post(`/api/v1/campaigns/${id}/pause`),
  resume: (id) => api.post(`/api/v1/campaigns/${id}/resume`),
  stop: (id) => api.post(`/api/v1/campaigns/${id}/stop`),

  // Get campaign stats
  getStats: (id) => api.get(`/api/v1/campaigns/${id}/stats`),

  // Upload contacts
  uploadContacts: (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/api/v1/campaigns/${id}/contacts`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// ============================================
// SURVEYS API
// ============================================
export const surveysAPI = {
  // NOTE: trailing slash is REQUIRED on the collection routes — without it,
  // the legacy `/api/v1/surveys` router (which expects `name` instead of `title`)
  // intercepts the request and returns a 422.
  getAll: () => api.get('/api/v1/surveys/'),

  // Get single survey
  getById: (id) => api.get(`/api/v1/surveys/${id}`),

  // Create survey
  create: (data) => api.post('/api/v1/surveys/', data),
  
  // Update survey
  update: (id, data) => api.put(`/api/v1/surveys/${id}`, data),
  
  // Delete survey
  delete: (id) => api.delete(`/api/v1/surveys/${id}`),
  
  // Get survey responses
  getResponses: (id, params) => api.get(`/api/v1/surveys/${id}/responses`, { params }),
  
  // Get survey analytics
  getAnalytics: (id) => api.get(`/api/v1/surveys/${id}/analytics`),
  
  // Get shareable link
  getShareLink: (id) => api.get(`/api/v1/surveys/${id}/share`),

  // Publish a draft/paused survey (status → active)
  publish: (id) => api.post(`/api/v1/surveys/${id}/publish`),

  // ── Public (unauthenticated) endpoints used by the share link page.
  //    Use raw axios so the 401-redirect interceptor never fires for anonymous users.
  getPublicBySlug: (slug) =>
    axios.get(`${API_BASE_URL}/api/v1/public/surveys/${slug}`),
  submitPublicResponse: (slug, data) =>
    axios.post(`${API_BASE_URL}/api/v1/public/surveys/${slug}/responses`, data),
};

// ============================================
// HELP DESK (TICKETS) API
// ============================================
// Backend prefix is /api/v1/helpdesk (helpdesk.py router)
export const ticketsAPI = {
  // Paginated list with filters: { page, page_size, status, priority, category, assigned_to, search }
  getAll: (params) => api.get('/api/v1/helpdesk/tickets', { params }),

  // Single ticket with replies thread
  getById: (id) => api.get(`/api/v1/helpdesk/tickets/${id}`),

  // Create ticket
  create: (data) => api.post('/api/v1/helpdesk/tickets', data),

  // Update ticket (status, priority, category, assignee, internal_notes…)
  update: (id, data) => api.put(`/api/v1/helpdesk/tickets/${id}`, data),

  // Reply (public message or internal note)
  // body: { body, is_internal, sender_type: 'agent' | 'customer', sender_name?, sender_email?, attachments? }
  addReply: (id, body) => api.post(`/api/v1/helpdesk/tickets/${id}/reply`, body),

  // Mark resolved
  resolve: (id, resolution_notes) =>
    api.post(`/api/v1/helpdesk/tickets/${id}/resolve`, null, { params: { resolution_notes } }),

  // Dashboard stats
  getDashboard: () => api.get('/api/v1/helpdesk/dashboard'),

  // ── Convenience helpers (compose into update) ──
  updateStatus: (id, status) => api.put(`/api/v1/helpdesk/tickets/${id}`, { status }),
  updatePriority: (id, priority) => api.put(`/api/v1/helpdesk/tickets/${id}`, { priority }),
  assign: (id, agentId) => api.put(`/api/v1/helpdesk/tickets/${id}`, { assigned_to: agentId }),
};

// ============================================
// ANALYTICS API
// ============================================
export const analyticsAPI = {
  // Get dashboard stats
  getDashboard: (params) => api.get('/api/v1/analytics/dashboard', { params }),
  
  // Get call volume
  getCallVolume: (params) => api.get('/api/v1/analytics/calls/volume', { params }),
  
  // Get emotion analytics
  getEmotions: (params) => api.get('/api/v1/analytics/emotions', { params }),
  
  // Get dialect/language analytics
  getDialects: (params) => api.get('/api/v1/analytics/dialects', { params }),
  
  // Get conversion analytics
  getConversions: (params) => api.get('/api/v1/analytics/conversions', { params }),
  
  // Get hourly distribution
  getHourlyDistribution: (params) => api.get('/api/v1/analytics/hourly', { params }),
  
  // Export report
  exportReport: (params) => api.get('/api/v1/analytics/export', { params, responseType: 'blob' }),
};

// ============================================
// TTS / VOICE STUDIO API
// ============================================
export const ttsAPI = {
  // Synthesize text to speech (voice router)
  synthesize: (data) => api.post('/api/v1/voice/synthesize', data),

  // List built-in TTS voices
  listVoices: (language) => api.get('/api/v1/voice/voices', { params: { language } }),

  // Clone a voice (voice agent router)
  cloneVoice: (formData) => api.post('/api/v1/agent/voices/clone', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),

  // Delete a cloned voice
  deleteVoice: (voiceId) => api.delete(`/api/v1/agent/voices/${voiceId}`),

  // Test a cloned voice
  testVoice: (voiceId, text) => api.post(`/api/v1/agent/voices/${voiceId}/test`, { text }),

  // List cloned voices
  listClonedVoices: (tenantId = 'default') =>
    api.get('/api/v1/agent/voices', { params: { tenant_id: tenantId } }),
};

// ============================================
// INTEGRATIONS API
// ============================================
export const integrationsAPI = {
  // Get all integrations
  getAll: () => api.get('/api/v1/integrations'),
  
  // Connect integration
  connect: (provider, data) => api.post(`/api/v1/integrations/${provider}/connect`, data),
  
  // Disconnect integration
  disconnect: (provider) => api.delete(`/api/v1/integrations/${provider}`),
  
  // Get integration status
  getStatus: (provider) => api.get(`/api/v1/integrations/${provider}/status`),
  
  // Test integration
  test: (provider) => api.post(`/api/v1/integrations/${provider}/test`),
  
  // Sync data
  sync: (provider) => api.post(`/api/v1/integrations/${provider}/sync`),
};

// ============================================
// SETTINGS API
// ============================================
export const settingsAPI = {
  // Get settings
  get: () => api.get('/api/v1/settings'),
  
  // Update settings
  update: (data) => api.put('/api/v1/settings', data),
  
  // Get billing info
  getBilling: () => api.get('/api/v1/settings/billing'),
  
  // Update billing
  updateBilling: (data) => api.put('/api/v1/settings/billing', data),
  
  // Get API keys
  getApiKeys: () => api.get('/api/v1/settings/api-keys'),
  
  // Create API key
  createApiKey: (name) => api.post('/api/v1/settings/api-keys', { name }),
  
  // Delete API key
  deleteApiKey: (id) => api.delete(`/api/v1/settings/api-keys/${id}`),
  
  // Get webhooks
  getWebhooks: () => api.get('/api/v1/settings/webhooks'),
  
  // Create webhook
  createWebhook: (data) => api.post('/api/v1/settings/webhooks', data),
  
  // Delete webhook
  deleteWebhook: (id) => api.delete(`/api/v1/settings/webhooks/${id}`),
};

// ============================================
// WHITE LABEL API (for agencies)
// ============================================
// ============================================
// PEB QUOTATION API
// ============================================
export const quotationAPI = {
  calculate: (data) => api.post('/api/v1/quotations/calculate', data),
  create: (data) => api.post('/api/v1/quotations', data),
  getAll: (params) => api.get('/api/v1/quotations', { params }),
  get: (id) => api.get(`/api/v1/quotations/${id}`),
  update: (id, data) => api.put(`/api/v1/quotations/${id}`, data),
  delete: (id) => api.delete(`/api/v1/quotations/${id}`),
  generatePdf: (id) => api.post(`/api/v1/quotations/${id}/pdf`, {}, { responseType: 'blob' }),
  downloadPdf: (id) => api.get(`/api/v1/quotations/${id}/pdf`, { responseType: 'blob' }),
  revise: (id) => api.post(`/api/v1/quotations/${id}/revise`),
  changeStatus: (id, status) => api.patch(`/api/v1/quotations/${id}/status`, { status }),
  getLogs: (id) => api.get(`/api/v1/quotations/${id}/logs`),
  getStats: () => api.get('/api/v1/quotations/stats'),
  getByLead: (leadId) => api.get(`/api/v1/quotations/by-lead/${leadId}`),
};

// ============================================
// TENDENT QUOTATION ENGINE (templates, intake, portal, offers)
// ============================================
export const quotationTemplateAPI = {
  list: (params) => api.get('/api/v1/quotation-templates', { params }),
  get: (id) => api.get(`/api/v1/quotation-templates/${id}`),
  create: (data) => api.post('/api/v1/quotation-templates', data),
  update: (id, data) => api.put(`/api/v1/quotation-templates/${id}`, data),
  delete: (id) => api.delete(`/api/v1/quotation-templates/${id}`),
  calc: (templateId, formData) =>
    api.post('/api/v1/quotation-templates/calc', { template_id: templateId, form_data: formData }),
  generateToken: (quotationId, expiresInDays = 30) =>
    api.post(`/api/v1/quotation-templates/tokens/${quotationId}`, null, { params: { expires_in_days: expiresInDays } }),
  revokeTokens: (quotationId) =>
    api.post(`/api/v1/quotation-templates/tokens/${quotationId}/revoke`),
  listOffers: (quotationId) => api.get(`/api/v1/quotations/${quotationId}/offers`),
  decideOffer: (quotationId, offerId, action, body = {}) =>
    api.post(`/api/v1/quotations/${quotationId}/offers/${offerId}/decide`, { action, ...body }),
};

// ─── Public quotation APIs (no auth) ───
// Call with `api` but without Authorization header — uses axios instance defaults.
export const quotationPublicAPI = {
  getIntakeTemplate: (tenantSlug, templateSlug) =>
    api.get(`/api/v1/public/intake/${tenantSlug}/${templateSlug}`),
  submitIntake: (tenantSlug, templateSlug, data) =>
    api.post(`/api/v1/public/intake/${tenantSlug}/${templateSlug}`, data),
  viewQuote: (token) => api.get(`/api/v1/public/quote/${token}`),
  acceptQuote: (token) => api.post(`/api/v1/public/quote/${token}/accept`),
  rejectQuote: (token) => api.post(`/api/v1/public/quote/${token}/reject`),
  proposeOffer: (token, proposedAmount, clientMessage) =>
    api.post(`/api/v1/public/quote/${token}/offer`, {
      proposed_amount: proposedAmount,
      client_message: clientMessage,
    }),
  askQuestion: (token, message) =>
    api.post(`/api/v1/public/quote/${token}/ask`, { message }),
};

// ============================================
// MESSAGING API (WhatsApp / SMS / Email)
// ============================================
export const whatsappAPI = {
  send: (data) => api.post('/api/v1/whatsapp/send', data),
  sendTemplate: (data) => api.post('/api/v1/whatsapp/template', data),
  sendBulk: (data) => api.post('/api/v1/whatsapp/bulk', data),
  getTemplates: () => api.get('/api/v1/whatsapp/templates'),
  getStatus: (messageId) => api.get(`/api/v1/whatsapp/status/${messageId}`),
};

export const smsAPI = {
  send: (data) => api.post('/api/v1/sms/send', data),
  sendCampaign: (data) => api.post('/api/v1/sms/campaign', data),
  checkDND: (phone) => api.get(`/api/v1/sms/dnd/${phone}`),
  getTemplates: () => api.get('/api/v1/sms/templates'),
};

export const emailAPI = {
  send: (data) => api.post('/api/v1/email/send', data),
  sendCampaign: (data) => api.post('/api/v1/email/campaign', data),
  getTemplates: () => api.get('/api/v1/email/templates'),
};

// ============================================
// UNIFIED INBOX API
// ============================================
export const inboxAPI = {
  // Connections
  listConnections: () => api.get('/api/v1/inbox/connections'),
  createConnection: (data) => api.post('/api/v1/inbox/connections', data),
  updateConnection: (id, data) => api.put(`/api/v1/inbox/connections/${id}`, data),
  deleteConnection: (id) => api.delete(`/api/v1/inbox/connections/${id}`),
  testConnection: (id) => api.post(`/api/v1/inbox/connections/${id}/test`),

  // Baileys (WhatsApp Web) QR
  getBaileysQR: (id) => api.get(`/api/v1/inbox/connections/${id}/baileys/qr`),

  // Email IMAP poll
  pollEmail: (id, limit = 30) =>
    api.post(`/api/v1/inbox/connections/${id}/email/poll`, null, { params: { limit } }),

  // Conversations + messages
  listConversations: (params) => api.get('/api/v1/inbox/conversations', { params }),
  getMessages: (conversationId) =>
    api.get(`/api/v1/inbox/conversations/${conversationId}/messages`),
  sendMessage: (conversationId, data) =>
    api.post(`/api/v1/inbox/conversations/${conversationId}/messages`, data),
  markRead: (conversationId) =>
    api.post(`/api/v1/inbox/conversations/${conversationId}/read`),
};

// ============================================
// INTEGRATIONS API (Zapier / Slack / Sheets)
// ============================================
export const zapierAPI = {
  trigger: (data) => api.post('/api/v1/zapier/trigger', data),
  notifySlack: (data) => api.post('/api/v1/slack/notify', data),
  syncSheets: (data) => api.post('/api/v1/sheets/sync', data),
};

// ============================================
// CALL SCHEDULING API
// ============================================
export const schedulingAPI = {
  schedule: (data) => api.post('/api/v1/schedule/call', data),
  getQueue: () => api.get('/api/v1/schedule/queue'),
  cancel: (scheduleId) => api.delete(`/api/v1/schedule/${scheduleId}`),
  getWindows: () => api.get('/api/v1/schedule/windows'),
};

// ============================================
// A/B TESTING API
// ============================================
export const abTestingAPI = {
  create: (data) => api.post('/api/v1/ab-tests', data),
  getAll: () => api.get('/api/v1/ab-tests'),
  start: (id) => api.post(`/api/v1/ab-tests/${id}/start`),
  stop: (id) => api.post(`/api/v1/ab-tests/${id}/stop`),
  getResults: (id) => api.get(`/api/v1/ab-tests/${id}/results`),
};

// ============================================
// AI TRAINING API
// ============================================
export const aiTrainingAPI = {
  addData: (data) => api.post('/api/v1/ai-training/data', data),
  getData: () => api.get('/api/v1/ai-training/data'),
  triggerJob: () => api.post('/api/v1/ai-training/train'),
};

// ============================================
// SENTIMENT & ANALYTICS API
// ============================================
export const sentimentAPI = {
  getTrends: (params) => api.get('/api/v1/sentiment/trends', { params }),
  getSummary: () => api.get('/api/v1/sentiment/summary'),
  getCompetitorMentions: () => api.get('/api/v1/competitor/mentions'),
};

// ============================================
// RECORDINGS API
// ============================================
export const recordingsAPI = {
  get: (callId) => api.get(`/api/v1/recordings/${callId}`),
  download: (callId) => api.get(`/api/v1/recordings/${callId}/download`, { responseType: 'blob' }),
};

// ============================================
// FEATURE FLAGS API
// ============================================
export const featuresAPI = {
  getAll: () => api.get('/api/v1/features'),
  get: (key) => api.get(`/api/v1/features/${key}`),
};

// ============================================
// USERS / ADMIN API
// ============================================
export const usersAPI = {
  getAll: (params) => api.get('/api/v1/users', { params }),
  getById: (id) => api.get(`/api/v1/users/${id}`),
  updateRole: (id, role) => api.put(`/api/v1/users/${id}/role`, { role }),
  updateStatus: (id, is_active) => api.put(`/api/v1/users/${id}/status`, { is_active }),
  invite: (data) => api.post('/api/v1/users/invite', data),
  remove: (id) => api.delete(`/api/v1/users/${id}`),
  getPermissions: () => api.get('/api/v1/auth/permissions'),
};

// ============================================
// VOICE AGENT API (Cloned Voices, Knowledge, Recordings)
// ============================================
export const voiceAgentAPI = {
  // Voices
  cloneVoice: (formData) => api.post('/api/v1/agent/voices/clone', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  listVoices: (tenantId = 'default', activeOnly = true) =>
    api.get('/api/v1/agent/voices', { params: { tenant_id: tenantId, active_only: activeOnly } }),
  getVoice: (voiceId) => api.get(`/api/v1/agent/voices/${voiceId}`),
  deleteVoice: (voiceId) => api.delete(`/api/v1/agent/voices/${voiceId}`),
  testVoice: (voiceId, text) => api.post(`/api/v1/agent/voices/${voiceId}/test`, { text }),

  // Knowledge
  addKnowledge: (payload) => api.post('/api/v1/agent/knowledge', payload),
  bulkAddKnowledge: (payload) => api.post('/api/v1/agent/knowledge/bulk', payload),
  listKnowledge: (tenantId = 'default', docType, agentId) =>
    api.get('/api/v1/agent/knowledge', { params: { tenant_id: tenantId, doc_type: docType, agent_id: agentId } }),
  updateKnowledge: (docId, updates) => api.put(`/api/v1/agent/knowledge/${docId}`, updates),
  deleteKnowledge: (docId) => api.delete(`/api/v1/agent/knowledge/${docId}`),

  // Recordings
  listRecordings: (tenantId, limit = 50) =>
    api.get('/api/v1/agent/recordings', { params: { tenant_id: tenantId, limit } }),
  getRecordingStats: (tenantId) =>
    api.get('/api/v1/agent/recordings/stats', { params: { tenant_id: tenantId } }),
  getRecording: (recordingId) => api.get(`/api/v1/agent/recordings/${recordingId}`),
  getRecordingAudio: (recordingId) =>
    api.get(`/api/v1/agent/recordings/${recordingId}/audio`, { responseType: 'blob' }),
  analyzeRecording: (recordingId) => api.post(`/api/v1/agent/recordings/${recordingId}/analyze`),
};

// ============================================
// SUPER ADMIN API (platform console)
// ============================================
// All endpoints require is_super_admin = true on the backend.
// 403 if a tenant user calls these.
export const superAdminAPI = {
  // Platform stats
  getStats: () => api.get('/api/v1/admin/stats'),

  // Tenants
  listTenants: () => api.get('/api/v1/admin/tenants'),
  getTenant: (tenantId) => api.get(`/api/v1/admin/tenants/${tenantId}`),
  createTenant: (payload) => api.post('/api/v1/admin/tenants', payload),
  updateTenant: (tenantId, payload) => api.put(`/api/v1/admin/tenants/${tenantId}`, payload),
  deleteTenant: (tenantId) => api.delete(`/api/v1/admin/tenants/${tenantId}`),

  // Cross-tenant users
  listUsers: (params = {}) => api.get('/api/v1/admin/users', { params }),
  getUser: (userId) => api.get(`/api/v1/admin/users/${userId}`),
  createUser: (payload) => api.post('/api/v1/admin/users', payload),
  updateUser: (userId, payload) => api.put(`/api/v1/admin/users/${userId}`, payload),
  resetUserPassword: (userId, newPassword) =>
    api.post(`/api/v1/admin/users/${userId}/reset-password`, { new_password: newPassword }),
  activateUser: (userId) => api.post(`/api/v1/admin/users/${userId}/activate`),
  deactivateUser: (userId) => api.post(`/api/v1/admin/users/${userId}/deactivate`),
  deleteUser: (userId) => api.delete(`/api/v1/admin/users/${userId}`),
  moveUserTenant: (userId, tenantId) =>
    api.post(`/api/v1/admin/users/${userId}/move-tenant`, { tenant_id: tenantId }),

  // System features (catalog)
  listFeatures: () => api.get('/api/v1/admin/features'),

  // Per-tenant feature toggles
  getTenantFeatures: (tenantId) => api.get(`/api/v1/admin/tenants/${tenantId}/features`),
  toggleTenantFeature: (tenantId, featureKey, enabled) =>
    api.put(`/api/v1/admin/tenants/${tenantId}/features/${featureKey}`, { enabled }),

  // Plans
  listPlans: () => api.get('/api/v1/admin/plans'),

  // Platform support tickets (super admin inbox)
  listTickets: (params = {}) => api.get('/api/v1/admin/tickets', { params }),
  getTicket: (ticketId) => api.get(`/api/v1/admin/tickets/${ticketId}`),
  updateTicket: (ticketId, payload) => api.put(`/api/v1/admin/tickets/${ticketId}`, payload),
  replyToTicket: (ticketId, body) => api.post(`/api/v1/admin/tickets/${ticketId}/reply`, { body }),
  resolveTicket: (ticketId) => api.post(`/api/v1/admin/tickets/${ticketId}/resolve`),
};

// ============================================
// PLATFORM SUPPORT API (tenant side)
// ============================================
// Used by tenant admins to raise support tickets to the platform team.
// Super admins should NOT call these — backend returns 403.
export const platformSupportAPI = {
  listMyTickets: (params = {}) => api.get('/api/v1/platform-support/tickets', { params }),
  getMyTicket: (ticketId) => api.get(`/api/v1/platform-support/tickets/${ticketId}`),
  createTicket: (payload) => api.post('/api/v1/platform-support/tickets', payload),
  replyToTicket: (ticketId, body) =>
    api.post(`/api/v1/platform-support/tickets/${ticketId}/reply`, { body }),
};

// ============================================
// TELEPHONY API (7 providers)
// ============================================
export const telephonyAPI = {
  // Make call with auto provider selection
  makeCall: (data) => api.post('/api/v1/telephony/call', data),

  // Get call details
  getCall: (provider, callId) => api.get(`/api/v1/telephony/call/${provider}/${callId}`),

  // End call
  endCall: (provider, callId) => api.post(`/api/v1/telephony/call/${provider}/${callId}/end`),

  // Bulk voice broadcast (Vobiz / Bolna)
  bulkCall: (data) => api.post('/api/v1/telephony/bulk-call', data),

  // List all phone numbers across providers
  listNumbers: () => api.get('/api/v1/telephony/numbers'),

  // Cost estimation
  estimateCost: (data) => api.post('/api/v1/telephony/cost-estimate', data),

  // Get all provider statuses
  getProviders: () => api.get('/api/v1/telephony/providers'),
};

// ============================================
// WEBRTC API (browser calls)
// ============================================
export const webrtcAPI = {
  // Create session for browser voice call
  createSession: (data) => api.post('/api/v1/webrtc/session', data),

  // Send SDP offer
  sendOffer: (sessionId, sdp) =>
    api.post(`/api/v1/webrtc/signal/${sessionId}/offer`, { sdp }),

  // Send ICE candidate
  sendIceCandidate: (sessionId, candidate) =>
    api.post(`/api/v1/webrtc/signal/${sessionId}/ice`, { candidate }),

  // End session
  endSession: (sessionId) =>
    api.post(`/api/v1/webrtc/signal/${sessionId}/end`),

  // Get ICE server config
  getIceConfig: () => api.get('/api/v1/webrtc/ice-config'),
};

// ============================================
// VOICE CLONING API
// ============================================
export const voiceCloneAPI = {
  // Upload sample + create clone
  register: (formData) => api.post('/api/v1/voice-clone/register', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),

  // Check audio quality before cloning
  qualityCheck: (formData) => api.post('/api/v1/voice-clone/quality-check', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),

  // Synthesize speech in cloned voice
  synthesize: (data) => api.post('/api/v1/voice-clone/synthesize', data),

  // List all cloned voices
  listVoices: (params) => api.get('/api/v1/voice-clone/voices', { params }),

  // Get single voice details
  getVoice: (voiceId) => api.get(`/api/v1/voice-clone/voices/${voiceId}`),

  // Delete a cloned voice
  deleteVoice: (voiceId) => api.delete(`/api/v1/voice-clone/voices/${voiceId}`),
};

// ============================================
// LIVEKIT API (real-time voice)
// ============================================
export const livekitAPI = {
  // Get LiveKit status
  status: () => api.get('/api/v1/livekit/status'),

  // Create room and get user token
  createRoom: (data) => api.post('/api/v1/livekit/token', data),

  // Get agent token for a room
  agentToken: (data) => api.post('/api/v1/livekit/agent-token', data),
};

// ============================================
// BILLING PRO (wallet + cost calculator)
// ============================================
export const billingAPI = {
  catalog: () => api.get('/api/v1/billing/catalog'),
  presets: () => api.get('/api/v1/billing/presets'),
  presetsWithPrices: (view = 'user') => api.get('/api/v1/billing/presets-with-prices', { params: { view } }),
  selectPreset: (preset_id) => api.post('/api/v1/billing/rate-plan/preset', { preset_id }),
  calculate: (data) => api.post('/api/v1/billing/calculate', data),
  ratePlan: () => api.get('/api/v1/billing/rate-plan'),
  updateProviders: (data) => api.post('/api/v1/billing/rate-plan/providers', data),
  wallet: () => api.get('/api/v1/billing/wallet'),
  transactions: (params) => api.get('/api/v1/billing/wallet/transactions', { params }),
  rechargeOrder: (data) => api.post('/api/v1/billing/wallet/recharge/order', data),
  verifyRecharge: (data) => api.post('/api/v1/billing/wallet/recharge/verify', data),
  debit: (data) => api.post('/api/v1/billing/wallet/debit', data),
  // Tenant (white-label) endpoints — uses current logged-in tenant context
  tenantRatePlan: () => api.get('/api/v1/billing/tenant/rate-plan'),
  tenantUpdateRatePlan: (data) => api.put('/api/v1/billing/tenant/rate-plan', data),
  tenantCalculate: (data) => api.post('/api/v1/billing/tenant/calculate', data),
  // Agency endpoints — require X-Admin-Token header
  adminRatePlan: (tenantId, token) =>
    api.get(`/api/v1/billing/admin/rate-plan/${tenantId}`, { headers: { 'X-Admin-Token': token } }),
  adminUpdateRatePlan: (tenantId, data, token) =>
    api.put(`/api/v1/billing/admin/rate-plan/${tenantId}`, data, { headers: { 'X-Admin-Token': token } }),
  adminCalculate: (data, tenantId, token) =>
    api.post('/api/v1/billing/admin/calculate', data, {
      headers: { 'X-Admin-Token': token, 'X-Tenant-Id': tenantId }
    }),
  adminCredit: (data, token) =>
    api.post('/api/v1/billing/admin/wallet/credit', data, { headers: { 'X-Admin-Token': token } }),
};

// ============================================
// QUALITY & TESTING METRICS API
// ============================================
export const qualityAPI = {
  providers: () => api.get('/api/v1/quality/providers'),
  pipeline: () => api.get('/api/v1/quality/pipeline-latency'),
  uptime: () => api.get('/api/v1/quality/uptime'),
  accuracy: () => api.get('/api/v1/quality/accuracy'),
  competitors: () => api.get('/api/v1/quality/competitors'),
  trends: () => api.get('/api/v1/quality/trends'),
  summary: () => api.get('/api/v1/quality/summary'),
};

export default api;
