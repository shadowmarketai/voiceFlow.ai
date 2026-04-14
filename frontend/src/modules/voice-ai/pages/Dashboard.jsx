/**
 * Voice AI Dashboard — World-class light-theme command center
 * Premium design with subtle 3D accents, framer-motion animations, recharts
 */

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import {
  MessageSquare, Bot, Clock, Smile, TrendingUp, TrendingDown,
  Phone, Globe, ArrowRight, Plus, Upload, BarChart3,
  Activity, Sparkles, Star, Headphones, Languages
} from 'lucide-react';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, Tooltip, ResponsiveContainer
} from 'recharts';

/* ─── Lazy 3D ─────────────────────────────────────────────────── */
const HeroOrb3D = React.lazy(() => import('./Dashboard3DOrb'));

/* ─── Color Palette (light only) ──────────────────────────────── */
const PALETTE = {
  bg: '#fafbfe',
  card: '#ffffff',
  border: 'rgba(0,0,0,0.06)',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  emerald: '#10b981',
  amber: '#f59e0b',
  slate: '#64748b',
};

/* ─── Mock Data ───────────────────────────────────────────────── */

const HERO_STATS = [
  {
    label: 'Total Conversations',
    value: 12456,
    change: '+14.2%',
    changeType: 'up',
    icon: MessageSquare,
    sparkData: [180, 220, 195, 310, 280, 350, 420],
  },
  {
    label: 'Active Agents',
    value: 4,
    suffix: '/ 5',
    change: '+1 this week',
    changeType: 'up',
    icon: Bot,
    sparkData: [2, 2, 3, 3, 3, 4, 4],
  },
  {
    label: 'Minutes Used',
    value: 8432,
    suffix: 'min',
    change: '84% of limit',
    changeType: 'up',
    icon: Clock,
    sparkData: [5200, 5800, 6300, 7100, 7600, 8000, 8432],
  },
  {
    label: 'Satisfaction Score',
    value: 4.7,
    suffix: '/ 5',
    change: '+0.3 pts',
    changeType: 'up',
    icon: Smile,
    sparkData: [4.2, 4.3, 4.4, 4.5, 4.5, 4.6, 4.7],
  },
];

const CONVERSATION_DATA = [
  { day: 'Mon', conversations: 245 },
  { day: 'Tue', conversations: 312 },
  { day: 'Wed', conversations: 289 },
  { day: 'Thu', conversations: 378 },
  { day: 'Fri', conversations: 421 },
  { day: 'Sat', conversations: 198 },
  { day: 'Sun', conversations: 156 },
];

const LANGUAGE_DATA = [
  { name: 'Hindi', value: 35, color: PALETTE.indigo },
  { name: 'English', value: 30, color: PALETTE.violet },
  { name: 'Tamil', value: 15, color: PALETTE.amber },
  { name: 'Telugu', value: 10, color: PALETTE.emerald },
  { name: 'Other', value: 10, color: PALETTE.slate },
];

const LIVE_CALLS = [
  { id: 1, caller: '+91 98765 43210', agent: 'Sales Pro', duration: 124, status: 'active', language: 'Hindi' },
  { id: 2, caller: '+91 87654 32109', agent: 'Support Guru', duration: 67, status: 'active', language: 'Tamil' },
  { id: 3, caller: '+91 76543 21098', agent: 'Promo Blaster', duration: 245, status: 'completed', language: 'English' },
  { id: 4, caller: '+91 65432 10987', agent: 'Sales Pro', duration: 32, status: 'active', language: 'Telugu' },
  { id: 5, caller: '+91 54321 09876', agent: 'Support Guru', duration: 189, status: 'failed', language: 'Hindi' },
  { id: 6, caller: '+91 43210 98765', agent: 'Retention Bot', duration: 312, status: 'completed', language: 'English' },
  { id: 7, caller: '+91 32109 87654', agent: 'Sales Pro', duration: 45, status: 'active', language: 'Hindi' },
];

const TOP_AGENTS = [
  { name: 'Support Guru', avatar: 'SG', calls: 5621, successRate: 96, avgDuration: '3:24', rating: 4.9 },
  { name: 'Sales Pro', avatar: 'SP', calls: 3842, successRate: 94, avgDuration: '2:48', rating: 4.8 },
  { name: 'Promo Blaster', avatar: 'PB', calls: 12430, successRate: 87, avgDuration: '1:15', rating: 4.2 },
  { name: 'Retention Bot', avatar: 'RB', calls: 2156, successRate: 82, avgDuration: '4:02', rating: 4.5 },
];

