/**
 * AgentsListPage - Light Theme Voice AI Agent Management
 * Grid/List view with filtering, search, and quick actions
 */

import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Bot, Plus, LayoutGrid, List, Search, Filter, MoreVertical,
  Phone, Star, Globe, Trash2, Copy, Power, PowerOff, Edit3,
  ChevronDown, X, TrendingUp, Clock, MessageSquare, Sparkles,
  CheckCircle, PauseCircle, XCircle, ArrowUpDown
} from 'lucide-react';

/* ─── Mock Data ────────────────────────────────────────────────── */

const AGENTS = [
  {
    id: 1, name: 'Sales Pro', description: 'High-performance outbound sales agent for B2B lead qualification',
    status: 'active', language: 'Hindi, English', conversations: 3842, rating: 4.8,
    avatar: { emoji: '\u{1F916}', bg: 'from-indigo-500 to-violet-600' }, createdAt: '2026-01-15',
    successRate: 0.74, avgDuration: '4:22',
  },
  {
    id: 2, name: 'Support Guru', description: 'Customer support specialist for issue resolution',
    status: 'active', language: 'Tamil, English', conversations: 5621, rating: 4.9,
    avatar: { emoji: '\u{1F3A7}', bg: 'from-emerald-500 to-teal-600' }, createdAt: '2026-01-08',
    successRate: 0.89, avgDuration: '6:15',
  },
  {
    id: 3, name: 'Promo Blaster', description: 'Promotional campaign agent for announcements',
    status: 'active', language: 'Hindi, Tamil, English', conversations: 12430, rating: 4.2,
    avatar: { emoji: '\u{1F4DE}', bg: 'from-amber-500 to-orange-600' }, createdAt: '2026-02-01',
    successRate: 0.61, avgDuration: '2:45',
  },
  {
    id: 4, name: 'Retention Bot', description: 'Churn prevention agent for customer retention',
    status: 'inactive', language: 'English', conversations: 2156, rating: 4.5,
    avatar: { emoji: '\u{1F4AC}', bg: 'from-rose-500 to-pink-600' }, createdAt: '2026-02-10',
    successRate: 0.78, avgDuration: '5:30',
  },
  {
    id: 5, name: 'Survey Agent', description: 'Automated survey collection and feedback gathering',
    status: 'draft', language: 'Hindi', conversations: 0, rating: 0,
    avatar: { emoji: '\u{1F3AF}', bg: 'from-cyan-500 to-blue-600' }, createdAt: '2026-03-01',
    successRate: 0, avgDuration: '0:00',
  },
  {
    id: 6, name: 'Onboarding Helper', description: 'New customer onboarding and welcome calls',
    status: 'active', language: 'Hinglish', conversations: 876, rating: 4.6,
    avatar: { emoji: '\u{1F9E0}', bg: 'from-purple-500 to-fuchsia-600' }, createdAt: '2026-03-15',
    successRate: 0.82, avgDuration: '3:50',
  },
];

const STATUS_OPTIONS = ['All', 'Active', 'Inactive', 'Draft'];
const LANGUAGE_OPTIONS = ['All', 'Hindi', 'English', 'Tamil', 'Telugu', 'Hinglish'];
const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'conversations', label: 'Conversations' },
  { value: 'rating', label: 'Rating' },
  { value: 'createdAt', label: 'Date Created' },
];

/* ─── Status Badge ─────────────────────────────────────────────── */

const STATUS_STYLES = {
  active: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  inactive: { bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200', dot: 'bg-slate-400' },
  draft: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', dot: 'bg-amber-500' },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${s.bg} ${s.text} ${s.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${status === 'active' ? 'animate-pulse' : ''}`} />
      {status}
    </span>
  );
}

/* ─── Agent Card (Grid View) ───────────────────────────────────── */

