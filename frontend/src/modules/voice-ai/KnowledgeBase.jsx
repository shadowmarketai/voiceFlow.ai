/**
 * Knowledge Base — scope-first flow
 *
 * Layout:
 *  1. Header
 *  2. Step 1: Assign To — scope picker (Global / Campaign / Agent)
 *     → must select scope (and agent/campaign if applicable) before uploading
 *  3. Step 2: Add Knowledge — 3 method cards (Upload · Scrape · Write)
 *     → disabled until scope assignment is complete
 *  4. Your Documents — filter tabs + document list
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  BookOpen, FileUp, Globe, PenLine, Search, FileText, HelpCircle,
  ShoppingBag, ScrollText, Trash2, Loader2, X, Bot, UploadCloud,
  CheckCircle2, AlertCircle, ChevronDown, Megaphone, Link,
  Plus, ArrowRight, File, FileSpreadsheet,
} from 'lucide-react';
import { voiceAgentAPI, agentsAPI, campaignsAPI } from '../../services/api';

// ─── constants ────────────────────────────────────────────────────────────────

const DOC_TYPES = [
  { id: 'document',        label: 'Document',  icon: FileText,    color: 'text-blue-500',    bg: 'bg-blue-50' },
  { id: 'faq',             label: 'FAQ',        icon: HelpCircle,  color: 'text-emerald-500', bg: 'bg-emerald-50' },
  { id: 'product_catalog', label: 'Catalog',    icon: ShoppingBag, color: 'text-amber-500',   bg: 'bg-amber-50' },
  { id: 'script',          label: 'Script',     icon: ScrollText,  color: 'text-purple-500',  bg: 'bg-purple-50' },
];

const SCOPES = [
  {
    id: 'global',
    label: 'Global',
    icon: Globe,
    color: 'text-emerald-600',
    activeBg: 'bg-emerald-50 border-emerald-300',
    dot: 'bg-emerald-500',
    desc: 'All agents & campaigns can use this',
  },
  {
    id: 'campaign',
    label: 'Campaign',
    icon: Megaphone,
    color: 'text-blue-600',
    activeBg: 'bg-blue-50 border-blue-300',
    dot: 'bg-blue-500',
    desc: 'All agents within a specific campaign',
  },
  {
    id: 'agent',
    label: 'Agent',
    icon: Bot,
    color: 'text-indigo-600',
    activeBg: 'bg-indigo-50 border-indigo-300',
    dot: 'bg-indigo-500',
    desc: 'One specific agent only',
  },
];

const ACCEPTED = ['.pdf', '.docx', '.txt', '.csv', '.xlsx', '.xls'];
const FILE_ICONS = { pdf: FileText, xlsx: FileSpreadsheet, xls: FileSpreadsheet, csv: FileSpreadsheet, docx: File, txt: File };

function fileIcon(name) {
  const ext = (name || '').split('.').pop()?.toLowerCase();
  return FILE_ICONS[ext] || File;
}
function scopeOf(s) { return SCOPES.find(x => x.id === s) || SCOPES[2]; }
function typeOf(t)  { return DOC_TYPES.find(x => x.id === t) || DOC_TYPES[0]; }

// ─── small reusables ─────────────────────────────────────────────────────────

function ScopeBadge({ scope }) {
  const s = scopeOf(scope);
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium ${s.activeBg} ${s.color} border`}>
      <Icon className="w-3 h-3" />{s.label}
    </span>
  );
}

function UploadRow({ file, progress, status, error }) {
  const Icon = fileIcon(file?.name);
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-700 truncate">{file?.name}</p>
        {status === 'uploading' && (
          <div className="mt-1 h-1 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        {status === 'error' && <p className="text-[11px] text-red-500 mt-0.5">{error}</p>}
      </div>
      <span className="flex-shrink-0">
        {status === 'done'      && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        {status === 'error'     && <AlertCircle  className="w-4 h-4 text-red-500" />}
        {status === 'uploading' && <Loader2      className="w-4 h-4 text-indigo-400 animate-spin" />}
      </span>
    </div>
  );
}

// ─── scope readiness check ───────────────────────────────────────────────────

function isScopeReady(scope, agentId, campaignId) {
  if (scope === 'global') return true;
  if (scope === 'campaign') return !!campaignId;
  if (scope === 'agent') return !!agentId;
  return false;
}

function scopeReadyLabel(scope, agentId, campaignId, agents, campaigns) {
  if (scope === 'global') return 'Global — all agents will access this knowledge';
  if (scope === 'campaign' && campaignId) {
    const name = campaigns.find(c => String(c.id) === String(campaignId))?.name || 'Selected campaign';
    return `Campaign: ${name}`;
  }
  if (scope === 'agent' && agentId) {
    const name = agents.find(a => String(a.id) === String(agentId))?.name || 'Selected agent';
    return `Agent: ${name}`;
  }
  return null;
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function KnowledgeBasePage() {
  // ── data ──
  const [docs,      setDocs]      = useState([]);
  const [agents,    setAgents]    = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading,   setLoading]   = useState(true);

  // ── active method panel: null | 'upload' | 'scrape' | 'text' ──
  const [activeMethod, setActiveMethod] = useState(null);

  // ── shared scope state for all methods ──
  const [scope,      setScope]      = useState('global');
  const [agentId,    setAgentId]    = useState(null);
  const [campaignId, setCampaignId] = useState(null);
  const [docType,    setDocType]    = useState('document');

  // ── filter ──
  const [filterScope, setFilterScope] = useState('all');
  const [filterType,  setFilterType]  = useState('all');
  const [search,      setSearch]      = useState('');

  // ── upload ──
  const [uploads,  setUploads]  = useState([]);
  const [dragging, setDragging] = useState(false);
  const uploadRef = useRef(null);

  // ── scrape ──
  const [scrapeUrl,  setScrapeUrl]  = useState('');
  const [isScraping, setIsScraping] = useState(false);

  // ── text form ──
  const [formTitle,    setFormTitle]    = useState('');
  const [formContent,  setFormContent]  = useState('');
  const [formQuestion, setFormQuestion] = useState('');
  const [formAnswer,   setFormAnswer]   = useState('');
  const [isAdding,     setIsAdding]     = useState(false);

  // ── load ──
  useEffect(() => {
    agentsAPI.list()
      .then(({ data }) => setAgents(Array.isArray(data) ? data : (data?.agents ?? [])))
      .catch(() => {});
    campaignsAPI.getAll()
      .then(({ data }) => setCampaigns(Array.isArray(data) ? data : (data?.campaigns ?? [])))
      .catch(() => {});
  }, []);

  const loadDocs = useCallback(() => {
    setLoading(true);
    const params = {};
    if (filterScope !== 'all') params.scope = filterScope;
    if (filterType  !== 'all') params.doc_type = filterType;
    voiceAgentAPI.listKnowledge(params)
      .then(({ data }) => { if (Array.isArray(data)) setDocs(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filterScope, filterType]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const filtered = docs.filter(d => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return d.title?.toLowerCase().includes(q) || d.content?.toLowerCase().includes(q);
  });

  // ── toggle method ──
  const toggleMethod = (m) => setActiveMethod(prev => prev === m ? null : m);

  // ── file upload ──
  const handleFiles = useCallback((files) => {
    const valid = files.filter(f => ACCEPTED.some(e => f.name.toLowerCase().endsWith(e)));
    if (!valid.length) { toast.error('Unsupported file type'); return; }

    setUploads(prev => {
      const base = prev.length;
      valid.forEach((file, idx) => {
        const i = base + idx;
        const fd = new FormData();
        fd.append('file', file);
        fd.append('doc_type', docType);
        fd.append('scope', scope);
        if (agentId    && scope === 'agent')    fd.append('agent_id',    agentId);
        if (campaignId && scope !== 'global')   fd.append('campaign_id', campaignId);

        voiceAgentAPI.uploadKnowledge(fd, ev => {
          const pct = Math.round((ev.loaded / ev.total) * 100);
          setUploads(p => p.map((u, j) => j === i ? { ...u, progress: pct } : u));
        })
          .then(({ data }) => {
            setUploads(p => p.map((u, j) => j === i ? { ...u, status: 'done', progress: 100 } : u));
            toast.success(`"${data.title}" — ${data.chunks} chunk(s) added`);
            loadDocs();
          })
          .catch(err => {
            const msg = err.response?.data?.detail || 'Upload failed';
            setUploads(p => p.map((u, j) => j === i ? { ...u, status: 'error', error: msg } : u));
            toast.error(msg);
          });
      });
      return [...prev, ...valid.map(f => ({ file: f, progress: 0, status: 'uploading', error: null }))];
    });
  }, [docType, scope, agentId, campaignId, loadDocs]);

  const handleDrop = (e) => { e.preventDefault(); setDragging(false); handleFiles(Array.from(e.dataTransfer.files)); };

  // ── scrape ──
  const handleScrape = async () => {
    if (!scrapeUrl.trim()) { toast.error('Enter a URL'); return; }
    setIsScraping(true);
    try {
      const fd = new FormData();
      fd.append('url', scrapeUrl.trim());
      fd.append('doc_type', docType);
      fd.append('scope', scope);
      if (agentId    && scope === 'agent')    fd.append('agent_id',    agentId);
      if (campaignId && scope !== 'global')   fd.append('campaign_id', campaignId);
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

  // ── manual add ──
  const handleAdd = async () => {
    if (!formTitle.trim() || !formContent.trim()) { toast.error('Title and content required'); return; }
    setIsAdding(true);
    try {
      const payload = {
        title: formTitle, content: formContent, doc_type: docType, scope,
        agent_id:    scope === 'agent'  ? agentId    : undefined,
        campaign_id: scope !== 'global' ? campaignId : undefined,
        ...(docType === 'faq' && { question: formQuestion, answer: formAnswer }),
      };
      const { data } = await voiceAgentAPI.addKnowledge(payload);
      const chunks = Array.isArray(data) ? data : [data];
      setDocs(prev => [...chunks, ...prev]);
      toast.success(`Added ${chunks.length} chunk(s)`);
      setFormTitle(''); setFormContent(''); setFormQuestion(''); setFormAnswer('');
      setActiveMethod(null);
    } catch {
      toast.error('Failed to save');
    } finally { setIsAdding(false); }
  };

  // ── delete ──
  const handleDelete = async (id) => {
    try { await voiceAgentAPI.deleteKnowledge(id); } catch { /* offline */ }
    setDocs(prev => prev.filter(d => d.id !== id));
    toast.success('Removed');
  };

  // ── scope / type counts ──
  const cnt = { all: docs.length, global: 0, campaign: 0, agent: 0 };
  docs.forEach(d => { if (cnt[d.scope] !== undefined) cnt[d.scope]++; });

  // ── method card config ──
  const METHODS = [
    {
      id: 'upload',
      icon: FileUp,
      iconBg: 'bg-indigo-100',
      iconColor: 'text-indigo-600',
      label: 'Upload Files',
      desc: 'PDF, Word, TXT, CSV, Excel',
      activeBorder: 'border-indigo-400 ring-1 ring-indigo-200',
    },
    {
      id: 'scrape',
      icon: Globe,
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      label: 'Website URL',
      desc: 'Paste a URL to auto-extract',
      activeBorder: 'border-blue-400 ring-1 ring-blue-200',
    },
    {
      id: 'text',
      icon: PenLine,
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600',
      label: 'Write / Paste Text',
      desc: 'Type or paste content & FAQs',
      activeBorder: 'border-purple-400 ring-1 ring-purple-200',
    },
  ];

  // ── scope readiness ──
  const scopeReady = isScopeReady(scope, agentId, campaignId);
  const readyLabel = scopeReadyLabel(scope, agentId, campaignId, agents, campaigns);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-5xl">

      {/* ── 1. Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-indigo-500" /> Knowledge Base
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Add documents, FAQs, and scripts to train your AI agents. First choose where this knowledge belongs, then add your content.
        </p>
      </div>

      {/* ── 2. Step 1: Assign To (SCOPE-FIRST) ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold">1</span>
            <p className="text-sm font-semibold text-slate-800">Choose where this knowledge belongs</p>
          </div>
          <p className="text-xs text-slate-400 mt-1 ml-8">Select scope and target before adding content</p>
        </div>

        <div className="px-6 py-5">
          {/* Scope buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            {SCOPES.map(s => {
              const Icon = s.icon;
              const active = scope === s.id;
              return (
                <button key={s.id} onClick={() => { setScope(s.id); setAgentId(null); setCampaignId(null); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    active ? `${s.activeBg} ${s.color} border-current` : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                  }`}>
                  <Icon className="w-4 h-4" />
                  {s.label}
                  {active && <span className="text-[10px] font-normal opacity-70">— {s.desc}</span>}
                </button>
              );
            })}
          </div>

          {/* Agent / Campaign dropdowns */}
          <div className="flex flex-wrap gap-3">
            {scope === 'campaign' && (
              <div className="flex-1 min-w-[220px]">
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Campaign <span className="text-red-500">*</span>
                </label>
                <select value={campaignId || ''} onChange={e => setCampaignId(e.target.value || null)}
                  className={`w-full px-3 py-2.5 text-sm border rounded-xl bg-white text-slate-800 transition-colors ${
                    !campaignId ? 'border-amber-300 ring-1 ring-amber-100' : 'border-slate-200'
                  }`}>
                  <option value="">— Select campaign —</option>
                  {campaigns.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                </select>
                {!campaignId && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Select a campaign to continue
                  </p>
                )}
              </div>
            )}
            {scope === 'agent' && (
              <div className="flex-1 min-w-[220px]">
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Agent <span className="text-red-500">*</span>
                </label>
                <select value={agentId || ''} onChange={e => setAgentId(e.target.value || null)}
                  className={`w-full px-3 py-2.5 text-sm border rounded-xl bg-white text-slate-800 transition-colors ${
                    !agentId ? 'border-amber-300 ring-1 ring-amber-100' : 'border-slate-200'
                  }`}>
                  <option value="">— Select agent —</option>
                  {agents.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
                </select>
                {!agentId && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Select an agent to continue
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Ready indicator */}
          {scopeReady && readyLabel && (
            <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <p className="text-xs font-medium text-emerald-700">{readyLabel}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── 3. Step 2: Add Knowledge (gated on scope) ── */}
      <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
        scopeReady ? 'border-slate-200 opacity-100' : 'border-slate-100 opacity-50 pointer-events-none'
      }`}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
              scopeReady ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-400'
            }`}>2</span>
            <div>
              <p className="text-sm font-semibold text-slate-800">Add Knowledge</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {scopeReady ? 'Choose how you want to add information' : 'Complete Step 1 first'}
              </p>
            </div>
          </div>
          {/* Doc type selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Type:</span>
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              {DOC_TYPES.map(t => (
                <button key={t.id} onClick={() => setDocType(t.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    docType === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Method cards */}
        <div className="grid grid-cols-3 gap-4 p-6">
          {METHODS.map(m => {
            const Icon = m.icon;
            const active = activeMethod === m.id;
            return (
              <button key={m.id} onClick={() => toggleMethod(m.id)}
                className={`flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all text-center cursor-pointer ${
                  active ? m.activeBorder + ' bg-slate-50' : 'border-slate-200 hover:border-slate-300 bg-white hover:shadow-sm'
                }`}>
                <div className={`w-12 h-12 rounded-xl ${m.iconBg} flex items-center justify-center`}>
                  <Icon className={`w-6 h-6 ${m.iconColor}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{m.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{m.desc}</p>
                </div>
                <div className={`text-xs font-medium flex items-center gap-1 ${active ? 'text-indigo-600' : 'text-slate-400'}`}>
                  {active ? <><X className="w-3 h-3" /> Close</> : <><Plus className="w-3 h-3" /> Open</>}
                </div>
              </button>
            );
          })}
        </div>

        {/* Expanded input panels */}
        <AnimatePresence>
          {activeMethod && (
            <motion.div
              key={activeMethod}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-slate-100"
            >
              <div className="px-6 py-5 space-y-4">

                {/* Scope summary banner */}
                <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl">
                  <Bot className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                  <p className="text-xs font-medium text-indigo-700">
                    Adding to: {readyLabel}
                  </p>
                  <button onClick={() => { setActiveMethod(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className="ml-auto text-xs text-indigo-500 hover:text-indigo-700 font-medium underline">
                    Change
                  </button>
                </div>

                {/* ── Upload panel ── */}
                {activeMethod === 'upload' && (
                  <>
                    <div
                      onDragOver={e => { e.preventDefault(); setDragging(true); }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={handleDrop}
                      onClick={() => uploadRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
                        dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center">
                        <UploadCloud className="w-7 h-7 text-indigo-500" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-slate-700">
                          Drag &amp; drop files here
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          or <span className="text-indigo-600 font-medium">click to browse</span>
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2 mt-1">
                        {['PDF', 'DOCX', 'TXT', 'CSV', 'Excel'].map(f => (
                          <span key={f} className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-500 font-medium">
                            {f}
                          </span>
                        ))}
                      </div>
                      <input ref={uploadRef} type="file" multiple accept={ACCEPTED.join(',')}
                        onChange={e => handleFiles(Array.from(e.target.files || []))} className="hidden" />
                    </div>

                    {uploads.length > 0 && (
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        {uploads.map((u, i) => <UploadRow key={i} {...u} />)}
                        {uploads.some(u => u.status !== 'uploading') && (
                          <button onClick={() => setUploads(p => p.filter(u => u.status === 'uploading'))}
                            className="text-xs text-slate-400 hover:text-slate-600 pt-1">
                            Clear completed
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* ── Scrape panel ── */}
                {activeMethod === 'scrape' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Website URL</label>
                      <p className="text-xs text-slate-400 mb-2">
                        Paste a public webpage URL. We'll extract all the text content automatically.
                      </p>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input type="url"
                            placeholder="https://example.com/about"
                            value={scrapeUrl} onChange={e => setScrapeUrl(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleScrape()}
                            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200" />
                        </div>
                        <button onClick={handleScrape} disabled={isScraping || !scrapeUrl.trim()}
                          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                          {isScraping ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                          {isScraping ? 'Scraping…' : 'Extract'}
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
                      Works best with product pages, FAQs, about pages, and documentation.
                      JavaScript-heavy SPAs may not extract fully.
                    </p>
                  </div>
                )}

                {/* ── Text / FAQ panel ── */}
                {activeMethod === 'text' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                      <input type="text" value={formTitle} onChange={e => setFormTitle(e.target.value)}
                        placeholder="e.g. Company Overview, Pricing FAQ…"
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 bg-white focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-200" />
                    </div>

                    {docType === 'faq' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Question</label>
                          <input type="text" value={formQuestion} onChange={e => setFormQuestion(e.target.value)}
                            placeholder="What is your return policy?"
                            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 bg-white focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-200" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Answer</label>
                          <textarea value={formAnswer} onChange={e => setFormAnswer(e.target.value)} rows={3}
                            placeholder="We offer a 30-day return policy…"
                            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 bg-white resize-none focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-200" />
                        </div>
                      </>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Content</label>
                      <textarea value={formContent} onChange={e => setFormContent(e.target.value)} rows={6}
                        placeholder="Paste or type your content here…"
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 bg-white resize-none focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-200" />
                    </div>

                    <button onClick={handleAdd} disabled={isAdding}
                      className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors">
                      {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      {isAdding ? 'Saving…' : 'Save to Knowledge Base'}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── 3. Your Documents ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Your Documents</p>
            <p className="text-xs text-slate-400 mt-0.5">{docs.length} total · {filtered.length} shown</p>
          </div>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Scope tabs */}
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              {[
                { id: 'all',      label: `All (${cnt.all})` },
                { id: 'global',   label: `Global (${cnt.global})` },
                { id: 'campaign', label: `Campaign (${cnt.campaign})` },
                { id: 'agent',    label: `Agent (${cnt.agent})` },
              ].map(t => (
                <button key={t.id} onClick={() => setFilterScope(t.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    filterScope === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
            {/* Type filter */}
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              <button onClick={() => setFilterType('all')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${filterType === 'all' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
                All
              </button>
              {DOC_TYPES.map(t => (
                <button key={t.id} onClick={() => setFilterType(filterType === t.id ? 'all' : t.id)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${filterType === t.id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
                  {t.label}
                </button>
              ))}
            </div>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 w-40" />
            </div>
          </div>
        </div>

        {/* Document rows */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /><span className="text-sm">Loading…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <BookOpen className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium text-slate-500">No documents yet</p>
            <p className="text-xs mt-1">Use one of the methods above to add knowledge</p>
            <button onClick={() => setActiveMethod('upload')}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
              <FileUp className="w-4 h-4" /> Upload your first file
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map(doc => {
              const ti = typeOf(doc.doc_type);
              const TypeIcon = ti.icon;
              const agentName    = agents.find(a => String(a.id) === String(doc.agent_id))?.name;
              const campaignName = campaigns.find(c => String(c.id) === String(doc.campaign_id))?.name;
              return (
                <div key={doc.id} className="flex items-start gap-4 px-6 py-4 hover:bg-slate-50 transition-colors">
                  {/* Type icon */}
                  <div className={`w-9 h-9 rounded-xl ${ti.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                    <TypeIcon className={`w-4 h-4 ${ti.color}`} />
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2 mb-1">
                      <span className="text-sm font-semibold text-slate-800">{doc.title}</span>
                      <ScopeBadge scope={doc.scope || 'agent'} />
                      {campaignName && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-md text-[11px] font-medium">
                          <Megaphone className="w-3 h-3" />{campaignName}
                        </span>
                      )}
                      {agentName && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-md text-[11px] font-medium">
                          <Bot className="w-3 h-3" />{agentName}
                        </span>
                      )}
                    </div>
                    {doc.doc_type === 'faq' && doc.question && (
                      <p className="text-xs text-emerald-600 mb-1 font-medium">Q: {doc.question}</p>
                    )}
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{doc.content}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400">
                      <span className={`${ti.bg} ${ti.color} px-1.5 py-0.5 rounded font-medium`}>{ti.label}</span>
                      {doc.chunk_index > 0 && <span>Chunk {doc.chunk_index + 1}</span>}
                      <span>{new Date(doc.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                  </div>
                  {/* Delete */}
                  <button onClick={() => handleDelete(doc.id)}
                    className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 mt-0.5">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
