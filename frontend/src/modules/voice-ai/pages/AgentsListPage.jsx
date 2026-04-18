/**
 * Agents Page — Premium redesign
 * - Demo agents displayed as showcase cards with gradient accents
 * - My Agents section with action buttons
 * - Try Now navigates to /voice/testing with agent context
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Bot, Plus, LayoutGrid, List, Search, MoreVertical,
  Play, Edit3, Trash2, Copy, Globe, Sparkles,
  Clock, Star, TrendingUp, MessageSquare, Phone,
  ChevronRight, Zap, Mic, Users, Activity
} from 'lucide-react';
import { agentsAPI } from '../../../services/api';

/* ─── Demo/Template Agents ────────────────────────────────────── */

const DEMO_AGENTS = [
  { id: 'demo-1', name: 'Real Estate', subtitle: 'Gujarati + English', language: 'Gujarati + English', status: 'active', isDemo: true, conversations: 1240, icon: '🏠', category: 'Real Estate',
    gradient: 'from-orange-500 to-amber-400',
    config: { llmProvider: 'gemini', voice: 'leda', prompt: '## CRITICAL INSTRUCTION - DO NOT OUTPUT THINKING\nNEVER output your internal thoughts, reasoning, or meta-commentary. Only speak the actual dialogue directly.\n\n## GENDER & VOICE\nYou are a FEMALE speaker. Your voice is warm, professional, and friendly.\n\n## ROLE\nYou are a real estate lead qualifier for ++Sunrise Properties++, speaking in a Gujarati-English mix — the natural way educated Gujarati professionals talk. Your leads come from Facebook ads about residential projects.\n\n## LANGUAGE STYLE\nGujarati-English (Gujlish) style:\n- Mix in English terms for "apartment", "flat", "villa", "budget", "loan", "site visit", "EMI"\n- Keep Gujarati natural and conversational\n\n## STEPS\n1. Greet warmly, introduce yourself\n2. Confirm interest in the property\n3. Ask about budget and timeline\n4. Ask if they need a home loan\n\n## LEAD CLASSIFICATION\n- "Hot Lead": Ready to buy within 3 months\n- "Warm Lead": Planning within 6 months\n- "Cold": Just browsing', accent: 'indian_english' }
  },
  { id: 'demo-2', name: 'Sales Agent', subtitle: 'Assamese', language: 'Assamese', status: 'active', isDemo: true, conversations: 890, icon: '💼', category: 'Sales',
    gradient: 'from-blue-600 to-indigo-500',
    config: { llmProvider: 'groq', voice: 'meera', accent: 'default', prompt: '## CRITICAL INSTRUCTION - DO NOT OUTPUT THINKING\nNEVER output your internal thoughts, reasoning, or meta-commentary. Only speak the actual dialogue directly.\n\n## GENDER & VOICE\nYou are a FEMALE speaker. Your voice is warm, professional, and friendly.\n\n## ROLE\nYou are a B2B sales agent for **TechSolutions Assam**, speaking in **Assamese**.' }
  },
  { id: 'demo-3', name: 'Customer Support', subtitle: 'Odia', language: 'Odia', status: 'active', isDemo: true, conversations: 2100, icon: '🎧', category: 'Support',
    gradient: 'from-emerald-500 to-teal-400',
    config: { llmProvider: 'groq', voice: 'priya', accent: 'default', prompt: '## CRITICAL INSTRUCTION - DO NOT OUTPUT THINKING\nNEVER output your internal thoughts. Only speak the actual dialogue.\n\n## GENDER & VOICE\nYou are a FEMALE speaker. Calm, patient, and empathetic.\n\n## ROLE\nYou are a customer support agent for **Odisha Telecom**, speaking in **Odia**.' }
  },
  { id: 'demo-4', name: 'Real Estate', subtitle: 'Bengali', language: 'Bengali', status: 'active', isDemo: true, conversations: 560, icon: '🏠', category: 'Real Estate',
    gradient: 'from-pink-500 to-rose-400',
    config: { llmProvider: 'anthropic', voice: 'nova', accent: 'default', prompt: '## CRITICAL INSTRUCTION - DO NOT OUTPUT THINKING\nNEVER output your internal thoughts. Only speak the actual dialogue.\n\n## GENDER & VOICE\nYou are a FEMALE speaker. Warm and trustworthy.\n\n## ROLE\nYou are a real estate consultant for **Kolkata Dream Homes**, speaking in **Bengali-English mix**.' }
  },
  { id: 'demo-5', name: 'Sales Agent', subtitle: 'Kannada', language: 'Kannada', status: 'active', isDemo: true, conversations: 430, icon: '💼', category: 'Sales',
    gradient: 'from-violet-600 to-purple-500',
    config: { llmProvider: 'groq', voice: 'ananya', accent: 'indian_english', prompt: '## CRITICAL INSTRUCTION - DO NOT OUTPUT THINKING\nOnly speak the actual dialogue.\n\n## GENDER & VOICE\nYou are a FEMALE speaker. Professional and energetic.\n\n## ROLE\nYou are a sales agent for **Bangalore EduTech**, speaking in **Kannada-English mix**.' }
  },
  { id: 'demo-6', name: 'Customer Support', subtitle: 'Telugu', language: 'Telugu', status: 'active', isDemo: true, conversations: 1850, icon: '🎧', category: 'Support',
    gradient: 'from-cyan-500 to-sky-400',
    config: { llmProvider: 'groq', voice: 'priya', accent: 'default', prompt: '## CRITICAL INSTRUCTION - DO NOT OUTPUT THINKING\nOnly speak the actual dialogue.\n\n## GENDER & VOICE\nYou are a FEMALE speaker. Patient and helpful.\n\n## ROLE\nYou are a customer support agent for **Hyderabad FinServ**, speaking in **Telugu**.' }
  },
  { id: 'demo-7', name: 'Real Estate', subtitle: 'Tamil + English', language: 'Tamil + English', status: 'active', isDemo: true, conversations: 3200, icon: '🏠', category: 'Real Estate',
    gradient: 'from-red-500 to-orange-400',
    config: { llmProvider: 'groq', voice: 'priya', accent: 'indian_english', prompt: '## CRITICAL INSTRUCTION - DO NOT OUTPUT THINKING\nOnly speak the actual dialogue.\n\n## GENDER & VOICE\nYou are a FEMALE speaker. Warm and trustworthy.\n\n## ROLE\nYou are a real estate lead qualifier for **Chennai Prime Homes**, speaking in **Tamil-English mix (Tamlish)**.' }
  },
  { id: 'demo-8', name: 'Sales Agent', subtitle: 'Hindi + English', language: 'Hindi + English', status: 'active', isDemo: true, conversations: 5100, icon: '💼', category: 'Sales',
    gradient: 'from-yellow-500 to-orange-400',
    config: { llmProvider: 'groq', voice: 'meera', accent: 'indian_english', prompt: '## CRITICAL INSTRUCTION - DO NOT OUTPUT THINKING\nOnly speak the actual dialogue.\n\n## GENDER & VOICE\nYou are a FEMALE speaker. Confident and warm.\n\n## ROLE\nYou are a sales agent for **Digital India Solutions**, speaking in **Hinglish (Hindi + English mix)**.' }
  },
  { id: 'demo-9', name: 'Customer Support', subtitle: 'English', language: 'English', status: 'active', isDemo: true, conversations: 7800, icon: '🎧', category: 'Support',
    gradient: 'from-indigo-600 to-violet-500',
    config: { llmProvider: 'openai', voice: 'nova', accent: 'indian_english', prompt: '## CRITICAL INSTRUCTION - DO NOT OUTPUT THINKING\nNEVER output your internal thoughts. Only speak the actual dialogue.\n\n## GENDER & VOICE\nYou are a FEMALE speaker. Professional, calm, and empathetic.\n\n## ROLE\nYou are a customer support agent for **CloudServe India**, speaking in **Indian English**.' }
  },
];

