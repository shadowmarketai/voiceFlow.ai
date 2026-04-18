/**
 * Knowledge Base — per-agent training data
 * Features: agent selector, drag-drop file upload (PDF/DOCX/TXT),
 *           manual text entry, filter by type, search, delete
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  BookOpen, Plus, Search, FileText, HelpCircle, ShoppingBag, ScrollText,
  Trash2, Upload, Loader2, X, Bot, UploadCloud, CheckCircle2, AlertCircle,
  ChevronDown,
} from 'lucide-react';
import { usePermissions } from '../../hooks/usePermissions';
import { voiceAgentAPI, agentsAPI } from '../../services/api';

// ─── constants ───────────────────────────────────────────────────────────────

const DOC_TYPES = [
  { id: 'document',        label: 'Document',  icon: FileText,   color: 'text-blue-500',    bg: 'bg-blue-50' },
  { id: 'faq',             label: 'FAQ',        icon: HelpCircle, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  { id: 'product_catalog', label: 'Catalog',    icon: ShoppingBag,color: 'text-amber-500',   bg: 'bg-amber-50' },
  { id: 'script',          label: 'Script',     icon: ScrollText, color: 'text-purple-500',  bg: 'bg-purple-50' },
];

const ACCEPTED_EXTS = ['.pdf', '.docx', '.txt'];
const ALL_AGENT = { id: null, name: 'All Agents' };

// ─── helpers ─────────────────────────────────────────────────────────────────

function typeInfo(docType) {
  return DOC_TYPES.find(t => t.id === docType) || DOC_TYPES[0];
}

// ─── sub-components ──────────────────────────────────────────────────────────

function AgentSelector({ agents, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-indigo-400 transition-colors min-w-[180px] justify-between"
      >
        <span className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-indigo-500 flex-shrink-0" />
          <span className="truncate max-w-[130px]">{selected?.name || 'All Agents'}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 bg-white rounded-xl border border-slate-200 shadow-lg py-1 min-w-[200px]">
          {[ALL_AGENT, ...agents].map(a => (
            <button
              key={a.id ?? '__all__'}
              onClick={() => { onChange(a); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-indigo-50 transition-colors ${
                (selected?.id ?? null) === a.id ? 'text-indigo-700 font-medium' : 'text-slate-700'
              }`}
            >
              <Bot className="w-3.5 h-3.5 text-slate-400" />
              {a.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DropZone({ onFiles, disabled }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files).filter(f =>
      ACCEPTED_EXTS.some(ext => f.name.toLowerCase().endsWith(ext))
    );
    if (files.length) onFiles(files);
    else toast.error('Only PDF, DOCX, or TXT files accepted');
  }, [disabled, onFiles]);

  const handleChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) onFiles(files);
    e.target.value = '';
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`
        border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors
        ${dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
        <UploadCloud className="w-6 h-6 text-indigo-500" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-slate-700">
          Drag &amp; drop files here, or <span className="text-indigo-600">browse</span>
        </p>
        <p className="text-xs text-slate-400 mt-1">PDF, DOCX, TXT — up to 10 MB each</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTS.join(',')}
        onChange={handleChange}
        className="hidden"
        disabled={disabled}
      />
    </div>
  );
}

function UploadItem({ file, progress, status, error }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-700 truncate">{file.name}</p>
        {status === 'uploading' && (
          <div className="mt-1 h-1 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        {status === 'error' && (
          <p className="text-xs text-red-500 mt-0.5">{error}</p>
        )}
      </div>
      {status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
      {status === 'error' && <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
      {status === 'uploading' && <Loader2 className="w-4 h-4 text-indigo-500 animate-spin flex-shrink-0" />}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function KnowledgeBasePage() {
  const { can } = usePermissions();

  // ── data ──
  const [docs, setDocs]         = useState([]);
  const [agents, setAgents]     = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);

  // ── filters ──
  const [selectedAgent, setSelectedAgent] = useState(ALL_AGENT);
  const [activeTab, setActiveTab]         = useState('all');
  const [search, setSearch]               = useState('');

  // ── modals ──
  const [showAddModal, setShowAddModal]     = useState(false);
  const [showUploadPanel, setShowUploadPanel] = useState(false);

  // ── manual-add form ──
  const [formTitle,    setFormTitle]    = useState('');
  const [formContent,  setFormContent]  = useState('');
  const [formDocType,  setFormDocType]  = useState('document');
  const [formQuestion, setFormQuestion] = useState('');
  const [formAnswer,   setFormAnswer]   = useState('');
  const [isAdding,     setIsAdding]     = useState(false);

  // ── file upload queue ──
  const [uploads, setUploads] = useState([]); // [{file, progress, status, error}]

  // ─── load agents ───────────────────────────────────────────────────────────
  useEffect(() => {
    agentsAPI.list()
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : (data?.agents ?? []);
        setAgents(list);
      })
      .catch(() => {});
  }, []);

  // ─── load knowledge ────────────────────────────────────────────────────────
  const loadDocs = useCallback(() => {
    setLoadingDocs(true);
    voiceAgentAPI.listKnowledge('default', undefined, selectedAgent.id || undefined)
      .then(({ data }) => {
        if (Array.isArray(data)) setDocs(data);
      })
      .catch(() => {})
      .finally(() => setLoadingDocs(false));
  }, [selectedAgent.id]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  // ─── filtered view ────────────────────────────────────────────────────────
  const filtered = docs.filter(d => {
    if (activeTab !== 'all' && d.doc_type !== activeTab) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        d.title?.toLowerCase().includes(q) ||
        d.content?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const typeCounts = DOC_TYPES.reduce((acc, t) => {
    acc[t.id] = docs.filter(d => d.doc_type === t.id).length;
    return acc;
  }, {});

  // ─── manual add ──────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!formTitle.trim() || !formContent.trim()) {
      toast.error('Title and content are required');
      return;
    }
    setIsAdding(true);
    try {
      const payload = {
        title: formTitle,
        content: formContent,
        doc_type: formDocType,
        agent_id: selectedAgent.id || undefined,
        ...(formDocType === 'faq' && { question: formQuestion, answer: formAnswer }),
      };
      const { data } = await voiceAgentAPI.addKnowledge(payload);
      const chunks = Array.isArray(data) ? data : [data];
      setDocs(prev => [...chunks, ...prev]);
      toast.success(`Added ${chunks.length} chunk(s)`);
    } catch {
      const newDoc = {
        id: Date.now(),
        title: formTitle,
        doc_type: formDocType,
        content: formContent,
        question: formDocType === 'faq' ? formQuestion : null,
        answer:   formDocType === 'faq' ? formAnswer   : null,
        chunk_index: 0,
        is_active: true,
        created_at: new Date().toISOString(),
        agent_id: selectedAgent.id || null,
      };
      setDocs(prev => [newDoc, ...prev]);
      toast.success('Saved locally (offline mode)');
    }
    setFormTitle(''); setFormContent(''); setFormQuestion(''); setFormAnswer('');
    setShowAddModal(false);
    setIsAdding(false);
  };

  // ─── file upload ──────────────────────────────────────────────────────────
  const handleFiles = useCallback((files) => {
    const newItems = files.map(f => ({ file: f, progress: 0, status: 'uploading', error: null }));
    setUploads(prev => [...prev, ...newItems]);

    newItems.forEach((item, idx) => {
      const globalIdx = uploads.length + idx;
      const formData = new FormData();
      formData.append('file', item.file);
      formData.append('doc_type', formDocType);
      if (selectedAgent.id) formData.append('agent_id', selectedAgent.id);

      voiceAgentAPI.uploadKnowledge(formData, (ev) => {
        const pct = Math.round((ev.loaded / ev.total) * 100);
        setUploads(prev => prev.map((u, i) =>
          i === globalIdx ? { ...u, progress: pct } : u
        ));
      })
        .then(({ data }) => {
          setUploads(prev => prev.map((u, i) =>
            i === globalIdx ? { ...u, status: 'done', progress: 100 } : u
          ));
          toast.success(`"${data.title}" uploaded (${data.chunks} chunk${data.chunks !== 1 ? 's' : ''})`);
          loadDocs();
        })
        .catch(err => {
          const msg = err.response?.data?.detail || 'Upload failed';
          setUploads(prev => prev.map((u, i) =>
            i === globalIdx ? { ...u, status: 'error', error: msg } : u
          ));
          toast.error(msg);
        });
    });
  }, [uploads.length, formDocType, selectedAgent.id, loadDocs]);

  const clearUploads = () => setUploads(prev => prev.filter(u => u.status === 'uploading'));

  // ─── delete ──────────────────────────────────────────────────────────────
  const handleDelete = async (docId) => {
    try { await voiceAgentAPI.deleteKnowledge(docId); } catch { /* offline */ }
    setDocs(prev => prev.filter(d => d.id !== docId));
    toast.success('Document removed');
  };

  // ─── render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-indigo-500" />
            Knowledge Base
          </h1>
          <p className="text-sm text-slate-500 mt-1">Train your AI agent with documents, FAQs, and scripts</p>
        </div>
        <div className="flex items-center gap-2">
          {can('voiceAI', 'create') && (
            <>
              <button
                onClick={() => setShowUploadPanel(o => !o)}
                className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:border-indigo-400 hover:text-indigo-700 transition-colors"
              >
                <Upload className="w-4 h-4" /> Upload File
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Text
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Agent Selector + Filters Row ── */}
      <div className="flex flex-wrap items-center gap-3">
        <AgentSelector
          agents={agents}
          selected={selectedAgent}
          onChange={setSelectedAgent}
        />
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            All ({docs.length})
          </button>
          {DOC_TYPES.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              {t.label} ({typeCounts[t.id] || 0})
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 w-52"
          />
        </div>
      </div>

      {/* ── Upload Panel (inline) ── */}
      {showUploadPanel && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
              <Upload className="w-4 h-4 text-indigo-500" /> Upload Files
              {selectedAgent.id && (
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">
                  → {selectedAgent.name}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              <select
                value={formDocType}
                onChange={e => setFormDocType(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700"
              >
                {DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <button onClick={() => setShowUploadPanel(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          </div>

          <DropZone onFiles={handleFiles} disabled={false} />

          {uploads.length > 0 && (
            <div className="mt-3 divide-y divide-slate-100">
              {uploads.map((u, i) => (
                <UploadItem key={i} {...u} />
              ))}
              {uploads.some(u => u.status !== 'uploading') && (
                <button
                  onClick={clearUploads}
                  className="mt-2 text-xs text-slate-400 hover:text-slate-600"
                >
                  Clear completed
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {DOC_TYPES.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(activeTab === t.id ? 'all' : t.id)}
              className={`bg-white rounded-xl border p-4 text-left transition-colors hover:border-indigo-300 ${
                activeTab === t.id ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-slate-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg ${t.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-4 h-4 ${t.color}`} />
                </div>
                <div>
                  <p className="text-xl font-bold text-slate-900">{typeCounts[t.id] || 0}</p>
                  <p className="text-xs text-slate-500">{t.label}s</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Documents list ── */}
      {loadingDocs ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span className="text-sm">Loading knowledge base…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <BookOpen className="w-12 h-12 mb-3 opacity-40" />
          <p className="text-sm font-medium">No documents found</p>
          <p className="text-xs mt-1">
            {selectedAgent.id
              ? `No knowledge assigned to "${selectedAgent.name}" yet`
              : 'Add documents or upload files to get started'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(doc => {
            const ti = typeInfo(doc.doc_type);
            const Icon = ti.icon;
            const agentName = agents.find(a => String(a.id) === String(doc.agent_id))?.name;
            return (
              <div
                key={doc.id}
                className="bg-white rounded-xl border border-slate-200 px-4 py-3.5 hover:border-indigo-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`w-9 h-9 rounded-lg ${ti.bg} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-4 h-4 ${ti.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-slate-900 text-sm">{doc.title}</h3>
                        {agentName && (
                          <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded flex items-center gap-1">
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
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
                    >
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
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Add to Knowledge Base</h2>
                {selectedAgent.id && (
                  <p className="text-xs text-indigo-600 mt-0.5 flex items-center gap-1">
                    <Bot className="w-3 h-3" /> Assigning to: {selectedAgent.name}
                  </p>
                )}
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                <select
                  value={formDocType}
                  onChange={e => setFormDocType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900"
                >
                  {DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="e.g. Product FAQ"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900"
                />
              </div>

              {formDocType === 'faq' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Question</label>
                    <input
                      type="text"
                      value={formQuestion}
                      onChange={e => setFormQuestion(e.target.value)}
                      placeholder="What products do you offer?"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Answer</label>
                    <textarea
                      value={formAnswer}
                      onChange={e => setFormAnswer(e.target.value)}
                      rows={3}
                      placeholder="We offer..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 resize-none"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Content</label>
                <textarea
                  value={formContent}
                  onChange={e => setFormContent(e.target.value)}
                  rows={5}
                  placeholder="Paste your document content here..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 resize-none"
                />
              </div>

              <button
                onClick={handleAdd}
                disabled={isAdding}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {isAdding
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Plus className="w-4 h-4" />
                }
                Add to Knowledge Base
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
