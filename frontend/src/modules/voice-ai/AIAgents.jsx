import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { usePermissions } from '../../hooks/usePermissions';
import { assistantsAPI } from '../../services/api';
import {
 Bot, Plus, LayoutGrid, Columns, X, Settings, Power, Trash2,
 Phone, CheckCircle, Clock, Globe, Sparkles, Brain, Smile,
 Mic, Volume2, Shield, Zap, ChevronRight, Search, Filter
} from 'lucide-react';
import CollapsibleSection from './components/CollapsibleSection';
import KanbanBoard from './components/KanbanBoard';
import DialectBadge from './components/DialectBadge';
import EmotionIndicator from './components/EmotionIndicator';
import GenZBadge from './components/GenZBadge';

// ── Mock Data ───────────────────────────────────────────────────────────────────
const initialAgents = [
 {
 id: 1,
 name: 'Sales Pro',
 description: 'High-performance outbound sales agent for B2B lead qualification',
 status: 'active',
 voice: 'Female - Natural',
 personality: 'Professional & Persuasive',
 totalCalls: 3842,
 successRate: 0.74,
 avgDuration: '4:22',
 languages: ['Tamil','English','Hindi'],
 dialects: [
 { dialect: 'Chennai', confidence: 0.92 },
 { dialect: 'Kongu', confidence: 0.85 },
 ],
 emotionRules: [
 { emotion: 'angry', action: 'Switch to empathetic tone, offer callback' },
 { emotion: 'happy', action: 'Upsell and cross-sell opportunities' },
 { emotion: 'confused', action: 'Simplify language, repeat key points' },
 ],
 genZMode: true,
 genZScore: 0.72,
 genZTerms: ['no cap','slay','bet','vibe check','lowkey'],
 createdAt: '2026-01-15',
 },
 {
 id: 2,
 name: 'Support Guru',
 description: 'Customer support specialist for issue resolution and escalations',
 status: 'active',
 voice: 'Male - Calm',
 personality: 'Patient & Empathetic',
 totalCalls: 5621,
 successRate: 0.89,
 avgDuration: '6:15',
 languages: ['Tamil','English'],
 dialects: [
 { dialect: 'Madurai', confidence: 0.88 },
 { dialect: 'Chennai', confidence: 0.95 },
 { dialect: 'English', confidence: 0.97 },
 ],
 emotionRules: [
 { emotion: 'angry', action: 'Acknowledge frustration, escalate if needed' },
 { emotion: 'sad', action: 'Show empathy, offer proactive solutions' },
 { emotion: 'neutral', action: 'Maintain friendly professional tone' },
 ],
 genZMode: false,
 genZScore: 0,
 genZTerms: [],
 createdAt: '2026-01-08',
 },
 {
 id: 3,
 name: 'Promo Blaster',
 description: 'Promotional campaign agent for product announcements and offers',
 status: 'active',
 voice: 'Female - Energetic',
 personality: 'Enthusiastic & Friendly',
 totalCalls: 12430,
 successRate: 0.61,
 avgDuration: '2:45',
 languages: ['Tamil','Hindi','English'],
 dialects: [
 { dialect: 'Kongu', confidence: 0.90 },
 { dialect: 'Tirunelveli', confidence: 0.78 },
 { dialect: 'Hindi', confidence: 0.93 },
 ],
 emotionRules: [
 { emotion: 'excited', action: 'Match energy, push for conversion' },
 { emotion: 'neutral', action: 'Build excitement with benefits' },
 ],
 genZMode: true,
 genZScore: 0.85,
 genZTerms: ['fire','W','bestie','its giving','fr fr'],
 createdAt: '2026-02-01',
 },
 {
 id: 4,
 name: 'Retention Bot',
 description: 'Churn prevention agent focusing on customer retention and win-back',
 status: 'inactive',
 voice: 'Male - Warm',
 personality: 'Understanding & Solution-Oriented',
 totalCalls: 1890,
 successRate: 0.68,
 avgDuration: '5:40',
 languages: ['Tamil','English'],
 dialects: [
 { dialect: 'Chennai', confidence: 0.91 },
 { dialect: 'English', confidence: 0.96 },
 ],
 emotionRules: [
 { emotion: 'angry', action: 'De-escalate, offer incentives' },
 { emotion: 'sad', action: 'Empathize, highlight value delivered' },
 ],
 genZMode: false,
 genZScore: 0,
 genZTerms: [],
 createdAt: '2025-12-20',
 },
 {
 id: 5,
 name: 'Survey Agent',
 description: 'Post-call survey and feedback collection specialist',
 status: 'inactive',
 voice: 'Female - Neutral',
 personality: 'Concise & Polite',
 totalCalls: 890,
 successRate: 0.52,
 avgDuration: '1:55',
 languages: ['Tamil','Hindi'],
 dialects: [
 { dialect: 'Madurai', confidence: 0.82 },
 { dialect: 'Hindi', confidence: 0.88 },
 ],
 emotionRules: [
 { emotion: 'neutral', action: 'Keep survey flowing' },
 { emotion: 'angry', action: 'Shorten survey, thank and disconnect' },
 ],
 genZMode: false,
 genZScore: 0.2,
 genZTerms: ['bussin'],
 createdAt: '2026-01-25',
 },
 {
 id: 6,
 name: 'Onboard Buddy',
 description: 'New customer onboarding assistant with step-by-step guidance',
 status: 'training',
 voice: 'Male - Friendly',
 personality: 'Helpful & Encouraging',
 totalCalls: 245,
 successRate: 0.58,
 avgDuration: '8:10',
 languages: ['Tamil','English','Hindi'],
 dialects: [
 { dialect: 'Tirunelveli', confidence: 0.72 },
 { dialect: 'Kongu', confidence: 0.65 },
 { dialect: 'English', confidence: 0.90 },
 ],
 emotionRules: [
 { emotion: 'confused', action: 'Slow down, use simpler language' },
 { emotion: 'happy', action: 'Encourage and move to next step' },
 { emotion: 'neutral', action: 'Add engagement questions' },
 ],
 genZMode: true,
 genZScore: 0.45,
 genZTerms: ['lit','vibe','sus'],
 createdAt: '2026-02-18',
 },
];

