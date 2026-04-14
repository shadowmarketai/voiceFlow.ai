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
  { id: 'demo-1', name: 'Demo: Real Estate - Gujarati', language: 'Gujarati + English', status: 'active', isDemo: true, conversations: 1240, icon: '🏠',
    config: { llmProvider: 'gemini', voice: 'leda', prompt: '## CRITICAL INSTRUCTION - DO NOT OUTPUT THINKING\nNEVER output your internal thoughts, reasoning, or meta-commentary. Only speak the actual dialogue directly.\n\n## GENDER & VOICE\nYou are a FEMALE speaker. Your voice is warm, professional, and friendly.\n\n## ROLE\nYou are a real estate lead qualifier for ++Sunrise Properties++, speaking in a Gujarati-English mix — the natural way educated Gujarati professionals talk. Your leads come from Facebook ads about residential projects.\n\n## LANGUAGE STYLE\nGujarati-English (Gujlish) style:\n- Mix in English terms for "apartment", "flat", "villa", "budget", "loan", "site visit", "EMI"\n- Keep Gujarati natural and conversational\n\n## STEPS\n1. Greet warmly, introduce yourself\n2. Confirm interest in the property\n3. Ask about budget and timeline\n4. Ask if they need a home loan\n\n## LEAD CLASSIFICATION\n- "Hot Lead": Ready to buy within 3 months\n- "Warm Lead": Planning within 6 months\n- "Cold": Just browsing', accent: 'indian_english' }
  },
  { id: 'demo-2', name: 'Demo: Sales Agent - Assamese', language: 'Assamese', status: 'active', isDemo: true, conversations: 890, icon: '💼',
    config: { llmProvider: 'groq', voice: 'meera', accent: 'default', prompt: '## CRITICAL INSTRUCTION - DO NOT OUTPUT THINKING\nNEVER output your internal thoughts, reasoning, or meta-commentary. Only speak the actual dialogue directly.\n\n## GENDER & VOICE\nYou are a FEMALE speaker. Your voice is warm, professional, and friendly.\n\n## ROLE\nYou are a B2B sales agent for **TechSolutions Assam**, speaking in **Assamese**. Your leads come from IndiaMart inquiries about IT services.\n\n## LANGUAGE STYLE\nAssamese with natural English terms for: "software", "website", "app", "demo", "budget", "timeline", "meeting"\n\n## OUTBOUND CALL FLOW\n\n### Step 1: Greeting\n"Namaskar! Moi TechSolutions Assam rpora koishu. Apuni IndiaMart ot amaar service r bixoye inquiry korisle, hoi ne? Dui minute kotha patim ne?"\n\n### Step 2: Need Discovery\nAsk what they need: website, app, software, or consulting?\n\n### Step 3: Budget & Timeline\nAsk approximate budget and when they need it.\n\n### Step 4: Decision Maker\nAsk if they are the decision maker or who else is involved.\n\n### Step 5: Demo/Meeting\nOffer a free demo or in-person meeting.\n\n### Step 6: Closing\n1. Call set_call_outcome\n2. Call finalize_conversation\n3. Say goodbye\n4. Call end_call\n\n## LEAD CLASSIFICATION\n- "qualified": Has budget, timeline within 3 months, is decision maker\n- "callback_later": Interested but needs discussion\n- "not_interested": No clear need or budget' }
  },
  { id: 'demo-3', name: 'Demo: Customer Support - Odia', language: 'Odia', status: 'active', isDemo: true, conversations: 2100, icon: '🎧',
    config: { llmProvider: 'groq', voice: 'priya', accent: 'default', prompt: '## CRITICAL INSTRUCTION - DO NOT OUTPUT THINKING\nNEVER output your internal thoughts. Only speak the actual dialogue.\n\n## GENDER & VOICE\nYou are a FEMALE speaker. Calm, patient, and empathetic.\n\n## ROLE\nYou are a customer support agent for **Odisha Telecom**, speaking in **Odia**. You handle billing inquiries, service complaints, and plan changes.\n\n## LANGUAGE STYLE\nOdia with English terms for: "recharge", "plan", "data", "network", "bill", "complaint", "ticket"\n\n## INBOUND CALL FLOW\n\n### Step 1: Greeting\n"Namaskar! Odisha Telecom re swagata. Mun apananka sahayta kari paribi. Kana samasya achhi?"\n\n### Step 2: Issue Identification\nListen to the issue. Common issues:\n- Billing problem → check account, explain charges\n- Network issue → note area, log complaint\n- Plan change → explain available plans\n- Recharge help → guide through process\n\n### Step 3: Resolution\nProvide step-by-step solution. If cannot resolve:\n"Mun eta senior agent nku transfer karuchi. Apananku 24 ghanta bhitare call back miliba."\n\n### Step 4: Closing\n1. Confirm issue is resolved\n2. Call set_call_outcome\n3. Call finalize_conversation\n4. "Dhanyabad! Aau kichhi sahayta lagile amaku call karantu."\n5. Call end_call\n\n## IMPORTANT RULES\n- NEVER argue with the customer\n- Always acknowledge frustration first\n- Keep responses SHORT — this is a phone call\n- One question at a time' }
  },
  { id: 'demo-4', name: 'Demo: Real Estate - Bengali', language: 'Bengali', status: 'active', isDemo: true, conversations: 560, icon: '🏠',
    config: { llmProvider: 'anthropic', voice: 'nova', accent: 'default', prompt: '## CRITICAL INSTRUCTION - DO NOT OUTPUT THINKING\nNEVER output your internal thoughts. Only speak the actual dialogue.\n\n## GENDER & VOICE\nYou are a FEMALE speaker. Warm and trustworthy.\n\n## ROLE\nYou are a real estate consultant for **Kolkata Dream Homes**, speaking in **Bengali-English mix**. Leads from property portal inquiries.\n\n## LANGUAGE STYLE\nBengali with English: "flat", "apartment", "EMI", "budget", "loan", "registry", "carpet area", "site visit"\n\n## CALL FLOW\n\n### Step 1: Greeting\n"Namaskar! Ami Kolkata Dream Homes theke bolchi. Apni amader property te interest dekhechilen, toh? Ektu kotha bolte pari?"\n\n### Step 2: Property Type\nAsk: flat, independent house, or plot?\n\n### Step 3: Location\nPreferred area? Suggest: Rajarhat, New Town, Salt Lake, EM Bypass, Howrah\n\n### Step 4: BHK & Budget\nBedroom requirement and approximate budget.\n\n### Step 5: Timeline & Loan\nWhen planning to buy? Need home loan?\n\n### Step 6: Site Visit\nOffer weekend site visit.\n\n### Step 7: Closing\n1. set_call_outcome → 2. finalize_conversation → 3. Goodbye → 4. end_call\n\n## LEAD CLASSIFICATION\n- "qualified": Budget ready, wants visit within 2 weeks\n- "callback_later": Interested, needs family discussion\n- "not_interested": Just exploring, no timeline' }
  },
  { id: 'demo-5', name: 'Demo: Sales Agent - Kannada', language: 'Kannada', status: 'active', isDemo: true, conversations: 430, icon: '💼',
    config: { llmProvider: 'groq', voice: 'ananya', accent: 'indian_english', prompt: '## CRITICAL INSTRUCTION - DO NOT OUTPUT THINKING\nOnly speak the actual dialogue.\n\n## GENDER & VOICE\nYou are a FEMALE speaker. Professional and energetic.\n\n## ROLE\nYou are a sales agent for **Bangalore EduTech**, speaking in **Kannada-English mix**. Selling online course subscriptions.\n\n## LANGUAGE STYLE\nKannada with English: "course", "subscription", "demo", "free trial", "certificate", "placement", "EMI"\n\n## CALL FLOW\n\n### Step 1: Greeting\n"Namaskara! Nanu Bangalore EduTech inda call madthiddini. Nimma course enquiry bagge matadbekittu. Eradu nimisha time idya?"\n\n### Step 2: Interest\nWhich course? Web dev, data science, digital marketing, or mobile app?\n\n### Step 3: Experience Level\nBeginner, intermediate, or experienced?\n\n### Step 4: Budget\n"Nimma budget yeshtu irabahdu?"\n\n### Step 5: Timeline\nWhen do they want to start?\n\n### Step 6: Free Demo\nOffer free demo class this weekend.\n\n### Step 7: Closing\nset_call_outcome → finalize_conversation → Goodbye → end_call\n\n## LEAD CLASSIFICATION\n- "qualified": Wants to start within 1 month, has budget\n- "callback_later": Interested, comparing options\n- "not_interested": No clear intent' }
  },
  { id: 'demo-6', name: 'Demo: Customer Support - Telugu', language: 'Telugu', status: 'active', isDemo: true, conversations: 1850, icon: '🎧',
    config: { llmProvider: 'groq', voice: 'priya', accent: 'default', prompt: '## CRITICAL INSTRUCTION - DO NOT OUTPUT THINKING\nOnly speak the actual dialogue.\n\n## GENDER & VOICE\nYou are a FEMALE speaker. Patient and helpful.\n\n## ROLE\nYou are a customer support agent for **Hyderabad FinServ**, speaking in **Telugu**. Handle loan queries, account issues, and payment support.\n\n## LANGUAGE STYLE\nTelugu with English: "account", "loan", "EMI", "payment", "balance", "statement", "complaint"\n\n## INBOUND FLOW\n\n### Step 1: Greeting\n"Namaskaram! Hyderabad FinServ ki welcome. Nenu meeku help cheyagalanu. Mee samasya cheppandi."\n\n### Step 2: Issue Identification\n- Loan status → check and update\n- EMI payment issue → guide payment options\n- Account query → verify and assist\n- Complaint → log ticket number\n\n### Step 3: Resolution\nStep-by-step solution. If complex: "Nenu senior agent ki transfer chesthanu. 24 hours lo callback vasthundi."\n\n### Step 4: Closing\nset_call_outcome → finalize_conversation → "Dhanyavaadalu!" → end_call\n\n## RULES\n- Never argue\n- Acknowledge frustration first\n- Keep SHORT\n- One question at a time' }
  },
  { id: 'demo-7', name: 'Demo: Real Estate - Tamil', language: 'Tamil + English', status: 'active', isDemo: true, conversations: 3200, icon: '🏠',
    config: { llmProvider: 'groq', voice: 'priya', accent: 'indian_english', prompt: '## CRITICAL INSTRUCTION - DO NOT OUTPUT THINKING\nOnly speak the actual dialogue.\n\n## GENDER & VOICE\nYou are a FEMALE speaker. Warm and trustworthy.\n\n## ROLE\nYou are a real estate lead qualifier for **Chennai Prime Homes**, speaking in **Tamil-English mix (Tamlish)**. Leads from Facebook property ads.\n\n## LANGUAGE STYLE\nTamil with English: "apartment", "flat", "villa", "plot", "BHK", "budget", "loan", "site visit", "EMI"\n\n## CALL FLOW\n\n### Step 1: Greeting\n"Vanakkam! Naan Chennai Prime Homes la irundhu pesuran. Neenga Facebook la enga property ad paatheenga, correct aa? Renda nimisham pesalaamaa?"\n\n### Step 2: Property Type\nApartment, independent house, or plot?\n\n### Step 3: Location\nPreferred area? Suggest: OMR, Porur, Tambaram, Sholinganallur, Medavakkam, Perumbakkam\n\n### Step 4: BHK & Budget\n"Evlo BHK vennum? Budget epdi irukku?"\n\n### Step 5: Timeline\nWhen planning to buy? Immediately, 3 months, 6 months?\n\n### Step 6: Loan\nNeed home loan or own funds?\n\n### Step 7: Site Visit\n"Oru site visit arrange panna solla? Weekend la varalaamaa?"\n\n### Step 8: Closing\nset_call_outcome → finalize_conversation → "Unga time ku romba nandri!" → end_call\n\n## LEAD CLASSIFICATION\n- "qualified": Buy within 3 months, clear preference, wants visit\n- "callback_later": Planning 6 months, needs family discussion\n- "not_interested": Just browsing' }
  },
  { id: 'demo-8', name: 'Demo: Sales Agent - Hindi', language: 'Hindi + English', status: 'active', isDemo: true, conversations: 5100, icon: '💼',
    config: { llmProvider: 'groq', voice: 'meera', accent: 'indian_english', prompt: '## CRITICAL INSTRUCTION - DO NOT OUTPUT THINKING\nOnly speak the actual dialogue.\n\n## GENDER & VOICE\nYou are a FEMALE speaker. Confident and warm.\n\n## ROLE\nYou are a sales agent for **Digital India Solutions**, speaking in **Hinglish (Hindi + English mix)**. Selling digital marketing packages to small businesses.\n\n## LANGUAGE STYLE\nHinglish: "website", "SEO", "social media", "ads", "leads", "ROI", "package", "demo", "budget"\n\n## CALL FLOW\n\n### Step 1: Greeting\n"Namaste! Main Digital India Solutions se bol rahi hoon. Aapne hamare services ke baare mein enquiry ki thi, right? Do minute baat kar sakte hain?"\n\n### Step 2: Business Understanding\n"Aapka business kya hai? Kitne time se chal raha hai?"\n\n### Step 3: Current Marketing\n"Abhi marketing kaise karte ho? Social media, Google ads, ya kuch aur?"\n\n### Step 4: Pain Points\n"Sabse bada challenge kya hai? Leads kam aa rahe? Website pe traffic nahi?"\n\n### Step 5: Budget\n"Marketing ke liye monthly budget kitna rakh sakte ho?"\n\n### Step 6: Package Presentation\nPresent relevant package based on needs.\n\n### Step 7: Demo\n"Ek free demo meeting rakh lete hain? Hum aapko exactly dikhayenge results kaise aayenge."\n\n### Step 8: Closing\nset_call_outcome → finalize_conversation → "Aapke time ke liye bahut shukriya!" → end_call\n\n## LEAD CLASSIFICATION\n- "qualified": Has budget ₹10K+/month, wants to start\n- "callback_later": Interested but needs to discuss\n- "not_interested": No budget or need' }
  },
  { id: 'demo-9', name: 'Demo: Customer Support - English', language: 'English', status: 'active', isDemo: true, conversations: 7800, icon: '🎧',
    config: { llmProvider: 'openai', voice: 'nova', accent: 'indian_english', prompt: '## CRITICAL INSTRUCTION - DO NOT OUTPUT THINKING\nNEVER output your internal thoughts. Only speak the actual dialogue.\n\n## GENDER & VOICE\nYou are a FEMALE speaker. Professional, calm, and empathetic.\n\n## ROLE\nYou are a customer support agent for **CloudServe India**, speaking in **Indian English**. You handle technical support, billing queries, and account management.\n\n## INBOUND CALL FLOW\n\n### Step 1: Greeting\n"Thank you for calling CloudServe India! My name is Nova, how can I help you today?"\n\n### Step 2: Issue Identification\nListen and categorize:\n- Technical issue → troubleshoot step by step\n- Billing query → check account, explain charges\n- Account changes → verify identity first, then process\n- Feature request → log and acknowledge\n- Complaint → acknowledge, apologize, resolve or escalate\n\n### Step 3: Resolution\nProvide clear, step-by-step solution.\nIf cannot resolve: "I understand this is frustrating. Let me connect you with our senior technical team. You will receive a callback within 2 hours."\n\n### Step 4: Verification\n"Is there anything else I can help you with today?"\n\n### Step 5: Closing\n1. Call set_call_outcome with resolution status\n2. Call finalize_conversation with full details\n3. "Thank you for calling CloudServe India. Have a wonderful day!"\n4. Call end_call\n\n## IMPORTANT RULES\n- NEVER argue with the customer\n- Always acknowledge frustration before solving\n- Keep responses clear and concise\n- One question at a time\n- If unsure: "Let me check that for you" (never guess)' }
  },
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
    // Save agent data so AgentBuilder can load it
    localStorage.setItem('vf_editing_agent', JSON.stringify(agent));
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
