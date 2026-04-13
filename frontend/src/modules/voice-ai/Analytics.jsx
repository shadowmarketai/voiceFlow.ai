/**
 * Voice AI Analytics - Dialect, emotion, and GenZ analytics dashboard
 */

import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { analyticsAPI } from '../../services/api';
import {
 Download, Calendar, TrendingUp, TrendingDown, Minus,
 Phone, BarChart3, Brain, Sparkles, Languages, Activity,
 ArrowUpRight, ArrowDownRight, ArrowRight, Globe, Hash
} from 'lucide-react';
import {
 PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
 XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import CollapsibleSection from './components/CollapsibleSection';
import DialectBadge from './components/DialectBadge';
import EmotionIndicator from './components/EmotionIndicator';
import GenZBadge from './components/GenZBadge';

/* ─── Mock Data ─────────────────────────────────────────────────────── */

const DIALECT_DATA = [
 { name: 'Kongu', value: 35, color: '#f97316' },
 { name: 'Chennai', value: 28, color: '#3b82f6' },
 { name: 'Madurai', value: 22, color: '#a855f7' },
 { name: 'Tirunelveli', value: 15, color: '#14b8a6' },
];

const EMOTION_DATA = [
 { emotion: 'Happy', value: 32, color: '#10b981' },
 { emotion: 'Neutral', value: 28, color: '#94a3b8' },
 { emotion: 'Excited', value: 18, color: '#f59e0b' },
 { emotion: 'Sad', value: 12, color: '#3b82f6' },
 { emotion: 'Confused', value: 6, color: '#a855f7' },
 { emotion: 'Angry', value: 4, color: '#ef4444' },
];

const GENZ_TREND_DATA = [
 { day: 'Mon', score: 0.42, calls: 1680 },
 { day: 'Tue', score: 0.45, calls: 1820 },
 { day: 'Wed', score: 0.51, calls: 1950 },
 { day: 'Thu', score: 0.48, calls: 1760 },
 { day: 'Fri', score: 0.56, calls: 2100 },
 { day: 'Sat', score: 0.62, calls: 1540 },
 { day: 'Sun', score: 0.58, calls: 1200 },
];

const CODE_MIX_DATA = [
 { pair: 'Tamil-English', value: 45, color: '#6366f1' },
 { pair: 'Hindi-English', value: 30, color: '#f59e0b' },
 { pair: 'Tamil-Hindi', value: 15, color: '#10b981' },
 { pair: 'Other', value: 10, color: '#94a3b8' },
];

const LANGUAGE_SPLIT_DATA = [
 { name: 'Tamil', value: 45, color: '#f97316' },
 { name: 'Hindi', value: 25, color: '#ef4444' },
 { name: 'English', value: 20, color: '#3b82f6' },
 { name: 'Mixed', value: 10, color: '#a855f7' },
];

const SLANG_TABLE_DATA = [
 { term: 'slay', frequency: 2847, category: 'GenZ', example: '"That outfit is totally slay da"', trend: 'up' },
 { term: 'no cap', frequency: 2134, category: 'GenZ', example: '"No cap, this product is really good"', trend: 'up' },
 { term: 'vibe check', frequency: 1892, category: 'GenZ', example: '"Quick vibe check - how is the team?"', trend: 'up' },
 { term: 'lowkey', frequency: 1654, category: 'Slang', example: '"I lowkey want to upgrade the plan"', trend: 'stable' },
 { term: 'bestie', frequency: 1423, category: 'GenZ', example: '"Tell your bestie about our referral"', trend: 'up' },
 { term: 'sus', frequency: 1198, category: 'GenZ', example: '"That pricing seems a bit sus"', trend: 'down' },
 { term: 'ghosting', frequency: 987, category: 'Slang', example: '"The vendor has been ghosting us"', trend: 'stable' },
 { term: 'flex', frequency: 876, category: 'Slang', example: '"Let me flex our new features"', trend: 'up' },
 { term: 'lit', frequency: 743, category: 'GenZ', example: '"The demo was lit, sign me up"', trend: 'down' },
 { term: 'bruh', frequency: 612, category: 'Code-Mix', example: '"Bruh, enna price idhu?"', trend: 'stable' },
];

const DATE_RANGES = ['Last 7 Days','Last 30 Days','Last 90 Days','Custom'];

/* ─── Stat Card ─────────────────────────────────────────────────────── */

const StatCard = ({ label, value, change, changeType, icon: Icon, color }) => (
 <div className="bg-white rounded-xl p-5 border border-slate-200">
 <div className="flex items-center justify-between">
 <div className={`p-2.5 rounded-xl ${color}`}>
 <Icon className="w-5 h-5" />
 </div>
 {change && (
 <span className={`flex items-center gap-1 text-sm font-medium ${
 changeType === 'up' ? 'text-emerald-600' : changeType === 'down' ? 'text-red-500' : 'text-slate-400'
 }`}>
 {changeType === 'up' ? <TrendingUp className="w-4 h-4" /> : changeType === 'down' ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
 {change}
 </span>
 )}
 </div>
 <p className="text-2xl font-bold text-slate-900 mt-4">{value}</p>
 <p className="text-sm text-slate-500 mt-1">{label}</p>
 </div>
);

/* ─── Custom Tooltip ────────────────────────────────────────────────── */

const CustomTooltip = ({ active, payload, label }) => {
 if (!active || !payload || !payload.length) return null;
 return (
 <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
 <p className="font-medium text-slate-900 mb-1">{label}</p>
 {payload.map((entry, i) => (
 <p key={i} className="text-slate-600" style={{ color: entry.color }}>
 {entry.name}: {typeof entry.value === 'number' && entry.value < 1 ? entry.value.toFixed(2) : entry.value}
 </p>
 ))}
 </div>
 );
};

/* ─── Trend Icon ────────────────────────────────────────────────────── */

const TrendIcon = ({ trend }) => {
 if (trend === 'up') return <ArrowUpRight className="w-4 h-4 text-emerald-500" />;
 if (trend === 'down') return <ArrowDownRight className="w-4 h-4 text-red-500" />;
 return <ArrowRight className="w-4 h-4 text-slate-400" />;
};

/* ─── Main Component ────────────────────────────────────────────────── */

export default function VoiceAnalyticsPage() {
 const [dateRange, setDateRange] = useState('Last 7 Days');
 const [apiStats, setApiStats] = useState(null);

 // Load analytics from API
 useEffect(() => {
 let cancelled = false;
 analyticsAPI.getDashboard({ period: dateRange ==='Last 7 Days' ? '7d' : dateRange ==='Last 30 Days' ? '30d' : '90d' })
 .then(({ data }) => {
 if (cancelled || !data) return;
 setApiStats(data);
 })
 .catch(() => {}); // keep mock data
 return () => { cancelled = true; };
 }, [dateRange]);

 const totalDialectAnalyzed = DIALECT_DATA.reduce((sum, d) => sum + d.value, 0);

 const handleExport = () => {
 toast.success('Exporting analytics report as CSV...');
 };

 return (
 <div className="space-y-6">
 {/* Header */}
 <div className="flex items-center justify-between flex-wrap gap-4">
 <div>
 <h1 className="text-2xl font-bold text-slate-900">Voice AI Analytics</h1>
 <p className="text-sm text-slate-500 mt-1">Dialect, emotion, and language analytics overview</p>
 </div>
 <div className="flex items-center gap-3">
 <div className="relative">
 <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
 <select
 value={dateRange}
 onChange={(e) => setDateRange(e.target.value)}
 className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
 >
 {DATE_RANGES.map((r) => (
 <option key={r} value={r}>{r}</option>
 ))}
 </select>
 </div>
 <button
 onClick={handleExport}
 className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
 >
 <Download className="w-4 h-4" /> Export
 </button>
 </div>
 </div>

 {/* Summary Stat Cards */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
 <StatCard
 label="Total Calls"
 value="12,456"
 change="+14.2%"
 changeType="up"
 icon={Phone}
 color="bg-indigo-100 text-indigo-600"
 />
 <StatCard
 label="Avg Dialect Accuracy"
 value="94.2%"
 change="+2.1%"
 changeType="up"
 icon={Languages}
 color="bg-orange-100 text-orange-600"
 />
 <StatCard
 label="Emotion Detection Rate"
 value="87.5%"
 change="+3.4%"
 changeType="up"
 icon={Brain}
 color="bg-emerald-100 text-emerald-600"
 />
 <StatCard
 label="GenZ Usage Rate"
 value="23.4%"
 change="+8.7%"
 changeType="up"
 icon={Sparkles}
 color="bg-pink-100 text-pink-600"
 />
 </div>

 {/* Charts Row 1: Dialect Distribution + Emotion Heatmap */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 {/* Dialect Distribution Donut */}
 <div className="bg-white rounded-xl p-5 border border-slate-200">
 <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
 <Globe className="w-4 h-4 text-orange-500" /> Dialect Distribution
 </h3>
 <div className="h-64 relative">
 <ResponsiveContainer width="100%" height="100%">
 <PieChart>
 <Pie
 data={DIALECT_DATA}
 innerRadius={65}
 outerRadius={95}
 dataKey="value"
 paddingAngle={3}
 stroke="none"
 >
 {DIALECT_DATA.map((entry, i) => (
 <Cell key={i} fill={entry.color} />
 ))}
 </Pie>
 <Tooltip content={<CustomTooltip />} />
 </PieChart>
 </ResponsiveContainer>
 {/* Center text */}
 <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
 <div className="text-center">
 <p className="text-2xl font-bold text-slate-900">{totalDialectAnalyzed}%</p>
 <p className="text-xs text-slate-400">Analyzed</p>
 </div>
 </div>
 </div>
 {/* Legend */}
 <div className="grid grid-cols-2 gap-2 mt-4">
 {DIALECT_DATA.map((item, i) => (
 <div key={i} className="flex items-center justify-between text-sm px-2 py-1.5 bg-slate-50 rounded-lg">
 <span className="flex items-center gap-2">
 <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
 <DialectBadge dialect={item.name} />
 </span>
 <span className="font-semibold text-slate-700">{item.value}%</span>
 </div>
 ))}
 </div>
 </div>

 {/* Emotion Heatmap (Horizontal Bar Chart) */}
 <div className="bg-white rounded-xl p-5 border border-slate-200">
 <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
 <Activity className="w-4 h-4 text-emerald-500" /> Emotion Distribution
 </h3>
 <div className="h-72">
 <ResponsiveContainer width="100%" height="100%">
 <BarChart data={EMOTION_DATA} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
 <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" opacity={0.2} />
 <XAxis type="number" domain={[0, 40]} tick={{ fontSize: 12 }} tickFormatter={(v) => v +'%'} />
 <YAxis type="category" dataKey="emotion" tick={{ fontSize: 12 }} width={70} />
 <Tooltip content={<CustomTooltip />} />
 <Bar dataKey="value" name="Distribution" radius={[0, 6, 6, 0]} barSize={28}>
 {EMOTION_DATA.map((entry, i) => (
 <Cell key={i} fill={entry.color} />
 ))}
 </Bar>
 </BarChart>
 </ResponsiveContainer>
 </div>
 {/* Emotion indicators row */}
 <div className="flex flex-wrap gap-2 mt-4">
 {EMOTION_DATA.map((item, i) => (
 <EmotionIndicator key={i} emotion={item.emotion.toLowerCase()} confidence={item.value / 100} size="sm" />
 ))}
 </div>
 </div>
 </div>

 {/* Charts Row 2: GenZ Trend + Code-Mixing Stats */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 {/* GenZ Trend (Line Chart) - 2 col span */}
 <div className="lg:col-span-2 bg-white rounded-xl p-5 border border-slate-200">
 <h3 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
 <Sparkles className="w-4 h-4 text-pink-500" /> GenZ Trend
 <GenZBadge score={0.52} terms={['slay','no cap','vibe']} size="sm" />
 </h3>
 <p className="text-xs text-slate-400 mb-4">Average GenZ score and daily call volume over the last 7 days</p>
 <div className="h-72">
 <ResponsiveContainer width="100%" height="100%">
 <LineChart data={GENZ_TREND_DATA} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
 <defs>
 <linearGradient id="genzGradient" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3} />
 <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
 </linearGradient>
 </defs>
 <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
 <XAxis dataKey="day" tick={{ fontSize: 12 }} />
 <YAxis yAxisId="score" domain={[0, 1]} tick={{ fontSize: 12 }} tickFormatter={(v) => v.toFixed(1)} />
 <YAxis yAxisId="calls" orientation="right" tick={{ fontSize: 12 }} />
 <Tooltip content={<CustomTooltip />} />
 <Legend />
 <Bar yAxisId="calls" dataKey="calls" name="Daily Calls" fill="#e2e8f0" radius={[4, 4, 0, 0]} opacity={0.4} />
 <Line
 yAxisId="score"
 type="monotone"
 dataKey="score"
 name="GenZ Score"
 stroke="#ec4899"
 strokeWidth={3}
 dot={{ fill: '#ec4899', r: 5, strokeWidth: 2, stroke: '#fff' }}
 activeDot={{ r: 7, stroke: '#ec4899', strokeWidth: 2 }}
 fill="url(#genzGradient)"
 />
 </LineChart>
 </ResponsiveContainer>
 </div>
 </div>

 {/* Code-Mixing Stats */}
 <div className="bg-white rounded-xl p-5 border border-slate-200">
 <h3 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
 <Languages className="w-4 h-4 text-teal-500" /> Code-Mixing Stats
 </h3>
 <p className="text-xs text-slate-400 mb-4">Language pair mixing distribution</p>

 {/* Overall ratio */}
 <div className="text-center mb-4 p-4 bg-slate-50 rounded-xl">
 <p className="text-3xl font-bold text-slate-900">38.6%</p>
 <p className="text-xs text-slate-400 mt-1">Overall Code-Mix Ratio</p>
 <div className="flex items-center justify-center gap-1 mt-2">
 <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
 <span className="text-xs font-medium text-emerald-600">+4.2% vs last week</span>
 </div>
 </div>

 {/* Mini bar chart */}
 <div className="h-40">
 <ResponsiveContainer width="100%" height="100%">
 <BarChart data={CODE_MIX_DATA} margin={{ left: -10, right: 5, top: 5, bottom: 5 }}>
 <XAxis dataKey="pair" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={40} />
 <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => v +'%'} />
 <Tooltip content={<CustomTooltip />} />
 <Bar dataKey="value" name="Mix %" radius={[4, 4, 0, 0]} barSize={32}>
 {CODE_MIX_DATA.map((entry, i) => (
 <Cell key={i} fill={entry.color} />
 ))}
 </Bar>
 </BarChart>
 </ResponsiveContainer>
 </div>

 {/* Language pair list */}
 <div className="space-y-2 mt-4">
 {CODE_MIX_DATA.map((item, i) => (
 <div key={i} className="flex items-center justify-between text-sm">
 <span className="flex items-center gap-2">
 <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
 <span className="text-slate-600">{item.pair}</span>
 </span>
 <span className="font-semibold text-slate-700">{item.value}%</span>
 </div>
 ))}
 </div>
 </div>
 </div>

 {/* Top Slang Terms Table */}
 <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
 <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
 <h3 className="font-semibold text-slate-900 flex items-center gap-2">
 <Hash className="w-4 h-4 text-pink-500" /> Top Slang Terms
 </h3>
 <span className="text-xs text-slate-400">{SLANG_TABLE_DATA.length} terms tracked</span>
 </div>
 <div className="overflow-x-auto">
 <table className="w-full">
 <thead>
 <tr className="bg-slate-50">
 <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Term</th>
 <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Frequency</th>
 <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
 <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Example Context</th>
 <th className="px-5 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Trend</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-100">
 {SLANG_TABLE_DATA.map((row, i) => (
 <tr key={i} className="hover:bg-slate-50 transition-colors">
 <td className="px-5 py-3">
 <span className="font-semibold text-sm text-slate-900">{row.term}</span>
 </td>
 <td className="px-5 py-3">
 <span className="text-sm text-slate-700 font-mono">{row.frequency.toLocaleString()}</span>
 </td>
 <td className="px-5 py-3">
 <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
 row.category ==='GenZ'
 ? 'bg-pink-100 text-pink-700'
 : row.category ==='Slang'
 ? 'bg-violet-100 text-violet-700'
 : 'bg-teal-100 text-teal-700'
 }`}>
 {row.category}
 </span>
 </td>
 <td className="px-5 py-3">
 <span className="text-sm text-slate-500 italic truncate block max-w-xs">{row.example}</span>
 </td>
 <td className="px-5 py-3 text-center">
 <TrendIcon trend={row.trend} />
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>

 {/* Language Split Pie Chart */}
 <div className="bg-white rounded-xl p-5 border border-slate-200">
 <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
 <Globe className="w-4 h-4 text-blue-500" /> Language Split
 </h3>
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
 <div className="h-64">
 <ResponsiveContainer width="100%" height="100%">
 <PieChart>
 <Pie
 data={LANGUAGE_SPLIT_DATA}
 outerRadius={100}
 dataKey="value"
 paddingAngle={2}
 stroke="none"
 label={({ name, value }) => name + ' ' + value + '%'}
 >
 {LANGUAGE_SPLIT_DATA.map((entry, i) => (
 <Cell key={i} fill={entry.color} />
 ))}
 </Pie>
 <Tooltip content={<CustomTooltip />} />
 </PieChart>
 </ResponsiveContainer>
 </div>
 <div className="space-y-3">
 {LANGUAGE_SPLIT_DATA.map((item, i) => (
 <div key={i} className="flex items-center gap-3">
 <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
 <div className="flex-1">
 <div className="flex items-center justify-between mb-1">
 <span className="text-sm font-medium text-slate-700">{item.name}</span>
 <span className="text-sm font-bold text-slate-900">{item.value}%</span>
 </div>
 <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
 <div
 className="h-full rounded-full transition-all"
 style={{ width: item.value +'%', backgroundColor: item.color }}
 />
 </div>
 </div>
 </div>
 ))}
 <div className="pt-3 border-t border-slate-200">
 <p className="text-xs text-slate-400">
 Based on {(12456).toLocaleString()} analyzed calls in the selected period.
 Language detection accuracy: 96.8%
 </p>
 </div>
 </div>
 </div>
 </div>
 </div>
 );
}