function AgentCard({ agent, onToggle, onDuplicate, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="group relative rounded-2xl border border-gray-100 bg-white overflow-hidden hover:shadow-lg hover:border-gray-200 transition-all duration-300 shadow-sm">
      {/* Gradient accent top */}
      <div className={`h-1 bg-gradient-to-r ${agent.avatar.bg}`} />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${agent.avatar.bg} flex items-center justify-center text-2xl shadow-md ring-2 ring-white`}>
              {agent.avatar.emoji}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{agent.name}</h3>
              <StatusBadge status={agent.status} />
            </div>
          </div>
          {/* Actions menu */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all opacity-0 group-hover:opacity-100"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-xl py-1 z-20">
                  <Link
                    to={`/voice/agent-builder/${agent.id}`}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit Agent
                  </Link>
                  <button
                    onClick={() => { onDuplicate(agent); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" /> Duplicate
                  </button>
                  <button
                    onClick={() => { onToggle(agent); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    {agent.status === 'active' ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                    {agent.status === 'active' ? 'Deactivate' : 'Activate'}
                  </button>
                  <div className="border-t border-gray-100 my-1" />
                  <button
                    onClick={() => { onDelete(agent); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-slate-500 mb-4 line-clamp-2">{agent.description}</p>

        {/* Language */}
        <div className="flex items-center gap-1.5 mb-4">
          <Globe className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs text-slate-500">{agent.language}</span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-slate-50 border border-gray-100">
          <div className="text-center">
            <p className="text-sm font-bold text-slate-900">{agent.conversations.toLocaleString()}</p>
            <p className="text-[10px] text-slate-400">Calls</p>
          </div>
          <div className="text-center border-x border-gray-200">
            <p className="text-sm font-bold text-slate-900">{agent.rating > 0 ? agent.rating : '--'}</p>
            <p className="text-[10px] text-slate-400">Rating</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-slate-900">{agent.successRate > 0 ? `${Math.round(agent.successRate * 100)}%` : '--'}</p>
            <p className="text-[10px] text-slate-400">Success</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Agent Row (List View) ────────────────────────────────────── */

function AgentRow({ agent, onToggle, onDuplicate, onDelete }) {
  return (
    <div className="group flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors border-b border-gray-100 last:border-0">
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${agent.avatar.bg} flex items-center justify-center text-lg flex-shrink-0 shadow-sm`}>
        {agent.avatar.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-900 truncate">{agent.name}</p>
          <StatusBadge status={agent.status} />
        </div>
        <p className="text-xs text-slate-500 truncate">{agent.description}</p>
      </div>
      <div className="flex items-center gap-1.5 w-28">
        <Globe className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        <span className="text-xs text-slate-500 truncate">{agent.language}</span>
      </div>
      <div className="w-20 text-right">
        <p className="text-sm font-semibold text-slate-900">{agent.conversations.toLocaleString()}</p>
        <p className="text-[10px] text-slate-400">Calls</p>
      </div>
      <div className="w-16 text-right">
        <div className="flex items-center justify-end gap-1">
          <Star className="w-3 h-3 text-amber-500" />
          <span className="text-sm font-semibold text-slate-900">{agent.rating > 0 ? agent.rating : '--'}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Link
          to={`/voice/agent-builder/${agent.id}`}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-indigo-500 transition-colors"
          title="Edit"
        >
          <Edit3 className="w-4 h-4" />
        </Link>
        <button onClick={() => onDuplicate(agent)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Duplicate">
          <Copy className="w-4 h-4" />
        </button>
        <button onClick={() => onToggle(agent)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-amber-500 transition-colors" title="Toggle">
          {agent.status === 'active' ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
        </button>
        <button onClick={() => onDelete(agent)} className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Delete">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/* ─── Main Component ───────────────────────────────────────────── */

export default function AgentsListPage() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState(AGENTS);
  const [view, setView] = useState('grid');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [languageFilter, setLanguageFilter] = useState('All');
  const [sortBy, setSortBy] = useState('conversations');

  const filtered = useMemo(() => {
    let result = agents;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((a) => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q));
    }
    if (statusFilter !== 'All') {
      result = result.filter((a) => a.status === statusFilter.toLowerCase());
    }
    if (languageFilter !== 'All') {
      result = result.filter((a) => a.language.includes(languageFilter));
    }
    result = [...result].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'conversations') return b.conversations - a.conversations;
      if (sortBy === 'rating') return b.rating - a.rating;
      if (sortBy === 'createdAt') return new Date(b.createdAt) - new Date(a.createdAt);
      return 0;
    });
    return result;
  }, [agents, search, statusFilter, languageFilter, sortBy]);

  const handleToggle = (agent) => {
    setAgents((prev) => prev.map((a) => a.id === agent.id ? { ...a, status: a.status === 'active' ? 'inactive' : 'active' } : a));
    toast.success(`${agent.name} ${agent.status === 'active' ? 'deactivated' : 'activated'}`);
  };

  const handleDuplicate = (agent) => {
    const dup = { ...agent, id: Date.now(), name: `${agent.name} (Copy)`, status: 'draft', conversations: 0, rating: 0 };
    setAgents((prev) => [...prev, dup]);
    toast.success(`Duplicated ${agent.name}`);
  };

  const handleDelete = (agent) => {
    setAgents((prev) => prev.filter((a) => a.id !== agent.id));
    toast.success(`Deleted ${agent.name}`);
  };

  const activeCount = agents.filter((a) => a.status === 'active').length;
  const totalConversations = agents.reduce((sum, a) => sum + a.conversations, 0);

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
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">AI Agents</h1>
            <p className="text-sm text-slate-500 mt-1">
              {agents.length} agents total &middot; {activeCount} active &middot; {totalConversations.toLocaleString()} total conversations
            </p>
          </div>
          <Link
            to="/voice/agent-builder"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-lg shadow-indigo-200 transition-all"
          >
            <Plus className="w-4 h-4" /> Create New Agent
          </Link>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agents..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all shadow-sm"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-white border border-gray-200 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none appearance-none cursor-pointer shadow-sm"
            >
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s === 'All' ? 'All Status' : s}</option>)}
            </select>

            <select
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-white border border-gray-200 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none appearance-none cursor-pointer shadow-sm"
            >
              {LANGUAGE_OPTIONS.map((l) => <option key={l} value={l}>{l === 'All' ? 'All Languages' : l}</option>)}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-white border border-gray-200 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none appearance-none cursor-pointer shadow-sm"
            >
              {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>Sort: {s.label}</option>)}
            </select>
          </div>

          {/* View toggle */}
          <div className="flex items-center rounded-xl border border-gray-200 overflow-hidden ml-auto bg-white shadow-sm">
            <button
              onClick={() => setView('grid')}
              className={`p-2.5 transition-colors ${view === 'grid' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={`p-2.5 transition-colors ${view === 'list' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Results count */}
        <p className="text-xs text-slate-400 mb-4">{filtered.length} agent{filtered.length !== 1 ? 's' : ''} found</p>

        {/* Grid View */}
        {view === 'grid' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Create card */}
            <Link
              to="/voice/agent-builder"
              className="flex flex-col items-center justify-center gap-3 p-8 rounded-2xl border-2 border-dashed border-gray-200 hover:border-indigo-300 bg-white hover:bg-indigo-50/50 transition-all cursor-pointer group min-h-[280px] shadow-sm"
            >
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Plus className="w-6 h-6 text-indigo-500" />
              </div>
              <p className="text-sm font-semibold text-slate-500 group-hover:text-indigo-600 transition-colors">Create New Agent</p>
            </Link>
            {filtered.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onToggle={handleToggle} onDuplicate={handleDuplicate} onDelete={handleDelete} />
            ))}
          </div>
        )}

        {/* List View */}
        {view === 'list' && (
          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            {/* Header */}
            <div className="flex items-center gap-4 px-5 py-3 border-b border-gray-100 text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50">
              <div className="w-10" />
              <div className="flex-1">Agent</div>
              <div className="w-28">Language</div>
              <div className="w-20 text-right">Calls</div>
              <div className="w-16 text-right">Rating</div>
              <div className="w-40" />
            </div>
            {filtered.map((agent) => (
              <AgentRow key={agent.id} agent={agent} onToggle={handleToggle} onDuplicate={handleDuplicate} onDelete={handleDelete} />
            ))}
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16">
                <Bot className="w-12 h-12 text-slate-300 mb-3" />
                <p className="text-sm text-slate-500">No agents found</p>
                <p className="text-xs text-slate-400 mt-1">Try adjusting your filters</p>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
