/**
 * CRM Import Page
 * Import contacts from: CSV, External CRM sync, Ad sources
 * Shows import history and source stats
 */

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Download, FileUp, Globe, Building2, ShoppingBag, MapPin,
  Loader2, CheckCircle2, AlertCircle, Upload, ArrowRight,
  FileSpreadsheet, Link2, Megaphone, X, Zap,
} from 'lucide-react';
import { crmLeadsAPI, crmIntegrationsAPI } from '../../../services/api';

const IMPORT_METHODS = [
  {
    id: 'csv',
    icon: FileSpreadsheet,
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-600',
    label: 'CSV / Excel Import',
    desc: 'Upload a spreadsheet with contacts',
  },
  {
    id: 'crm',
    icon: Building2,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    label: 'External CRM',
    desc: 'Sync from Zoho, HubSpot, Salesforce',
  },
  {
    id: 'ads',
    icon: Megaphone,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    label: 'Ad Platforms',
    desc: 'Facebook, Google, IndiaMart, JustDial',
  },
];

export default function CrmImportPage() {
  const [activeMethod, setActiveMethod] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [tags, setTags] = useState('');
  const fileRef = useRef(null);

  const handleCSVImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('source', 'csv');
      if (tags.trim()) fd.append('tags', tags.trim());
      const { data } = await crmLeadsAPI.importCSV(fd);
      setImportResult(data);
      toast.success(`Import complete: ${data.created} new, ${data.updated} updated`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Import failed');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleCRMConnect = (provider) => {
    window.location.href = `/voice/crm-integrations?tab=crm&connect=${provider}`;
  };

  const handleAdConnect = (provider) => {
    window.location.href = `/voice/crm-integrations?tab=ads&connect=${provider}`;
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Download className="w-6 h-6 text-indigo-500" /> Import Contacts
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Import contacts from spreadsheets, external CRMs, or ad platforms
        </p>
      </div>

      {/* Method cards */}
      <div className="grid grid-cols-3 gap-4">
        {IMPORT_METHODS.map(m => {
          const Icon = m.icon;
          const active = activeMethod === m.id;
          return (
            <button key={m.id} onClick={() => setActiveMethod(active ? null : m.id)}
              className={`flex flex-col items-center gap-3 p-6 rounded-2xl border-2 transition-all text-center cursor-pointer ${
                active ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
              }`}>
              <div className={`w-14 h-14 rounded-xl ${m.iconBg} flex items-center justify-center`}>
                <Icon className={`w-7 h-7 ${m.iconColor}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{m.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{m.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* CSV Import Panel */}
      <AnimatePresence>
        {activeMethod === 'csv' && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-800">Upload CSV File</h3>
            <p className="text-xs text-slate-500">
              Your CSV should have columns like: <strong>Name, Phone/Mobile, Email, Company, City, State, Source</strong>.
              We'll auto-detect column names and map them.
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Tags (optional, comma-separated)</label>
              <input type="text" value={tags} onChange={e => setTags(e.target.value)}
                placeholder="e.g. campaign_q2, hot_leads"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" />
            </div>

            <label className="flex flex-col items-center gap-3 p-10 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-indigo-300 hover:bg-slate-50">
              {importing ? (
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              ) : (
                <FileUp className="w-8 h-8 text-indigo-500" />
              )}
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">
                  {importing ? 'Importing...' : 'Click to select CSV file'}
                </p>
                <p className="text-xs text-slate-400 mt-1">CSV, TXT supported</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleCSVImport} className="hidden" disabled={importing} />
            </label>

            {importResult && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <h4 className="text-sm font-semibold text-emerald-800">Import Complete</h4>
                </div>
                <div className="grid grid-cols-4 gap-3 text-center">
                  <div>
                    <p className="text-lg font-bold text-slate-800">{importResult.total_rows}</p>
                    <p className="text-xs text-slate-500">Total Rows</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-emerald-600">{importResult.created}</p>
                    <p className="text-xs text-slate-500">New Created</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-blue-600">{importResult.updated}</p>
                    <p className="text-xs text-slate-500">Updated</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-amber-600">{importResult.skipped}</p>
                    <p className="text-xs text-slate-500">Skipped</p>
                  </div>
                </div>
                {importResult.errors?.length > 0 && (
                  <div className="mt-3 text-xs text-red-600">
                    {importResult.errors.slice(0, 5).map((e, i) => <p key={i}>{e}</p>)}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* CRM Sync Panel */}
        {activeMethod === 'crm' && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-1">Connect External CRM</h3>
            <p className="text-xs text-slate-500 mb-4">Pull contacts and leads from your existing CRM</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'zoho', name: 'Zoho CRM', icon: '🟢' },
                { id: 'hubspot', name: 'HubSpot', icon: '🟠' },
                { id: 'salesforce', name: 'Salesforce', icon: '🔵' },
                { id: 'pipedrive', name: 'Pipedrive', icon: '🟣' },
                { id: 'freshsales', name: 'Freshsales', icon: '🟡' },
                { id: 'custom', name: 'Custom CRM', icon: '⚙️' },
              ].map(crm => (
                <button key={crm.id} onClick={() => handleCRMConnect(crm.id)}
                  className="flex items-center gap-3 p-4 border-2 border-slate-200 rounded-xl hover:border-indigo-200 hover:bg-indigo-50 transition-all">
                  <span className="text-xl">{crm.icon}</span>
                  <div className="text-left">
                    <p className="text-sm font-medium text-slate-800">{crm.name}</p>
                    <p className="text-xs text-indigo-500 font-medium">Connect →</p>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Ad Sources Panel */}
        {activeMethod === 'ads' && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-1">Connect Ad Platforms</h3>
            <p className="text-xs text-slate-500 mb-4">Auto-import leads from your advertising campaigns</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'facebook', name: 'Facebook Lead Ads', icon: '📘' },
                { id: 'google', name: 'Google Ads', icon: '🔍' },
                { id: 'indiamart', name: 'IndiaMart', icon: '🏪' },
                { id: 'justdial', name: 'JustDial', icon: '📍' },
                { id: 'linkedin', name: 'LinkedIn', icon: '💼' },
                { id: 'website', name: 'Website Form', icon: '🌐' },
              ].map(ad => (
                <button key={ad.id} onClick={() => handleAdConnect(ad.id)}
                  className="flex items-center gap-3 p-4 border-2 border-slate-200 rounded-xl hover:border-blue-200 hover:bg-blue-50 transition-all">
                  <span className="text-xl">{ad.icon}</span>
                  <div className="text-left">
                    <p className="text-sm font-medium text-slate-800">{ad.name}</p>
                    <p className="text-xs text-blue-500 font-medium">Enable →</p>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
