/**
 * Agents Page — Browse agents + templates, create new agents
 * Matches Edesy agent listing with grid/list views
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Bot, Plus, LayoutGrid, List, Search, MoreVertical,
  Play, Edit3, Trash2, Copy, Globe, Phone, Sparkles,
  CheckCircle, Languages, Clock, Star, TrendingUp,
  MessageSquare, ChevronDown, X
} from 'lucide-react';

/* ─── Demo/Template Agents ────────────────────────────────────── */

const DEMO_AGENTS = [
  { id: 'demo-1', name: 'Demo: Real Estate - Gujarati', language: 'Gujarati + English', status: 'active', isDemo: true, conversations: 1240, icon: '🏠' },
  { id: 'demo-2', name: 'Demo: Sales Agent - Assamese', language: 'Assamese', status: 'active', isDemo: true, conversations: 890, icon: '💼' },
  { id: 'demo-3', name: 'Demo: Customer Support - Odia', language: 'Odia', status: 'active', isDemo: true, conversations: 2100, icon: '🎧' },
  { id: 'demo-4', name: 'Demo: Real Estate - Bengali', language: 'Bengali', status: 'active', isDemo: true, conversations: 560, icon: '🏠' },
  { id: 'demo-5', name: 'Demo: Sales Agent - Kannada', language: 'Kannada', status: 'active', isDemo: true, conversations: 430, icon: '💼' },
  { id: 'demo-6', name: 'Demo: Customer Support - Telugu', language: 'Telugu', status: 'active', isDemo: true, conversations: 1850, icon: '🎧' },
  { id: 'demo-7', name: 'Demo: Real Estate - Tamil', language: 'Tamil + English', status: 'active', isDemo: true, conversations: 3200, icon: '🏠' },
  { id: 'demo-8', name: 'Demo: Sales Agent - Hindi', language: 'Hindi + English', status: 'active', isDemo: true, conversations: 5100, icon: '💼' },
  { id: 'demo-9', name: 'Demo: Customer Support - English', language: 'English', status: 'active', isDemo: true, conversations: 7800, icon: '🎧' },
];

/* ─── Main Component ──────────────────────────────────────────── */

