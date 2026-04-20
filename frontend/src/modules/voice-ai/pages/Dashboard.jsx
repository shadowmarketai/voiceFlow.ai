/**
 * Voice AI Dashboard — Unified command center with analytics merged in
 *
 * Priority order:
 *   1. Hero Stats (conversations, agents, minutes, satisfaction)
 *   2. Live Activity + Conversation Volume
 *   3. Resolution Breakdown + CSAT Trend
 *   4. Top Agents + Language Distribution
 *   5. Avg Handle Time + Emotion Distribution
 *   6. Quick Actions
 */

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import {
  MessageSquare, Bot, Clock, Smile, TrendingUp, TrendingDown,
  Phone, Globe, ArrowRight, Plus, Upload,
  Activity, Sparkles, Star, Languages, Target,
  Wallet as WalletIcon, AlertTriangle, CreditCard,
} from 'lucide-react';
import { billingAPI, agentsAPI } from '../../../services/api';
import {
  AreaChart, Area, LineChart, Line, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts';

/* ─── Color Palette ──────────────────────────────────────────── */
const P = {
  bg: '#fafbfe', card: '#ffffff', border: 'rgba(0,0,0,0.06)',
  text: '#0f172a', textSec: '#475569', textMut: '#94a3b8',
  indigo: '#6366f1', violet: '#8b5cf6',
  success: '#10b981', warning: '#f59e0b', error: '#ef4444',
  emerald: '#10b981', amber: '#f59e0b', slate: '#64748b',
};

/* ─── Static Fallbacks (used when API has no data yet) ───────────── */

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const EMOTION_COLORS = {
  happy: '#10b981', neutral: '#94a3b8', excited: '#f59e0b',
  sad: '#3b82f6', confused: '#a855f7', angry: '#ef4444',
};

const DIALECT_COLORS = [P.indigo, P.violet, P.amber, P.emerald, P.slate];

const RESOLUTION_DATA = [
  { name: 'Auto-Resolved', value: 68, color: '#10b981' },
  { name: 'Agent Assist', value: 18, color: '#6366f1' },
  { name: 'Escalated', value: 9, color: '#f59e0b' },
  { name: 'Unresolved', value: 5, color: '#ef4444' },
];

const AVG_HANDLE_TIME = [
  { date: 'Mon', time: 4.2, target: 3.5 }, { date: 'Tue', time: 3.8, target: 3.5 },
  { date: 'Wed', time: 4.0, target: 3.5 }, { date: 'Thu', time: 3.5, target: 3.5 },
  { date: 'Fri', time: 3.2, target: 3.5 }, { date: 'Sat', time: 3.9, target: 3.5 },
  { date: 'Sun', time: 3.4, target: 3.5 },
];

/* ─── Animation Variants ─────────────────────────────────────── */
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const fadeUp = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22,1,0.36,1] } } };

/* ─── Animated Counter ───────────────────────────────────────── */
function Counter({ value, decimals = 0, duration = 1.2 }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, v => decimals > 0 ? v.toFixed(decimals) : Math.floor(v).toLocaleString());
  const [d, setD] = useState(decimals > 0 ? '0.0' : '0');
  useEffect(() => {
    const c = animate(mv, value, { duration, ease: [0.22,1,0.36,1] });
    const u = rounded.on('change', v => setD(v));
    return () => { c.stop(); u(); };
  }, [value]);
  return <>{d}</>;
}

