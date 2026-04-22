/**
 * CRM Contacts Page
 * - List all contacts/leads with search, filter, pagination
 * - CSV import button
 * - Pipeline view toggle
 * - Click to view lead details
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Users, Search, Plus, Upload, Download, Filter, ChevronDown,
  Phone, Mail, Building2, MapPin, Star, MoreHorizontal, Trash2,
  FileUp, ArrowUpDown, Eye, Edit2, Loader2, X, Tag, TrendingUp,
  UserPlus, Globe, Megaphone, ShoppingBag, RefreshCw,
} from 'lucide-react';
import { crmLeadsAPI } from '../../../services/api';
import LeadDetailDrawer from '../components/LeadDetailDrawer';

const STATUS_COLORS = {
  new: 'bg-blue-100 text-blue-700 border-blue-200',
  contacted: 'bg-amber-100 text-amber-700 border-amber-200',
  nurturing: 'bg-purple-100 text-purple-700 border-purple-200',
  converted: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  lost: 'bg-red-100 text-red-700 border-red-200',
};

const DISPOSITION_LABELS = {
  follow_up: 'Follow Up',
  not_interested: 'Not Interested',
  wrong_enquiry: 'Wrong Enquiry',
  callback: 'Callback',
  site_visit: 'Site Visit',
  quotation_sent: 'Quotation Sent',
  negotiation: 'Negotiation',
  booked: 'Booked',
  dnc: 'DNC',
};

const DISPOSITION_COLORS = {
  follow_up: 'bg-blue-50 text-blue-600',
  not_interested: 'bg-red-50 text-red-600',
  wrong_enquiry: 'bg-orange-50 text-orange-600',
  callback: 'bg-amber-50 text-amber-600',
  site_visit: 'bg-teal-50 text-teal-600',
  quotation_sent: 'bg-indigo-50 text-indigo-600',
  negotiation: 'bg-purple-50 text-purple-600',
  booked: 'bg-emerald-50 text-emerald-600',
  dnc: 'bg-gray-50 text-gray-600',
};

const QUAL_COLORS = {
  cold: 'bg-slate-100 text-slate-600',
  warm: 'bg-amber-100 text-amber-700',
  hot: 'bg-red-100 text-red-700',
  qualified: 'bg-emerald-100 text-emerald-700',
  disqualified: 'bg-gray-100 text-gray-500',
};

const SOURCE_ICONS = {
  manual: UserPlus, csv: FileUp, voiceflow: Phone, facebook: Globe,
  google: Globe, indiamart: ShoppingBag, justdial: MapPin,
  zoho: Building2, hubspot: Building2, webhook: Globe,
};

export default function CrmContactsPage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(25);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [dispositionFilter, setDispositionFilter] = useState('');
  const [pipeline, setPipeline] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showAddLead, setShowAddLead] = useState(false);
  const [addingLead, setAddingLead] = useState(false);
  const [newLead, setNewLead] = useState({ name: '', phone: '', email: '', business_name: '', location_city: '', business_type: '', source: 'manual' });
  const [selectedLeadId, setSelectedLeadId] = useState(null);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, per_page: perPage };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (sourceFilter) params.source = sourceFilter;
      if (dispositionFilter) params.disposition = dispositionFilter;
      const { data } = await crmLeadsAPI.list(params);
      setLeads(data.leads || []);
      setTotal(data.total || 0);
    } catch {
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [page, perPage, search, statusFilter, sourceFilter, dispositionFilter]);

  const loadPipeline = useCallback(async () => {
    try {
      const { data } = await crmLeadsAPI.pipeline();
      setPipeline(data);
    } catch {}
  }, []);

  useEffect(() => { loadLeads(); loadPipeline(); }, [loadLeads, loadPipeline]);

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('source', 'csv');
      const { data } = await crmLeadsAPI.importCSV(fd);
      toast.success(`Imported: ${data.created} new, ${data.updated} updated, ${data.skipped} skipped`);
      loadLeads();
      loadPipeline();
      setShowImport(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    try {
      const response = await crmLeadsAPI.exportCSV();
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'leads_export.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV exported');
    } catch {
      toast.error('Export failed');
    }
  };

  const handleDelete = async (id) => {
    try {
      await crmLeadsAPI.delete(id);
      toast.success('Lead deleted');
      loadLeads();
      loadPipeline();
    } catch {
      toast.error('Delete failed');
    }
  };

  const handleAddLead = async () => {
    if (!newLead.name?.trim()) { toast.error('Name is required'); return; }
    if (!newLead.phone?.trim() && !newLead.email?.trim()) { toast.error('Phone or email required'); return; }
    setAddingLead(true);
    try {
      await crmLeadsAPI.capture({
        ...newLead,
        source: newLead.source || 'manual',
        consent_given: true,
        consent_source: 'manual_entry',
      });
      toast.success('Lead added!');
      setNewLead({ name: '', phone: '', email: '', business_name: '', location_city: '', business_type: '', source: 'manual' });
      setShowAddLead(false);
      loadLeads();
      loadPipeline();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add lead');
    } finally {
      setAddingLead(false);
    }
  };

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-500" /> Leads
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {total} total leads from all sources
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600">
            <Upload className="w-4 h-4" /> Import CSV
          </button>
          <button onClick={() => setShowAddLead(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium">
            <Plus className="w-4 h-4" /> Add Lead
          </button>
        </div>
      </div>

      {/* Add Lead Modal */}
      <AnimatePresence>
        {showAddLead && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">Add New Lead</h3>
              <button onClick={() => setShowAddLead(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Name <span className="text-red-500">*</span></label>
                <input type="text" value={newLead.name} onChange={e => setNewLead(p => ({ ...p, name: e.target.value }))}
                  placeholder="John Doe" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Phone</label>
                <input type="text" value={newLead.phone} onChange={e => setNewLead(p => ({ ...p, phone: e.target.value }))}
                  placeholder="+91 98765 43210" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                <input type="email" value={newLead.email} onChange={e => setNewLead(p => ({ ...p, email: e.target.value }))}
                  placeholder="john@company.com" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Business Name</label>
                <input type="text" value={newLead.business_name} onChange={e => setNewLead(p => ({ ...p, business_name: e.target.value }))}
                  placeholder="Acme Corp" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">City</label>
                <input type="text" value={newLead.location_city} onChange={e => setNewLead(p => ({ ...p, location_city: e.target.value }))}
                  placeholder="Chennai" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Business Type</label>
                <input type="text" value={newLead.business_type} onChange={e => setNewLead(p => ({ ...p, business_type: e.target.value }))}
                  placeholder="Real Estate" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowAddLead(false)}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleAddLead} disabled={addingLead}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50">
                {addingLead ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {addingLead ? 'Adding...' : 'Add Lead'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pipeline Stats */}
      {pipeline && (
        <div className="grid grid-cols-6 gap-3">
          {[
            { key: 'new', label: 'New', color: 'border-blue-400 bg-blue-50' },
            { key: 'contacted', label: 'Contacted', color: 'border-amber-400 bg-amber-50' },
            { key: 'nurturing', label: 'Nurturing', color: 'border-purple-400 bg-purple-50' },
            { key: 'converted', label: 'Converted', color: 'border-emerald-400 bg-emerald-50' },
            { key: 'lost', label: 'Lost', color: 'border-red-400 bg-red-50' },
            { key: 'total', label: 'Total', color: 'border-slate-400 bg-slate-50' },
          ].map(s => (
            <button key={s.key}
              onClick={() => { setStatusFilter(statusFilter === s.key && s.key !== 'total' ? '' : s.key === 'total' ? '' : s.key); setDispositionFilter(''); setPage(1); }}
              className={`p-3 rounded-xl border-l-4 ${s.color} ${statusFilter === s.key && !dispositionFilter ? 'ring-2 ring-indigo-300' : ''} transition-all hover:shadow-sm cursor-pointer`}>
              <p className="text-2xl font-bold text-slate-800">{pipeline[s.key] || 0}</p>
              <p className="text-xs text-slate-500 font-medium">{s.label}</p>
            </button>
          ))}
        </div>
      )}

      {/* Disposition Tabs */}
      {pipeline?.dispositions && (
        <div className="flex gap-2 flex-wrap">
          {[
            { key: 'follow_up', label: 'Follow Up', color: 'bg-blue-50 text-blue-700 border-blue-200' },
            { key: 'callback', label: 'Callback', color: 'bg-amber-50 text-amber-700 border-amber-200' },
            { key: 'site_visit', label: 'Site Visit', color: 'bg-teal-50 text-teal-700 border-teal-200' },
            { key: 'quotation_sent', label: 'Quotation Sent', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
            { key: 'negotiation', label: 'Negotiation', color: 'bg-purple-50 text-purple-700 border-purple-200' },
            { key: 'booked', label: 'Booked', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
            { key: 'unwanted', label: 'Unwanted', color: 'bg-red-50 text-red-700 border-red-200' },
          ].map(d => (
            <button key={d.key}
              onClick={() => { setDispositionFilter(dispositionFilter === d.key ? '' : d.key); setStatusFilter(''); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${d.color} ${dispositionFilter === d.key ? 'ring-2 ring-indigo-300 shadow-sm' : 'opacity-80 hover:opacity-100'} transition-all`}>
              {d.label} <span className="ml-1 font-bold">{pipeline.dispositions[d.key] || 0}</span>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Search by name, phone, email, business..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-800" />
        </div>
        <select value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(1); }}
          className="px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-600">
          <option value="">All Sources</option>
          <option value="manual">Manual</option>
          <option value="csv">CSV Import</option>
          <option value="voiceflow">VoiceFlow</option>
          <option value="facebook">Facebook</option>
          <option value="google">Google</option>
          <option value="indiamart">IndiaMart</option>
          <option value="justdial">JustDial</option>
          <option value="zoho">Zoho</option>
          <option value="hubspot">HubSpot</option>
        </select>
        <button onClick={() => { loadLeads(); loadPipeline(); }}
          className="p-2.5 border border-slate-200 rounded-xl hover:bg-slate-50">
          <RefreshCw className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      {/* Import Modal */}
      <AnimatePresence>
        {showImport && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">Import Contacts from CSV</h3>
              <button onClick={() => setShowImport(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              CSV should have columns: Name, Phone/Mobile, Email, Company, City, State, Source
            </p>
            <label className="flex flex-col items-center gap-2 p-8 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-indigo-300">
              {importing ? <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /> : <FileUp className="w-6 h-6 text-indigo-500" />}
              <span className="text-sm text-slate-600">{importing ? 'Importing...' : 'Click to select CSV file'}</span>
              <input type="file" accept=".csv,.txt" onChange={handleImport} className="hidden" disabled={importing} />
            </label>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Leads Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400 mr-2" />
            <span className="text-sm text-slate-500">Loading...</span>
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Users className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium text-slate-500">No contacts yet</p>
            <p className="text-xs mt-1">Import from CSV or connect an external CRM</p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Contact</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Business</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Source</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Score</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Tags</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {leads.map(lead => {
                  const SourceIcon = SOURCE_ICONS[lead.source] || Globe;
                  return (
                    <tr key={lead.id} onClick={() => setSelectedLeadId(lead.id)}
                      className="border-b border-slate-50 hover:bg-indigo-50/50 transition-colors cursor-pointer">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{lead.name || '—'}</p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                          {lead.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{lead.phone}</span>}
                          {lead.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{lead.email}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-slate-700 text-xs">{lead.business_name || '—'}</p>
                        {lead.location_city && (
                          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" />{lead.location_city}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-xs font-medium">
                          <SourceIcon className="w-3 h-3" />{lead.source}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium border ${STATUS_COLORS[lead.status] || 'bg-slate-100 text-slate-600'}`}>
                          {lead.status}
                        </span>
                        <span className={`ml-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${QUAL_COLORS[lead.qualification] || ''}`}>
                          {lead.qualification}
                        </span>
                        {lead.disposition && (
                          <span className={`ml-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${DISPOSITION_COLORS[lead.disposition] || 'bg-slate-50 text-slate-500'}`}>
                            {DISPOSITION_LABELS[lead.disposition] || lead.disposition}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${lead.lead_score >= 70 ? 'bg-emerald-500' : lead.lead_score >= 40 ? 'bg-amber-500' : 'bg-slate-300'}`}
                              style={{ width: `${lead.lead_score}%` }} />
                          </div>
                          <span className="text-xs font-medium text-slate-600">{lead.lead_score}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {(lead.tags || []).slice(0, 2).map(t => (
                            <span key={t} className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[10px] font-medium">{t}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {lead.phone && (
                            <a href={`tel:${lead.phone}`} onClick={e => e.stopPropagation()}
                              className="p-1.5 rounded-lg text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Call">
                              <Phone className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {lead.phone && (
                            <a href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="p-1.5 rounded-lg text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 transition-colors" title="WhatsApp">
                              <Globe className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button onClick={e => { e.stopPropagation(); handleDelete(lead.id); }}
                            className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                <p className="text-xs text-slate-400">
                  Page {page} of {totalPages} ({total} total)
                </p>
                <div className="flex gap-1">
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                    className="px-3 py-1 text-xs border border-slate-200 rounded-lg disabled:opacity-30">Prev</button>
                  <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                    className="px-3 py-1 text-xs border border-slate-200 rounded-lg disabled:opacity-30">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Lead Detail Drawer */}
      {selectedLeadId && (
        <LeadDetailDrawer
          leadId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
          onUpdate={() => { loadLeads(); loadPipeline(); }}
        />
      )}
    </div>
  );
}
