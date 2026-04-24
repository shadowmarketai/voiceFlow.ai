/**
 * CRM Integrations — API Settings Page
 * Groweon-style: sidebar tabs + form per integration
 * Each client enters their own API keys/credentials
 * Webhook URLs auto-generated for webhook-based integrations
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Settings, Puzzle, Copy, Trash2, Edit2, CheckCircle2, Loader2,
  Plus, Save, TestTube, ExternalLink, RefreshCw, X, AlertCircle, Download,
} from 'lucide-react';
import { crmIntegrationsAPI } from '../../../services/api';

// ── Integration definitions ──────────────────────────────────────
// Each integration defines: what fields the form needs + type

const INTEGRATIONS = [
  // Lead Sources
  { section: 'LEAD SOURCES' },
  {
    id: 'indiamart', name: 'IndiaMart', icon: '🏪',
    type: 'api_key',
    fields: [
      { key: 'account_name', label: 'Account Name', required: true },
      { key: 'mobile', label: 'Mobile / Email', required: true },
      { key: 'api_key', label: 'CRM Key', required: true, secret: true },
    ],
    desc: 'Paste your IndiaMart CRM key — leads sync automatically every 5 minutes with full details',
  },
  {
    id: 'tradeindia', name: 'TradeIndia', icon: '🇮🇳',
    type: 'api_key',
    fields: [
      { key: 'account_name', label: 'Account Name', required: true },
      { key: 'user_id', label: 'User ID', required: true },
      { key: 'profile_id', label: 'Profile ID', required: true },
      { key: 'api_key', label: 'Key', required: true, secret: true },
    ],
    desc: 'Connect TradeIndia to import leads automatically',
  },
  {
    id: 'justdial', name: 'JustDial', icon: '📍',
    type: 'webhook',
    fields: [],
    desc: 'Register the webhook URL below in your JustDial panel',
    showWebhook: true,
  },
  {
    id: 'sulekha', name: 'Sulekha', icon: '📋',
    type: 'api_key',
    fields: [
      { key: 'account_name', label: 'Account Name', required: true },
      { key: 'email', label: 'Email', required: true },
      { key: 'api_key', label: 'Key', required: true, secret: true },
    ],
    desc: 'Connect Sulekha to import service leads',
  },
  {
    id: 'facebook', name: 'Facebook Lead Ads', icon: '📘',
    type: 'facebook_oauth',
    fields: [],
    desc: 'Connect your Facebook account to import leads from Lead Ad forms',
  },
  {
    id: 'google', name: 'Google Ads', icon: '🔍',
    type: 'webhook',
    fields: [],
    desc: 'Use the webhook URL below in Google Ads form extensions',
    showWebhook: true,
  },
  {
    id: 'website', name: 'Website Form', icon: '🌐',
    type: 'webhook',
    fields: [],
    desc: 'Use this webhook URL to capture leads from your website forms',
    showWebhook: true,
    showSnippet: true,
  },
  {
    id: 'linkedin', name: 'LinkedIn', icon: '💼',
    type: 'webhook',
    fields: [],
    desc: 'Register webhook URL for LinkedIn Lead Gen Forms',
    showWebhook: true,
  },

  // Messaging
  { section: 'MESSAGING' },
  {
    id: 'whatsapp', name: 'WhatsApp Business', icon: '💬',
    type: 'api_key',
    fields: [
      { key: 'provider', label: 'Service Provider', required: true, select: ['Select', 'Twilio', 'Meta Cloud API', 'Gupshup', 'Wati', 'Interakt'] },
      { key: 'api_key', label: 'API Key', required: true, secret: true, multiline: true },
      { key: 'phone_number_id', label: 'Phone Number ID', required: false },
    ],
    desc: 'Send WhatsApp follow-ups to leads after calls',
    showWebhook: true,
  },
  {
    id: 'sms', name: 'SMS Gateway', icon: '📱',
    type: 'api_key',
    fields: [
      { key: 'provider', label: 'Service Provider', required: true, select: ['Select', 'Pinnacle Teleservices', 'MSG91', 'Twilio', 'TextLocal', 'Custom'] },
      { key: 'account_name', label: 'Name', required: true },
      { key: 'sender_id', label: 'Sender ID', required: true },
      { key: 'api_key', label: 'API Key', required: true, secret: true },
      { key: 'entity_id', label: 'Entity ID (DLT)', required: false },
    ],
    desc: 'Send SMS notifications and follow-ups',
  },

  // CRM
  { section: 'CRM' },
  {
    id: 'zoho', name: 'Zoho CRM', icon: '🟢',
    type: 'api_key',
    fields: [
      { key: 'account_name', label: 'Account Name', required: true },
      { key: 'api_key', label: 'Zoho API Token / Auth Token', required: true, secret: true, multiline: true },
      { key: 'api_domain', label: 'API Domain', required: false, placeholder: 'https://www.zohoapis.in' },
    ],
    desc: 'Connect Zoho CRM to sync leads both ways',
  },
  {
    id: 'hubspot', name: 'HubSpot', icon: '🟠',
    type: 'api_key',
    fields: [
      { key: 'account_name', label: 'Account Name', required: true },
      { key: 'api_key', label: 'Private App Access Token', required: true, secret: true, multiline: true },
    ],
    desc: 'Connect HubSpot to sync contacts and deals',
  },
  {
    id: 'salesforce', name: 'Salesforce', icon: '🔵',
    type: 'api_key',
    fields: [
      { key: 'account_name', label: 'Account Name', required: true },
      { key: 'api_key', label: 'Access Token', required: true, secret: true, multiline: true },
      { key: 'api_domain', label: 'Instance URL', required: true, placeholder: 'https://yourorg.salesforce.com' },
    ],
    desc: 'Connect Salesforce to push call data and pull leads',
  },
  {
    id: 'pipedrive', name: 'Pipedrive', icon: '🟣',
    type: 'api_key',
    fields: [
      { key: 'account_name', label: 'Account Name', required: true },
      { key: 'api_key', label: 'API Token', required: true, secret: true },
    ],
    desc: 'Connect Pipedrive to sync deals and contacts',
  },
  {
    id: 'freshsales', name: 'Freshsales', icon: '🟡',
    type: 'api_key',
    fields: [
      { key: 'account_name', label: 'Account Name', required: true },
      { key: 'api_key', label: 'API Key', required: true, secret: true },
      { key: 'api_domain', label: 'Domain', required: true, placeholder: 'yourcompany.freshsales.io' },
    ],
    desc: 'Connect Freshsales for lead management',
  },
  {
    id: 'custom', name: 'Custom CRM / Webhook', icon: '⚙️',
    type: 'webhook',
    fields: [
      { key: 'account_name', label: 'CRM Name', required: true },
      { key: 'webhook_url', label: 'Your CRM Webhook URL', required: false, placeholder: 'https://your-crm.com/api/leads' },
    ],
    desc: 'Send lead data to any CRM via webhook. Also shows our inbound webhook URL below.',
    showWebhook: true,
  },

  // Tools
  { section: 'TOOLS' },
  {
    id: 'google_calendar', name: 'Google Calendar', icon: '📅',
    type: 'api_key',
    fields: [
      { key: 'api_key', label: 'Google API Key or Service Account JSON', required: true, secret: true, multiline: true },
      { key: 'calendar_id', label: 'Calendar ID', required: false, placeholder: 'primary' },
    ],
    desc: 'Schedule follow-up meetings after calls',
  },
  {
    id: 'slack', name: 'Slack', icon: '💼',
    type: 'webhook',
    fields: [
      { key: 'webhook_url', label: 'Slack Incoming Webhook URL', required: true, placeholder: 'https://hooks.slack.com/services/...' },
    ],
    desc: 'Get lead notifications in your Slack channel',
  },
  {
    id: 'telegram', name: 'Telegram Bot', icon: '📨',
    type: 'api_key',
    fields: [
      { key: 'api_key', label: 'Bot Token', required: true, secret: true },
      { key: 'chat_id', label: 'Chat ID', required: true },
    ],
    desc: 'Get lead alerts via Telegram',
  },
];

const BASE_URL = window.location.origin;

export default function CrmIntegrationsPage() {
  const [activeId, setActiveId] = useState('indiamart');
  const [connections, setConnections] = useState([]);
  const [adSources, setAdSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({});
  const [agents, setAgents] = useState([]);
  const [syncingId, setSyncingId] = useState(null);

  // Facebook-specific state
  const [fbConnected, setFbConnected] = useState(false);
  const [fbPages, setFbPages] = useState([]);
  const [fbForms, setFbForms] = useState([]);
  const [fbSelectedPage, setFbSelectedPage] = useState('');
  const [fbSelectedForm, setFbSelectedForm] = useState('');
  const [fbSubscribedForms, setFbSubscribedForms] = useState([]);
  const [fbLoading, setFbLoading] = useState(false);
  const [fbPulling, setFbPulling] = useState(false);
  const [fbPullResult, setFbPullResult] = useState(null);

  const activeIntegration = INTEGRATIONS.find(i => i.id === activeId);

  // Load existing connections + agents
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [crmRes, adRes] = await Promise.allSettled([
        crmIntegrationsAPI.listCrm(),
        crmIntegrationsAPI.listAdSources(),
      ]);
      if (crmRes.status === 'fulfilled') setConnections(crmRes.value.data || []);
      if (adRes.status === 'fulfilled') setAdSources(adRes.value.data || []);

      // Load agents for assignment
      try {
        const { agentsAPI } = await import('../../../services/api');
        const { data } = await agentsAPI.list();
        setAgents(Array.isArray(data) ? data : (data?.agents ?? []));
      } catch {}
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Load Facebook subscribed forms
  const loadFbForms = useCallback(async () => {
    try {
      const { data } = await crmIntegrationsAPI.facebookListForms();
      setFbConnected(data.connected);
      setFbSubscribedForms(data.forms || []);
    } catch {}
  }, []);

  useEffect(() => { if (activeId === 'facebook') loadFbForms(); }, [activeId, loadFbForms]);

  // Facebook Login handler
  const handleFacebookLogin = () => {
    const appId = import.meta.env.VITE_FACEBOOK_APP_ID || '';
    if (!appId) {
      toast.error('Facebook App ID not configured. Contact admin.');
      return;
    }
    const redirectUri = encodeURIComponent(window.location.origin + '/voice/crm-integrations?fb=callback');
    const scope = 'pages_show_list,pages_read_engagement,pages_manage_ads';
    window.location.href = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=token`;
  };

  // Handle FB callback (token in URL hash)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('access_token')) {
      const params = new URLSearchParams(hash.substring(1));
      const token = params.get('access_token');
      if (token) {
        setActiveId('facebook');
        crmIntegrationsAPI.facebookSaveToken(token)
          .then(() => {
            toast.success('Facebook connected!');
            setFbConnected(true);
            window.history.replaceState(null, '', window.location.pathname);
            loadFbPages();
          })
          .catch(() => toast.error('Failed to save Facebook token'));
      }
    }
  }, []);

  const loadFbPages = async () => {
    setFbLoading(true);
    try {
      const { data } = await crmIntegrationsAPI.facebookGetPages();
      setFbPages(data.pages || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load pages');
    } finally {
      setFbLoading(false);
    }
  };

  const handleFbPageSelect = async (pageId) => {
    setFbSelectedPage(pageId);
    setFbSelectedForm('');
    setFbForms([]);
    if (!pageId) return;
    setFbLoading(true);
    try {
      const { data } = await crmIntegrationsAPI.facebookGetForms(pageId);
      setFbForms(data.forms || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load forms');
    } finally {
      setFbLoading(false);
    }
  };

  const handleFbSubscribe = async () => {
    if (!fbSelectedPage || !fbSelectedForm) { toast.error('Select page and form'); return; }
    const page = fbPages.find(p => p.id === fbSelectedPage);
    const form = fbForms.find(f => f.id === fbSelectedForm);
    try {
      await crmIntegrationsAPI.facebookSubscribe({
        page_id: fbSelectedPage,
        page_name: page?.name || '',
        form_id: fbSelectedForm,
        form_name: form?.name || '',
      });
      toast.success('Form subscribed!');
      setFbSelectedForm('');
      loadFbForms();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to subscribe');
    }
  };

  const handleFbDeleteForm = async (formId) => {
    try {
      await crmIntegrationsAPI.facebookDeleteForm(formId);
      toast.success('Form removed');
      loadFbForms();
    } catch { toast.error('Failed to remove'); }
  };

  const handleFbPullLeads = async (pageId, formId) => {
    setFbPulling(true);
    setFbPullResult(null);
    try {
      const { data } = await crmIntegrationsAPI.facebookPullLeads({ page_id: pageId, form_id: formId || undefined });
      setFbPullResult(data);
      toast.success(`Imported ${data.imported} leads!`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to pull leads');
    } finally {
      setFbPulling(false);
    }
  };

  // Reset form when switching integration
  useEffect(() => {
    setFormData({});
  }, [activeId]);

  // Get existing connections for current integration
  const existingConnections = [
    ...connections.filter(c => c.provider === activeId),
    ...adSources.filter(s => s.provider === activeId),
  ];

  // Get webhook URL for this integration
  const tenantId = 'default'; // Will be replaced by actual tenant from auth
  const webhookUrl = `${BASE_URL}/api/v1/crm-integrations/webhooks/${activeId === 'website' ? 'generic' : activeId}/${tenantId}`;

  // JS snippet for website embedding
  const websiteSnippet = `<script>
document.querySelector('form').addEventListener('submit', function(e) {
  e.preventDefault();
  var fd = new FormData(this);
  var data = {};
  fd.forEach(function(v, k) { data[k] = v; });
  fetch('${webhookUrl}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
});
</script>`;

  const handleSave = async () => {
    if (!activeIntegration) return;

    // Validate required fields
    for (const f of (activeIntegration.fields || [])) {
      if (f.required && !formData[f.key]?.trim()) {
        toast.error(`${f.label} is required`);
        return;
      }
    }

    setSaving(true);
    try {
      const isCrm = ['zoho', 'hubspot', 'salesforce', 'pipedrive', 'freshsales'].includes(activeId);

      if (isCrm) {
        await crmIntegrationsAPI.createCrm({
          provider: activeId,
          display_name: formData.account_name || activeIntegration.name,
          api_key: formData.api_key || '',
          webhook_url: formData.webhook_url || '',
          field_mapping: { api_domain: formData.api_domain },
          sync_direction: 'bidirectional',
        });
      } else {
        const creds = { ...formData };
        delete creds.account_name;
        await crmIntegrationsAPI.createAdSource({
          provider: activeId,
          display_name: formData.account_name || activeIntegration.name,
          auth_type: activeIntegration.type,
          credentials: creds,
          auto_assign_agent_id: assignAgent || null,
          default_tags: [activeId],
        });
      }

      toast.success(`${activeIntegration.name} saved!`);
      setFormData({});
      setAssignAgent('');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (conn) => {
    try {
      const isCrm = connections.some(c => c.id === conn.id);
      if (isCrm) {
        await crmIntegrationsAPI.deleteCrm(conn.id);
      } else {
        await crmIntegrationsAPI.deleteAdSource(conn.id);
      }
      toast.success('Removed');
      loadData();
    } catch {
      toast.error('Failed to remove');
    }
  };

  const copyText = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="flex gap-6 max-w-6xl">
      {/* ── LEFT SIDEBAR ── */}
      <div className="w-56 flex-shrink-0">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden sticky top-4">
          <div className="px-4 py-3 bg-indigo-600">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Settings className="w-4 h-4" /> API Settings
            </h3>
          </div>
          <div className="py-1">
            {INTEGRATIONS.map((item, i) => {
              if (item.section) {
                return (
                  <p key={i} className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-2 first:mt-0">
                    {item.section}
                  </p>
                );
              }
              const isActive = activeId === item.id;
              const hasConnection = [...connections, ...adSources].some(c => c.provider === item.id);
              return (
                <button key={item.id} onClick={() => setActiveId(item.id)}
                  className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 font-medium border-r-2 border-indigo-600'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}>
                  <span className="text-base">{item.icon}</span>
                  <span className="truncate">{item.name}</span>
                  {hasConnection && <CheckCircle2 className="w-3 h-3 text-emerald-500 ml-auto flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 space-y-4">
        {activeIntegration && (
          <>
            {/* Header */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl">{activeIntegration.icon}</span>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">{activeIntegration.name} API Settings</h2>
                  <p className="text-xs text-slate-500">{activeIntegration.desc}</p>
                </div>
              </div>

              {/* Webhook URL (auto-generated) */}
              {activeIntegration.showWebhook && (
                <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    {activeIntegration.type === 'webhook' ? 'Your Webhook URL (register this in ' + activeIntegration.name + ')' : 'Lead Push URL'}
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs text-indigo-600 bg-white border border-slate-200 rounded-lg px-3 py-2 truncate">
                      {webhookUrl}
                    </code>
                    <button onClick={() => copyText(webhookUrl)}
                      className="p-2 rounded-lg hover:bg-slate-200 text-slate-500">
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Website JS Snippet */}
              {activeIntegration.showSnippet && (
                <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-slate-500">Embed this script on your website</label>
                    <button onClick={() => copyText(websiteSnippet)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
                      <Copy className="w-3 h-3" /> Copy Snippet
                    </button>
                  </div>
                  <pre className="text-[10px] text-slate-600 bg-white border border-slate-200 rounded-lg p-2 overflow-x-auto max-h-24">
                    {websiteSnippet}
                  </pre>
                </div>
              )}

              {/* Form fields */}
              {activeIntegration.fields.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">
                    Add New {activeIntegration.name} API:
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {activeIntegration.fields.map(f => (
                      <div key={f.key} className={f.multiline ? 'col-span-2' : ''}>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          {f.label}{f.required && <span className="text-red-500">*</span>}:
                        </label>
                        {f.select ? (
                          <select
                            value={formData[f.key] || ''}
                            onChange={e => setFormData(p => ({ ...p, [f.key]: e.target.value }))}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-800">
                            {f.select.map(opt => (
                              <option key={opt} value={opt === 'Select' ? '' : opt}>{opt}</option>
                            ))}
                          </select>
                        ) : f.multiline ? (
                          <textarea
                            value={formData[f.key] || ''}
                            onChange={e => setFormData(p => ({ ...p, [f.key]: e.target.value }))}
                            placeholder={f.placeholder || ''}
                            rows={3}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-800 resize-none font-mono"
                          />
                        ) : (
                          <input
                            type={f.secret ? 'password' : 'text'}
                            value={formData[f.key] || ''}
                            onChange={e => setFormData(p => ({ ...p, [f.key]: e.target.value }))}
                            placeholder={f.placeholder || ''}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-800"
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Save button */}
                  <div className="mt-4 flex gap-2">
                    <button onClick={handleSave} disabled={saving}
                      className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={() => setFormData({})}
                      className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">
                      Clear
                    </button>
                  </div>
                </div>
              )}

              {/* For pure webhook integrations (no fields, not facebook) */}
              {activeIntegration.fields.length === 0 && activeIntegration.type !== 'facebook_oauth' && (
                <div className="mt-5">
                  <button onClick={handleSave} disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              )}

              {/* ── Facebook Lead Ads OAuth Flow ── */}
              {activeIntegration.type === 'facebook_oauth' && (
                <div className="mt-5 space-y-4">
                  {/* Continue with Facebook button */}
                  {!fbConnected ? (
                    <button onClick={handleFacebookLogin}
                      className="flex items-center gap-3 px-6 py-3 bg-[#1877F2] text-white rounded-xl text-sm font-semibold hover:bg-[#166FE5] transition-colors shadow-sm">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                      Continue with Facebook
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      <span className="text-sm font-medium text-emerald-700">Facebook Connected</span>
                      <button onClick={() => { loadFbPages(); }}
                        className="ml-auto text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                        Refresh Pages
                      </button>
                    </div>
                  )}

                  {/* Page selector */}
                  {fbConnected && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Page</label>
                        <select value={fbSelectedPage} onChange={e => handleFbPageSelect(e.target.value)}
                          className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-800 max-w-md">
                          <option value="">Select Page</option>
                          {fbPages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {fbPages.length === 0 && !fbLoading && (
                          <button onClick={loadFbPages} className="mt-1 text-xs text-indigo-600 hover:underline">
                            Load Pages
                          </button>
                        )}
                      </div>

                      {/* Form selector */}
                      {fbSelectedPage && (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Form</label>
                          <select value={fbSelectedForm} onChange={e => setFbSelectedForm(e.target.value)}
                            className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-800 max-w-md">
                            <option value="">Select Form</option>
                            {fbForms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                          </select>
                        </div>
                      )}

                      {/* Subscribe button */}
                      {fbSelectedForm && (
                        <button onClick={handleFbSubscribe}
                          className="flex items-center gap-2 px-5 py-2.5 bg-[#1877F2] text-white rounded-xl text-sm font-medium hover:bg-[#166FE5]">
                          <Plus className="w-4 h-4" /> Subscribe to Form
                        </button>
                      )}

                      {/* Pull All Leads from selected page */}
                      {fbSelectedPage && (
                        <div className="pt-2 border-t border-slate-100">
                          <button onClick={() => handleFbPullLeads(fbSelectedPage, fbSelectedForm || null)}
                            disabled={fbPulling}
                            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                            {fbPulling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {fbPulling ? 'Pulling Leads...' : fbSelectedForm ? 'Pull Leads from Form' : 'Pull All Leads from Page'}
                          </button>
                          {fbPullResult && (
                            <p className="mt-2 text-sm text-emerald-600 font-medium">
                              {fbPullResult.imported} imported, {fbPullResult.skipped} skipped
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {fbLoading && (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading...
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Facebook subscribed forms table */}
            {activeId === 'facebook' && fbSubscribedForms.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-3 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-700">Existing Forms</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Page Name</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Form Name</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Form ID</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fbSubscribedForms.map(f => (
                      <tr key={f.form_id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-700">{f.page_name}</td>
                        <td className="px-4 py-3 text-slate-600">{f.form_name}</td>
                        <td className="px-4 py-3 text-xs text-slate-400 font-mono">{f.form_id}</td>
                        <td className="px-4 py-3 text-right flex items-center justify-end gap-1">
                          <button onClick={() => handleFbPullLeads(f.page_id, f.form_id)}
                            disabled={fbPulling}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium text-emerald-600 hover:bg-emerald-50 border border-emerald-200 disabled:opacity-50"
                            title="Pull leads from this form">
                            {fbPulling ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Pull Leads'}
                          </button>
                          <button onClick={() => handleFbDeleteForm(f.form_id)}
                            className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Existing connections table */}
            {existingConnections.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-3 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-700">Saved Connections</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Account Name</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Status</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Last Sync</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {existingConnections.map(conn => (
                      <tr key={conn.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-700">
                          {conn.display_name || conn.provider}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded text-xs font-medium">
                            <CheckCircle2 className="w-3 h-3" /> Active
                          </span>
                          {conn.provider === 'indiamart' && (
                            <span className="ml-1.5 inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-medium">
                              <RefreshCw className="w-2.5 h-2.5" /> Auto-sync every 5 min
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {conn.last_poll_at ? (
                            <span title={conn.last_poll_at}>
                              {new Date(conn.last_poll_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                            </span>
                          ) : 'Never'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {conn.provider === 'indiamart' && (
                              <button onClick={async () => {
                                  try {
                                    toast.loading('Syncing IndiaMart leads...', { id: 'im-sync' });
                                    const { data } = await crmIntegrationsAPI.syncAdSource(conn.id);
                                    toast.success(`Synced! ${data.created || 0} new, ${data.updated || 0} updated`, { id: 'im-sync' });
                                    loadData();
                                  } catch (err) {
                                    toast.error(err.response?.data?.detail || 'Sync failed', { id: 'im-sync' });
                                  }
                                }}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-600 hover:bg-indigo-50 border border-indigo-200"
                                title="Sync now">
                                <RefreshCw className="w-3 h-3" /> Sync Now
                              </button>
                            )}
                            {['zoho', 'hubspot', 'salesforce'].includes(conn.provider) && (
                              <button
                                onClick={async () => {
                                  setSyncingId(conn.id);
                                  try {
                                    toast.loading(`Syncing ${conn.display_name || conn.provider} leads...`, { id: `sync-${conn.id}` });
                                    const { data } = await crmIntegrationsAPI.triggerSync(conn.id);
                                    if (data.error) {
                                      toast.error(data.error, { id: `sync-${conn.id}` });
                                    } else {
                                      toast.success(`Synced! ${data.created || 0} new, ${data.updated || 0} updated`, { id: `sync-${conn.id}` });
                                    }
                                    loadData();
                                  } catch (err) {
                                    toast.error(err.response?.data?.detail || 'Sync failed', { id: `sync-${conn.id}` });
                                  } finally {
                                    setSyncingId(null);
                                  }
                                }}
                                disabled={syncingId === conn.id}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-emerald-600 hover:bg-emerald-50 border border-emerald-200 disabled:opacity-50"
                                title="Pull leads from CRM now">
                                {syncingId === conn.id
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <RefreshCw className="w-3 h-3" />}
                                Sync Now
                              </button>
                            )}
                            <button onClick={() => handleDelete(conn)}
                              className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
