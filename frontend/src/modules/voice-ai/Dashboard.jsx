/**
 * Voice AI Command Center Dashboard - Redesigned with Dialect/Emotion/GenZ/Code-Mix analytics
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, Link } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermissions';

// React Query hooks — real API data with mock fallback
let useVoiceStats, useVoiceAnalyses, useDialerCampaigns;
try {
 const api = require('../../hooks/api');
 useVoiceStats = api.useVoiceStats;
 useVoiceAnalyses = api.useVoiceAnalyses;
 useDialerCampaigns = api.useDialerCampaigns;
} catch { /* hooks not available, use mock data */ }
import {
 Phone, PhoneCall, PhoneOff, Mic, Users, TrendingUp, TrendingDown, Clock,
 Play, Pause, Volume2, BarChart3, Zap, Target, Calendar, Activity,
 CheckCircle, XCircle, AlertCircle, ChevronRight, Radio, Sparkles,
 Languages, Brain, X, Plus
} from 'lucide-react';
import {
 BarChart, Bar, PieChart, Pie, Cell,
 XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import DialectBadge from './components/DialectBadge';
import EmotionIndicator from './components/EmotionIndicator';
import GenZBadge from './components/GenZBadge';

/* ─── Stat Card ──────────────────────────────────────────────────── */
const StatCard = ({ label, value, change, changeType, icon: Icon, color, subtext }) => (
 <div className="bg-white rounded-xl p-5 border border-slate-200 hover:shadow-lg transition-shadow">
 <div className="flex items-center justify-between">
 <div className={`p-2.5 rounded-xl ${color}`}>
 <Icon className="w-5 h-5" />
 </div>
 {change && (
 <span className={`flex items-center gap-1 text-sm font-medium ${changeType === 'up' ? 'text-emerald-600' : 'text-red-500'}`}>
 {changeType === 'up' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
 {change}
 </span>
 )}
 </div>
 <p className="text-2xl font-bold text-slate-900 mt-4">{value}</p>
 <p className="text-sm text-slate-500 mt-1">{label}</p>
 {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
 </div>
);

/* ─── Live Call Card (enhanced) ──────────────────────────────────── */
const LiveCallCard = ({ call, onListen, onTakeOver, onEndCall }) => (
 <div className="bg-white rounded-xl p-4 border border-slate-200 hover:shadow-md transition-shadow">
 <div className="flex items-center justify-between mb-3">
 <div className="flex items-center gap-3">
 <div className="relative">
 <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center">
 <Phone className="w-5 h-5 text-white" />
 </div>
 <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white animate-pulse" />
 </div>
 <div>
 <p className="font-medium text-slate-900">{call.name}</p>
 <p className="text-sm text-slate-500">{call.phone}</p>
 </div>
 </div>
 <span className="text-sm font-mono text-slate-600">{call.duration}</span>
 </div>

 <div className="flex items-center gap-2 flex-wrap mb-3">
 <DialectBadge dialect={call.dialect} confidence={call.dialectConfidence} />
 <EmotionIndicator emotion={call.emotion} confidence={call.emotionConfidence} showBar={false} />
 {call.genZScore > 0 && <GenZBadge score={call.genZScore} terms={call.genZTerms} />}
 </div>

 <div className="bg-slate-50 rounded-lg p-3 mb-3">
 <p className="text-sm text-slate-600 italic">"{call.lastMessage}"</p>
 </div>

 <div className="flex items-center gap-2">
 <button
 onClick={() => onListen(call)}
 className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-slate-100 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-200 transition-colors"
 >
 <Volume2 className="w-4 h-4" /> Listen
 </button>
 <button
 onClick={() => onTakeOver(call)}
 className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-200 transition-colors"
 >
 <Mic className="w-4 h-4" /> Take Over
 </button>
 <button
 onClick={() => onEndCall(call)}
 className="px-3 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
 >
 <PhoneOff className="w-4 h-4" />
 </button>
 </div>
 </div>
);

/* ─── Campaign Card ──────────────────────────────────────────────── */
const CampaignCard = ({ campaign, onToggleStatus, onViewAnalytics }) => {
 const statusColors = {
 active: 'bg-emerald-100 text-emerald-700',
 paused: 'bg-amber-100 text-amber-700',
 completed: 'bg-slate-100 text-slate-600',
 scheduled: 'bg-blue-100 text-blue-700',
 };

 return (
 <div className="bg-white rounded-xl p-4 border border-slate-200 hover:shadow-md transition-shadow">
 <div className="flex items-start justify-between mb-3">
 <div>
 <h3 className="font-semibold text-slate-900">{campaign.name}</h3>
 <p className="text-sm text-slate-500">{campaign.agent}</p>
 </div>
 <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[campaign.status]}`}>
 {campaign.status}
 </span>
 </div>

 <div className="grid grid-cols-3 gap-2 mb-3 text-center">
 <div className="bg-slate-50 rounded-lg p-2">
 <p className="text-lg font-bold text-slate-900">{campaign.totalCalls}</p>
 <p className="text-xs text-slate-500">Total</p>
 </div>
 <div className="bg-slate-50 rounded-lg p-2">
 <p className="text-lg font-bold text-emerald-600">{campaign.connected}</p>
 <p className="text-xs text-slate-500">Connected</p>
 </div>
 <div className="bg-slate-50 rounded-lg p-2">
 <p className="text-lg font-bold text-indigo-600">{campaign.converted}</p>
 <p className="text-xs text-slate-500">Converted</p>
 </div>
 </div>

 <div className="mb-3">
 <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
 <span>Progress</span>
 <span>{campaign.progress}%</span>
 </div>
 <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
 <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${campaign.progress}%` }} />
 </div>
 </div>

 <div className="flex items-center gap-2">
 {campaign.status === 'active' ? (
 <button
 onClick={() => onToggleStatus(campaign)}
 className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-200 transition-colors"
 >
 <Pause className="w-4 h-4" /> Pause
 </button>
 ) : (
 <button
 onClick={() => onToggleStatus(campaign)}
 className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-200 transition-colors"
 >
 <Play className="w-4 h-4" /> Start
 </button>
 )}
 <button
 onClick={() => onViewAnalytics(campaign)}
 className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 text-slate-700 transition-colors"
 >
 <BarChart3 className="w-4 h-4" />
 </button>
 </div>
 </div>
 );
};

