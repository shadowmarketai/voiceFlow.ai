/**
 * CRM Integrations Page
 * - Connect external CRMs (Zoho, HubSpot, Salesforce, Pipedrive, Freshsales)
 * - Connect ad sources (Facebook, Google, IndiaMart, JustDial, LinkedIn)
 * - View webhook URLs for each connection
 * - Sync logs
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Puzzle, Link2, Plus, ExternalLink, RefreshCw, Trash2, Copy,
  CheckCircle2, XCircle, Loader2, Clock, ArrowRight, Globe,
  Building2, ShoppingBag, MapPin, Megaphone, Code, Webhook,
  ChevronDown, Settings, Zap,
} from 'lucide-react';
import { crmIntegrationsAPI } from '../../../services/api';

const CRM_PROVIDERS = [
  { id: 'zoho', name: 'Zoho CRM', icon: '🟢', auth: 'oauth2', desc: 'Popular Indian CRM' },
  { id: 'hubspot', name: 'HubSpot', icon: '🟠', auth: 'oauth2', desc: 'Marketing + Sales CRM' },
  { id: 'salesforce', name: 'Salesforce', icon: '🔵', auth: 'oauth2', desc: 'Enterprise CRM' },
  { id: 'pipedrive', name: 'Pipedrive', icon: '🟣', auth: 'oauth2', desc: 'Sales pipeline CRM' },
  { id: 'freshsales', name: 'Freshsales', icon: '🟡', auth: 'api_key', desc: 'API key based' },
  { id: 'custom', name: 'Custom CRM', icon: '⚙️', auth: 'webhook', desc: 'Webhook integration' },
];

const AD_PROVIDERS = [
  { id: 'facebook', name: 'Facebook Lead Ads', icon: '📘', auth: 'webhook', desc: 'Instant lead capture from FB ads' },
  { id: 'google', name: 'Google Ads', icon: '🔍', auth: 'webhook', desc: 'Form extensions via webhook' },
  { id: 'indiamart', name: 'IndiaMart', icon: '🏪', auth: 'api_key', desc: 'Poll for new buyer inquiries' },
  { id: 'justdial', name: 'JustDial', icon: '📍', auth: 'webhook', desc: 'Register webhook callback' },
  { id: 'linkedin', name: 'LinkedIn', icon: '💼', auth: 'oauth2', desc: 'Lead Gen Forms' },
  { id: 'website', name: 'Website Form', icon: '🌐', auth: 'webhook', desc: 'Embed JS snippet on your site' },
];

export default function CrmIntegrationsPage() {
  const [crmConnections, setCrmConnections] = useState([]);
  const [adSources, setAdSources] = useState([]);
  const [syncLogs, setSyncLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('crm');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [crmRes, adRes, logsRes] = await Promise.allSettled([
        crmIntegrationsAPI.listCrm(),
        crmIntegrationsAPI.listAdSources(),
        crmIntegrationsAPI.listSyncLogs(),
      ]);
      if (crmRes.status === 'fulfilled') setCrmConnections(crmRes.value.data || []);
      if (adRes.status === 'fulfilled') setAdSources(adRes.value.data || []);
      if (logsRes.status === 'fulfilled') setSyncLogs(logsRes.value.data || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleConnectCrm = async (provider) => {
    const prov = CRM_PROVIDERS.find(p => p.id === provider);
    if (prov?.auth === 'oauth2') {
      try {
        const { data } = await crmIntegrationsAPI.oauthAuthorize(provider);
        window.open(data.auth_url, '_blank');
        toast.success(`Redirecting to ${prov.name} login...`);
      } catch (err) {
        toast.error(err.response?.data?.detail || 'OAuth failed');
      }
    } else {
      try {
        await crmIntegrationsAPI.createCrm({ provider, display_name: prov?.name });
        toast.success(`${prov?.name} connection created`);
        loadData();
      } catch (err) {
        toast.error(err.response?.data?.detail || 'Connection failed');
      }
    }
  };

  const handleConnectAdSource = async (provider) => {
    const prov = AD_PROVIDERS.find(p => p.id === provider);
    try {
      const { data } = await crmIntegrationsAPI.createAdSource({
        provider,
        display_name: prov?.name,
        auth_type: prov?.auth || 'webhook',
        default_tags: [provider],
      });
      toast.success(`${prov?.name} connected! Webhook URL generated.`);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Connection failed');
    }
  };

  const handleDeleteCrm = async (id) => {
    try {
      await crmIntegrationsAPI.deleteCrm(id);
      toast.success('Disconnected');
      loadData();
    } catch { toast.error('Failed to disconnect'); }
  };

  const handleDeleteAdSource = async (id) => {
    try {
      await crmIntegrationsAPI.deleteAdSource(id);
      toast.success('Disconnected');
      loadData();
    } catch { toast.error('Failed to disconnect'); }
  };

  const handleSync = async (id) => {
    try {
      await crmIntegrationsAPI.triggerSync(id);
      toast.success('Sync triggered');
      loadData();
    } catch { toast.error('Sync failed'); }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const connectedCrmIds = new Set(crmConnections.map(c => c.provider));
  const connectedAdIds = new Set(adSources.map(s => s.provider));

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Puzzle className="w-6 h-6 text-indigo-500" /> Integrations
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Connect your CRM and ad platforms to import leads and sync call data back
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {[
          { id: 'crm', label: 'CRM Connectors', count: crmConnections.length },
          { id: 'ads', label: 'Ad Sources', count: adSources.length },
          { id: 'logs', label: 'Sync Logs', count: syncLogs.length },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t.label} {t.count > 0 && <span className="ml-1 text-xs text-slate-400">({t.count})</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400 mr-2" />
          <span className="text-sm text-slate-500">Loading integrations...</span>
        </div>
      ) : (
        <>
          {/* CRM Connectors Tab */}
          {activeTab === 'crm' && (
            <div className="space-y-4">
              {/* Active connections */}
              {crmConnections.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
                  <div className="px-6 py-3">
                    <p className="text-sm font-semibold text-slate-800">Active Connections</p>
                  </div>
                  {crmConnections.map(conn => (
                    <div key={conn.id} className="flex items-center justify-between px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{conn.display_name || conn.provider}</p>
                          <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                            <span>Sync: {conn.sync_direction}</span>
                            {conn.last_sync_at && <span>Last: {new Date(conn.last_sync_at).toLocaleDateString()}</span>}
                            {conn.has_access_token && <span className="text-emerald-500">OAuth Connected</span>}
                            {conn.has_api_key && <span className="text-blue-500">API Key Set</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleSync(conn.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
                          <RefreshCw className="w-3 h-3" /> Sync Now
                        </button>
                        <button onClick={() => handleDeleteCrm(conn.id)}
                          className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Available CRM providers */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
                <div className="px-6 py-3 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-800">Available CRM Providers</p>
                </div>
                <div className="grid grid-cols-2 gap-4 p-6">
                  {CRM_PROVIDERS.map(prov => {
                    const connected = connectedCrmIds.has(prov.id);
                    return (
                      <div key={prov.id}
                        className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                          connected ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 hover:border-indigo-200'
                        }`}>
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{prov.icon}</span>
                          <div>
                            <p className="font-medium text-slate-800 text-sm">{prov.name}</p>
                            <p className="text-xs text-slate-400">{prov.desc}</p>
                          </div>
                        </div>
                        {connected ? (
                          <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                          </span>
                        ) : (
                          <button onClick={() => handleConnectCrm(prov.id)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">
                            <Link2 className="w-3 h-3" /> Connect
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Ad Sources Tab */}
          {activeTab === 'ads' && (
            <div className="space-y-4">
              {/* Active ad source connections with webhook URLs */}
              {adSources.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
                  <div className="px-6 py-3">
                    <p className="text-sm font-semibold text-slate-800">Active Sources</p>
                  </div>
                  {adSources.map(src => (
                    <div key={src.id} className="px-6 py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          <div>
                            <p className="font-medium text-slate-800 text-sm">{src.display_name || src.provider}</p>
                            <p className="text-xs text-slate-400">Type: {src.auth_type}</p>
                          </div>
                        </div>
                        <button onClick={() => handleDeleteAdSource(src.id)}
                          className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {src.webhook_url && (
                        <div className="mt-3 flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg">
                          <Code className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          <code className="text-xs text-slate-600 flex-1 truncate">{src.webhook_url}</code>
                          <button onClick={() => copyToClipboard(src.webhook_url)}
                            className="flex-shrink-0 p-1 rounded hover:bg-slate-200">
                            <Copy className="w-3.5 h-3.5 text-slate-400" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Available ad providers */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
                <div className="px-6 py-3 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-800">Available Ad Platforms</p>
                  <p className="text-xs text-slate-400 mt-0.5">Connect to automatically import leads from your ads</p>
                </div>
                <div className="grid grid-cols-2 gap-4 p-6">
                  {AD_PROVIDERS.map(prov => {
                    const connected = connectedAdIds.has(prov.id);
                    return (
                      <div key={prov.id}
                        className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                          connected ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 hover:border-blue-200'
                        }`}>
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{prov.icon}</span>
                          <div>
                            <p className="font-medium text-slate-800 text-sm">{prov.name}</p>
                            <p className="text-xs text-slate-400">{prov.desc}</p>
                          </div>
                        </div>
                        {connected ? (
                          <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Active
                          </span>
                        ) : (
                          <button onClick={() => handleConnectAdSource(prov.id)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
                            <Zap className="w-3 h-3" /> Enable
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Sync Logs Tab */}
          {activeTab === 'logs' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-3 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-800">Recent Sync Activity</p>
              </div>
              {syncLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Clock className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">No sync activity yet</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Provider</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Direction</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Status</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Records</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncLogs.map(log => (
                      <tr key={log.id} className="border-b border-slate-50">
                        <td className="px-4 py-2.5 font-medium text-slate-700">{log.provider}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            log.direction === 'import' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'
                          }`}>{log.direction}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            log.status === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                          }`}>{log.status}</span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">
                          {log.records_created} new, {log.records_updated} updated
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-400">
                          {log.started_at ? new Date(log.started_at).toLocaleString('en-IN') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
