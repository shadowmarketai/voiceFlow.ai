import React, { useState, useMemo, useEffect } from 'react';
import toast from 'react-hot-toast';
import { campaignsAPI } from '../../services/api';
import {
 Megaphone, Plus, Columns, Table2, X, Play, Pause, Edit3, Trash2,
 BarChart3, Calendar, Users, Phone, PhoneCall, ArrowUpDown, ArrowUp,
 ArrowDown, Search, Filter, ChevronRight, Clock, Target, Sparkles,
 CheckCircle, XCircle, Zap, TrendingUp
} from 'lucide-react';
import CollapsibleSection from './components/CollapsibleSection';
import KanbanBoard from './components/KanbanBoard';
import DialectBadge from './components/DialectBadge';
import EmotionIndicator from './components/EmotionIndicator';
import GenZBadge from './components/GenZBadge';
import { usePermissions } from '../../hooks/usePermissions';

// ── Mock Data ───────────────────────────────────────────────────────────────────
const initialCampaigns = [
 {
 id: 1,
 name: 'February Lead Follow-up',
 agent: 'Sales Pro',
 status: 'active',
 total: 2500,
 called: 1840,
 connected: 1250,
 converted: 187,
 progress: 74,
 startDate: '2026-02-01',
 endDate: '2026-02-28',
 targetDialect: 'Chennai',
 dialects: [
 { dialect: 'Chennai', count: 1100, pct: 0.60 },
 { dialect: 'Kongu', count: 460, pct: 0.25 },
 { dialect: 'English', count: 280, pct: 0.15 },
 ],
 emotions: {
 happy: 0.38,
 neutral: 0.32,
 confused: 0.14,
 angry: 0.09,
 excited: 0.07,
 },
 genZMode: true,
 genZScore: 0.68,
 genZTopTerms: ['no cap','vibe check','lowkey','slay'],
 contactList: 'February Leads',
 emotionStrategy: 'Adaptive',
 },
 {
 id: 2,
 name: 'Product Launch Blitz',
 agent: 'Promo Blaster',
 status: 'active',
 total: 5000,
 called: 2100,
 connected: 1430,
 converted: 215,
 progress: 42,
 startDate: '2026-02-10',
 endDate: '2026-03-10',
 targetDialect: 'Kongu',
 dialects: [
 { dialect: 'Kongu', count: 950, pct: 0.45 },
 { dialect: 'Madurai', count: 630, pct: 0.30 },
 { dialect: 'Hindi', count: 520, pct: 0.25 },
 ],
 emotions: {
 excited: 0.42,
 happy: 0.28,
 neutral: 0.18,
 confused: 0.08,
 angry: 0.04,
 },
 genZMode: true,
 genZScore: 0.82,
 genZTopTerms: ['fire','W','bestie','its giving','fr fr'],
 contactList: 'Product Interest List',
 emotionStrategy: 'Enthusiasm Match',
 },
 {
 id: 3,
 name: 'Renewal Reminders Q1',
 agent: 'Retention Bot',
 status: 'paused',
 total: 1200,
 called: 680,
 connected: 520,
 converted: 78,
 progress: 57,
 startDate: '2026-01-15',
 endDate: '2026-03-15',
 targetDialect: 'Madurai',
 dialects: [
 { dialect: 'Madurai', count: 310, pct: 0.46 },
 { dialect: 'Tirunelveli', count: 210, pct: 0.31 },
 { dialect: 'Chennai', count: 160, pct: 0.23 },
 ],
 emotions: {
 neutral: 0.40,
 sad: 0.22,
 angry: 0.18,
 happy: 0.12,
 confused: 0.08,
 },
 genZMode: false,
 genZScore: 0.15,
 genZTopTerms: [],
 contactList: 'Renewal List',
 emotionStrategy: 'Empathy First',
 },
 {
 id: 4,
 name: 'Holiday Season Campaign',
 agent: 'Sales Pro',
 status: 'completed',
 total: 3000,
 called: 3000,
 connected: 2180,
 converted: 412,
 progress: 100,
 startDate: '2025-12-15',
 endDate: '2026-01-15',
 targetDialect: 'English',
 dialects: [
 { dialect: 'English', count: 1200, pct: 0.40 },
 { dialect: 'Chennai', count: 980, pct: 0.33 },
 { dialect: 'Hindi', count: 800, pct: 0.27 },
 ],
 emotions: {
 happy: 0.45,
 excited: 0.25,
 neutral: 0.20,
 confused: 0.06,
 angry: 0.04,
 },
 genZMode: true,
 genZScore: 0.55,
 genZTopTerms: ['lit','vibe','bet'],
 contactList: 'Holiday Promo List',
 emotionStrategy: 'Festive Enthusiasm',
 },
 {
 id: 5,
 name: 'Customer Feedback Drive',
 agent: 'Survey Agent',
 status: 'completed',
 total: 800,
 called: 800,
 connected: 540,
 converted: 410,
 progress: 100,
 startDate: '2026-01-20',
 endDate: '2026-02-10',
 targetDialect: 'Hindi',
 dialects: [
 { dialect: 'Hindi', count: 320, pct: 0.47 },
 { dialect: 'Madurai', count: 220, pct: 0.32 },
 { dialect: 'English', count: 140, pct: 0.21 },
 ],
 emotions: {
 neutral: 0.55,
 happy: 0.20,
 sad: 0.12,
 angry: 0.08,
 confused: 0.05,
 },
 genZMode: false,
 genZScore: 0.1,
 genZTopTerms: [],
 contactList: 'Active Customers',
 emotionStrategy: 'Neutral Polite',
 },
 {
 id: 6,
 name: 'March Outbound Push',
 agent: 'Onboard Buddy',
 status: 'scheduled',
 total: 4000,
 called: 0,
 connected: 0,
 converted: 0,
 progress: 0,
 startDate: '2026-03-01',
 endDate: '2026-03-31',
 targetDialect: 'Tirunelveli',
 dialects: [
 { dialect: 'Tirunelveli', count: 0, pct: 0.35 },
 { dialect: 'Kongu', count: 0, pct: 0.35 },
 { dialect: 'Chennai', count: 0, pct: 0.30 },
 ],
 emotions: {
 neutral: 1.0,
 happy: 0,
 angry: 0,
 confused: 0,
 excited: 0,
 },
 genZMode: true,
 genZScore: 0,
 genZTopTerms: ['vibe','sus','bet','no cap'],
 contactList: 'March Prospect List',
 emotionStrategy: 'Adaptive',
 },
];