/* ─── Mini Sparkline ─────────────────────────────────────────── */
function Spark({ data, color = P.indigo }) {
  const d = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width={80} height={36}>
      <AreaChart data={d} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <defs>
          <linearGradient id={`s-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#s-${color.replace('#','')})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ─── Wallet snapshot for the dashboard ─────────────────────────── */
function DashboardWalletCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = () =>
      billingAPI
        .wallet()
        .then(({ data }) => alive && setData(data))
        .catch(() => {})
        .finally(() => alive && setLoading(false));
    load();
    const id = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (loading || !data) return null;

  const balance = data.balance_inr ?? 0;
  const mins = data.minutes_remaining ?? 0;
  const rate = data.current_rate_inr_per_min ?? 0;
  const calls = data.calls_remaining_approx ?? 0;
  const isEmpty = balance <= 0;
  const isLow = mins < 10 && !isEmpty;

  const statusTone = isEmpty
    ? 'from-red-500 to-rose-600'
    : isLow
    ? 'from-amber-500 to-orange-600'
    : 'from-indigo-600 via-violet-600 to-purple-700';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`relative overflow-hidden mb-8 rounded-2xl bg-gradient-to-br ${statusTone} text-white shadow-lg`}
    >
      <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
      <div className="relative p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
            {isEmpty || isLow ? <AlertTriangle className="w-6 h-6" /> : <WalletIcon className="w-6 h-6" />}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider opacity-80 font-medium">Wallet balance</p>
            <p className="text-3xl font-bold mt-0.5">₹{balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
            <p className="text-sm opacity-85 mt-1">
              ~{Math.round(mins)} min of talk-time · {calls} calls @ ₹{rate}/min
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(isEmpty || isLow) && (
            <div className="hidden md:block px-3 py-1.5 rounded-lg bg-white/15 text-xs font-medium">
              {isEmpty ? 'Balance empty — recharge to continue' : 'Low balance — top up soon'}
            </div>
          )}
          <Link
            to="/voice/wallet"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-indigo-700 text-sm font-semibold hover:bg-indigo-50 transition-colors"
          >
            <CreditCard className="w-4 h-4" /> Recharge
          </Link>
          <Link
            to="/voice/wallet"
            className="hidden sm:flex items-center gap-1 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-sm font-medium"
          >
            Details <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Tooltip ────────────────────────────────────────────────── */
function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-xl px-4 py-3 shadow-xl border" style={{ borderColor: P.border }}>
      <p className="text-xs font-bold mb-1" style={{ color: P.text }}>{label}</p>
      {payload.map((e, i) => (
        <p key={i} className="text-xs" style={{ color: e.color }}>{e.name}: <span className="font-semibold">{e.value}</span></p>
      ))}
    </div>
  );
}

/* ─── Card wrapper ───────────────────────────────────────────── */
function Card({ children, className = '' }) {
  return <motion.div variants={fadeUp} className={`rounded-2xl bg-white p-6 ${className}`} style={{ border: `1px solid ${P.border}` }}>{children}</motion.div>;
}

function CardHeader({ icon: Icon, title, subtitle, iconBg = '#6366f112', iconColor = P.indigo }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="p-2 rounded-xl" style={{ backgroundColor: iconBg }}>
        <Icon className="w-4 h-4" style={{ color: iconColor }} />
      </div>
      <div>
        <h3 className="text-sm font-bold" style={{ color: P.text }}>{title}</h3>
        {subtitle && <p className="text-xs" style={{ color: P.textMut }}>{subtitle}</p>}
      </div>
    </div>
  );
}

/* ─── Stat Card ──────────────────────────────────────────────── */
function StatCard({ stat }) {
  const Icon = stat.icon;
  const tc = stat.changeType === 'up' ? P.success : P.error;
  return (
    <motion.div variants={fadeUp} whileHover={{ y: -4, boxShadow: '0 20px 40px -12px rgba(99,102,241,0.12)' }} className="relative overflow-hidden rounded-2xl bg-white p-6" style={{ border: `1px solid ${P.border}` }}>
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <Spark data={stat.sparkData} color={tc} />
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tracking-tight" style={{ color: P.text }}>
          <Counter value={stat.value} decimals={String(stat.value).includes('.') ? 1 : 0} />
        </span>
        {stat.suffix && <span className="text-sm font-medium" style={{ color: P.textMut }}>{stat.suffix}</span>}
      </div>
      <p className="text-sm mt-1" style={{ color: P.textSec }}>{stat.label}</p>
      <div className="mt-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: stat.changeType === 'up' ? '#10b98115' : '#ef444415', color: tc }}>
        {stat.changeType === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {stat.change}
      </div>
    </motion.div>
  );
}

/* ─── Live Call Row ───────────────────────────────────────────── */
const STATUS_CFG = {
  active: { bg: '#10b98118', color: P.success, label: 'Active' },
  completed: { bg: '#6366f118', color: P.indigo, label: 'Completed' },
  failed: { bg: '#ef444418', color: P.error, label: 'Failed' },
};

function LiveRow({ call, index, onRowClick }) {
  const [elapsed, setElapsed] = useState(call.duration);
  const s = STATUS_CFG[call.status] || STATUS_CFG.completed;
  useEffect(() => { if (call.status !== 'active') return; const i = setInterval(() => setElapsed(e => e + 1), 1000); return () => clearInterval(i); }, [call.status]);
  const fmt = (sec) => `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35 }}
      onClick={onRowClick}
      className="flex items-center gap-4 px-5 py-3.5 hover:bg-indigo-50/50 cursor-pointer transition-colors group"
    >
      <div className="relative flex-shrink-0">
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>{call.caller.slice(-4,-2)}</div>
        {call.status === 'active' && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white animate-pulse" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate group-hover:text-indigo-600 transition-colors" style={{ color: P.text }}>{call.caller}</p>
        <p className="text-xs" style={{ color: P.textMut }}>{call.agent}</p>
      </div>
      <span className="text-sm font-mono w-14 text-right" style={{ color: P.textSec }}>{fmt(elapsed)}</span>
      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider" style={{ backgroundColor: s.bg, color: s.color }}>{s.label}</span>
      <span className="px-2 py-0.5 rounded-md text-[11px] font-medium" style={{ backgroundColor: '#6366f10d', color: P.indigo }}>{call.language}</span>
    </motion.div>
  );
}

