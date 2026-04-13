/**
 * Knowledge Base - Manage AI agent training data
 * Documents, FAQs, Product Catalogs, Scripts
 */

import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
 BookOpen, Plus, Search, FileText, HelpCircle, ShoppingBag, ScrollText,
 Trash2, Edit3, Upload, Loader2, ChevronDown, X
} from 'lucide-react';
import { usePermissions } from '../../hooks/usePermissions';
import { voiceAgentAPI } from '../../services/api';

const DOC_TYPES = [
 { id: 'document', label: 'Documents', icon: FileText, color: 'text-blue-500' },
 { id: 'faq', label: 'FAQs', icon: HelpCircle, color: 'text-emerald-500' },
 { id: 'product_catalog', label: 'Catalogs', icon: ShoppingBag, color: 'text-amber-500' },
 { id: 'script', label: 'Scripts', icon: ScrollText, color: 'text-purple-500' },
];

// Mock data for when API is unavailable
const MOCK_DOCS = [
 { id: 1, title: 'Company Overview', doc_type: 'document', content: 'Swetha Structures provides pre-engineered building solutions with CRM and Voice AI-powered customer engagement...', chunk_index: 0, is_active: true, created_at: '2026-02-28T10:00:00Z' },
 { id: 2, title: 'What is Swetha CRM? ', doc_type: 'faq', content: 'Swetha CRM is a CRM + Voice AI + PEB Quotation platform.', question: 'What is Swetha CRM? ', answer: 'Swetha CRM is a CRM + Voice AI + PEB Quotation platform for Swetha Structures.', chunk_index: 0, is_active: true, created_at: '2026-02-28T09:00:00Z' },
 { id: 3, title: 'PEB Building Specifications', doc_type: 'product_catalog', content: 'Standard PEB: 1.8 kg/sqft steel, Galvalume roofing, PUF panels optional...', chunk_index: 0, is_active: true, created_at: '2026-02-27T15:00:00Z' },
 { id: 4, title: 'Sales Opening Script', doc_type: 'script', content: 'Vanakkam! This is [Agent Name] from Swetha Structures. I am calling regarding your interest in our PEB building solutions...', chunk_index: 0, is_active: true, created_at: '2026-02-27T12:00:00Z' },
];

