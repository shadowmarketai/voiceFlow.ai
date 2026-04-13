/**
 * AnalyticsDashboard - Light Theme Comprehensive Voice AI Analytics
 * White cards, indigo/violet chart fills, clean design
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Calendar, Download, TrendingUp, TrendingDown, Phone, Clock,
  Smile, Brain, Globe, BarChart3, Activity, Sparkles, Target,
  ArrowUpRight, Minus, Users, Zap
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

/* ─── Date Ranges ──────────────────────────────────────────────── */

const DATE_RANGES = [
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: '90d', value: '90d' },
  { label: 'Custom', value: 'custom' },
];

/* ─── Mock Data ────────────────────────────────────────────────── */

const VOLUME_DATA = [
  { date: 'Mar 7', total: 245, resolved: 198, escalated: 47 },
  { date: 'Mar 8', total: 312, resolved: 267, escalated: 45 },
  { date: 'Mar 9', total: 289, resolved: 241, escalated: 48 },
  { date: 'Mar 10', total: 378, resolved: 334, escalated: 44 },
  { date: 'Mar 11', total: 421, resolved: 389, escalated: 32 },
  { date: 'Mar 12', total: 198, resolved: 156, escalated: 42 },
  { date: 'Mar 13', total: 356, resolved: 298, escalated: 58 },
];

const RESOLUTION_DATA = [
  { name: 'Auto-Resolved', value: 68, color: '#10b981' },
  { name: 'Agent Assist', value: 18, color: '#6366f1' },
  { name: 'Escalated', value: 9, color: '#f59e0b' },
  { name: 'Unresolved', value: 5, color: '#ef4444' },
];

const AVG_HANDLE_TIME = [
  { date: 'Mar 7', time: 4.2, target: 3.5 },
  { date: 'Mar 8', time: 3.8, target: 3.5 },
  { date: 'Mar 9', time: 4.0, target: 3.5 },
  { date: 'Mar 10', time: 3.5, target: 3.5 },
  { date: 'Mar 11', time: 3.2, target: 3.5 },
  { date: 'Mar 12', time: 3.9, target: 3.5 },
  { date: 'Mar 13', time: 3.4, target: 3.5 },
];

const CSAT_TREND = [
  { date: 'Mar 7', score: 4.2, responses: 156 },
  { date: 'Mar 8', score: 4.3, responses: 198 },
  { date: 'Mar 9', score: 4.4, responses: 178 },
  { date: 'Mar 10', score: 4.5, responses: 234 },
  { date: 'Mar 11', score: 4.6, responses: 267 },
  { date: 'Mar 12', score: 4.5, responses: 123 },
  { date: 'Mar 13', score: 4.7, responses: 212 },
];

const LANGUAGE_DATA = [
  { name: 'Hindi', value: 35, color: '#f97316' },
  { name: 'English', value: 30, color: '#3b82f6' },
  { name: 'Tamil', value: 15, color: '#a855f7' },
  { name: 'Telugu', value: 10, color: '#14b8a6' },
  { name: 'Hinglish', value: 5, color: '#ec4899' },
  { name: 'Other', value: 5, color: '#94a3b8' },
];

const EMOTION_BAR_DATA = [
  { emotion: 'Happy', value: 32, color: '#10b981' },
  { emotion: 'Neutral', value: 28, color: '#94a3b8' },
  { emotion: 'Excited', value: 18, color: '#f59e0b' },
  { emotion: 'Sad', value: 12, color: '#3b82f6' },
  { emotion: 'Confused', value: 6, color: '#a855f7' },
  { emotion: 'Angry', value: 4, color: '#ef4444' },
];

const PEAK_HOURS = [
  [2, 3, 5, 8, 12, 15, 18, 20, 22, 18, 14, 10, 8, 6, 4, 3, 2, 1, 1, 0, 0, 0, 0, 1],
  [1, 2, 4, 7, 11, 14, 17, 19, 21, 19, 15, 12, 9, 7, 5, 4, 3, 2, 1, 1, 0, 0, 0, 0],
  [3, 4, 6, 9, 13, 16, 19, 22, 24, 20, 16, 13, 10, 8, 6, 5, 4, 3, 2, 1, 1, 0, 0, 1],
  [2, 3, 5, 8, 12, 15, 18, 21, 23, 19, 15, 11, 9, 7, 5, 4, 3, 2, 1, 1, 0, 0, 0, 1],
  [4, 5, 7, 10, 14, 18, 22, 25, 28, 24, 20, 16, 12, 9, 7, 5, 4, 3, 2, 1, 1, 0, 0, 2],
  [1, 1, 2, 4, 6, 8, 10, 12, 14, 12, 10, 8, 6, 5, 4, 3, 2, 1, 1, 0, 0, 0, 0, 0],
  [0, 1, 1, 3, 5, 7, 8, 10, 12, 10, 8, 6, 5, 4, 3, 2, 1, 1, 0, 0, 0, 0, 0, 0],
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const AGENT_PERF = [
  { name: 'Sales Pro', conversations: 3842, resolution: 74, avgTime: '4:22', csat: 4.8 },
  { name: 'Support Guru', conversations: 5621, resolution: 89, avgTime: '6:15', csat: 4.9 },
  { name: 'Promo Blaster', conversations: 12430, resolution: 61, avgTime: '2:45', csat: 4.2 },
  { name: 'Retention Bot', conversations: 2156, resolution: 78, avgTime: '5:30', csat: 4.5 },
  { name: 'Onboarding Helper', conversations: 876, resolution: 82, avgTime: '3:50', csat: 4.6 },
];

/* ─── Light Tooltip ───────────────────────────────────────────── */

const LightTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-lg">
      <p className="text-xs font-semibold text-slate-900 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs" style={{ color: entry.color }}>
          {entry.name}: <span className="font-semibold text-slate-900">{typeof entry.value === 'number' && entry.value < 10 ? entry.value.toFixed(1) : entry.value}</span>
        </p>
      ))}
    </div>
  );
};