const CATEGORY_COLORS = {
  'Real Estate': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  'Sales':       { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
  'Support':     { bg: 'bg-emerald-50',text: 'text-emerald-700',border: 'border-emerald-200' },
};

const fadeUp = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } } };
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };

/* ─── Demo Agent Card ────────────────────────────────────────── */
function DemoCard({ agent, onTry, onUse }) {
  const cat = CATEGORY_COLORS[agent.category] || CATEGORY_COLORS['Support'];
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -4, boxShadow: '0 20px 40px -8px rgba(0,0,0,0.12)' }}
      className="bg-white rounded-2xl border border-gray-200/70 overflow-hidden flex flex-col"
    >
      {/* Gradient header */}
      <div className={`bg-gradient-to-br ${agent.gradient} p-5 relative overflow-hidden`}>
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
        <div className="relative flex items-start justify-between">
          <div>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cat.bg} ${cat.text} ${cat.border} border mb-2`}>
              {agent.category}
            </span>
            <h3 className="text-white font-bold text-base leading-tight">{agent.name}</h3>
            <p className="text-white/80 text-xs mt-0.5">{agent.subtitle}</p>
          </div>
          <span className="text-3xl">{agent.icon}</span>
        </div>
        <div className="relative mt-3 flex items-center gap-3 text-white/75 text-xs">
          <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{agent.conversations.toLocaleString()} calls</span>
          <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{agent.language}</span>
        </div>
      </div>

      {/* Footer actions */}
      <div className="p-4 flex items-center gap-2 mt-auto">
        <button
          onClick={() => onTry(agent)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-90 shadow-sm shadow-indigo-200 transition-all"
        >
          <Play className="w-3.5 h-3.5" /> Try Now
        </button>
        <button
          onClick={() => onUse(agent)}
          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all"
        >
          <Copy className="w-3.5 h-3.5" /> Use
        </button>
      </div>
    </motion.div>
  );
}

/* ─── My Agent Card ──────────────────────────────────────────── */
function MyAgentCard({ agent, onEdit, onDelete, onTry, menuOpen, setMenuOpen }) {
  return (
    <motion.div
      variants={fadeUp}
      className="bg-white rounded-2xl border border-gray-200/70 p-5 hover:shadow-md hover:border-indigo-200/60 transition-all"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center text-lg flex-shrink-0">
            {agent.icon || '🤖'}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{agent.name}</h3>
            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><Globe className="w-3 h-3" />{agent.language}</p>
          </div>
        </div>
        <div className="relative">
          <button onClick={() => setMenuOpen(menuOpen === agent.id ? null : agent.id)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <MoreVertical className="w-4 h-4 text-gray-400" />
          </button>
          {menuOpen === agent.id && (
            <div className="absolute right-0 top-9 w-36 bg-white rounded-xl border border-gray-200 shadow-lg z-20 py-1">
              <button onClick={() => { onEdit(agent); setMenuOpen(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                <Edit3 className="w-3.5 h-3.5" /> Edit
              </button>
              <button onClick={() => { onDelete(agent.id); setMenuOpen(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-4">
        <button onClick={() => onEdit(agent)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all">
          <Edit3 className="w-3.5 h-3.5" /> Edit
        </button>
        <button onClick={() => onTry(agent)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-90 shadow-sm shadow-indigo-200 transition-all">
          <Play className="w-3.5 h-3.5" /> Try
        </button>
      </div>
    </motion.div>
  );
}

/* ─── Main Component ──────────────────────────────────────────── */

export default function AgentsListPage() {
  const navigate = useNavigate();
  const [customAgents, setCustomAgents] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [menuOpen, setMenuOpen] = useState(null);

  useEffect(() => {
    agentsAPI.list()
      .then(({ data }) => {
        const dbAgents = (data?.agents || []).map(a => ({
          id: a.id, name: a.name, language: a.language || 'English',
          status: a.status || 'active', isDemo: false,
          conversations: a.conversations || 0, icon: a.icon || '🤖',
          config: a.config || {},
        }));
        if (dbAgents.length > 0) setCustomAgents(dbAgents);
      })
      .catch(() => {
        try {
          const saved = localStorage.getItem('vf_custom_agents');
          if (saved) setCustomAgents(JSON.parse(saved));
        } catch {}
      });
  }, []);

  const filteredDemo = useMemo(() => {
    return DEMO_AGENTS.filter(a => {
      if (categoryFilter !== 'all' && a.category !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return a.name.toLowerCase().includes(q) || a.language.toLowerCase().includes(q) || a.subtitle.toLowerCase().includes(q);
      }
      return true;
    });
  }, [search, categoryFilter]);

  const handleTryNow = (agent) => {
    localStorage.setItem('vf_test_agent', JSON.stringify(agent));
    navigate('/voice/testing');
    toast.success(`Loading "${agent.name}" in test console…`);
  };

  const handleUseTemplate = async (agent) => {
    const copy = {
      ...agent,
      id: `agent-${Date.now()}`,
      name: `${agent.name} (${agent.subtitle})`,
      isDemo: false,
      status: 'draft',
    };
    // Save to API immediately so the agent exists in DB before AgentBuilder loads
    try {
      const { data } = await agentsAPI.create(copy);
      const saved = data?.id ? data : copy;
      setCustomAgents(prev => [saved, ...prev]);
      localStorage.setItem('vf_editing_agent', JSON.stringify(saved));
      navigate(`/voice/agent-builder/${saved.id}`);
      toast.success('Template copied — customize it now!');
    } catch {
      // Fallback: navigate anyway, AgentBuilder will save on first submit
      setCustomAgents(prev => [copy, ...prev]);
      localStorage.setItem('vf_editing_agent', JSON.stringify(copy));
      navigate(`/voice/agent-builder/${copy.id}`);
      toast.success('Template copied — customize it now!');
    }
  };

  const handleEdit = (agent) => {
    localStorage.setItem('vf_editing_agent', JSON.stringify(agent));
    navigate(`/voice/agent-builder/${agent.id}`);
  };

  const handleDelete = async (id) => {
    setCustomAgents(prev => prev.filter(a => a.id !== id));
    try {
      if (!String(id).startsWith('demo-') && !String(id).startsWith('custom-')) await agentsAPI.delete(id);
      toast.success('Agent deleted');
    } catch {
      toast.error('Delete failed');
    }
  };

  return (
    <div className="space-y-8" onClick={() => menuOpen && setMenuOpen(null)}>

      {/* ─── Page Header ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Voice Agents</h1>
          <p className="text-sm text-gray-500 mt-0.5">Build, test, and deploy AI voice agents in any Indian language</p>
        </div>
        <button
          onClick={() => navigate('/voice/agent-builder')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold shadow-md shadow-indigo-200 hover:opacity-90 transition-all"
        >
          <Plus className="w-4 h-4" /> New Agent
        </button>
      </div>

      {/* ─── Stats bar ─── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Agents', value: DEMO_AGENTS.length + customAgents.length, icon: Bot, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Demo Templates', value: DEMO_AGENTS.length, icon: Sparkles, color: 'text-violet-600', bg: 'bg-violet-50' },
          { label: 'My Agents', value: customAgents.length, icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-200/60 p-4 flex items-center gap-4">
            <div className={`p-2.5 rounded-xl ${s.bg}`}><s.icon className={`w-5 h-5 ${s.color}`} /></div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ─── My Agents section ─── */}
      {customAgents.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-600" /> My Agents
          </h2>
          <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {customAgents.map(agent => (
              <MyAgentCard key={agent.id} agent={agent} onEdit={handleEdit} onDelete={handleDelete} onTry={handleTryNow} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
            ))}
          </motion.div>
        </div>
      )}

      {/* ─── Demo Agents showcase ─── */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-600" /> Demo Agents
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Ready-to-use templates — try live or copy to customize</p>
          </div>
          {/* Filters */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-indigo-300 w-40"
              />
            </div>
            {['all', 'Real Estate', 'Sales', 'Support'].map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                  categoryFilter === cat
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {cat === 'all' ? 'All' : cat}
              </button>
            ))}
          </div>
        </div>

        <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredDemo.map(agent => (
            <DemoCard key={agent.id} agent={agent} onTry={handleTryNow} onUse={handleUseTemplate} />
          ))}
        </motion.div>

        {filteredDemo.length === 0 && (
          <div className="py-16 text-center bg-white rounded-2xl border border-gray-200/60">
            <Bot className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No agents match your filter</p>
          </div>
        )}
      </div>

      {menuOpen && <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />}
    </div>
  );
}