// ── Status badge helper ─────────────────────────────────────────────────────────
const statusBadge = (status) => {
 const styles = {
 active: 'bg-emerald-100 text-emerald-700',
 inactive: 'bg-slate-100 text-slate-600',
 training: 'bg-amber-100 text-amber-700',
 };
 return (
 <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${styles[status] || styles.inactive}`}>
 {status}
 </span>
 );
};

// ── Agent card content (shared between kanban & grid) ───────────────────────────
function AgentCardContent({ agent, onConfigure, onToggle, onDelete, canUpdate = true, canDelete = true }) {
 return (
 <>
 <div className="flex items-start justify-between mb-2">
 <div className="flex items-center gap-2">
 <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
 <Bot className="w-4 h-4 text-white" />
 </div>
 <div>
 <h4 className="font-semibold text-sm text-slate-900">{agent.name}</h4>
 </div>
 </div>
 {statusBadge(agent.status)}
 </div>

 <p className="text-xs text-slate-500 mb-3 line-clamp-2">{agent.description}</p>

 {/* Stats row */}
 <div className="grid grid-cols-2 gap-2 mb-3">
 <div className="bg-slate-50 rounded-lg px-2 py-1.5 text-center">
 <p className="text-sm font-bold text-slate-900">{agent.totalCalls.toLocaleString()}</p>
 <p className="text-[10px] text-slate-500">Total Calls</p>
 </div>
 <div className="bg-slate-50 rounded-lg px-2 py-1.5 text-center">
 <p className="text-sm font-bold text-emerald-600">{Math.round(agent.successRate * 100)}%</p>
 <p className="text-[10px] text-slate-500">Success Rate</p>
 </div>
 </div>

 {/* Languages */}
 <div className="flex items-center gap-1 mb-2 flex-wrap">
 <Globe className="w-3 h-3 text-slate-400 flex-shrink-0" />
 {agent.languages.map((lang) => (
 <span key={lang} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
 {lang}
 </span>
 ))}
 </div>

 {/* Dialects */}
 <div className="flex items-center gap-1 mb-3 flex-wrap">
 {agent.dialects.map((d) => (
 <DialectBadge key={d.dialect} dialect={d.dialect} confidence={d.confidence} />
 ))}
 </div>

 {/* GenZ badge if applicable */}
 {agent.genZMode && (
 <div className="mb-3">
 <GenZBadge score={agent.genZScore} terms={agent.genZTerms} />
 </div>
 )}

 {/* Action buttons */}
 <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100">
 <button
 onClick={(e) => { e.stopPropagation(); onConfigure(agent); }}
 className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-100 transition-colors"
 >
 <Settings className="w-3 h-3" /> Configure
 </button>
 {canUpdate && (
 <button
 onClick={(e) => { e.stopPropagation(); onToggle(agent); }}
 className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-amber-50 text-amber-600 rounded-lg text-xs font-medium hover:bg-amber-100 transition-colors"
 >
 <Power className="w-3 h-3" /> Toggle
 </button>
 )}
 {canDelete && (
 <button
 onClick={(e) => { e.stopPropagation(); onDelete(agent); }}
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
export default function AIAgentsPage() {
 const { can } = usePermissions();
 const canCreate = can('voiceAI','create');
 const canUpdate = can('voiceAI','update');
 const canDelete = can('voiceAI','delete');
 const [agents, setAgents] = useState(initialAgents);
 const [viewMode, setViewMode] = useState('kanban'); //'kanban' |'grid'

 // Load agents from API on mount
 useEffect(() => {
 let cancelled = false;
 assistantsAPI.getAll()
 .then(({ data }) => {
 if (cancelled || !Array.isArray(data) || data.length === 0) return;
 const mapped = data.map(a => ({
 id: a.id,
 name: a.name || a.assistant_name || 'Agent',
 description: a.description || a.system_prompt?.slice(0, 80) || '',
 status: a.is_active ? 'active' : 'inactive',
 voice: a.voice || a.tts_voice || 'Default',
 personality: a.personality || 'Professional',
 totalCalls: a.total_calls || 0,
 successRate: a.success_rate || 0,
 avgDuration: a.avg_duration || '0:00',
 languages: a.languages || ['Tamil'],
 dialects: a.dialects || [{ dialect: 'Chennai', confidence: 0.8 }],
 emotionRules: a.emotion_rules || [],
 genZMode: a.genz_mode || false,
 genZScore: a.genz_score || 0,
 genZTerms: a.genz_terms || [],
 createdAt: a.created_at ? new Date(a.created_at).toISOString().split('T')[0] : '',
 }));
 setAgents(prev => [...mapped, ...prev.filter(p => !mapped.find(m => m.id === p.id))]);
 })
 .catch(() => {}); // keep mock data
 return () => { cancelled = true; };
 }, []);
 const [selectedAgent, setSelectedAgent] = useState(null);
 const [showCreateModal, setShowCreateModal] = useState(false);
 const [searchQuery, setSearchQuery] = useState('');

 // Create agent form state
 const [newAgent, setNewAgent] = useState({
 name: '',
 voice: 'Female - Natural',
 language: 'Tamil',
 dialects: ['Chennai'],
 personality: 'Professional & Persuasive',
 genZMode: false,
 emotionSensitivity: 50,
 });

 // ── Derived data ─────────────────────────────────────────────────────────────
 const filteredAgents = agents.filter((a) =>
 a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
 a.description.toLowerCase().includes(searchQuery.toLowerCase())
 );

 const activeAgents = filteredAgents.filter((a) => a.status === 'active');
 const inactiveAgents = filteredAgents.filter((a) => a.status === 'inactive');
 const trainingAgents = filteredAgents.filter((a) => a.status === 'training');

 // ── Handlers ─────────────────────────────────────────────────────────────────
 const handleConfigure = (agent) => {
 toast.success(`Opening configuration for "${agent.name}"`);
 };

 const handleToggle = (agent) => {
 setAgents((prev) =>
 prev.map((a) => {
 if (a.id === agent.id) {
 const next = a.status === 'active' ? 'inactive' : 'active';
 toast.success(`Agent"${a.name}" set to ${next}`);
 return { ...a, status: next };
 }
 return a;
 })
 );
 if (selectedAgent?.id === agent.id) {
 setSelectedAgent((prev) => ({
 ...prev,
 status: prev.status === 'active' ? 'inactive' : 'active',
 }));
 }
 };

 const handleDelete = (agent) => {
 setAgents((prev) => prev.filter((a) => a.id !== agent.id));
 if (selectedAgent?.id === agent.id) setSelectedAgent(null);
 toast.success(`Agent"${agent.name}" deleted`);
 };

 const handleCardClick = (agent) => {
 setSelectedAgent(agent);
 };

 const handleCreateAgent = () => {
 if (!newAgent.name.trim()) {
 toast.error('Please enter an agent name');
 return;
 }
 const created = {
 id: Date.now(),
 name: newAgent.name,
 description: `Custom AI agent with ${newAgent.personality.toLowerCase()} personality`,
 status: 'training',
 voice: newAgent.voice,
 personality: newAgent.personality,
 totalCalls: 0,
 successRate: 0,
 avgDuration: '0:00',
 languages: [newAgent.language],
 dialects: newAgent.dialects.map((d) => ({ dialect: d, confidence: 0.5 })),
 emotionRules: [
 { emotion: 'angry', action: 'De-escalate with empathy' },
 { emotion: 'happy', action: 'Reinforce positive sentiment' },
 ],
 genZMode: newAgent.genZMode,
 genZScore: newAgent.genZMode ? 0.3 : 0,
 genZTerms: newAgent.genZMode ? ['vibe','bet'] : [],
 createdAt: new Date().toISOString().split('T')[0],
 };
 setAgents((prev) => [...prev, created]);
 toast.success(`Agent"${newAgent.name}" created and set to training`);
 setNewAgent({
 name: '',
 voice: 'Female - Natural',
 language: 'Tamil',
 dialects: ['Chennai'],
 personality: 'Professional & Persuasive',
 genZMode: false,
 emotionSensitivity: 50,
 });
 setShowCreateModal(false);
 };

 const handleDialectToggle = (dialect) => {
 setNewAgent((prev) => {
 const has = prev.dialects.includes(dialect);
 return {
 ...prev,
 dialects: has
 ? prev.dialects.filter((d) => d !== dialect)
 : [...prev.dialects, dialect],
 };
 });
 };

 // ── Kanban columns ───────────────────────────────────────────────────────────
 const kanbanColumns = [
 { id: 'active', title: 'Active', items: activeAgents },
 { id: 'inactive', title: 'Inactive', items: inactiveAgents },
 { id: 'training', title: 'Training', items: trainingAgents },
 ];

 // ── Render ───────────────────────────────────────────────────────────────────
 return (
 <div className="space-y-6">
 {/* ─── Header ─────────────────────────────────────────────────────────── */}
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
 <div>
 <h1 className="text-2xl font-bold text-slate-900">AI Agents</h1>
 <p className="text-sm text-slate-500 mt-0.5">Manage your voice AI agents, dialects, and emotion handling</p>
 </div>
 <div className="flex items-center gap-2">
 {/* Search */}
 <div className="relative">
 <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
 <input
 type="text"
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 placeholder="Search agents..."
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
 onClick={() => setViewMode('grid')}
 className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
 title="Grid view"
 >
 <LayoutGrid className="w-4 h-4" />
 </button>
 </div>
 {/* Create button */}
 {canCreate && (
 <button
 onClick={() => setShowCreateModal(true)}
 className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
 >
 <Plus className="w-4 h-4" /> Create Agent
 </button>
 )}
 </div>
 </div>

 {/* ─── Kanban View ────────────────────────────────────────────────────── */}
 {viewMode === 'kanban' && (
 <KanbanBoard
 columns={kanbanColumns}
 onCardClick={handleCardClick}
 emptyMessage="No agents in this column"
 renderCard={(agent) => (
 <AgentCardContent
 agent={agent}
 onConfigure={handleConfigure}
 onToggle={handleToggle}
 onDelete={handleDelete}
 canUpdate={canUpdate}
 canDelete={canDelete}
 />
 )}
 />
 )}

 {/* ─── Grid View ──────────────────────────────────────────────────────── */}
 {viewMode === 'grid' && (
 <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
 {filteredAgents.length === 0 ? (
 <p className="col-span-full text-center text-slate-400 py-12">No agents match your search.</p>
 ) : (
 filteredAgents.map((agent) => (
 <div
 key={agent.id}
 onClick={() => handleCardClick(agent)}
 className="bg-white rounded-xl p-4 border border-slate-200 hover:shadow-md hover:border-indigo-300 cursor-pointer transition-all"
 >
 <AgentCardContent
 agent={agent}
 onConfigure={handleConfigure}
 onToggle={handleToggle}
 onDelete={handleDelete}
 />
 </div>
 ))
 )}
 </div>
 )}

 {/* ─── Detail Side Panel ──────────────────────────────────────────────── */}
 {selectedAgent && (
 <div className="fixed inset-0 z-50 flex justify-end">
 {/* Backdrop */}
 <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedAgent(null)} />
 {/* Panel */}
 <div className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl animate-slide-in-right">
 {/* Panel header */}
 <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
 <Bot className="w-5 h-5 text-white" />
 </div>
 <div>
 <h2 className="font-bold text-slate-900">{selectedAgent.name}</h2>
 <div className="flex items-center gap-2 mt-0.5">
 {statusBadge(selectedAgent.status)}
 <span className="text-xs text-slate-400">Created {selectedAgent.createdAt}</span>
 </div>
 </div>
 </div>
 <button
 onClick={() => setSelectedAgent(null)}
 className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
 >
 <X className="w-5 h-5 text-slate-500" />
 </button>
 </div>

 {/* Panel body */}
 <div className="p-6 space-y-4">
 <p className="text-sm text-slate-600">{selectedAgent.description}</p>

 {/* Performance */}
 <CollapsibleSection title="Performance" badge={`${Math.round(selectedAgent.successRate * 100)}%`}>
 <div className="grid grid-cols-3 gap-3">
 <div className="text-center">
 <div className="flex items-center justify-center w-10 h-10 bg-indigo-50 rounded-lg mx-auto mb-1">
 <Phone className="w-4 h-4 text-indigo-600" />
 </div>
 <p className="text-lg font-bold text-slate-900">{selectedAgent.totalCalls.toLocaleString()}</p>
 <p className="text-[10px] text-slate-500">Total Calls</p>
 </div>
 <div className="text-center">
 <div className="flex items-center justify-center w-10 h-10 bg-emerald-50 rounded-lg mx-auto mb-1">
 <CheckCircle className="w-4 h-4 text-emerald-600" />
 </div>
 <p className="text-lg font-bold text-emerald-600">{Math.round(selectedAgent.successRate * 100)}%</p>
 <p className="text-[10px] text-slate-500">Success Rate</p>
 </div>
 <div className="text-center">
 <div className="flex items-center justify-center w-10 h-10 bg-amber-50 rounded-lg mx-auto mb-1">
 <Clock className="w-4 h-4 text-amber-600" />
 </div>
 <p className="text-lg font-bold text-slate-900">{selectedAgent.avgDuration}</p>
 <p className="text-[10px] text-slate-500">Avg Duration</p>
 </div>
 </div>
 </CollapsibleSection>

 {/* Language & Dialect */}
 <CollapsibleSection title="Language & Dialect" badge={`${selectedAgent.dialects.length} dialects`}>
 <div className="space-y-3">
 <div>
 <p className="text-xs font-medium text-slate-500 mb-2">Supported Languages</p>
 <div className="flex flex-wrap gap-1.5">
 {selectedAgent.languages.map((lang) => (
 <span key={lang} className="px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded-lg font-medium">
 {lang}
 </span>
 ))}
 </div>
 </div>
 <div>
 <p className="text-xs font-medium text-slate-500 mb-2">Dialect Capabilities</p>
 <div className="space-y-2">
 {selectedAgent.dialects.map((d) => (
 <div key={d.dialect} className="flex items-center justify-between">
 <DialectBadge dialect={d.dialect} confidence={d.confidence} size="lg" />
 <div className="flex-1 mx-3 h-1.5 bg-slate-200 rounded-full overflow-hidden">
 <div
 className="h-full bg-indigo-500 rounded-full transition-all"
 style={{ width: `${Math.round(d.confidence * 100)}%` }}
 />
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>
 </CollapsibleSection>

 {/* Emotion Handling */}
 <CollapsibleSection title="Emotion Handling" badge={`${selectedAgent.emotionRules.length} rules`}>
 <div className="space-y-3">
 {selectedAgent.emotionRules.map((rule, i) => (
 <div key={i} className="flex items-start gap-3 p-2.5 bg-slate-50 rounded-lg">
 <EmotionIndicator emotion={rule.emotion} showBar={false} />
 <p className="text-xs text-slate-600 mt-0.5">{rule.action}</p>
 </div>
 ))}
 </div>
 </CollapsibleSection>

 {/* GenZ Mode */}
 <CollapsibleSection title="GenZ Mode" badge={selectedAgent.genZMode ? 'ON' : 'OFF'}>
 <div className="space-y-3">
 <div className="flex items-center justify-between">
 <span className="text-sm text-slate-700">GenZ Slang Understanding</span>
 <span className={`px-2 py-0.5 rounded text-xs font-medium ${selectedAgent.genZMode ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
 {selectedAgent.genZMode ? 'Enabled' : 'Disabled'}
 </span>
 </div>
 {selectedAgent.genZMode && (
 <>
 <div>
 <p className="text-xs font-medium text-slate-500 mb-1.5">GenZ Score</p>
 <GenZBadge score={selectedAgent.genZScore} terms={selectedAgent.genZTerms} size="lg" />
 </div>
 <div>
 <p className="text-xs font-medium text-slate-500 mb-1.5">Detected Terms Preview</p>
 <div className="flex flex-wrap gap-1.5">
 {selectedAgent.genZTerms.map((term) => (
 <span key={term} className="px-2 py-1 bg-pink-50 text-pink-600 text-xs rounded-lg font-medium">
 {term}
 </span>
 ))}
 </div>
 </div>
 </>
 )}
 </div>
 </CollapsibleSection>

 {/* Panel actions */}
 <div className="flex items-center gap-2 pt-4">
 <button
 onClick={() => { handleConfigure(selectedAgent); }}
 className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
 >
 <Settings className="w-4 h-4" /> Configure
 </button>
 <button
 onClick={() => { handleToggle(selectedAgent); }}
 className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
 >
 <Power className="w-4 h-4" /> Toggle Status
 </button>
 </div>
 </div>
 </div>
 </div>
 )}

 {/* ─── Create Agent Modal ─────────────────────────────────────────────── */}
 {showCreateModal && (
 <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateModal(false)}>
 <div
 className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
 onClick={(e) => e.stopPropagation()}
 >
 <div className="flex items-center justify-between mb-5">
 <h2 className="text-lg font-bold text-slate-900">Create New Agent</h2>
 <button onClick={() => setShowCreateModal(false)} className="p-1 hover:bg-slate-100 rounded-lg">
 <X className="w-5 h-5 text-slate-400" />
 </button>
 </div>

 <div className="space-y-4">
 {/* Name */}
 <div>
 <label className="block text-sm font-medium text-slate-700 mb-1">Agent Name</label>
 <input
 type="text"
 value={newAgent.name}
 onChange={(e) => setNewAgent((p) => ({ ...p, name: e.target.value }))}
 placeholder="e.g. Sales Champion"
 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
 />
 </div>

 {/* Voice */}
 <div>
 <label className="block text-sm font-medium text-slate-700 mb-1">Voice</label>
 <select
 value={newAgent.voice}
 onChange={(e) => setNewAgent((p) => ({ ...p, voice: e.target.value }))}
 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900"
 >
 <option value="Female - Natural">Female - Natural</option>
 <option value="Female - Energetic">Female - Energetic</option>
 <option value="Female - Neutral">Female - Neutral</option>
 <option value="Male - Calm">Male - Calm</option>
 <option value="Male - Warm">Male - Warm</option>
 <option value="Male - Friendly">Male - Friendly</option>
 </select>
 </div>

 {/* Language */}
 <div>
 <label className="block text-sm font-medium text-slate-700 mb-1">Primary Language</label>
 <select
 value={newAgent.language}
 onChange={(e) => setNewAgent((p) => ({ ...p, language: e.target.value }))}
 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900"
 >
 <option value="Tamil">Tamil</option>
 <option value="Hindi">Hindi</option>
 <option value="English">English</option>
 </select>
 </div>

 {/* Dialect options */}
 <div>
 <label className="block text-sm font-medium text-slate-700 mb-2">Dialect Support</label>
 <div className="flex flex-wrap gap-2">
 {['Kongu','Chennai','Madurai','Tirunelveli','Hindi','English'].map((dialect) => {
 const isSelected = newAgent.dialects.includes(dialect);
 return (
 <button
 key={dialect}
 type="button"
 onClick={() => handleDialectToggle(dialect)}
 className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
 isSelected
 ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
 : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
 }`}
 >
 {dialect} Tamil{dialect !=='Hindi' && dialect !=='English' ? '' : ''}
 {isSelected && <span className="ml-1">&#10003;</span>}
 </button>
 );
 })}
 </div>
 </div>

 {/* Personality */}
 <div>
 <label className="block text-sm font-medium text-slate-700 mb-1">Personality</label>
 <select
 value={newAgent.personality}
 onChange={(e) => setNewAgent((p) => ({ ...p, personality: e.target.value }))}
 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900"
 >
 <option value="Professional & Persuasive">Professional & Persuasive</option>
 <option value="Patient & Empathetic">Patient & Empathetic</option>
 <option value="Enthusiastic & Friendly">Enthusiastic & Friendly</option>
 <option value="Understanding & Solution-Oriented">Understanding & Solution-Oriented</option>
 <option value="Concise & Polite">Concise & Polite</option>
 <option value="Helpful & Encouraging">Helpful & Encouraging</option>
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
 onClick={() => setNewAgent((p) => ({ ...p, genZMode: !p.genZMode }))}
 className={`relative w-11 h-6 rounded-full transition-colors ${newAgent.genZMode ? 'bg-indigo-600' : 'bg-slate-300'}`}
 >
 <span
 className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${newAgent.genZMode ? 'translate-x-5' : 'translate-x-0'}`}
 />
 </button>
 </div>

 {/* Emotion Sensitivity */}
 <div>
 <label className="block text-sm font-medium text-slate-700 mb-2">
 Emotion Sensitivity: <span className="text-indigo-600">{newAgent.emotionSensitivity}%</span>
 </label>
 <input
 type="range"
 min="0"
 max="100"
 value={newAgent.emotionSensitivity}
 onChange={(e) => setNewAgent((p) => ({ ...p, emotionSensitivity: parseInt(e.target.value) }))}
 className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-indigo-600"
 />
 <div className="flex justify-between text-[10px] text-slate-400 mt-1">
 <span>Low</span>
 <span>Medium</span>
 <span>High</span>
 </div>
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
 onClick={handleCreateAgent}
 className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
 >
 Create Agent
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
