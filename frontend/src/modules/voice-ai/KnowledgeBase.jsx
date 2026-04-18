/**
 * Knowledge Base — 3-level scoped training data
 *
 * Scopes:
 *   Global   → shared by ALL agents & campaigns in the tenant
 *   Campaign → shared by all agents WITHIN a campaign
 *   Agent    → private to one specific agent
 *
 * Input methods: Manual text · PDF · DOCX · TXT · CSV · Excel · URL scrape
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  BookOpen, Plus, Search, FileText, HelpCircle, ShoppingBag, ScrollText,
  Trash2, Upload, Loader2, X, Bot, UploadCloud, CheckCircle2, AlertCircle,
  ChevronDown, Globe, Megaphone, Link, Table,
} from 'lucide-react';
import { usePermissions } from '../../hooks/usePermissions';
import { voiceAgentAPI, agentsAPI, campaignsAPI } from '../../services/api';

// ─── constants ────────────────────────────────────────────────────────────────

const DOC_TYPES = [
  { id: 'document',        label: 'Document',  icon: FileText,    color: 'text-blue-500',    bg: 'bg-blue-50' },
  { id: 'faq',             label: 'FAQ',        icon: HelpCircle,  color: 'text-emerald-500', bg: 'bg-emerald-50' },
  { id: 'product_catalog', label: 'Catalog',    icon: ShoppingBag, color: 'text-amber-500',   bg: 'bg-amber-50' },
  { id: 'script',          label: 'Script',     icon: ScrollText,  color: 'text-purple-500',  bg: 'bg-purple-50' },
];

const SCOPES = [
  { id: 'global',   label: 'Global',   icon: Globe,      color: 'text-emerald-600', bg: 'bg-emerald-50',  border: 'border-emerald-200', desc: 'All agents & campaigns' },
  { id: 'campaign', label: 'Campaign', icon: Megaphone,  color: 'text-blue-600',    bg: 'bg-blue-50',     border: 'border-blue-200',    desc: 'All agents in a campaign' },
  { id: 'agent',    label: 'Agent',    icon: Bot,        color: 'text-indigo-600',  bg: 'bg-indigo-50',   border: 'border-indigo-200',  desc: 'Single agent only' },
];

const ACCEPTED_EXTS = ['.pdf', '.docx', '.txt', '.csv', '.xlsx', '.xls'];

function scopeInfo(s) { return SCOPES.find(x => x.id === s) || SCOPES[2]; }
function typeInfo(t)  { return DOC_TYPES.find(x => x.id === t) || DOC_TYPES[0]; }

// ─── tiny components ─────────────────────────────────────────────────────────

function Dropdown({ label, icon: Icon, iconClass, value, options, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const selected = options.find(o => o.id === value);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-indigo-400 transition-colors min-w-[160px] justify-between"
      >
        <span className="flex items-center gap-1.5 truncate">
          {Icon && <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${iconClass || 'text-slate-400'}`} />}
          <span className="truncate">{selected?.name || selected?.label || placeholder || label}</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 bg-white rounded-xl border border-slate-200 shadow-lg py-1 min-w-[200px]">
          {options.map(o => (
            <button
              key={o.id ?? '__null__'}
              onClick={() => { onChange(o.id); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-slate-50 transition-colors ${value === o.id ? 'text-indigo-700 font-medium bg-indigo-50' : 'text-slate-700'}`}
            >
              {o.label || o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ScopePill({ scope }) {
  const s = scopeInfo(scope);
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${s.bg} ${s.color}`}>
      <Icon className="w-3 h-3" />{s.label}
    </span>
  );
}

function UploadItem({ file, progress, status, error }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-700 truncate">{file?.name || 'file'}</p>
        {status === 'uploading' && (
          <div className="mt-1 h-1 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        )}
        {status === 'error' && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
      </div>
      {status === 'done'      && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
      {status === 'error'     && <AlertCircle  className="w-4 h-4 text-red-500 flex-shrink-0" />}
      {status === 'uploading' && <Loader2      className="w-4 h-4 text-indigo-500 animate-spin flex-shrink-0" />}
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function KnowledgeBasePage() {
  const { can } = usePermissions();

  // ── data ──
  const [docs,     setDocs]     = useState([]);
  const [agents,   setAgents]   = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading,  setLoading]  = useState(true);

  // ── scope filter (top bar) ──
  const [filterScope,      setFilterScope]      = useState('all');  // all | global | campaign | agent
  const [filterCampaignId, setFilterCampaignId] = useState(null);
  const [filterAgentId,    setFilterAgentId]    = useState(null);
  const [filterDocType,    setFilterDocType]    = useState('all');
  const [search,           setSearch]           = useState('');

  // ── new-item scope (for add/upload) ──
  const [addScope,      setAddScope]      = useState('agent');
  const [addAgentId,    setAddAgentId]    = useState(null);
  const [addCampaignId, setAddCampaignId] = useState(null);

  // ── panels ──
  const [showAddModal,    setShowAddModal]    = useState(false);
  const [showUploadPanel, setShowUploadPanel] = useState(false);

  // ── manual-add form ──
  const [formTitle,    setFormTitle]    = useState('');
  const [formContent,  setFormContent]  = useState('');
  const [formDocType,  setFormDocType]  = useState('document');
  const [formQuestion, setFormQuestion] = useState('');
  const [formAnswer,   setFormAnswer]   = useState('');
  const [isAdding,     setIsAdding]     = useState(false);

  // ── upload queue ──
  const [uploads, setUploads] = useState([]);

  // ── URL scrape ──
  const [scrapeUrl,     setScrapeUrl]     = useState('');
  const [isScraping,    setIsScraping]    = useState(false);

  // ── load reference data ──
  useEffect(() => {
    agentsAPI.list()
      .then(({ data }) => setAgents(Array.isArray(data) ? data : (data?.agents ?? [])))
      .catch(() => {});
    campaignsAPI.getAll()
      .then(({ data }) => setCampaigns(Array.isArray(data) ? data : (data?.campaigns ?? [])))
      .catch(() => {});
  }, []);

  // ── load docs ──
  const loadDocs = useCallback(() => {
    setLoading(true);
    const params = {};
    if (filterScope !== 'all')    params.scope       = filterScope;
    if (filterCampaignId)         params.campaign_id = filterCampaignId;
    if (filterAgentId)            params.agent_id    = filterAgentId;
    if (filterDocType !== 'all')  params.doc_type    = filterDocType;

    voiceAgentAPI.listKnowledge(params)
      .then(({ data }) => { if (Array.isArray(data)) setDocs(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filterScope, filterCampaignId, filterAgentId, filterDocType]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  // ── search filter (client-side) ──
  const filtered = docs.filter(d => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return d.title?.toLowerCase().includes(q) || d.content?.toLowerCase().includes(q);
  });

  // ── counts ──
  const scopeCounts = { all: docs.length };
  SCOPES.forEach(s => { scopeCounts[s.id] = docs.filter(d => d.scope === s.id).length; });

  // ── manual add ──
  const handleAdd = async () => {
    if (!formTitle.trim() || !formContent.trim()) { toast.error('Title and content are required'); return; }
    setIsAdding(true);
    try {
      const payload = {
        title: formTitle, content: formContent, doc_type: formDocType,
        scope: addScope,
        agent_id: addScope === 'agent' ? addAgentId : undefined,
        campaign_id: addScope !== 'global' ? addCampaignId : undefined,
        ...(formDocType === 'faq' && { question: formQuestion, answer: formAnswer }),
      };
      const { data } = await voiceAgentAPI.addKnowledge(payload);
      const chunks = Array.isArray(data) ? data : [data];
      setDocs(prev => [...chunks, ...prev]);
      toast.success(`Added ${chunks.length} chunk(s)`);
    } catch {
      setDocs(prev => [{
        id: Date.now(), title: formTitle, doc_type: formDocType, content: formContent,
        scope: addScope, agent_id: addAgentId, campaign_id: addCampaignId,
        question: formDocType === 'faq' ? formQuestion : null,
        answer:   formDocType === 'faq' ? formAnswer   : null,
        chunk_index: 0, is_active: true, created_at: new Date().toISOString(),
      }, ...prev]);
      toast.success('Saved locally (offline mode)');
    }
    setFormTitle(''); setFormContent(''); setFormQuestion(''); setFormAnswer('');
    setShowAddModal(false); setIsAdding(false);
  };

  // ── file upload ──
  const uploadRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback((files) => {
    const validFiles = files.filter(f => ACCEPTED_EXTS.some(e => f.name.toLowerCase().endsWith(e)));
    if (validFiles.length < files.length) toast.error('Some files skipped — unsupported format');
    if (!validFiles.length) return;

    const newItems = validFiles.map(f => ({ file: f, progress: 0, status: 'uploading', error: null }));
    setUploads(prev => {
      const base = prev.length;
      newItems.forEach((item, idx) => {
        const i = base + idx;
        const fd = new FormData();
        fd.append('file', item.file);
        fd.append('doc_type', formDocType);
        fd.append('scope', addScope);
        if (addAgentId && addScope === 'agent')       fd.append('agent_id', addAgentId);
        if (addCampaignId && addScope !== 'global')   fd.append('campaign_id', addCampaignId);

        voiceAgentAPI.uploadKnowledge(fd, (ev) => {
          const pct = Math.round((ev.loaded / ev.total) * 100);
          setUploads(p => p.map((u, j) => j === i ? { ...u, progress: pct } : u));
        })
          .then(({ data }) => {
            setUploads(p => p.map((u, j) => j === i ? { ...u, status: 'done', progress: 100 } : u));
            toast.success(`"${data.title}" — ${data.chunks} chunk(s)`);
            loadDocs();
          })
          .catch(err => {
            const msg = err.response?.data?.detail || 'Upload failed';
            setUploads(p => p.map((u, j) => j === i ? { ...u, status: 'error', error: msg } : u));
          });
      });
      return [...prev, ...newItems];
    });
  }, [formDocType, addScope, addAgentId, addCampaignId, loadDocs]);

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    handleFiles(Array.from(e.dataTransfer.files));
  };

  // ── URL scrape ──
  const handleScrape = async () => {
    if (!scrapeUrl.trim()) { toast.error('Enter a URL'); return; }
    setIsScraping(true);
    try {
      const fd = new FormData();
      fd.append('url', scrapeUrl.trim());
      fd.append('doc_type', formDocType);
      fd.append('scope', addScope);
      if (addAgentId && addScope === 'agent')       fd.append('agent_id', addAgentId);
      if (addCampaignId && addScope !== 'global')   fd.append('campaign_id', addCampaignId);
      const { data } = await voiceAgentAPI.scrapeUrl(fd);
      toast.success(`Scraped "${data.title}" — ${data.chunks} chunk(s)`);
      setScrapeUrl('');
      loadDocs();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Scrape failed');
    } finally {
      setIsScraping(false);
    }
  };

  // ── delete ──
  const handleDelete = async (docId) => {
    try { await voiceAgentAPI.deleteKnowledge(docId); } catch { /* offline */ }
    setDocs(prev => prev.filter(d => d.id !== docId));
    toast.success('Removed');
  };

  // ── scope tab bar ──
  const scopeTabs = [
    { id: 'all', label: 'All', count: scopeCounts.all },
    ...SCOPES.map(s => ({ id: s.id, label: s.label, count: scopeCounts[s.id] || 0, icon: s.icon })),
  ];

  // ── campaign / agent options for dropdowns ──
  const campaignOptions = [{ id: null, label: '— None —' }, ...campaigns.map(c => ({ id: String(c.id), label: c.name }))];
  const agentOptions    = [{ id: null, label: '— None —' }, ...agents.map(a => ({ id: String(a.id), label: a.name }))];

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-indigo-500" /> Knowledge Base
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Train your AI agents with scoped documents, FAQs, and scripts</p>
        </div>
        {can('voiceAI', 'create') && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowUploadPanel(o => !o)}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:border-indigo-400 hover:text-indigo-700 transition-colors">
              <Upload className="w-4 h-4" /> Upload / Scrape
            </button>
            <button onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
              <Plus className="w-4 h-4" /> Add Text
            </button>
          </div>
        )}
      </div>

      {/* ── Scope cards ── */}
      <div className="grid grid-cols-3 gap-3">
        {SCOPES.map(s => {
          const Icon = s.icon;
          return (
            <button key={s.id}
              onClick={() => setFilterScope(filterScope === s.id ? 'all' : s.id)}
              className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${
                filterScope === s.id ? `${s.bg} ${s.border} ring-1 ring-offset-1 ${s.border}` : 'bg-white border-slate-200 hover:border-slate-300'
              }`}>
              <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-800">{s.label}</p>
                  <span className={`text-xs font-bold ${s.color}`}>{scopeCounts[s.id] || 0}</span>
                </div>
                <p className="text-xs text-slate-400 truncate">{s.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Scope tabs */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {scopeTabs.map(t => (
            <button key={t.id} onClick={() => setFilterScope(t.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filterScope === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        {/* Campaign filter */}
        <Dropdown
          label="Campaign" icon={Megaphone} iconClass="text-blue-400"
          value={filterCampaignId}
          options={campaignOptions}
          onChange={setFilterCampaignId}
          placeholder="All Campaigns"
        />

        {/* Agent filter */}
        <Dropdown
          label="Agent" icon={Bot} iconClass="text-indigo-400"
          value={filterAgentId}
          options={agentOptions}
          onChange={setFilterAgentId}
          placeholder="All Agents"
        />

        {/* Doc type filter */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          <button onClick={() => setFilterDocType('all')}
            className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${filterDocType === 'all' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
            All
          </button>
          {DOC_TYPES.map(t => (
            <button key={t.id} onClick={() => setFilterDocType(filterDocType === t.id ? 'all' : t.id)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${filterDocType === t.id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 w-44" />
        </div>
      </div>

      {/* ── Upload / Scrape Panel ── */}
      {showUploadPanel && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          {/* Panel header with scope selector */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Upload className="w-4 h-4 text-indigo-500" /> Upload Files &amp; Scrape URLs
            </h3>
            <button onClick={() => setShowUploadPanel(false)} className="p-1 hover:bg-slate-100 rounded-lg">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {/* Scope assignment row */}
          <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <span className="text-xs font-medium text-slate-500 mr-1">Assign to:</span>
            {SCOPES.map(s => (
              <button key={s.id} onClick={() => setAddScope(s.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  addScope === s.id ? `${s.bg} ${s.color} ${s.border}` : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}>
                <s.icon className="w-3.5 h-3.5" />{s.label}
              </button>
            ))}
            {addScope !== 'global' && (
              <Dropdown label="Campaign" icon={Megaphone} iconClass="text-blue-400"
                value={addCampaignId} options={campaignOptions} onChange={setAddCampaignId} placeholder="Pick Campaign" />
            )}
            {addScope === 'agent' && (
              <Dropdown label="Agent" icon={Bot} iconClass="text-indigo-400"
                value={addAgentId} options={agentOptions} onChange={setAddAgentId} placeholder="Pick Agent" />
            )}
            <select value={formDocType} onChange={e => setFormDocType(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 ml-auto">
              {DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>

          {/* Drag-drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => uploadRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${
              dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
            }`}
          >
            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
              <UploadCloud className="w-6 h-6 text-indigo-500" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-700">Drag &amp; drop or <span className="text-indigo-600">browse</span></p>
              <p className="text-xs text-slate-400 mt-0.5">PDF · DOCX · TXT · CSV · Excel</p>
            </div>
            <input ref={uploadRef} type="file" multiple accept={ACCEPTED_EXTS.join(',')}
              onChange={e => handleFiles(Array.from(e.target.files || []))} className="hidden" />
          </div>

          {/* URL scrape row */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="url" placeholder="https://yourwebsite.com/page-to-scrape"
                value={scrapeUrl} onChange={e => setScrapeUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleScrape()}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white" />
            </div>
            <button onClick={handleScrape} disabled={isScraping || !scrapeUrl.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {isScraping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
              Scrape URL
            </button>
          </div>

          {/* Upload progress list */}
          {uploads.length > 0 && (
            <div className="divide-y divide-slate-100">
              {uploads.map((u, i) => <UploadItem key={i} {...u} />)}
              {uploads.some(u => u.status !== 'uploading') && (
                <button onClick={() => setUploads(p => p.filter(u => u.status === 'uploading'))}
                  className="pt-2 text-xs text-slate-400 hover:text-slate-600">Clear completed</button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Document list ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /><span className="text-sm">Loading…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <BookOpen className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm font-medium">No documents found</p>
          <p className="text-xs mt-1">Upload files or add text to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(doc => {
            const ti = typeInfo(doc.doc_type);
            const Icon = ti.icon;
            const agentName    = agents.find(a => String(a.id) === String(doc.agent_id))?.name;
            const campaignName = campaigns.find(c => String(c.id) === String(doc.campaign_id))?.name;
            return (
              <div key={doc.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3.5 hover:border-indigo-200 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`w-9 h-9 rounded-lg ${ti.bg} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-4 h-4 ${ti.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-medium text-slate-900">{doc.title}</h3>
                        <ScopePill scope={doc.scope || 'agent'} />
                        {campaignName && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 text-xs rounded">
                            <Megaphone className="w-3 h-3" />{campaignName}
                          </span>
                        )}
                        {agentName && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded">
                            <Bot className="w-3 h-3" />{agentName}
                          </span>
                        )}
                      </div>
                      {doc.doc_type === 'faq' && doc.question && (
                        <p className="text-xs text-emerald-600 mt-0.5">Q: {doc.question}</p>
                      )}
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{doc.content}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                        <span className={`px-1.5 py-0.5 ${ti.bg} ${ti.color} rounded`}>{ti.label}</span>
                        {doc.chunk_index > 0 && <span>Chunk {doc.chunk_index + 1}</span>}
                        <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  {can('voiceAI', 'delete') && (
                    <button onClick={() => handleDelete(doc.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add Text Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-900">Add to Knowledge Base</h2>
              <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Scope selector */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Scope</label>
                <div className="flex gap-2">
                  {SCOPES.map(s => (
                    <button key={s.id} onClick={() => setAddScope(s.id)}
                      className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                        addScope === s.id ? `${s.bg} ${s.color} ${s.border}` : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}>
                      <s.icon className="w-4 h-4" />{s.label}
                    </button>
                  ))}
                </div>
              </div>

              {addScope !== 'global' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Campaign</label>
                  <select value={addCampaignId || ''} onChange={e => setAddCampaignId(e.target.value || null)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900">
                    <option value="">— Select Campaign —</option>
                    {campaigns.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                  </select>
                </div>
              )}

              {addScope === 'agent' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Agent</label>
                  <select value={addAgentId || ''} onChange={e => setAddAgentId(e.target.value || null)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900">
                    <option value="">— Select Agent —</option>
                    {agents.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                <select value={formDocType} onChange={e => setFormDocType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900">
                  {DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                <input type="text" value={formTitle} onChange={e => setFormTitle(e.target.value)}
                  placeholder="e.g. Product FAQ" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900" />
              </div>

              {formDocType === 'faq' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Question</label>
                    <input type="text" value={formQuestion} onChange={e => setFormQuestion(e.target.value)}
                      placeholder="What products do you offer?" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Answer</label>
                    <textarea value={formAnswer} onChange={e => setFormAnswer(e.target.value)} rows={3}
                      placeholder="We offer…" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 resize-none" />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Content</label>
                <textarea value={formContent} onChange={e => setFormContent(e.target.value)} rows={5}
                  placeholder="Paste your content here…" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 resize-none" />
              </div>

              <button onClick={handleAdd} disabled={isAdding}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add to Knowledge Base
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