/* ─── Custom Tooltip for Charts ──────────────────────────────────── */
const ChartTooltip = ({ active, payload, label }) => {
 if (!active || !payload?.length) return null;
 return (
 <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-lg">
 <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
 {payload.map((p, i) => (
 <p key={i} className="text-sm font-semibold" style={{ color: p.fill || p.color }}>
 {p.name}: {p.value}
 </p>
 ))}
 </div>
 );
};

/* ═══════════════════════════════════════════════════════════════════
 MAIN DASHBOARD COMPONENT
 ═══════════════════════════════════════════════════════════════════ */
export default function VoiceAIDashboard() {
 const navigate = useNavigate();
 const { can } = usePermissions();
 const canCreate = can('voiceAI','create');
 const canUpdate = can('voiceAI','update');

 /* ── API Data (real) with mock fallback ──────────────────── */
 let apiStats = null;
 let apiAnalyses = null;
 let apiCampaigns = null;
 try {
 if (useVoiceStats) apiStats = useVoiceStats();
 if (useVoiceAnalyses) apiAnalyses = useVoiceAnalyses({ limit: 10 });
 if (useDialerCampaigns) apiCampaigns = useDialerCampaigns();
 } catch { /* API unavailable */ }

 /* ── State (mock fallback) ─────────────────────────────── */
 const mockCampaigns = [
 { id: 1, name: 'February Lead Follow-up', agent: 'Sales Bot', status: 'active', totalCalls: 500, connected: 342, converted: 48, progress: 68 },
 { id: 2, name: 'Product Launch Campaign', agent: 'Promo Bot', status: 'active', totalCalls: 1000, connected: 456, converted: 67, progress: 45 },
 { id: 3, name: 'Customer Reactivation', agent: 'Retention Bot', status: 'paused', totalCalls: 300, connected: 189, converted: 23, progress: 63 },
 ];
 const [campaigns, setCampaigns] = useState(mockCampaigns);

 // Merge API campaigns when available
 useEffect(() => {
 if (apiCampaigns?.data?.items?.length > 0) {
 setCampaigns(apiCampaigns.data.items.map(c => ({
 id: c.id, name: c.name, agent: c.mode || 'Power',
 status: c.status === 'running' ? 'active' : c.status,
 totalCalls: c.total_contacts, connected: c.connected, converted: c.converted,
 progress: c.total_contacts > 0 ? Math.round(c.contacted / c.total_contacts * 100) : 0,
 })));
 }
 }, [apiCampaigns?.data]);

 const [showNewCampaignModal, setShowNewCampaignModal] = useState(false);
 const [newCampaign, setNewCampaign] = useState({
 name: '', agent: 'Sales Bot', contactList: '', schedule: '',
 });

 /* ── Stat Data (API-backed when available) ────────────────── */
 const realStats = apiStats?.data;
 const stats = [
 { label: 'Total Analyses', value: realStats?.total_analyses?.toLocaleString() || '1,247', change: '+18%', changeType: 'up', icon: Phone, color: 'bg-indigo-100 text-indigo-600' },
 { label: 'Avg Lead Score', value: realStats?.avg_lead_score?.toFixed(1) || '23', icon: Target, color: 'bg-emerald-100 text-emerald-600', subtext: realStats ? 'From voice AI' : 'Active now' },
 { label: 'Avg Confidence', value: realStats ? `${(realStats.avg_confidence * 100).toFixed(1)}%` : '68.4%', change: '+5%', changeType: 'up', icon: Zap, color: 'bg-purple-100 text-purple-600' },
 { label: 'Audio Duration', value: realStats ? `${Math.round(realStats.total_audio_duration_s / 60)}m` : '4:32', icon: Clock, color: 'bg-amber-100 text-amber-600' },
 { label: 'Avg Sentiment', value: realStats ? realStats.avg_sentiment.toFixed(3) : '0.42', icon: Activity, color: 'bg-blue-100 text-blue-600' },
 { label: 'Avg Processing', value: realStats ? `${realStats.avg_processing_time_ms.toFixed(0)}ms` : '850ms', icon: TrendingUp, color: 'bg-red-100 text-red-600' },
 ];

 /* ── Dialect / Emotion / GenZ / Code-Mix Data ─────────────── */
 const emotionColorMap = { happy: 'bg-emerald-500', neutral: 'bg-slate-400', excited: 'bg-amber-500', sad: 'bg-blue-500', angry: 'bg-red-500', confused: 'bg-purple-500', frustrated: 'bg-orange-500', fearful: 'bg-pink-500' };
 const dialectColorMap = { kongu: '#f97316', chennai: '#3b82f6', madurai: '#8b5cf6', tirunelveli: '#14b8a6', hindi_standard: '#eab308', hindi_bhojpuri: '#06b6d4' };

 const dialectData = useMemo(() => {
 if (realStats?.dialect_counts && Object.keys(realStats.dialect_counts).length > 0) {
 return Object.entries(realStats.dialect_counts).map(([name, value]) => ({
 name: name.replace('_','').replace(/\b\w/g, c => c.toUpperCase()), value,
 color: dialectColorMap[name] || '#64748b',
 }));
 }
 return [
 { name: 'Kongu', value: 35, color: '#f97316' },
 { name: 'Chennai', value: 28, color: '#3b82f6' },
 { name: 'Madurai', value: 22, color: '#8b5cf6' },
 { name: 'Tirunelveli', value: 15, color: '#14b8a6' },
 ];
 }, [realStats]);

 const emotionBreakdown = useMemo(() => {
 if (realStats?.emotion_distribution && Object.keys(realStats.emotion_distribution).length > 0) {
 return Object.entries(realStats.emotion_distribution).map(([label, value]) => ({
 label: label.charAt(0).toUpperCase() + label.slice(1), value,
 color: emotionColorMap[label] || 'bg-slate-400',
 }));
 }
 return [
 { label: 'Happy', value: 38, color: 'bg-emerald-500' },
 { label: 'Neutral', value: 30, color: 'bg-slate-400' },
 { label: 'Excited', value: 14, color: 'bg-amber-500' },
 { label: 'Sad', value: 10, color: 'bg-blue-500' },
 { label: 'Angry', value: 5, color: 'bg-red-500' },
 { label: 'Confused', value: 3, color: 'bg-purple-500' },
 ];
 }, [realStats]);

 const genZOverview = {
 avgScore: 0.42,
 trend: 'up',
 trendValue: '+8%',
 topTerms: ['no cap','slay','vibe check','lowkey','bet'],
 };

 const codeMixOverview = {
 avgRatio: 0.61,
 topPairs: [
 { pair: 'Tamil-English', pct: 58 },
 { pair: 'Hindi-English', pct: 27 },
 { pair: 'Tamil-Hindi', pct: 15 },
 ],
 };

 /* ── Live Calls Mock Data (enhanced) ─────────────────────── */
 const liveCalls = [
 {
 id: 1, name: 'Rajesh Kumar', phone: '+91 98765 43210', duration: '3:45',
 sentiment: 'positive', agent: 'Sales Bot',
 dialect: 'Kongu', dialectConfidence: 0.89,
 emotion: 'happy', emotionConfidence: 0.82,
 genZScore: 0.2, genZTerms: ['vibe'],
 lastMessage: 'Yes, I would like to schedule a demo for next week...',
 },
 {
 id: 2, name: 'Priya Sharma', phone: '+91 87654 32109', duration: '1:22',
 sentiment: 'neutral', agent: 'Support Bot',
 dialect: 'Chennai', dialectConfidence: 0.94,
 emotion: 'neutral', emotionConfidence: 0.71,
 genZScore: 0.65, genZTerms: ['no cap','slay'],
 lastMessage: 'Can you tell me more about the pricing plans? ',
 },
 {
 id: 3, name: 'Vikram Patel', phone: '+91 76543 21098', duration: '5:18',
 sentiment: 'positive', agent: 'Sales Bot',
 dialect: 'Madurai', dialectConfidence: 0.77,
 emotion: 'excited', emotionConfidence: 0.91,
 genZScore: 0.0, genZTerms: [],
 lastMessage: 'That sounds exactly what we need for our business!',
 },
 ];

 /* ── Chart Data ───────────────────────────────────────────── */
 const hourlyData = [
 { hour: '9AM', calls: 45, connected: 32 },
 { hour: '10AM', calls: 89, connected: 61 },
 { hour: '11AM', calls: 124, connected: 87 },
 { hour: '12PM', calls: 98, connected: 65 },
 { hour: '1PM', calls: 76, connected: 48 },
 { hour: '2PM', calls: 134, connected: 98 },
 { hour: '3PM', calls: 156, connected: 112 },
 { hour: '4PM', calls: 143, connected: 95 },
 { hour: '5PM', calls: 118, connected: 78 },
 { hour: '6PM', calls: 87, connected: 56 },
 ];

 const sentimentData = [
 { name: 'Positive', value: 58, color: '#22c55e' },
 { name: 'Neutral', value: 28, color: '#94a3b8' },
 { name: 'Negative', value: 14, color: '#ef4444' },
 ];

 /* ── Handlers ─────────────────────────────────────────────── */
 const handleListen = (call) => {
 toast.success('Now listening to call with ' + call.name);
 };

 const handleTakeOver = (call) => {
 toast('Taking over call with ' + call.name +'...', { icon: '\uD83C\uDFA4' });
 };

 const handleEndCall = (call) => {
 toast.success('Call with ' + call.name +' ended');
 };

 const handleToggleCampaignStatus = (campaign) => {
 setCampaigns(prev => prev.map(c => {
 if (c.id === campaign.id) {
 const newStatus = c.status === 'active' ? 'paused' : 'active';
 toast.success(`Campaign "${c.name}" ${newStatus === 'active' ? 'started' : 'paused'}`);
 return { ...c, status: newStatus };
 }
 return c;
 }));
 };

 const handleViewCampaignAnalytics = (campaign) => {
 toast.success('Opening analytics for "' + campaign.name +'"');
 };

 const handleLiveMonitor = () => {
 navigate('/voice/live-calls');
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
 toast.success('Campaign "' + newCampaign.name +'" created successfully!');
 setCampaigns(prev => [...prev, {
 id: Date.now(),
 name: newCampaign.name,
 agent: newCampaign.agent,
 status: newCampaign.schedule ? 'scheduled' : 'active',
 totalCalls: 0,
 connected: 0,
 converted: 0,
 progress: 0,
 }]);
 setNewCampaign({ name: '', agent: 'Sales Bot', contactList: '', schedule: '' });
 setShowNewCampaignModal(false);
 };

 /* ── Total for emotion bar widths ─────────────────────────── */
 const emotionTotal = emotionBreakdown.reduce((s, e) => s + e.value, 0);

 /* ═══════════════════════════════════════════════════════════
 RENDER
 ═══════════════════════════════════════════════════════════ */
 return (
 <div className="space-y-6">
 {/* ── Header ────────────────────────────────────────────── */}
 <div className="flex items-center justify-between">
 <div>
 <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
 <Radio className="w-6 h-6 text-indigo-500" />
 Voice AI Command Center
 </h1>
 <p className="text-sm text-slate-500 mt-1">Real-time monitoring, dialect analysis & campaign management</p>
 </div>
 <div className="flex items-center gap-2">
 <button
 onClick={handleLiveMonitor}
 className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
 >
 <Activity className="w-4 h-4 text-emerald-500" />
 <span className="relative flex h-2 w-2">
 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
 <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
 </span>
 Live Monitor
 </button>
 {canCreate && (
 <button
 onClick={() => setShowNewCampaignModal(true)}
 className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
 >
 <Plus className="w-4 h-4" /> New Campaign
 </button>
 )}
 </div>
 </div>

 {/* ── Stats Grid (6 cards) ─────────────────────────────── */}
 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
 {stats.map((stat, i) => <StatCard key={i} {...stat} />)}
 </div>

 {/* ── Dialect / Emotion / GenZ / Code-Mix Overview ─────── */}
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
 {/* Dialect Distribution - Donut Chart */}
 <div className="bg-white rounded-xl p-5 border border-slate-200">
 <div className="flex items-center gap-2 mb-4">
 <Languages className="w-4 h-4 text-orange-500" />
 <h3 className="font-semibold text-sm text-slate-900">Dialect Distribution</h3>
 </div>
 <div className="h-32">
 <ResponsiveContainer width="100%" height="100%">
 <PieChart>
 <Pie
 data={dialectData}
 innerRadius={35}
 outerRadius={55}
 dataKey="value"
 paddingAngle={3}
 strokeWidth={0}
 >
 {dialectData.map((entry, i) => (
 <Cell key={i} fill={entry.color} />
 ))}
 </Pie>
 <Tooltip content={<ChartTooltip />} />
 </PieChart>
 </ResponsiveContainer>
 </div>
 <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
 {dialectData.map((d, i) => (
 <div key={i} className="flex items-center gap-1.5 text-xs">
 <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
 <span className="text-slate-600 truncate">{d.name}</span>
 <span className="font-medium text-slate-900 ml-auto">{d.value}%</span>
 </div>
 ))}
 </div>
 </div>

 {/* Emotion Breakdown - Horizontal Stacked Bar */}
 <div className="bg-white rounded-xl p-5 border border-slate-200">
 <div className="flex items-center gap-2 mb-4">
 <Brain className="w-4 h-4 text-emerald-500" />
 <h3 className="font-semibold text-sm text-slate-900">Emotion Breakdown</h3>
 </div>
 {/* Stacked bar */}
 <div className="flex h-6 rounded-full overflow-hidden mb-4">
 {emotionBreakdown.map((e, i) => (
 <div
 key={i}
 className={`${e.color} transition-all relative group`}
 style={{ width: `${(e.value / emotionTotal) * 100}%` }}
 title={`${e.label}: ${e.value}%`}
 >
 <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
 <span className="text-[10px] font-bold text-white drop-shadow">{e.value}%</span>
 </div>
 </div>
 ))}
 </div>
 {/* Legend */}
 <div className="space-y-1.5">
 {emotionBreakdown.map((e, i) => (
 <div key={i} className="flex items-center justify-between text-xs">
 <span className="flex items-center gap-1.5">
 <span className={`w-2 h-2 rounded-full ${e.color} flex-shrink-0`} />
 <span className="text-slate-600">{e.label}</span>
 </span>
 <span className="font-medium text-slate-900">{e.value}%</span>
 </div>
 ))}
 </div>
 </div>

 {/* GenZ Score Overview */}
 <div className="bg-white rounded-xl p-5 border border-slate-200">
 <div className="flex items-center gap-2 mb-4">
 <Sparkles className="w-4 h-4 text-pink-500" />
 <h3 className="font-semibold text-sm text-slate-900">GenZ Score</h3>
 </div>
 <div className="flex items-baseline gap-2 mb-2">
 <span className="text-4xl font-bold text-slate-900">
 {(genZOverview.avgScore * 10).toFixed(1)}
 </span>
 <span className="text-sm text-slate-500">/10 avg</span>
 <span className={`flex items-center gap-0.5 text-sm font-medium ml-auto ${genZOverview.trend === 'up' ? 'text-emerald-600' : 'text-red-500'}`}>
 {genZOverview.trend === 'up' ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
 {genZOverview.trendValue}
 </span>
 </div>
 {/* Progress bar */}
 <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
 <div
 className="h-full bg-gradient-to-r from-pink-500 to-violet-500 rounded-full transition-all"
 style={{ width: `${genZOverview.avgScore * 100}%` }}
 />
 </div>
 <p className="text-xs text-slate-500 mb-2">Top detected terms:</p>
 <div className="flex flex-wrap gap-1.5">
 {genZOverview.topTerms.map((t, i) => (
 <span key={i} className="px-2 py-0.5 bg-pink-50 text-pink-600 text-xs rounded-full font-medium">
 {t}
 </span>
 ))}
 </div>
 </div>

 {/* Code-Mixing Ratio */}
 <div className="bg-white rounded-xl p-5 border border-slate-200">
 <div className="flex items-center gap-2 mb-4">
 <Languages className="w-4 h-4 text-indigo-500" />
 <h3 className="font-semibold text-sm text-slate-900">Code-Mixing</h3>
 </div>
 <div className="flex items-baseline gap-2 mb-2">
 <span className="text-4xl font-bold text-slate-900">
 {Math.round(codeMixOverview.avgRatio * 100)}%
 </span>
 <span className="text-sm text-slate-500">avg mix ratio</span>
 </div>
 {/* Progress bar */}
 <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
 <div
 className="h-full bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-full transition-all"
 style={{ width: `${codeMixOverview.avgRatio * 100}%` }}
 />
 </div>
 <p className="text-xs text-slate-500 mb-2">Top language pairs:</p>
 <div className="space-y-2">
 {codeMixOverview.topPairs.map((p, i) => (
 <div key={i} className="flex items-center justify-between">
 <span className="text-xs text-slate-600">{p.pair}</span>
 <div className="flex items-center gap-2">
 <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
 <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${p.pct}%` }} />
 </div>
 <span className="text-xs font-medium text-slate-900 w-8 text-right">{p.pct}%</span>
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>

 {/* ── Live Calls & Active Campaigns ────────────────────── */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 {/* Live Calls Preview */}
 <div>
 <div className="flex items-center justify-between mb-4">
 <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
 <span className="relative flex h-2.5 w-2.5">
 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
 <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
 </span>
 Live Calls (23)
 </h2>
 <Link
 to="/voice/live-calls"
 className="text-sm text-indigo-600 font-medium flex items-center gap-1 hover:text-indigo-700 transition-colors"
 >
 View All <ChevronRight className="w-4 h-4" />
 </Link>
 </div>
 <div className="space-y-4">
 {liveCalls.map((call) => (
 <LiveCallCard
 key={call.id}
 call={call}
 onListen={handleListen}
 onTakeOver={handleTakeOver}
 onEndCall={handleEndCall}
 />
 ))}
 </div>
 </div>

 {/* Active Campaigns Preview */}
 <div>
 <div className="flex items-center justify-between mb-4">
 <h2 className="text-lg font-semibold text-slate-900">Active Campaigns</h2>
 <Link
 to="/voice/campaigns"
 className="text-sm text-indigo-600 font-medium flex items-center gap-1 hover:text-indigo-700 transition-colors"
 >
 View All <ChevronRight className="w-4 h-4" />
 </Link>
 </div>
 <div className="space-y-4">
 {campaigns.slice(0, 3).map((campaign) => (
 <CampaignCard
 key={campaign.id}
 campaign={campaign}
 onToggleStatus={handleToggleCampaignStatus}
 onViewAnalytics={handleViewCampaignAnalytics}
 />
 ))}
 </div>
 </div>
 </div>

 {/* ── Charts Row ───────────────────────────────────────── */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 {/* Hourly Call Volume (2-col span) */}
 <div className="lg:col-span-2 bg-white rounded-xl p-5 border border-slate-200">
 <div className="flex items-center justify-between mb-4">
 <h3 className="font-semibold text-slate-900">Today's Call Volume</h3>
 <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">Hourly breakdown</span>
 </div>
 <div className="h-64">
 <ResponsiveContainer width="100%" height="100%">
 <BarChart data={hourlyData} barGap={2}>
 <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.15} />
 <XAxis dataKey="hour" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
 <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
 <Tooltip content={<ChartTooltip />} />
 <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
 <Bar dataKey="calls" fill="#6366f1" radius={[4, 4, 0, 0]} name="Total Calls" />
 <Bar dataKey="connected" fill="#22c55e" radius={[4, 4, 0, 0]} name="Connected" />
 </BarChart>
 </ResponsiveContainer>
 </div>
 </div>

 {/* Sentiment Pie Chart (1-col) */}
 <div className="bg-white rounded-xl p-5 border border-slate-200">
 <h3 className="font-semibold text-slate-900 mb-4">Call Sentiment</h3>
 <div className="h-48">
 <ResponsiveContainer width="100%" height="100%">
 <PieChart>
 <Pie
 data={sentimentData}
 innerRadius={50}
 outerRadius={70}
 dataKey="value"
 paddingAngle={2}
 strokeWidth={0}
 >
 {sentimentData.map((entry, i) => (
 <Cell key={i} fill={entry.color} />
 ))}
 </Pie>
 <Tooltip content={<ChartTooltip />} />
 </PieChart>
 </ResponsiveContainer>
 </div>
 <div className="space-y-2 mt-4">
 {sentimentData.map((item, i) => (
 <div key={i} className="flex items-center justify-between text-sm">
 <span className="flex items-center gap-2">
 <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
 <span className="text-slate-600">{item.name}</span>
 </span>
 <span className="font-medium text-slate-900">{item.value}%</span>
 </div>
 ))}
 </div>
 </div>
 </div>

 {/* ═══════════════════════════════════════════════════════
 NEW CAMPAIGN MODAL
 ═══════════════════════════════════════════════════════ */}
 {showNewCampaignModal && (
 <div
 className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
 onClick={() => setShowNewCampaignModal(false)}
 >
 <div
 className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200"
 onClick={e => e.stopPropagation()}
 >
 {/* Modal Header */}
 <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
 <h2 className="text-lg font-bold text-slate-900">Create New Campaign</h2>
 <button
 onClick={() => setShowNewCampaignModal(false)}
 className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 {/* Modal Body */}
 <div className="px-6 py-5 space-y-4">
 <div>
 <label className="block text-sm font-medium text-slate-700 mb-1">
 Campaign Name <span className="text-red-400">*</span>
 </label>
 <input
 type="text"
 value={newCampaign.name}
 onChange={e => setNewCampaign(prev => ({ ...prev, name: e.target.value }))}
 placeholder="e.g. March Lead Follow-up"
 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-slate-700 mb-1">AI Agent</label>
 <select
 value={newCampaign.agent}
 onChange={e => setNewCampaign(prev => ({ ...prev, agent: e.target.value }))}
 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none transition"
 >
 <option value="Sales Bot">Sales Bot</option>
 <option value="Support Bot">Support Bot</option>
 <option value="Promo Bot">Promo Bot</option>
 <option value="Retention Bot">Retention Bot</option>
 <option value="Reminder Bot">Reminder Bot</option>
 </select>
 </div>

 <div>
 <label className="block text-sm font-medium text-slate-700 mb-1">
 Contact List <span className="text-red-400">*</span>
 </label>
 <select
 value={newCampaign.contactList}
 onChange={e => setNewCampaign(prev => ({ ...prev, contactList: e.target.value }))}
 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none transition"
 >
 <option value="">Select a contact list</option>
 <option value="february-leads">February Leads (2,456)</option>
 <option value="indiamart">IndiaMart Leads (892)</option>
 <option value="website">Website Signups (567)</option>
 <option value="referrals">Referral Contacts (234)</option>
 </select>
 </div>

 <div>
 <label className="block text-sm font-medium text-slate-700 mb-1">
 Schedule (optional)
 </label>
 <input
 type="datetime-local"
 value={newCampaign.schedule}
 onChange={e => setNewCampaign(prev => ({ ...prev, schedule: e.target.value }))}
 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none transition"
 />
 <p className="text-xs text-slate-400 mt-1">Leave empty to start immediately</p>
 </div>
 </div>

 {/* Modal Footer */}
 <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
 <button
 onClick={() => setShowNewCampaignModal(false)}
 className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
 >
 Cancel
 </button>
 <button
 onClick={handleCreateCampaign}
 className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2"
 >
 <Plus className="w-4 h-4" /> Create Campaign
 </button>
 </div>
 </div>
 </div>
 )}
 </div>
 );
}