const QUICK_ACTIONS = [
  {
    label: 'Create New Agent',
    desc: 'Build a custom voice AI agent from scratch',
    icon: Plus,
    path: '/voice/agent-builder',
  },
  {
    label: 'Upload Knowledge',
    desc: 'Add documents to your knowledge base',
    icon: Upload,
    path: '/voice/knowledge',
  },
  {
    label: 'Buy Phone Number',
    desc: 'Get a dedicated number for your agents',
    icon: Phone,
    path: '/voice/phone-numbers',
  },
  {
    label: 'View Analytics',
    desc: 'Deep dive into performance metrics',
    icon: BarChart3,
    path: '/voice/analytics-dashboard',
  },
];

/* ─── Animation Variants ──────────────────────────────────────── */

const staggerContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08 },
  },
};

const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

const fadeInScale = {
  hidden: { opacity: 0, scale: 0.95 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

/* ─── Animated Counter (framer-motion) ────────────────────────── */

function AnimatedCounter({ value, decimals = 0, duration = 1.2 }) {
  const motionVal = useMotionValue(0);
  const rounded = useTransform(motionVal, (v) =>
    decimals > 0 ? v.toFixed(decimals) : Math.floor(v).toLocaleString()
  );
  const [display, setDisplay] = useState(decimals > 0 ? '0.0' : '0');

  useEffect(() => {
    const controls = animate(motionVal, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
    });
    const unsub = rounded.on('change', (v) => setDisplay(v));
    return () => {
      controls.stop();
      unsub();
    };
  }, [value, duration, decimals, motionVal, rounded]);

  return <>{display}</>;
}

/* ─── Mini Sparkline (recharts) ───────────────────────────────── */

function MiniSparkline({ data, color = PALETTE.indigo, height = 36 }) {
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width={80} height={height}>
      <AreaChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <defs>
          <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#spark-${color.replace('#', '')})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ─── Hero Stat Card ──────────────────────────────────────────── */

function StatCard({ stat, index }) {
  const Icon = stat.icon;
  const trendColor = stat.changeType === 'up' ? PALETTE.success : PALETTE.error;

  return (
    <motion.div
      variants={fadeInUp}
      whileHover={{ y: -4, boxShadow: '0 20px 40px -12px rgba(99,102,241,0.12)' }}
      transition={{ duration: 0.25 }}
      className="relative overflow-hidden rounded-2xl bg-white p-6"
      style={{ border: `1px solid ${PALETTE.border}` }}
    >
      {/* Gradient accent at top */}
      <div
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{
          background: 'linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%)',
        }}
      />

      <div className="flex items-start justify-between mb-4">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-xl"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
        >
          <Icon className="w-5 h-5 text-white" />
        </div>
        <MiniSparkline data={stat.sparkData} color={trendColor} />
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tracking-tight" style={{ color: PALETTE.textPrimary }}>
          <AnimatedCounter
            value={stat.value}
            decimals={String(stat.value).includes('.') ? 1 : 0}
          />
        </span>
        {stat.suffix && (
          <span className="text-sm font-medium" style={{ color: PALETTE.textMuted }}>
            {stat.suffix}
          </span>
        )}
      </div>

      <p className="text-sm mt-1" style={{ color: PALETTE.textSecondary }}>
        {stat.label}
      </p>

      <div className="mt-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
        style={{
          backgroundColor: stat.changeType === 'up' ? '#10b98115' : '#ef444415',
          color: trendColor,
        }}
      >
        {stat.changeType === 'up' ? (
          <TrendingUp className="w-3 h-3" />
        ) : (
          <TrendingDown className="w-3 h-3" />
        )}
        {stat.change}
      </div>
    </motion.div>
  );
}

/* ─── 3D Hero Fallback ────────────────────────────────────────── */

function Hero3DFallback() {
  return (
    <div
      className="w-full h-[200px] rounded-2xl flex items-center justify-center overflow-hidden relative"
      style={{
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 40%, #ec4899 100%)',
      }}
    >
      <div className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'radial-gradient(circle at 30% 50%, rgba(255,255,255,0.3) 0%, transparent 50%), radial-gradient(circle at 70% 50%, rgba(255,255,255,0.2) 0%, transparent 40%)',
        }}
      />
      <HeroOverlayText />
    </div>
  );
}