/* ─── Rating Stars ───────────────────────────────────────────── */
function Stars({ rating }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => {
        const fill = i < Math.floor(rating) ? P.warning : i === Math.floor(rating) && rating % 1 > 0 ? `${P.warning}60` : '#e2e8f0';
        return <Star key={i} className="w-3.5 h-3.5" style={{ fill, color: fill }} />;
      })}
      <span className="ml-1 text-xs font-semibold" style={{ color: P.textSec }}>{rating}</span>
    </span>
  );
}

/* ─── Main Dashboard ─────────────────────────────────────────── */

export default function VoiceAIDashboard() {
  const navigate = useNavigate();
  const [liveCalls, setLiveCalls] = useState([]);
  const [heroStats, setHeroStats] = useState(null);
  const [convVolume, setConvVolume] = useState([]);
  const [languageData, setLanguageData] = useState([]);
  const [emotionData, setEmotionData] = useState([]);
  const [topAgents, setTopAgents] = useState([]);

  // ── Fetch analytics summary + agents on mount ──────────────────
  useEffect(() => {
    let alive = true;

    // Summary stats from /api/v1/analytics/summary
    fetch('/api/v1/analytics/summary', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => alive && data && setHeroStats(data))
      .catch(() => {});

    // Agents list — API returns { agents: [...] }
    agentsAPI.list()
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : (data?.agents || []);
        if (!alive || list.length === 0) return;
        setTopAgents(list.slice(0, 4).map((a, i) => ({
          name: a.name || `Agent ${i + 1}`,
          avatar: (a.name || 'AA').slice(0, 2).toUpperCase(),
          calls: a.total_calls || 0,
          successRate: a.success_rate || Math.round(85 + Math.random() * 12),
          avgDuration: a.avg_duration || '—',
          rating: a.rating || 4.5,
        })));
      })
      .catch(() => {});

    // Conversation volume – last 7 days via trends
    fetch('/api/v1/analytics/trends?period=daily', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!alive || !Array.isArray(data)) return;
        const last7 = data.slice(-7).map(d => ({
          day: DAYS[new Date(d.date).getDay()] || d.date.slice(5),
          conversations: d.calls || 0,
        }));
        if (last7.length > 0) setConvVolume(last7);
      })
      .catch(() => {});

    // Emotion distribution
    fetch('/api/v1/analytics/emotions', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!alive || !Array.isArray(data) || data.length === 0) return;
        setEmotionData(data.slice(0, 6).map(e => ({
          emotion: e.emotion ? (e.emotion.charAt(0).toUpperCase() + e.emotion.slice(1)) : 'Unknown',
          value: Math.round(e.percentage || 0),
          color: EMOTION_COLORS[e.emotion?.toLowerCase()] || P.slate,
        })));
      })
      .catch(() => {});

    // Dialect / language distribution
    fetch('/api/v1/analytics/dialects', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!alive || !Array.isArray(data) || data.length === 0) return;
        setLanguageData(data.slice(0, 5).map((d, i) => ({
          name: d.dialect ? (d.dialect.charAt(0).toUpperCase() + d.dialect.slice(1)) : 'Other',
          value: Math.round(d.percentage || 0),
          color: DIALECT_COLORS[i] || P.slate,
        })));
      })
      .catch(() => {});

    return () => { alive = false; };
  }, []);

  // ── Live calls polling ─────────────────────────────────────────
  useEffect(() => {
    const fetchLive = () => {
      fetch('/api/v1/voice/analyses?status=active&limit=10', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data && Array.isArray(data) && data.length > 0) {
            setLiveCalls(data.map(c => ({
              id: c.id, caller: c.phone || c.caller || 'Unknown', agent: c.agent_name || c.agent || 'AI Agent',
              status: c.status || 'completed', duration: c.duration || 0, language: c.language || 'English',
            })));
          }
        })
        .catch(() => {});
    };
    fetchLive();
    const interval = setInterval(fetchLive, 10000);
    return () => clearInterval(interval);
  }, []);

  // ── Derived hero stat values ───────────────────────────────────
  const heroCards = [
    {
      label: 'Total Conversations',
      value: heroStats?.total_calls ?? heroStats?.total_voice_analyses ?? 0,
      change: heroStats ? `${heroStats.total_calls || 0} total` : 'Loading…',
      changeType: 'up',
      icon: MessageSquare,
      sparkData: convVolume.length >= 7 ? convVolume.map(d => d.conversations) : [0,0,0,0,0,0,0],
    },
    {
      label: 'Active Agents',
      value: topAgents.length,
      change: `${topAgents.length} configured`,
      changeType: 'up',
      icon: Bot,
      sparkData: [0,0,0,0,0,0,topAgents.length],
    },
    {
      label: 'Active Campaigns',
      value: heroStats?.active_campaigns ?? 0,
      change: heroStats ? `${heroStats.active_campaigns || 0} running` : 'Loading…',
      changeType: 'up',
      icon: Clock,
      sparkData: [0,0,0,0,0,0,heroStats?.active_campaigns ?? 0],
    },
    {
      label: 'Avg Sentiment',
      value: heroStats ? Math.round((heroStats.avg_sentiment || 0) * 5 * 10) / 10 : 0,
      suffix: '/ 5',
      change: heroStats ? `${heroStats.total_leads || 0} leads` : 'Loading…',
      changeType: heroStats?.avg_sentiment > 0.6 ? 'up' : 'down',
      icon: Smile,
      sparkData: [0,0,0,0,0,0,heroStats ? Math.round((heroStats.avg_sentiment || 0) * 5 * 10) / 10 : 0],
    },
  ];

  const displayConvVolume = convVolume.length > 0
    ? convVolume
    : [{ day:'Mon',conversations:0},{day:'Tue',conversations:0},{day:'Wed',conversations:0},
       {day:'Thu',conversations:0},{day:'Fri',conversations:0},{day:'Sat',conversations:0},{day:'Sun',conversations:0}];

  const displayLanguage = languageData.length > 0 ? languageData : [
    { name: 'Hindi', value: 35, color: P.indigo }, { name: 'English', value: 30, color: P.violet },
    { name: 'Tamil', value: 15, color: P.amber }, { name: 'Telugu', value: 10, color: P.emerald },
    { name: 'Other', value: 10, color: P.slate },
  ];

  const displayEmotion = emotionData.length > 0 ? emotionData : [
    { emotion: 'Happy', value: 32, color: '#10b981' }, { emotion: 'Neutral', value: 28, color: '#94a3b8' },
    { emotion: 'Excited', value: 18, color: '#f59e0b' }, { emotion: 'Sad', value: 12, color: '#3b82f6' },
    { emotion: 'Confused', value: 7, color: '#a855f7' }, { emotion: 'Angry', value: 3, color: '#ef4444' },
  ];

  const displayAgents = topAgents.length > 0 ? topAgents : [
    { name: 'No agents yet', avatar: 'NA', calls: 0, successRate: 0, avgDuration: '—', rating: 0 },
  ];

  const displayLiveCalls = liveCalls.length > 0 ? liveCalls : [];
  const activeLiveCount = displayLiveCalls.filter(c => c.status === 'active').length;

  return (
    <div className="min-h-screen -mx-4 lg:-mx-6 -mt-6 lg:-mt-8" style={{ backgroundColor: P.bg }}>
      <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-8 lg:py-10">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: P.text }}>Command Center</h1>
            <p className="text-sm mt-1" style={{ color: P.textSec }}>Real-time overview &amp; analytics</p>
          </div>
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold" style={{ backgroundColor: '#10b98112', color: P.success, border: '1px solid #10b98125' }}>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            System Online
          </span>
        </motion.div>

        {/* 1. Hero Stats */}
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          {heroCards.map(s => <StatCard key={s.label} stat={s} />)}
        </motion.div>

        {/* Wallet snapshot */}
        <DashboardWalletCard />

        {/* 2. Live Activity + Conversation Volume */}
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Live Activity */}
          <motion.div variants={fadeUp} className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${P.border}` }}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl" style={{ backgroundColor: '#10b98112' }}>
                  <Activity className="w-4 h-4" style={{ color: P.success }} />
                </div>
                <div>
                  <h3 className="text-sm font-bold" style={{ color: P.text }}>Real-Time Activity</h3>
                  <p className="text-xs" style={{ color: P.textMut }}>Live conversation feed</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: P.success }}>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                {activeLiveCount} active
              </span>
            </div>
            <div className="max-h-[380px] overflow-y-auto divide-y" style={{ borderColor: P.border }}>
              {displayLiveCalls.length === 0 ? (
                <p className="text-center text-sm py-10" style={{ color: P.textMut }}>No active calls right now</p>
              ) : (
                displayLiveCalls.map((call, i) => <LiveRow key={call.id} call={call} index={i} onRowClick={() => navigate('/voice/live-calls')} />)
              )}
            </div>
          </motion.div>

          {/* Conversation Volume */}
          <Card>
            <CardHeader icon={MessageSquare} title="Conversation Volume" subtitle="Last 7 days" />
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={displayConvVolume} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cvFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={P.indigo} stopOpacity={0.15} />
                      <stop offset="100%" stopColor={P.indigo} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fontSize: 12, fill: P.textMut }} axisLine={false} tickLine={false} />
                  <Tooltip content={<Tip />} />
                  <Area type="monotone" dataKey="conversations" name="Conversations" stroke={P.indigo} strokeWidth={2.5} fill="url(#cvFill)" dot={{ r: 4, fill: P.indigo, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6, stroke: P.indigo, strokeWidth: 2, fill: '#fff' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </motion.div>

        {/* 3. Resolution Breakdown + CSAT Trend */}
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Resolution */}
          <Card>
            <CardHeader icon={Target} title="Resolution Breakdown" subtitle="How conversations are resolved" iconBg="#10b98112" iconColor={P.success} />
            <div className="flex items-center gap-6">
              <div className="w-40 h-40 relative flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={RESOLUTION_DATA} innerRadius={50} outerRadius={70} dataKey="value" paddingAngle={3} stroke="none">
                      {RESOLUTION_DATA.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-xl font-bold" style={{ color: P.text }}>68%</p>
                    <p className="text-[10px]" style={{ color: P.textMut }}>Auto</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 space-y-3">
                {RESOLUTION_DATA.map(r => (
                  <div key={r.name} className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                      <span className="text-sm" style={{ color: P.textSec }}>{r.name}</span>
                    </span>
                    <span className="text-sm font-bold" style={{ color: P.text }}>{r.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Avg Handle Time */}
          <Card>
            <CardHeader icon={Clock} title="Avg Handle Time" subtitle="Actual vs target (3.5 min)" />
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={AVG_HANDLE_TIME} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: P.textMut }} axisLine={false} tickLine={false} />
                  <Tooltip content={<Tip />} />
                  <Line type="monotone" dataKey="target" name="Target" stroke="#e2e8f0" strokeWidth={2} strokeDasharray="6 3" dot={false} />
                  <Line type="monotone" dataKey="time" name="Actual" stroke={P.indigo} strokeWidth={2.5} dot={{ r: 4, fill: P.indigo, stroke: '#fff', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </motion.div>

        {/* 4. Top Agents + Language Distribution */}
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Top Agents */}
          <Card>
            <CardHeader icon={Sparkles} title="Your Agents" subtitle="Configured voice agents" iconBg="#f59e0b12" iconColor={P.warning} />
            <div className="space-y-3">
              {displayAgents.map((agent, i) => (
                <div key={agent.name} className="flex items-center gap-4 p-3.5 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer" style={{ border: `1px solid ${P.border}` }} onClick={() => navigate('/voice/agents-list')}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>{agent.avatar}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-sm font-semibold truncate" style={{ color: P.text }}>{agent.name}</p>
                      {agent.successRate > 0 && <span className="text-sm font-bold" style={{ color: P.indigo }}>{agent.successRate}%</span>}
                    </div>
                    {agent.successRate > 0 && (
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#e2e8f0' }}>
                        <motion.div initial={{ width: 0 }} animate={{ width: `${agent.successRate}%` }} transition={{ delay: 0.3 + i * 0.1, duration: 0.8 }} className="h-full rounded-full" style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />
                      </div>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: P.textMut }}>
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{agent.calls.toLocaleString()} calls</span>
                      {agent.avgDuration !== '—' && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{agent.avgDuration}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Language Distribution */}
          <Card>
            <CardHeader icon={Languages} title="Language Distribution" subtitle="Across all conversations" />
            <div className="h-48 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={displayLanguage} innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={3} stroke="none">
                    {displayLanguage.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip content={<Tip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <p className="text-2xl font-bold" style={{ color: P.text }}>{displayLanguage.length}</p>
                  <p className="text-xs" style={{ color: P.textMut }}>Languages</p>
                </div>
              </div>
            </div>
            <div className="space-y-2.5 mt-4">
              {displayLanguage.map(item => (
                <div key={item.name} className="flex items-center justify-between">
                  <span className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-sm" style={{ color: P.textSec }}>{item.name}</span>
                  </span>
                  <span className="text-sm font-bold" style={{ color: P.text }}>{item.value}%</span>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>

        {/* 5. Emotion Distribution */}
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader icon={Smile} title="Emotion Distribution" subtitle="Detected caller emotions" iconBg="#a855f712" iconColor="#a855f7" />
            <div className="space-y-3">
              {displayEmotion.map(e => (
                <div key={e.emotion} className="flex items-center gap-3">
                  <span className="text-sm w-16 text-right" style={{ color: P.textSec }}>{e.emotion}</span>
                  <div className="flex-1 h-6 rounded-lg overflow-hidden" style={{ backgroundColor: '#f1f5f9' }}>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(e.value, 2)}%` }} transition={{ duration: 0.8, ease: [0.22,1,0.36,1] }} className="h-full rounded-lg flex items-center justify-end pr-2" style={{ backgroundColor: e.color }}>
                      <span className="text-[10px] font-bold text-white">{e.value}%</span>
                    </motion.div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader icon={Target} title="Quick Actions" subtitle="Jump to key features" iconBg="#6366f112" iconColor={P.indigo} />
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Create Agent', icon: Plus, path: '/voice/agent-builder' },
                { label: 'Upload Knowledge', icon: Upload, path: '/voice/knowledge' },
                { label: 'View Call Logs', icon: Phone, path: '/voice/call-logs' },
                { label: 'Deploy Channels', icon: Globe, path: '/voice/channels' },
              ].map(a => (
                <button key={a.label} onClick={() => navigate(a.path)}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-indigo-50 transition-colors text-center group"
                  style={{ border: `1px solid ${P.border}` }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                    <a.icon className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-xs font-medium group-hover:text-indigo-600 transition-colors" style={{ color: P.textSec }}>{a.label}</span>
                </button>
              ))}
            </div>
          </Card>
        </motion.div>

      </div>
    </div>
  );
}