// ── Status helpers ──────────────────────────────────────────────────────────────
const statusStyles = {
 active: 'bg-emerald-100 text-emerald-700',
 paused: 'bg-amber-100 text-amber-700',
 completed: 'bg-blue-100 text-blue-700',
 scheduled: 'bg-purple-100 text-purple-700',
};

const StatusBadge = ({ status }) => (
 <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${statusStyles[status] || statusStyles.paused}`}>
 {status}
 </span>
);

// ── Progress bar component ──────────────────────────────────────────────────────
const ProgressBar = ({ value, size ='sm' }) => {
 const height = size === 'lg' ? 'h-2.5' : 'h-1.5';
 const color = value >= 80 ? 'bg-emerald-500' : value >= 40 ? 'bg-indigo-500' : 'bg-amber-500';
 return (
 <div className="flex items-center gap-2">
 <div className={`flex-1 ${height} bg-slate-200 rounded-full overflow-hidden`}>
 <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${value}%` }} />
 </div>
 <span className="text-xs text-slate-500 tabular-nums w-8 text-right">{value}%</span>
 </div>
 );
};

// ── Campaign card content (shared between kanban cards & grid) ──────────────────
function CampaignCardContent({ campaign, onPauseResume, onEdit, onStats, onDelete }) {
 const { can } = usePermissions();
 const canUpdate = can('campaigns','update');
 const canDelete = can('campaigns','delete');

 return (
 <>
 <div className="flex items-start justify-between mb-2">
 <div>
 <h4 className="font-semibold text-sm text-slate-900">{campaign.name}</h4>
 <p className="text-xs text-slate-500 mt-0.5">{campaign.agent}</p>
 </div>
 <StatusBadge status={campaign.status} />
 </div>

 {/* Progress */}
 <div className="mb-3">
 <ProgressBar value={campaign.progress} />
 </div>

 {/* Stats grid */}
 <div className="grid grid-cols-4 gap-1.5 mb-3">
 {[
 { label: 'Total', value: campaign.total, color: 'text-slate-900' },
 { label: 'Called', value: campaign.called, color: 'text-indigo-600' },
 { label: 'Connected', value: campaign.connected, color: 'text-emerald-600' },
 { label: 'Converted', value: campaign.converted, color: 'text-amber-600' },
 ].map((stat) => (
 <div key={stat.label} className="bg-slate-50 rounded-lg px-1.5 py-1.5 text-center">
 <p className={`text-sm font-bold ${stat.color}`}>{stat.value.toLocaleString()}</p>
 <p className="text-[9px] text-slate-500">{stat.label}</p>
 </div>
 ))}
 </div>

 {/* Date range */}
 <div className="flex items-center gap-1.5 mb-2 text-xs text-slate-500">
 <Calendar className="w-3 h-3" />
 <span>{campaign.startDate} — {campaign.endDate}</span>
 </div>

 {/* Dialect */}
 <div className="mb-3">
 <DialectBadge dialect={campaign.targetDialect} />
 </div>

 {/* Action buttons */}
 <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100">
 {canUpdate && campaign.status !=='completed' && (
 <button
 onClick={(e) => { e.stopPropagation(); onPauseResume(campaign); }}
 className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
 campaign.status === 'active'
 ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
 : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
 }`}
 >
 {campaign.status === 'active' ? <><Pause className="w-3 h-3" /> Pause</> : <><Play className="w-3 h-3" /> Resume</>}
 </button>
 )}
 <button
 onClick={(e) => { e.stopPropagation(); onStats(campaign); }}
 className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-100 transition-colors"
 >
 <BarChart3 className="w-3 h-3" /> Stats
 </button>
 {canDelete && (
 <button
 onClick={(e) => { e.stopPropagation(); onDelete(campaign); }}
 className="px-2 py-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors"
 >
 <Trash2 className="w-3 h-3" />
 </button>
 )}
 </div>
 </>
 );
}

// ═════════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════════════════════════════
export default function CampaignsPage() {
 const { can } = usePermissions();
 const canCreate = can('campaigns','create');
 const canUpdate = can('campaigns','update');
 const canDelete = can('campaigns','delete');

 const [campaigns, setCampaigns] = useState(initialCampaigns);
 const [viewMode, setViewMode] = useState('kanban'); //'kanban' |'table'

 // Load campaigns from API on mount
 useEffect(() => {
 let cancelled = false;
 campaignsAPI.getAll()
 .then(({ data }) => {
 if (cancelled || !Array.isArray(data) || data.length === 0) return;
 const mapped = data.map(c => ({
 id: c.id,
 name: c.name || c.campaign_name || 'Campaign',
 agent: c.agent_name || c.assistant_name || 'AI Agent',
 status: c.status || 'scheduled',
 total: c.total_contacts || c.total || 0,
 called: c.calls_made || c.called || 0,
 connected: c.calls_connected || c.connected || 0,
 converted: c.conversions || c.converted || 0,
 progress: c.total_contacts > 0 ? Math.round((c.calls_made || 0) / c.total_contacts * 100) : 0,
 startDate: c.start_date ? new Date(c.start_date).toISOString().split('T')[0] : '',
 endDate: c.end_date ? new Date(c.end_date).toISOString().split('T')[0] : '—',
 targetDialect: c.target_dialect || 'Chennai',
 dialects: c.dialects || [{ dialect: 'Chennai', count: 0, pct: 1.0 }],
 emotions: c.emotions || { neutral: 1.0 },
 genZMode: c.genz_mode || false,
 genZScore: c.genz_score || 0,
 genZTopTerms: c.genz_terms || [],
 contactList: c.contact_list_name || c.contact_list || '',
 emotionStrategy: c.emotion_strategy || 'Adaptive',
 }));
 setCampaigns(prev => [...mapped, ...prev.filter(p => !mapped.find(m => m.id === p.id))]);
 })
 .catch(() => {}); // keep mock data
 return () => { cancelled = true; };
 }, []);
 const [selectedCampaign, setSelectedCampaign] = useState(null);
 const [showCreateModal, setShowCreateModal] = useState(false);
 const [searchQuery, setSearchQuery] = useState('');
 const [sortConfig, setSortConfig] = useState({ key: 'name', dir: 'asc' });

 // Create campaign form state
 const [newCampaign, setNewCampaign] = useState({
 name: '',
 agent: 'Sales Pro',
 contactList: '',
 schedule: '',
 targetDialect: 'Chennai',
 emotionStrategy: 'Adaptive',
 genZMode: false,
 });

 // ── Derived data ─────────────────────────────────────────────────────────────
 const filteredCampaigns = campaigns.filter((c) =>
 c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
 c.agent.toLowerCase().includes(searchQuery.toLowerCase())
 );

 const sortedCampaigns = useMemo(() => {
 const sorted = [...filteredCampaigns];
 sorted.sort((a, b) => {
 let aVal = a[sortConfig.key];
 let bVal = b[sortConfig.key];
 if (typeof aVal === 'string') aVal = aVal.toLowerCase();
 if (typeof bVal === 'string') bVal = bVal.toLowerCase();
 if (aVal < bVal) return sortConfig.dir === 'asc' ? -1 : 1;
 if (aVal > bVal) return sortConfig.dir === 'asc' ? 1 : -1;
 return 0;
 });
 return sorted;
 }, [filteredCampaigns, sortConfig]);

 const activeCampaigns = filteredCampaigns.filter((c) => c.status === 'active');
 const pausedCampaigns = filteredCampaigns.filter((c) => c.status === 'paused');
 const completedCampaigns = filteredCampaigns.filter((c) => c.status === 'completed');
 const scheduledCampaigns = filteredCampaigns.filter((c) => c.status === 'scheduled');

 // ── Handlers ─────────────────────────────────────────────────────────────────
 const handlePauseResume = (campaign) => {
 setCampaigns((prev) =>
 prev.map((c) => {
 if (c.id === campaign.id) {
 const next = c.status === 'active' ? 'paused' : c.status === 'paused' ? 'active' : c.status;
 if (next !== c.status) {
 toast.success(`Campaign "${c.name}" ${next === 'active' ? 'resumed' : 'paused'}`);
 } else {
 toast(`Campaign "${c.name}" cannot be toggled from ${c.status}`);
 }
 return { ...c, status: next };
 }
 return c;
 })
 );
 if (selectedCampaign?.id === campaign.id) {
 setSelectedCampaign((prev) => ({
 ...prev,
 status: prev.status === 'active' ? 'paused' : prev.status === 'paused' ? 'active' : prev.status,
 }));
 }
 };

 const handleEdit = (campaign) => {
 toast.success(`Opening editor for "${campaign.name}"`);
 };

 const handleStats = (campaign) => {
 toast.success(`Loading analytics for "${campaign.name}"`);
 };

 const handleDelete = (campaign) => {
 setCampaigns((prev) => prev.filter((c) => c.id !== campaign.id));
 if (selectedCampaign?.id === campaign.id) setSelectedCampaign(null);
 toast.success(`Campaign "${campaign.name}" deleted`);
 };

 const handleCardClick = (campaign) => {
 setSelectedCampaign(campaign);
 };

 const handleSort = (key) => {
 setSortConfig((prev) => ({
 key,
 dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc',
 }));
 };

 const handleCreateCampaign = () => {
 if (!newCampaign.name.trim()) {
 toast.error('Please enter a campaign name');
 return;
 }
 if (!newCampaign.contactList) {
 toast.error('Please select a contact list');
 return;
 }
 const created = {
 id: Date.now(),
 name: newCampaign.name,
 agent: newCampaign.agent,
 status: 'scheduled',
 total: 0,
 called: 0,
 connected: 0,
 converted: 0,
 progress: 0,
 startDate: newCampaign.schedule ? newCampaign.schedule.split('T')[0] : new Date().toISOString().split('T')[0],
 endDate: '—',
 targetDialect: newCampaign.targetDialect,
 dialects: [{ dialect: newCampaign.targetDialect, count: 0, pct: 1.0 }],
 emotions: { neutral: 1.0, happy: 0, angry: 0, confused: 0, excited: 0 },
 genZMode: newCampaign.genZMode,
 genZScore: 0,
 genZTopTerms: newCampaign.genZMode ? ['vibe','bet'] : [],
 contactList: newCampaign.contactList,
 emotionStrategy: newCampaign.emotionStrategy,
 };
 setCampaigns((prev) => [...prev, created]);
 toast.success(`Campaign "${newCampaign.name}" created and scheduled`);
 setNewCampaign({
 name: '',
 agent: 'Sales Pro',
 contactList: '',
 schedule: '',
 targetDialect: 'Chennai',
 emotionStrategy: 'Adaptive',
 genZMode: false,
 });
 setShowCreateModal(false);
 };

 // ── Kanban columns ───────────────────────────────────────────────────────────
 const kanbanColumns = [
 { id: 'active', title: 'Active', items: activeCampaigns },
 { id: 'paused', title: 'Paused', items: pausedCampaigns },
 { id: 'completed', title: 'Completed', items: completedCampaigns },
 { id: 'scheduled', title: 'Scheduled', items: scheduledCampaigns },
 ];

 // ── Sort icon helper ─────────────────────────────────────────────────────────
 const SortIcon = ({ colKey }) => {
 if (sortConfig.key !== colKey) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
 return sortConfig.dir === 'asc'
 ? <ArrowUp className="w-3 h-3 text-indigo-500" />
 : <ArrowDown className="w-3 h-3 text-indigo-500" />;
 };

 // ── Render ───────────────────────────────────────────────────────────────────
 return (
 <div className="space-y-6">
 {/* ─── Header ─────────────────────────────────────────────────────────── */}
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
 <div>
 <h1 className="text-2xl font-bold text-slate-900">Campaigns</h1>
 <p className="text-sm text-slate-500 mt-0.5">Manage outbound voice campaigns with dialect and emotion targeting</p>
 </div>
 <div className="flex items-center gap-2">
 {/* Search */}
 <div className="relative">
 <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
 <input
 type="text"
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 placeholder="Search campaigns..."
 className="pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 w-48"
 />
 </div>
 {/* View toggle */}
 <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
 <button
 onClick={() => setViewMode('kanban')}
 className={`p-2 rounded-md transition-colors ${viewMode === 'kanban' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
 title="Kanban view"
 >
 <Columns className="w-4 h-4" />
 </button>
 <button
 onClick={() => setViewMode('table')}
 className={`p-2 rounded-md transition-colors ${viewMode === 'table' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
 title="Table view"
 >
 <Table2 className="w-4 h-4" />
 </button>
 </div>
 {/* Create button */}
 {canCreate && (
 <button
 onClick={() => setShowCreateModal(true)}
 className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
 >
 <Plus className="w-4 h-4" /> New Campaign
 </button>
 )}
 </div>
 </div>

 {/* ─── Kanban View ────────────────────────────────────────────────────── */}
 {viewMode === 'kanban' && (
 <KanbanBoard
 columns={kanbanColumns}
 onCardClick={handleCardClick}
 emptyMessage="No campaigns here"
 renderCard={(campaign) => (
 <CampaignCardContent
 campaign={campaign}
 onPauseResume={handlePauseResume}
 onEdit={handleEdit}
 onStats={handleStats}
 onDelete={handleDelete}
 />
 )}
 />
 )}

 {/* ─── Table View ─────────────────────────────────────────────────────── */}
 {viewMode === 'table' && (
 <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="bg-slate-50 border-b border-slate-200">
 {[
 { key: 'name', label: 'Name' },
 { key: 'agent', label: 'Agent' },
 { key: 'status', label: 'Status' },
 { key: 'total', label: 'Total' },
 { key: 'called', label: 'Called' },
 { key: 'connected', label: 'Connected' },
 { key: 'converted', label: 'Converted' },
 { key: 'targetDialect', label: 'Dialect' },
 { key: 'progress', label: 'Progress' },
 ].map((col) => (
 <th
 key={col.key}
 onClick={() => handleSort(col.key)}
 className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700 select-none"
 >
 <div className="flex items-center gap-1">
 {col.label}
 <SortIcon colKey={col.key} />
 </div>
 </th>
 ))}
 <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-100">
 {sortedCampaigns.length === 0 ? (
 <tr>
 <td colSpan={10} className="px-4 py-12 text-center text-slate-400">No campaigns match your search.</td>
 </tr>
 ) : (
 sortedCampaigns.map((c) => (
 <tr
 key={c.id}
 onClick={() => handleCardClick(c)}
 className="hover:bg-slate-50 cursor-pointer transition-colors"
 >
 <td className="px-4 py-3">
 <p className="font-medium text-slate-900">{c.name}</p>
 <p className="text-[10px] text-slate-400 mt-0.5">{c.startDate} — {c.endDate}</p>
 </td>
 <td className="px-4 py-3 text-slate-600">{c.agent}</td>
 <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
 <td className="px-4 py-3 text-slate-900 font-medium tabular-nums">{c.total.toLocaleString()}</td>
 <td className="px-4 py-3 text-indigo-600 font-medium tabular-nums">{c.called.toLocaleString()}</td>
 <td className="px-4 py-3 text-emerald-600 font-medium tabular-nums">{c.connected.toLocaleString()}</td>
 <td className="px-4 py-3 text-amber-600 font-medium tabular-nums">{c.converted.toLocaleString()}</td>
 <td className="px-4 py-3"><DialectBadge dialect={c.targetDialect} /></td>
 <td className="px-4 py-3 min-w-[140px]"><ProgressBar value={c.progress} /></td>
 <td className="px-4 py-3">
 <div className="flex items-center justify-end gap-1">
 {canUpdate && c.status !=='completed' && (
 <button
 onClick={(e) => { e.stopPropagation(); handlePauseResume(c); }}
 className={`p-1.5 rounded-lg transition-colors ${
 c.status === 'active'
 ? 'text-amber-600 hover:bg-amber-50'
 : 'text-emerald-600 hover:bg-emerald-50'
 }`}
 title={c.status === 'active' ? 'Pause' : 'Resume'}
 >
 {c.status === 'active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
 </button>
 )}
 {canUpdate && (
 <button
 onClick={(e) => { e.stopPropagation(); handleEdit(c); }}
 className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
 title="Edit"
 >
 <Edit3 className="w-4 h-4" />
 </button>
 )}
 <button
 onClick={(e) => { e.stopPropagation(); handleStats(c); }}
 className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
 title="Stats"
 >
 <BarChart3 className="w-4 h-4" />
 </button>
 {canDelete && (
 <button
 onClick={(e) => { e.stopPropagation(); handleDelete(c); }}
 className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
 title="Delete"
 >
 <Trash2 className="w-4 h-4" />
 </button>
 )}
 </div>
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 </div>
 )}

 {/* ─── Campaign Detail Panel ──────────────────────────────────────────── */}
 {selectedCampaign && (
 <div className="fixed inset-0 z-50 flex justify-end">
 {/* Backdrop */}
 <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedCampaign(null)} />
 {/* Panel */}
 <div className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl animate-slide-in-right">
 {/* Panel header */}
 <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
 <Megaphone className="w-5 h-5 text-white" />
 </div>
 <div>
 <h2 className="font-bold text-slate-900">{selectedCampaign.name}</h2>
 <div className="flex items-center gap-2 mt-0.5">
 <StatusBadge status={selectedCampaign.status} />
 <span className="text-xs text-slate-400">{selectedCampaign.agent}</span>
 </div>
 </div>
 </div>
 <button
 onClick={() => setSelectedCampaign(null)}
 className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
 >
 <X className="w-5 h-5 text-slate-500" />
 </button>
 </div>

 {/* Panel body */}
 <div className="p-6 space-y-4">
 {/* Overview */}
 <div className="grid grid-cols-2 gap-3">
 <div className="bg-slate-50 rounded-lg p-3">
 <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Date Range</p>
 <p className="text-sm font-medium text-slate-900">{selectedCampaign.startDate}</p>
 <p className="text-xs text-slate-500">to {selectedCampaign.endDate}</p>
 </div>
 <div className="bg-slate-50 rounded-lg p-3">
 <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Contact List</p>
 <p className="text-sm font-medium text-slate-900">{selectedCampaign.contactList}</p>
 <p className="text-xs text-slate-500">{selectedCampaign.total.toLocaleString()} contacts</p>
 </div>
 </div>

 {/* Progress */}
 <CollapsibleSection title="Progress" badge={`${selectedCampaign.progress}%`}>
 <div className="space-y-3">
 <ProgressBar value={selectedCampaign.progress} size="lg" />
 <div className="grid grid-cols-4 gap-2">
 {[
 { label: 'Total', value: selectedCampaign.total, icon: Users, color: 'text-slate-600 bg-slate-50' },
 { label: 'Called', value: selectedCampaign.called, icon: Phone, color: 'text-indigo-600 bg-indigo-50' },
 { label: 'Connected', value: selectedCampaign.connected, icon: PhoneCall, color: 'text-emerald-600 bg-emerald-50' },
 { label: 'Converted', value: selectedCampaign.converted, icon: CheckCircle, color: 'text-amber-600 bg-amber-50' },
 ].map((stat) => (
 <div key={stat.label} className={`text-center p-2 rounded-lg ${stat.color}`}>
 <stat.icon className={`w-4 h-4 mx-auto mb-1 ${stat.color.split('')[0]}`} />
 <p className={`text-sm font-bold ${stat.color.split('')[0]}`}>{stat.value.toLocaleString()}</p>
 <p className="text-[9px] text-slate-500">{stat.label}</p>
 </div>
 ))}
 </div>
 {selectedCampaign.total > 0 && (
 <div className="text-xs text-slate-500 space-y-1">
 <div className="flex justify-between">
 <span>Call Rate</span>
 <span className="font-medium">{Math.round((selectedCampaign.called / selectedCampaign.total) * 100)}%</span>
 </div>
 <div className="flex justify-between">
 <span>Connect Rate</span>
 <span className="font-medium">{selectedCampaign.called > 0 ? Math.round((selectedCampaign.connected / selectedCampaign.called) * 100) : 0}%</span>
 </div>
 <div className="flex justify-between">
 <span>Conversion Rate</span>
 <span className="font-medium">{selectedCampaign.connected > 0 ? Math.round((selectedCampaign.converted / selectedCampaign.connected) * 100) : 0}%</span>
 </div>
 </div>
 )}
 </div>
 </CollapsibleSection>

 {/* Dialect Distribution */}
 <CollapsibleSection title="Dialect Distribution" badge={`${selectedCampaign.dialects.length} dialects`}>
 <div className="space-y-3">
 {selectedCampaign.dialects.map((d) => (
 <div key={d.dialect} className="space-y-1">
 <div className="flex items-center justify-between">
 <DialectBadge dialect={d.dialect} />
 <span className="text-xs text-slate-500">
 {d.count.toLocaleString()} contacts ({Math.round(d.pct * 100)}%)
 </span>
 </div>
 <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
 <div
 className="h-full bg-indigo-500 rounded-full transition-all"
 style={{ width: `${Math.round(d.pct * 100)}%` }}
 />
 </div>
 </div>
 ))}
 </div>
 </CollapsibleSection>

 {/* Emotion Metrics */}
 <CollapsibleSection title="Emotion Metrics" badge={selectedCampaign.emotionStrategy}>
 <div className="space-y-2.5">
 {Object.entries(selectedCampaign.emotions)
 .sort(([, a], [, b]) => b - a)
 .map(([emotion, value]) => (
 <div key={emotion} className="flex items-center gap-3">
 <EmotionIndicator emotion={emotion} confidence={value} showBar={true} />
 </div>
 ))}
 </div>
 </CollapsibleSection>

 {/* GenZ Analytics */}
 <CollapsibleSection title="GenZ Analytics" badge={selectedCampaign.genZMode ? 'ON' : 'OFF'}>
 <div className="space-y-3">
 <div className="flex items-center justify-between">
 <span className="text-sm text-slate-700">GenZ Mode</span>
 <span className={`px-2 py-0.5 rounded text-xs font-medium ${selectedCampaign.genZMode ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
 {selectedCampaign.genZMode ? 'Enabled' : 'Disabled'}
 </span>
 </div>
 {selectedCampaign.genZMode && (
 <>
 <div>
 <p className="text-xs font-medium text-slate-500 mb-1.5">Average GenZ Score</p>
 <GenZBadge score={selectedCampaign.genZScore} terms={[]} size="lg" />
 </div>
 {selectedCampaign.genZTopTerms.length > 0 && (
 <div>
 <p className="text-xs font-medium text-slate-500 mb-1.5">Top Terms Detected</p>
 <div className="flex flex-wrap gap-1.5">
 {selectedCampaign.genZTopTerms.map((term) => (
 <span key={term} className="px-2 py-1 bg-pink-50 text-pink-600 text-xs rounded-lg font-medium">
 {term}
 </span>
 ))}
 </div>
 </div>
 )}
 </>
 )}
 </div>
 </CollapsibleSection>

 {/* Panel action buttons */}
 <div className="grid grid-cols-2 gap-2 pt-4">
 {canUpdate && selectedCampaign.status !=='completed' && (
 <button
 onClick={() => handlePauseResume(selectedCampaign)}
 className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
 selectedCampaign.status === 'active'
 ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
 : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
 }`}
 >
 {selectedCampaign.status === 'active' ? <><Pause className="w-4 h-4" /> Pause</> : <><Play className="w-4 h-4" /> Resume</>}
 </button>
 )}
 {canUpdate && (
 <button
 onClick={() => handleEdit(selectedCampaign)}
 className="flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
 >
 <Edit3 className="w-4 h-4" /> Edit
 </button>
 )}
 <button
 onClick={() => handleStats(selectedCampaign)}
 className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
 >
 <BarChart3 className="w-4 h-4" /> Full Stats
 </button>
 {canDelete && (
 <button
 onClick={() => handleDelete(selectedCampaign)}
 className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
 >
 <Trash2 className="w-4 h-4" /> Delete
 </button>
 )}
 </div>
 </div>
 </div>
 </div>
 )}

 {/* ─── Create Campaign Modal ──────────────────────────────────────────── */}
 {showCreateModal && (
 <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateModal(false)}>
 <div
 className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
 onClick={(e) => e.stopPropagation()}
 >
 <div className="flex items-center justify-between mb-5">
 <h2 className="text-lg font-bold text-slate-900">New Campaign</h2>
 <button onClick={() => setShowCreateModal(false)} className="p-1 hover:bg-slate-100 rounded-lg">
 <X className="w-5 h-5 text-slate-400" />
 </button>
 </div>

 <div className="space-y-4">
 {/* Name */}
 <div>
 <label className="block text-sm font-medium text-slate-700 mb-1">Campaign Name</label>
 <input
 type="text"
 value={newCampaign.name}
 onChange={(e) => setNewCampaign((p) => ({ ...p, name: e.target.value }))}
 placeholder="e.g. March Lead Outreach"
 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
 />
 </div>

 {/* Agent */}
 <div>
 <label className="block text-sm font-medium text-slate-700 mb-1">AI Agent</label>
 <select
 value={newCampaign.agent}
 onChange={(e) => setNewCampaign((p) => ({ ...p, agent: e.target.value }))}
 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900"
 >
 <option value="Sales Pro">Sales Pro</option>
 <option value="Support Guru">Support Guru</option>
 <option value="Promo Blaster">Promo Blaster</option>
 <option value="Retention Bot">Retention Bot</option>
 <option value="Survey Agent">Survey Agent</option>
 <option value="Onboard Buddy">Onboard Buddy</option>
 </select>
 </div>

 {/* Contact List */}
 <div>
 <label className="block text-sm font-medium text-slate-700 mb-1">Contact List</label>
 <select
 value={newCampaign.contactList}
 onChange={(e) => setNewCampaign((p) => ({ ...p, contactList: e.target.value }))}
 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900"
 >
 <option value="">Select a contact list</option>
 <option value="February Leads">February Leads (2,456)</option>
 <option value="IndiaMart Leads">IndiaMart Leads (892)</option>
 <option value="Website Signups">Website Signups (567)</option>
 <option value="Product Interest List">Product Interest List (1,340)</option>
 <option value="Active Customers">Active Customers (3,210)</option>
 </select>
 </div>

 {/* Schedule */}
 <div>
 <label className="block text-sm font-medium text-slate-700 mb-1">Schedule Start</label>
 <input
 type="datetime-local"
 value={newCampaign.schedule}
 onChange={(e) => setNewCampaign((p) => ({ ...p, schedule: e.target.value }))}
 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900"
 />
 </div>

 {/* Target Dialect */}
 <div>
 <label className="block text-sm font-medium text-slate-700 mb-1">Target Dialect Preference</label>
 <select
 value={newCampaign.targetDialect}
 onChange={(e) => setNewCampaign((p) => ({ ...p, targetDialect: e.target.value }))}
 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900"
 >
 <option value="Chennai">Chennai Tamil</option>
 <option value="Kongu">Kongu Tamil</option>
 <option value="Madurai">Madurai Tamil</option>
 <option value="Tirunelveli">Tirunelveli Tamil</option>
 <option value="Hindi">Hindi</option>
 <option value="English">English</option>
 </select>
 </div>

 {/* Emotion Strategy */}
 <div>
 <label className="block text-sm font-medium text-slate-700 mb-1">Emotion Strategy</label>
 <select
 value={newCampaign.emotionStrategy}
 onChange={(e) => setNewCampaign((p) => ({ ...p, emotionStrategy: e.target.value }))}
 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900"
 >
 <option value="Adaptive">Adaptive - Adjusts dynamically</option>
 <option value="Empathy First">Empathy First - Lead with empathy</option>
 <option value="Enthusiasm Match">Enthusiasm Match - Mirror energy</option>
 <option value="Neutral Polite">Neutral Polite - Professional tone</option>
 <option value="Festive Enthusiasm">Festive Enthusiasm - Celebratory</option>
 </select>
 </div>

 {/* GenZ Mode */}
 <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
 <div className="flex items-center gap-2">
 <Sparkles className="w-4 h-4 text-pink-500" />
 <span className="text-sm font-medium text-slate-700">GenZ Mode</span>
 </div>
 <button
 type="button"
 onClick={() => setNewCampaign((p) => ({ ...p, genZMode: !p.genZMode }))}
 className={`relative w-11 h-6 rounded-full transition-colors ${newCampaign.genZMode ? 'bg-indigo-600' : 'bg-slate-300'}`}
 >
 <span
 className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${newCampaign.genZMode ? 'translate-x-5' : 'translate-x-0'}`}
 />
 </button>
 </div>
 </div>

 {/* Modal actions */}
 <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200">
 <button
 onClick={() => setShowCreateModal(false)}
 className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
 >
 Cancel
 </button>
 <button
 onClick={handleCreateCampaign}
 className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
 >
 Create Campaign
 </button>
 </div>
 </div>
 </div>
 )}

 {/* Slide-in animation style */}
 <style>{`
 @keyframes slideInRight {
 from { transform: translateX(100%); }
 to { transform: translateX(0); }
 }
 .animate-slide-in-right {
 animation: slideInRight 0.25s ease-out;
 }
 `}</style>
 </div>
 );
}