/* ─── Stat Card ───────────────────────────────────────────────── */

function StatCard({ label, value, change, changeType, icon: Icon, gradient }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 hover:shadow-md transition-all shadow-sm">
      <div className={`absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r ${gradient}`} />
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 rounded-lg bg-gradient-to-br ${gradient} shadow-sm`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        {change && (
          <span className={`flex items-center gap-1 text-xs font-semibold ${
            changeType === 'up' ? 'text-emerald-600' : changeType === 'down' ? 'text-red-500' : 'text-slate-400'
          }`}>
            {changeType === 'up' ? <TrendingUp className="w-3 h-3" /> : changeType === 'down' ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {change}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

/* ─── Peak Hours Heatmap ──────────────────────────────────────── */

function PeakHoursHeatmap() {
  const maxVal = Math.max(...PEAK_HOURS.flat());

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        <div className="flex gap-0.5 mb-1 pl-10">
          {Array.from({ length: 24 }, (_, i) => (
            <div key={i} className="flex-1 text-center text-[9px] text-slate-400 font-mono">
              {i}
            </div>
          ))}
        </div>
        {DAYS.map((day, di) => (
          <div key={day} className="flex items-center gap-0.5 mb-0.5">
            <div className="w-10 text-[10px] text-slate-500 text-right pr-2 font-medium">{day}</div>
            {PEAK_HOURS[di].map((val, hi) => {
              const intensity = val / maxVal;
              return (
                <div
                  key={hi}
                  className="flex-1 h-6 rounded-sm transition-all hover:scale-110 cursor-pointer"
                  style={{
                    backgroundColor: intensity < 0.05
                      ? '#f1f5f9'
                      : `rgba(99, 102, 241, ${0.08 + intensity * 0.82})`,
                  }}
                  title={`${day} ${hi}:00 - ${val} calls`}
                />
              );
            })}
          </div>
        ))}
        <div className="flex items-center justify-end gap-2 mt-3">
          <span className="text-[10px] text-slate-400">Less</span>
          {[0.08, 0.25, 0.45, 0.65, 0.85].map((o) => (
            <div key={o} className="w-4 h-4 rounded-sm" style={{ backgroundColor: `rgba(99, 102, 241, ${o})` }} />
          ))}
          <span className="text-[10px] text-slate-400">More</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ───────────────────────────────────────────── */

export default function AnalyticsDashboard() {
  const [dateRange, setDateRange] = useState('7d');

  const handleExport = () => {
    toast.success('Exporting analytics data as CSV...');
  };

  return (
    <div className="-mx-4 lg:-mx-6 -mt-6 lg:-mt-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-[#fafbfe] min-h-screen px-4 lg:px-6 py-6 lg:py-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Analytics</h1>
            <p className="text-sm text-slate-500 mt-1">Comprehensive performance insights</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
              {DATE_RANGES.map((dr) => (
                <button
                  key={dr.value}
                  onClick={() => setDateRange(dr.value)}
                  className={`px-3 py-2 text-xs font-medium transition-colors ${
                    dateRange === dr.value
                      ? 'bg-indigo-50 text-indigo-600'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {dr.label}
                </button>
              ))}
            </div>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <StatCard label="Total Conversations" value="2,199" change="+14.2%" changeType="up" icon={Phone} gradient="from-indigo-500 to-violet-600" />
          <StatCard label="Resolution Rate" value="86.4%" change="+3.1%" changeType="up" icon={Target} gradient="from-emerald-500 to-teal-600" />
          <StatCard label="Avg Handle Time" value="3.7 min" change="-8.5%" changeType="up" icon={Clock} gradient="from-amber-500 to-orange-600" />
          <StatCard label="Customer Satisfaction" value="4.5 / 5" change="+0.3" changeType="up" icon={Smile} gradient="from-rose-500 to-pink-600" />
          <StatCard label="Active Agents" value="4" change="--" changeType="neutral" icon={Users} gradient="from-cyan-500 to-blue-600" />
        </div>

        {/* Row 1: Conversation Volume + Resolution Rate */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Conversation Volume</h3>
            <p className="text-xs text-slate-500 mb-4">Total, resolved, and escalated over time</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={VOLUME_DATA} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="totalG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="resolvedG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<LightTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                  <Area type="monotone" dataKey="total" name="Total" stroke="#6366f1" strokeWidth={2} fill="url(#totalG)" dot={{ r: 3, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }} />
                  <Area type="monotone" dataKey="resolved" name="Resolved" stroke="#10b981" strokeWidth={2} fill="url(#resolvedG)" dot={{ r: 3, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }} />
                  <Line type="monotone" dataKey="escalated" name="Escalated" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: '#f59e0b', stroke: '#fff', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Resolution Breakdown</h3>
            <p className="text-xs text-slate-500 mb-4">How conversations are being resolved</p>
            <div className="h-48 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={RESOLUTION_DATA} innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={3} stroke="none">
                    {RESOLUTION_DATA.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={<LightTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <p className="text-xl font-bold text-slate-900">86%</p>
                  <p className="text-[10px] text-slate-400">Resolved</p>
                </div>
              </div>
            </div>
            <div className="space-y-2 mt-4">
              {RESOLUTION_DATA.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-slate-500">{item.name}</span>
                  </span>
                  <span className="text-slate-900 font-semibold">{item.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: Avg Handle Time + CSAT Trend */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Average Handle Time</h3>
            <p className="text-xs text-slate-500 mb-4">Minutes per conversation vs target</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={AVG_HANDLE_TIME} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 6]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}m`} />
                  <Tooltip content={<LightTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                  <Line type="monotone" dataKey="time" name="Actual" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 4, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }} />
                  <Line type="monotone" dataKey="target" name="Target" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Customer Satisfaction Trend</h3>
            <p className="text-xs text-slate-500 mb-4">CSAT score and response count</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={CSAT_TREND} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="csatG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="score" domain={[3, 5]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="responses" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<LightTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                  <Bar yAxisId="responses" dataKey="responses" name="Responses" fill="#e2e8f0" radius={[4, 4, 0, 0]} opacity={0.7} />
                  <Area yAxisId="score" type="monotone" dataKey="score" name="CSAT Score" stroke="#f59e0b" strokeWidth={2.5} fill="url(#csatG)" dot={{ r: 4, fill: '#f59e0b', stroke: '#fff', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Row 3: Language + Emotion */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-slate-900">Language Breakdown</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">Distribution across conversations</p>
            <div className="h-56 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={LANGUAGE_DATA} outerRadius={90} dataKey="value" paddingAngle={2} stroke="none" label={({ name, value }) => `${name} ${value}%`}>
                    {LANGUAGE_DATA.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={<LightTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Brain className="w-4 h-4 text-violet-500" />
              <h3 className="text-sm font-semibold text-slate-900">Emotion Distribution</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">Detected emotions across calls</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={EMOTION_BAR_DATA} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                  <XAxis type="number" domain={[0, 40]} tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="emotion" tick={{ fontSize: 11, fill: '#64748b' }} width={70} axisLine={false} tickLine={false} />
                  <Tooltip content={<LightTooltip />} />
                  <Bar dataKey="value" name="Distribution" radius={[0, 6, 6, 0]} barSize={24}>
                    {EMOTION_BAR_DATA.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Row 4: Peak Hours Heatmap */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 mb-6 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-slate-900">Peak Hours Heatmap</h3>
          </div>
          <p className="text-xs text-slate-500 mb-4">Call volume by day and hour (24h format)</p>
          <PeakHoursHeatmap />
        </div>

        {/* Row 5: Agent Performance Comparison */}
        <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-slate-900">Agent Performance Comparison</h3>
            </div>
            <span className="text-xs text-slate-400">{AGENT_PERF.length} agents</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-slate-50">
                  <th className="px-6 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Agent</th>
                  <th className="px-6 py-3 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Conversations</th>
                  <th className="px-6 py-3 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Resolution %</th>
                  <th className="px-6 py-3 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Avg Time</th>
                  <th className="px-6 py-3 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider">CSAT</th>
                  <th className="px-6 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider w-48">Performance</th>
                </tr>
              </thead>
              <tbody>
                {AGENT_PERF.map((agent, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-slate-900">{agent.name}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm text-slate-600 font-mono">{agent.conversations.toLocaleString()}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`text-sm font-semibold ${agent.resolution >= 80 ? 'text-emerald-600' : agent.resolution >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                        {agent.resolution}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm text-slate-600 font-mono">{agent.avgTime}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-semibold text-amber-600">{agent.csat}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                          style={{ width: `${agent.resolution}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