function HeroOverlayText() {
  return (
    <div className="relative z-10 text-center px-6">
      <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight mb-2">
        VoiceFlow AI — India's #1 Voice Agent Platform
      </h2>
      <p className="text-white/80 text-sm md:text-base font-medium">
        12+ Languages &bull; 5 TTS Engines &bull; Sub-500ms Latency
      </p>
    </div>
  );
}

/* ─── 3D Hero Section ─────────────────────────────────────────── */

function Hero3DSection() {
  return (
    <motion.div variants={fadeInUp} className="relative w-full h-[200px] rounded-2xl overflow-hidden"
      style={{ border: `1px solid ${PALETTE.border}` }}
    >
      <Suspense fallback={<Hero3DFallback />}>
        <HeroOrb3D />
      </Suspense>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <HeroOverlayText />
      </div>
    </motion.div>
  );
}

/* ─── Live Activity Feed ──────────────────────────────────────── */

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const STATUS_CONFIG = {
  active: { bg: '#10b98118', color: PALETTE.success, label: 'Active' },
  completed: { bg: '#6366f118', color: PALETTE.indigo, label: 'Completed' },
  failed: { bg: '#ef444418', color: PALETTE.error, label: 'Failed' },
};

function LiveCallRow({ call, index }) {
  const [elapsed, setElapsed] = useState(call.duration);
  const status = STATUS_CONFIG[call.status] || STATUS_CONFIG.completed;

  useEffect(() => {
    if (call.status !== 'active') return;
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, [call.status]);

  const initials = call.caller.slice(-4, -2);

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/80 transition-colors"
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
        >
          {initials}
        </div>
        {call.status === 'active' && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white animate-pulse" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: PALETTE.textPrimary }}>
          {call.caller}
        </p>
        <p className="text-xs" style={{ color: PALETTE.textMuted }}>
          {call.agent}
        </p>
      </div>

      {/* Duration */}
      <span className="text-sm font-mono w-14 text-right" style={{ color: PALETTE.textSecondary }}>
        {formatDuration(elapsed)}
      </span>

      {/* Status */}
      <span
        className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
        style={{ backgroundColor: status.bg, color: status.color }}
      >
        {status.label}
      </span>

      {/* Language */}
      <span
        className="px-2 py-0.5 rounded-md text-[11px] font-medium"
        style={{ backgroundColor: '#6366f10d', color: PALETTE.indigo }}
      >
        {call.language}
      </span>
    </motion.div>
  );
}

/* ─── Custom Tooltip ──────────────────────────────────────────── */

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-xl px-4 py-3 shadow-xl border"
      style={{ borderColor: PALETTE.border }}
    >
      <p className="text-xs font-bold mb-1" style={{ color: PALETTE.textPrimary }}>{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs" style={{ color: entry.color }}>
          {entry.name}: <span className="font-semibold">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

/* ─── Rating Stars ────────────────────────────────────────────── */

function RatingStars({ rating, max = 5 }) {
  const full = Math.floor(rating);
  const partial = rating - full;
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => {
        let fill;
        if (i < full) fill = PALETTE.warning;
        else if (i === full && partial > 0) fill = `${PALETTE.warning}60`;
        else fill = '#e2e8f0';
        return <Star key={i} className="w-3.5 h-3.5" style={{ fill, color: fill }} />;
      })}
      <span className="ml-1 text-xs font-semibold" style={{ color: PALETTE.textSecondary }}>
        {rating}
      </span>
    </span>
  );
}

/* ─── Main Dashboard ──────────────────────────────────────────── */