export default function AgentsListPage() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState(DEMO_AGENTS);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [languageFilter, setLanguageFilter] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [menuOpen, setMenuOpen] = useState(null);

  // Load custom agents from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('vf_custom_agents');
      if (saved) {
        const custom = JSON.parse(saved);
        setAgents(prev => [...custom, ...prev]);
      }
    } catch {}
  }, []);

  const activeCount = agents.filter(a => a.status === 'active').length;

  const filtered = useMemo(() => {
    return agents.filter(a => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (languageFilter && !a.language.toLowerCase().includes(languageFilter.toLowerCase())) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return a.name.toLowerCase().includes(q) || a.language.toLowerCase().includes(q);
      }
      return true;
    });
  }, [agents, search, statusFilter, languageFilter]);

  const handleDelete = (id) => {
    setAgents(prev => prev.filter(a => a.id !== id));
    setMenuOpen(null);
    toast.success('Agent deleted');
  };

  const handleDuplicate = (agent) => {
    const dup = { ...agent, id: `dup-${Date.now()}`, name: `${agent.name} (Copy)`, isDemo: false };
    setAgents(prev => [dup, ...prev]);
    setMenuOpen(null);
    toast.success('Agent duplicated');
  };

  const handleTryNow = (agent) => {
    navigate('/voice/testing');
    toast.success(`Testing "${agent.name}"`);
  };

  const handleEdit = (agent) => {
    navigate(`/voice/agent-builder/${agent.id}`);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Agents</h1>
          <span className="text-sm text-gray-500">{agents.length} total</span>
          <span className="text-sm text-emerald-600 font-medium">{activeCount} active</span>
        </div>
        <button
          onClick={() => navigate('/voice/agent-builder')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-medium hover:shadow-md shadow-sm shadow-indigo-200 transition-all"
        >
          <Plus className="w-4 h-4" />
          New Agent
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search agents..."
            className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
        </div>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 appearance-none cursor-pointer pr-8 focus:outline-none focus:border-indigo-300">
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="draft">Draft</option>
        </select>

        <button onClick={() => setLanguageFilter(languageFilter ? '' : 'tamil')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${
            languageFilter ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
          }`}>
          <Languages className="w-4 h-4" />
          Languages
        </button>

        {/* View toggle */}
        <div className="flex items-center bg-gray-100 rounded-xl p-0.5 ml-auto">
          <button onClick={() => setViewMode('grid')}
            className={`p-2.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button onClick={() => setViewMode('list')}
            className={`p-2.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Section Label */}
      <div>
        <h2 className="text-sm font-medium text-gray-500">{filtered.some(a => a.isDemo) ? 'Demo Agents' : 'My Agents'}</h2>
      </div>

      {/* ═══ GRID VIEW ═══ */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {filtered.map(agent => (
            <div key={agent.id}
              className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5 hover:shadow-md hover:border-gray-300/60 transition-all">
              {/* Top row */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-lg">
                    {agent.icon || '🤖'}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 truncate max-w-[180px]">{agent.name}</h3>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {agent.isDemo && (
                        <span className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-gray-100 text-gray-600 border border-gray-200">Demo</span>
                      )}
                      <span className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-emerald-50 text-emerald-700 border border-emerald-200">Active</span>
                    </div>
                  </div>
                </div>

                {/* Menu */}
                <div className="relative">
                  <button onClick={() => setMenuOpen(menuOpen === agent.id ? null : agent.id)}
                    className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
                    <MoreVertical className="w-4 h-4 text-gray-400" />
                  </button>
                  {menuOpen === agent.id && (
                    <div className="absolute right-0 top-8 w-40 bg-white rounded-xl border border-gray-200 shadow-lg z-10 py-1">
                      <button onClick={() => { handleEdit(agent); setMenuOpen(null); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        <Edit3 className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button onClick={() => handleDuplicate(agent)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        <Copy className="w-3.5 h-3.5" /> Duplicate
                      </button>
                      <button onClick={() => handleDelete(agent.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Language */}
              <div className="flex items-center gap-1.5 mb-4 text-xs text-gray-500">
                <Globe className="w-3 h-3" />
                {agent.language}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button onClick={() => handleEdit(agent)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all">
                  <Edit3 className="w-3.5 h-3.5" /> Edit
                </button>
                <button onClick={() => handleTryNow(agent)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:shadow-md shadow-sm shadow-indigo-200 transition-all">
                  <Play className="w-3.5 h-3.5" /> Try Now
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ LIST VIEW ═══ */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-5 text-xs font-medium text-gray-500 uppercase">Agent</th>
                <th className="text-left py-3 px-5 text-xs font-medium text-gray-500 uppercase">Language</th>
                <th className="text-left py-3 px-5 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left py-3 px-5 text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="text-right py-3 px-5 text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(agent => (
                <tr key={agent.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="py-3 px-5">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{agent.icon || '🤖'}</span>
                      <span className="text-sm font-medium text-gray-900">{agent.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-5">
                    <span className="flex items-center gap-1.5 text-sm text-gray-600">
                      <Globe className="w-3 h-3" /> {agent.language}
                    </span>
                  </td>
                  <td className="py-3 px-5">
                    <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Active</span>
                  </td>
                  <td className="py-3 px-5">
                    {agent.isDemo && <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-600">Demo</span>}
                  </td>
                  <td className="py-3 px-5">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleEdit(agent)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50">
                        <Edit3 className="w-3 h-3" /> Edit
                      </button>
                      <button onClick={() => handleTryNow(agent)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:shadow-md shadow-sm shadow-indigo-200">
                        <Play className="w-3 h-3" /> Try Now
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="py-16 text-center bg-white rounded-2xl border border-gray-200/60 shadow-sm">
          <Bot className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No agents found</p>
          <p className="text-gray-400 text-sm mt-1">Try adjusting your filters or create a new agent</p>
          <button onClick={() => navigate('/voice/agent-builder')}
            className="mt-4 px-5 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800">
            <Plus className="w-4 h-4 inline mr-1" /> Create Agent
          </button>
        </div>
      )}

      {/* Close menus on outside click */}
      {menuOpen && <div className="fixed inset-0 z-0" onClick={() => setMenuOpen(null)} />}
    </div>
  );
}