export default function KnowledgeBasePage() {
 const [activeTab, setActiveTab] = useState('all');
 const [search, setSearch] = useState('');
 const [showAddModal, setShowAddModal] = useState(false);
 const [docs, setDocs] = useState(MOCK_DOCS);
 const [isLoading, setIsLoading] = useState(false);
 const { can } = usePermissions();

 // Load from API on mount
 useEffect(() => {
 voiceAgentAPI.listKnowledge()
 .then(({ data }) => {
 if (Array.isArray(data) && data.length > 0) setDocs(data);
 })
 .catch(() => {}); // keep mock data
 }, []);

 // Add form state
 const [formTitle, setFormTitle] = useState('');
 const [formContent, setFormContent] = useState('');
 const [formDocType, setFormDocType] = useState('document');
 const [formQuestion, setFormQuestion] = useState('');
 const [formAnswer, setFormAnswer] = useState('');

 const filtered = docs.filter(d => {
 if (activeTab !=='all' && d.doc_type !== activeTab) return false;
 if (search.trim()) {
 const q = search.toLowerCase();
 return d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q);
 }
 return true;
 });

 const handleAdd = async () => {
 if (!formTitle.trim() || !formContent.trim()) {
 toast.error('Title and content are required');
 return;
 }
 setIsLoading(true);

 try {
 const { voiceAgentAPI } = await import('../../services/api');
 const payload = {
 title: formTitle,
 content: formContent,
 doc_type: formDocType,
 ...(formDocType === 'faq' && { question: formQuestion, answer: formAnswer }),
 };
 const { data } = await voiceAgentAPI.addKnowledge(payload);
 setDocs(prev => [...data, ...prev]);
 toast.success(`Added ${data.length} chunk(s) to knowledge base`);
 } catch {
 // Fallback: add locally
 const newDoc = {
 id: Date.now(),
 title: formTitle,
 doc_type: formDocType,
 content: formContent,
 question: formDocType === 'faq' ? formQuestion : null,
 answer: formDocType === 'faq' ? formAnswer : null,
 chunk_index: 0,
 is_active: true,
 created_at: new Date().toISOString(),
 };
 setDocs(prev => [newDoc, ...prev]);
 toast.success('Added to knowledge base (offline mode)');
 }

 setFormTitle('');
 setFormContent('');
 setFormQuestion('');
 setFormAnswer('');
 setShowAddModal(false);
 setIsLoading(false);
 };

 const handleDelete = async (docId) => {
 try {
 const { voiceAgentAPI } = await import('../../services/api');
 await voiceAgentAPI.deleteKnowledge(docId);
 } catch {
 // offline
 }
 setDocs(prev => prev.filter(d => d.id !== docId));
 toast.success('Document removed');
 };

 const typeCounts = DOC_TYPES.reduce((acc, t) => {
 acc[t.id] = docs.filter(d => d.doc_type === t.id).length;
 return acc;
 }, {});

 return (
 <div className="space-y-6">
 {/* Header */}
 <div className="flex items-center justify-between">
 <div>
 <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
 <BookOpen className="w-6 h-6 text-indigo-500" />
 Knowledge Base
 </h1>
 <p className="text-sm text-slate-500 mt-1">Train your AI agent with documents, FAQs, and scripts</p>
 </div>
 {can('voiceAI','create') && (
 <button
 onClick={() => setShowAddModal(true)}
 className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
 >
 <Plus className="w-4 h-4" /> Add Document
 </button>
 )}
 </div>

 {/* Stats */}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
 {DOC_TYPES.map(t => {
 const Icon = t.icon;
 return (
 <div key={t.id} className="bg-white rounded-xl border border-slate-200 p-4">
 <div className="flex items-center gap-3">
 <div className={`w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center ${t.color}`}>
 <Icon className="w-5 h-5" />
 </div>
 <div>
 <p className="text-2xl font-bold text-slate-900">{typeCounts[t.id] || 0}</p>
 <p className="text-xs text-slate-500">{t.label}</p>
 </div>
 </div>
 </div>
 );
 })}
 </div>

 {/* Tabs + Search */}
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
 {t.label}
 </button>
 ))}
 </div>
 <div className="relative">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
 <input
 type="text"
 placeholder="Search knowledge base..."
 value={search}
 onChange={e => setSearch(e.target.value)}
 className="pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 w-64"
 />
 </div>
 </div>

 {/* Documents List */}
 <div className="space-y-3">
 {filtered.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-20 text-slate-400">
 <BookOpen className="w-12 h-12 mb-3 opacity-40" />
 <p className="text-sm">No documents found</p>
 </div>
 ) : (
 filtered.map(doc => {
 const typeInfo = DOC_TYPES.find(t => t.id === doc.doc_type) || DOC_TYPES[0];
 const Icon = typeInfo.icon;
 return (
 <div key={doc.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:border-indigo-300 transition-colors">
 <div className="flex items-start justify-between gap-4">
 <div className="flex items-start gap-3 flex-1 min-w-0">
 <div className={`w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 ${typeInfo.color}`}>
 <Icon className="w-4 h-4" />
 </div>
 <div className="flex-1 min-w-0">
 <h3 className="font-medium text-slate-900 text-sm">{doc.title}</h3>
 {doc.doc_type === 'faq' && doc.question && (
 <p className="text-xs text-emerald-600 mt-1">Q: {doc.question}</p>
 )}
 <p className="text-xs text-slate-500 mt-1 line-clamp-2">{doc.content}</p>
 <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
 <span className="px-2 py-0.5 bg-slate-100 rounded">{typeInfo.label}</span>
 {doc.chunk_index > 0 && <span>Chunk {doc.chunk_index + 1}</span>}
 <span>{new Date(doc.created_at).toLocaleDateString()}</span>
 </div>
 </div>
 </div>
 {can('voiceAI','delete') && (
 <button
 onClick={() => handleDelete(doc.id)}
 className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
 >
 <Trash2 className="w-4 h-4" />
 </button>
 )}
 </div>
 </div>
 );
 })
 )}
 </div>

 {/* Add Document Modal */}
 {showAddModal && (
 <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
 <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl" onClick={e => e.stopPropagation()}>
 <div className="flex items-center justify-between mb-5">
 <h2 className="text-lg font-bold text-slate-900">Add to Knowledge Base</h2>
 <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-slate-100 rounded-lg">
 <X className="w-5 h-5 text-slate-500" />
 </button>
 </div>

 <div className="space-y-4">
 {/* Doc Type */}
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

 {/* Title */}
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

 {/* FAQ fields */}
 {formDocType === 'faq' && (
 <>
 <div>
 <label className="block text-sm font-medium text-slate-700 mb-1">Question</label>
 <input
 type="text"
 value={formQuestion}
 onChange={e => setFormQuestion(e.target.value)}
 placeholder="What PEB buildings do you offer?"
 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900"
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-slate-700 mb-1">Answer</label>
 <textarea
 value={formAnswer}
 onChange={e => setFormAnswer(e.target.value)}
 rows={3}
 placeholder="Swetha Structures offers PEB buildings with..."
 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 resize-none"
 />
 </div>
 </>
 )}

 {/* Content */}
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
 disabled={isLoading}
 className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
 >
 {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
 Add to Knowledge Base
 </button>
 </div>
 </div>
 </div>
 )}
 </div>
 );
}