export default function VoiceAIDashboard() {
  const [stats, setStats] = useState(null);
  const [liveCalls, setLiveCalls] = useState(LIVE_CALLS);

  // Try to load real stats from API, fall back to mock data
  useEffect(() => {
    fetch('/api/v1/voice/analyses/stats')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.total_analyses > 0) {
          setStats(data);
        }
      })
      .catch(() => {}); // Keep mock data

    // Poll live calls every 10s
    const fetchLive = () => {
      fetch('/api/v1/voice/analyses?status=active&limit=5')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data && Array.isArray(data) && data.length > 0) {
            setLiveCalls(data.map(c => ({
              caller: c.phone || c.caller || 'Unknown',
              agent: c.agent || 'AI Agent',
              status: c.status || 'completed',
              duration: c.duration || 0,
              language: c.language || 'English',
            })));
          }
        })
        .catch(() => {});
    };
    const interval = setInterval(fetchLive, 10000);
    return () => clearInterval(interval);
  }, []);

  // Use API stats if available, otherwise mock
  const heroStats = stats ? [
    { ...HERO_STATS[0], value: stats.total_analyses || HERO_STATS[0].value },
    { ...HERO_STATS[1], value: stats.active_agents || HERO_STATS[1].value },
    { ...HERO_STATS[2], value: stats.total_minutes || HERO_STATS[2].value },
    { ...HERO_STATS[3], value: stats.avg_satisfaction || HERO_STATS[3].value },
  ] : HERO_STATS;

  const totalLanguageCalls = LANGUAGE_DATA.reduce((a, b) => a + b.value, 0);

  return (
    <div className="min-h-screen -mx-4 lg:-mx-6 -mt-6 lg:-mt-8" style={{ backgroundColor: PALETTE.bg }}>
      <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-8 lg:py-10">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between mb-8"
        >
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: PALETTE.textPrimary }}>
              Command Center
            </h1>
            <p className="text-sm mt-1" style={{ color: PALETTE.textSecondary }}>
              Real-time overview of your voice AI operations
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold"
              style={{ backgroundColor: '#10b98112', color: PALETTE.success, border: '1px solid #10b98125' }}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              System Online
            </span>
          </div>
        </motion.div>

        {/* ── Row 1: Hero Stats ─────────────────────────────────── */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8"
        >
          {heroStats.map((stat, i) => (
            <StatCard key={stat.label} stat={stat} index={i} />
          ))}
        </motion.div>

        {/* ── Row 2: 3D Hero Section ────────────────────────────── */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="mb-8"
        >
          <Hero3DSection />
        </motion.div>

        {/* ── Row 3: Live Activity + Conversation Volume ────────── */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8"
        >
          {/* Live Activity */}
          <motion.div
            variants={fadeInUp}
            className="rounded-2xl bg-white overflow-hidden"
            style={{ border: `1px solid ${PALETTE.border}` }}
          >
            <div className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: `1px solid ${PALETTE.border}` }}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl" style={{ backgroundColor: '#10b98112' }}>
                  <Activity className="w-4 h-4" style={{ color: PALETTE.success }} />
                </div>
                <div>
                  <h3 className="text-sm font-bold" style={{ color: PALETTE.textPrimary }}>
                    Real-Time Activity
                  </h3>
                  <p className="text-xs" style={{ color: PALETTE.textMuted }}>
                    Live conversation feed
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold"
                style={{ color: PALETTE.success }}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                {LIVE_CALLS.filter((c) => c.status === 'active').length} active
              </span>
            </div>
            <div className="max-h-[380px] overflow-y-auto divide-y" style={{ borderColor: PALETTE.border }}>
              {liveCalls.map((call, i) => (
                <LiveCallRow key={call.id} call={call} index={i} />
              ))}
            </div>
          </motion.div>

          {/* Conversation Volume Chart */}
          <motion.div
            variants={fadeInUp}
            className="rounded-2xl bg-white p-6"
            style={{ border: `1px solid ${PALETTE.border}` }}
          >
            <h3 className="text-sm font-bold mb-1" style={{ color: PALETTE.textPrimary }}>
              Conversation Volume
            </h3>
            <p className="text-xs mb-6" style={{ color: PALETTE.textMuted }}>
              Last 7 days
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={CONVERSATION_DATA} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="convGradFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PALETTE.indigo} stopOpacity={0.15} />
                      <stop offset="100%" stopColor={PALETTE.indigo} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 12, fill: PALETTE.textMuted }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="conversations"
                    name="Conversations"
                    stroke={PALETTE.indigo}
                    strokeWidth={2.5}
                    fill="url(#convGradFill)"
                    dot={{ r: 4, fill: PALETTE.indigo, stroke: '#ffffff', strokeWidth: 2 }}
                    activeDot={{ r: 6, stroke: PALETTE.indigo, strokeWidth: 2, fill: '#ffffff' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </motion.div>

        {/* ── Row 4: Agent Performance + Language Distribution ──── */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8"
        >
          {/* Top Agents */}
          <motion.div
            variants={fadeInUp}
            className="rounded-2xl bg-white p-6"
            style={{ border: `1px solid ${PALETTE.border}` }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4" style={{ color: PALETTE.warning }} />
              <h3 className="text-sm font-bold" style={{ color: PALETTE.textPrimary }}>
                Top Agents
              </h3>
            </div>
            <p className="text-xs mb-5" style={{ color: PALETTE.textMuted }}>
              Ranked by success rate
            </p>

            <div className="space-y-3">
              {TOP_AGENTS.map((agent, i) => (
                <div
                  key={agent.name}
                  className="flex items-center gap-4 p-3.5 rounded-xl hover:bg-slate-50 transition-colors"
                  style={{ border: `1px solid ${PALETTE.border}` }}
                >
                  {/* Avatar */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                  >
                    {agent.avatar}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-sm font-semibold truncate" style={{ color: PALETTE.textPrimary }}>
                        {agent.name}
                      </p>
                      <span className="text-sm font-bold" style={{ color: PALETTE.indigo }}>
                        {agent.successRate}%
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#e2e8f0' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${agent.successRate}%` }}
                        transition={{ delay: 0.3 + i * 0.1, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                        className="h-full rounded-full"
                        style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
                      />
                    </div>

                    <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: PALETTE.textMuted }}>
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {agent.calls.toLocaleString()} calls
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {agent.avgDuration}
                      </span>
                      <RatingStars rating={agent.rating} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Language Distribution */}
          <motion.div
            variants={fadeInUp}
            className="rounded-2xl bg-white p-6"
            style={{ border: `1px solid ${PALETTE.border}` }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Languages className="w-4 h-4" style={{ color: PALETTE.indigo }} />
              <h3 className="text-sm font-bold" style={{ color: PALETTE.textPrimary }}>
                Language Distribution
              </h3>
            </div>
            <p className="text-xs mb-5" style={{ color: PALETTE.textMuted }}>
              Across all conversations
            </p>

            <div className="h-56 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={LANGUAGE_DATA}
                    innerRadius={65}
                    outerRadius={95}
                    dataKey="value"
                    paddingAngle={3}
                    stroke="none"
                  >
                    {LANGUAGE_DATA.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Center text */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <p className="text-2xl font-bold" style={{ color: PALETTE.textPrimary }}>
                    {totalLanguageCalls}%
                  </p>
                  <p className="text-xs" style={{ color: PALETTE.textMuted }}>Total</p>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="space-y-2.5 mt-4">
              {LANGUAGE_DATA.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <span className="flex items-center gap-2.5">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm" style={{ color: PALETTE.textSecondary }}>
                      {item.name}
                    </span>
                  </span>
                  <span className="text-sm font-bold" style={{ color: PALETTE.textPrimary }}>
                    {item.value}%
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>

        {/* ── Row 5: Quick Actions ──────────────────────────────── */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          <motion.h3
            variants={fadeInUp}
            className="text-sm font-bold mb-4"
            style={{ color: PALETTE.textPrimary }}
          >
            Quick Actions
          </motion.h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {QUICK_ACTIONS.map((action, i) => {
              const Icon = action.icon;
              return (
                <motion.div key={action.label} variants={fadeInUp}>
                  <Link
                    to={action.path}
                    className="group flex items-start gap-4 p-5 rounded-2xl bg-white transition-all duration-300 hover:shadow-[0_16px_40px_-8px_rgba(99,102,241,0.15)]"
                    style={{ border: `1px solid ${PALETTE.border}` }}
                  >
                    <div
                      className="p-3 rounded-xl flex-shrink-0 group-hover:scale-110 transition-transform duration-300"
                      style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                    >
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold group-hover:text-indigo-600 transition-colors"
                        style={{ color: PALETTE.textPrimary }}
                      >
                        {action.label}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: PALETTE.textMuted }}>
                        {action.desc}
                      </p>
                    </div>
                    <ArrowRight
                      className="w-4 h-4 mt-1 flex-shrink-0 group-hover:translate-x-1 transition-transform duration-300"
                      style={{ color: PALETTE.textMuted }}
                    />
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

      </div>
    </div>
  );
}
