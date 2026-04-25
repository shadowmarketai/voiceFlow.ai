import React, { useState, useMemo, useEffect } from 'react';
import {
 Search, Download, Calendar, List, Clock, Phone, PhoneIncoming, PhoneOutgoing,
 CheckCircle2, AlertTriangle, XCircle, Info, ChevronLeft, ChevronRight,
 ArrowUpDown, ArrowUp, ArrowDown, Filter, FileText, X, Printer
} from 'lucide-react';
import toast from 'react-hot-toast';
import { voiceAgentAPI, agentsAPI } from '../../services/api';
import Timeline from './components/Timeline';
import CallDetailPanel from './components/CallDetailPanel';
import ResizablePanel from './components/ResizablePanel';
import DialectBadge from './components/DialectBadge';
import EmotionIndicator from './components/EmotionIndicator';
import GenZBadge from './components/GenZBadge';

// ── Transcript parser ────────────────────────────────────────────────────────
// Backend stores transcript as a plain string: "User: ...\nAgent: ..."
// Convert to the { speaker, text } array expected by the UI.
function parseTranscript(raw) {
 if (!raw) return [];
 if (Array.isArray(raw)) return raw; // already structured
 return raw
   .split('\n')
   .filter(line => line.trim())
   .map(line => {
     if (/^[Uu]ser:\s/.test(line))  return { speaker: 'customer', text: line.replace(/^[Uu]ser:\s*/, '') };
     if (/^[Aa]gent:\s/.test(line)) return { speaker: 'agent',    text: line.replace(/^[Aa]gent:\s*/, '') };
     return { speaker: 'agent', text: line };
   });
}

// ── Mock Data ────────────────────────────────────────────────────────────────
const mockCalls = [
 {
 id: 'call-001', name: 'Priya Shanmugam', phone: '+91 98765 43210', duration: '4:32',
 agent: 'VoiceBot Alpha', outcome: 'Meeting Booked', sentiment: 'positive',
 time: '10:15 AM', date: '2026-02-23', direction: 'outbound',
 dialect: 'Kongu', dialectConfidence: 0.92, dialectPatterns: ['Shortened vowels','Retroflex emphasis'],
 language: 'Tamil', emotion: 'happy', emotionConfidence: 0.88, emotionTrend: ['neutral','happy','excited'],
 genZScore: 0.3, genZTerms: ['vibe check'], codeMixLanguages: 'Tamil-English', codeMixRatio: 0.35,
 transcript: [
 { speaker: 'agent', text: 'Vanakkam! This is VoiceBot Alpha from ShadowMarket. How are you today? ', time: '0:00', emotion: 'neutral' },
 { speaker: 'customer', text: 'Hi, I was expecting your call. I saw the demo last week.', time: '0:08', emotion: 'happy' },
 { speaker: 'agent', text: 'Wonderful! Shall we schedule a detailed walkthrough this week? ', time: '0:22', emotion: 'happy' },
 { speaker: 'customer', text: 'Sure, Thursday afternoon works. The vibe check was great last time.', time: '0:35', emotion: 'excited' },
 ],
 },
 {
 id: 'call-002', name: 'Karthik Rajan', phone: '+91 87654 32109', duration: '2:18',
 agent: 'VoiceBot Beta', outcome: 'Query Resolved', sentiment: 'neutral',
 time: '11:02 AM', date: '2026-02-23', direction: 'inbound',
 dialect: 'Chennai', dialectConfidence: 0.87, dialectPatterns: ['English loanwords','Fast cadence'],
 language: 'Tamil', emotion: 'neutral', emotionConfidence: 0.72, emotionTrend: ['confused','neutral'],
 genZScore: 0.0, genZTerms: [], codeMixLanguages: 'Tamil-English', codeMixRatio: 0.55,
 transcript: [
 { speaker: 'customer', text: 'I need to understand the pricing for the enterprise plan.', time: '0:00', emotion: 'confused' },
 { speaker: 'agent', text: 'Of course! Let me walk you through the tiers.', time: '0:07', emotion: 'neutral' },
 ],
 },
 {
 id: 'call-003', name: 'Meena Devi', phone: '+91 76543 21098', duration: '6:45',
 agent: 'VoiceBot Alpha', outcome: 'Callback Scheduled', sentiment: 'positive',
 time: '11:30 AM', date: '2026-02-23', direction: 'outbound',
 dialect: 'Madurai', dialectConfidence: 0.95, dialectPatterns: ['Elongated vowels','Classical Tamil words'],
 language: 'Tamil', emotion: 'happy', emotionConfidence: 0.81, emotionTrend: ['neutral','happy'],
 genZScore: 0.0, genZTerms: [], codeMixLanguages: '', codeMixRatio: 0.05,
 transcript: [
 { speaker: 'agent', text: 'Vanakkam Meena! I am calling from ShadowMarket regarding your interest.', time: '0:00', emotion: 'neutral' },
 { speaker: 'customer', text: 'Aama, I filled the form. But I am busy now. Can you call tomorrow morning? ', time: '0:12', emotion: 'neutral' },
 { speaker: 'agent', text: 'Absolutely! I will schedule a callback for tomorrow at 10 AM. Thank you!', time: '0:24', emotion: 'happy' },
 ],
 },
 {
 id: 'call-004', name: 'Vikram Sundaram', phone: '+91 65432 10987', duration: '1:05',
 agent: 'VoiceBot Gamma', outcome: 'No Answer', sentiment: 'neutral',
 time: '12:00 PM', date: '2026-02-23', direction: 'outbound',
 dialect: 'Chennai', dialectConfidence: 0.60, dialectPatterns: [],
 language: 'English', emotion: 'neutral', emotionConfidence: 0.50, emotionTrend: ['neutral'],
 genZScore: 0.0, genZTerms: [], codeMixLanguages: '', codeMixRatio: 0.0,
 transcript: [],
 },
 {
 id: 'call-005', name: 'Ananya Krishnan', phone: '+91 54321 09876', duration: '3:50',
 agent: 'VoiceBot Beta', outcome: 'Meeting Booked', sentiment: 'positive',
 time: '1:15 PM', date: '2026-02-23', direction: 'inbound',
 dialect: 'Tirunelveli', dialectConfidence: 0.89, dialectPatterns: ['Nasal tones','Archaic expressions'],
 language: 'Tamil', emotion: 'excited', emotionConfidence: 0.91, emotionTrend: ['happy','excited'],
 genZScore: 0.8, genZTerms: ['slay','no cap','bussin'], codeMixLanguages: 'Tamil-English', codeMixRatio: 0.45,
 transcript: [
 { speaker: 'customer', text: 'Hey! I saw your reel. The AI voice thing is slay no cap!', time: '0:00', emotion: 'excited' },
 { speaker: 'agent', text: 'Thank you so much! Would you like to see a live demo? ', time: '0:09', emotion: 'happy' },
 { speaker: 'customer', text: 'Absolutely, this is bussin. Let us set a time!', time: '0:18', emotion: 'excited' },
 ],
 },
 {
 id: 'call-006', name: 'Ravi Kumar', phone: '+91 43210 98765', duration: '5:12',
 agent: 'VoiceBot Alpha', outcome: 'Escalated', sentiment: 'negative',
 time: '2:00 PM', date: '2026-02-22', direction: 'inbound',
 dialect: 'Kongu', dialectConfidence: 0.78, dialectPatterns: ['Shortened vowels'],
 language: 'Tamil', emotion: 'angry', emotionConfidence: 0.85, emotionTrend: ['neutral','confused','angry'],
 genZScore: 0.1, genZTerms: ['bruh'], codeMixLanguages: 'Tamil-English', codeMixRatio: 0.40,
 transcript: [
 { speaker: 'customer', text: 'Bruh, I have been waiting for a week for the setup!', time: '0:00', emotion: 'angry' },
 { speaker: 'agent', text: 'I sincerely apologize. Let me connect you with our senior support team.', time: '0:10', emotion: 'neutral' },
 ],
 },
 {
 id: 'call-007', name: 'Lakshmi Narayanan', phone: '+91 32109 87654', duration: '3:20',
 agent: 'VoiceBot Gamma', outcome: 'Query Resolved', sentiment: 'positive',
 time: '3:30 PM', date: '2026-02-22', direction: 'outbound',
 dialect: 'Madurai', dialectConfidence: 0.90, dialectPatterns: ['Elongated vowels','Classical Tamil words'],
 language: 'Tamil', emotion: 'happy', emotionConfidence: 0.76, emotionTrend: ['confused','happy'],
 genZScore: 0.0, genZTerms: [], codeMixLanguages: '', codeMixRatio: 0.10,
 transcript: [
 { speaker: 'agent', text: 'Vanakkam! I am following up on your support ticket about billing.', time: '0:00', emotion: 'neutral' },
 { speaker: 'customer', text: 'Oh yes, the invoice was confusing. Can you explain the breakdown? ', time: '0:10', emotion: 'confused' },
 { speaker: 'agent', text: 'Certainly! The monthly plan includes these components...', time: '0:20', emotion: 'neutral' },
 { speaker: 'customer', text: 'Ah that makes sense now. Thank you very much!', time: '1:55', emotion: 'happy' },
 ],
 },
 {
 id: 'call-008', name: 'Deepa Venkatesh', phone: '+91 21098 76543', duration: '7:15',
 agent: 'VoiceBot Beta', outcome: 'Meeting Booked', sentiment: 'positive',
 time: '4:00 PM', date: '2026-02-22', direction: 'outbound',
 dialect: 'Tirunelveli', dialectConfidence: 0.82, dialectPatterns: ['Nasal tones'],
 language: 'Tamil', emotion: 'happy', emotionConfidence: 0.79, emotionTrend: ['neutral','happy','excited'],
 genZScore: 0.5, genZTerms: ['lowkey','bet'], codeMixLanguages: 'Tamil-English', codeMixRatio: 0.30,
 transcript: [
 { speaker: 'agent', text: 'Vanakkam Deepa! I am reaching out about our new marketing suite.', time: '0:00', emotion: 'neutral' },
 { speaker: 'customer', text: 'Lowkey interested. What does it do exactly? ', time: '0:10', emotion: 'neutral' },
 { speaker: 'agent', text: 'Great question! It automates campaign flows, A/B testing, and analytics.', time: '0:19', emotion: 'happy' },
 { speaker: 'customer', text: 'Bet. Let us book a time to discuss more.', time: '3:40', emotion: 'excited' },
 ],
 },
 {
 id: 'call-009', name: 'Suresh Babu', phone: '+91 10987 65432', duration: '0:45',
 agent: 'VoiceBot Gamma', outcome: 'No Answer', sentiment: 'neutral',
 time: '5:00 PM', date: '2026-02-21', direction: 'outbound',
 dialect: 'Chennai', dialectConfidence: 0.55, dialectPatterns: [],
 language: 'Hindi', emotion: 'neutral', emotionConfidence: 0.50, emotionTrend: ['neutral'],
 genZScore: 0.0, genZTerms: [], codeMixLanguages: '', codeMixRatio: 0.0,
 transcript: [],
 },
 {
 id: 'call-010', name: 'Divya Prakash', phone: '+91 09876 54321', duration: '4:55',
 agent: 'VoiceBot Alpha', outcome: 'Callback Scheduled', sentiment: 'positive',
 time: '5:45 PM', date: '2026-02-21', direction: 'inbound',
 dialect: 'Kongu', dialectConfidence: 0.88, dialectPatterns: ['Retroflex emphasis','Shortened vowels'],
 language: 'Tamil', emotion: 'confused', emotionConfidence: 0.68, emotionTrend: ['confused','neutral'],
 genZScore: 0.6, genZTerms: ['sus','fr fr'], codeMixLanguages: 'Tamil-English', codeMixRatio: 0.50,
 transcript: [
 { speaker: 'customer', text: 'Hi, your website is kinda sus. Is this legit? Fr fr.', time: '0:00', emotion: 'confused' },
 { speaker: 'agent', text: 'Absolutely! We are a verified company. Let me schedule a call with our team lead to walk you through everything.', time: '0:12', emotion: 'neutral' },
 { speaker: 'customer', text: 'Okay, I guess that works. Schedule it.', time: '0:28', emotion: 'neutral' },
 ],
 },
];

// ── Outcome helpers ──────────────────────────────────────────────────────────
const outcomeConfig = {
'Meeting Booked': { icon: CheckCircle2, type: 'success', badge: 'bg-emerald-100 text-emerald-700' },
'Query Resolved': { icon: Info, type: 'info', badge: 'bg-blue-100 text-blue-700' },
'Callback Scheduled': { icon: Clock, type: 'warning', badge: 'bg-amber-100 text-amber-700' },
'Escalated': { icon: AlertTriangle, type: 'error', badge: 'bg-red-100 text-red-700' },
'No Answer': { icon: XCircle, type: 'default', badge: 'bg-slate-100 text-slate-600' },
};

const dateFilterOptions = [
 { label: 'Today', value: 'today' },
 { label: 'Yesterday', value: 'yesterday' },
 { label: 'Last 7 days', value: '7d' },
 { label: 'Last 30 days', value: '30d' },
 { label: 'All time', value: 'all' },
];

const ITEMS_PER_PAGE = 10;

export default function CallLogsPage() {
 const [viewMode, setViewMode] = useState('timeline'); //'timeline' |'table'
 const [search, setSearch] = useState('');
 const [dateFilter, setDateFilter] = useState('all');
 const [agentFilter, setAgentFilter] = useState('all');
 const [agents, setAgents] = useState([]);
 const [selectedCall, setSelectedCall] = useState(null);
 const [sortField, setSortField] = useState(null);
 const [sortDir, setSortDir] = useState('asc');
 const [currentPage, setCurrentPage] = useState(1);
 const [apiCalls, setApiCalls] = useState([]);
 const [transcriptModal, setTranscriptModal] = useState(null);

 // Load agents list
 useEffect(() => {
 agentsAPI.list()
   .then(({ data }) => {
     const list = data?.agents || data || [];
     setAgents(Array.isArray(list) ? list : []);
   })
   .catch(() => {});
 }, []);

 // Load call logs — use agent filter when set
 useEffect(() => {
 let cancelled = false;

 const loadCalls = async () => {
   // Try call-logs endpoint first (supports agent_id filter)
   try {
     const params = { limit: 200 };
     if (agentFilter !== 'all') params.agent_id = agentFilter;
     const { data } = await agentsAPI.callLogs(params);
     const logs = data?.logs || data || [];
     if (!cancelled && Array.isArray(logs) && logs.length > 0) {
       const agentMap = {};
       agents.forEach(a => { agentMap[a.id] = a.name; agentMap[String(a.id)] = a.name; });

       const mapped = logs.map(r => ({
         id: `log-${r.id}`,
         name: r.from || r.caller_number || `Call #${r.id}`,
         phone: r.from || r.to || '',
         duration: r.duration_sec ? `${Math.floor(r.duration_sec / 60)}:${String(Math.floor(r.duration_sec % 60)).padStart(2,'0')}` : '0:00',
         agent: agentMap[r.agent_id] || r.agent_id || 'AI Agent',
         agentId: r.agent_id || '',
         outcome: r.outcome || 'Completed',
         sentiment: r.sentiment || 'neutral',
         time: r.started_at ? new Date(r.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
         date: r.started_at ? new Date(r.started_at).toISOString().split('T')[0] : '',
         direction: r.direction || 'outbound',
         dialect: r.meta?.dialect || 'General',
         dialectConfidence: r.meta?.dialect_confidence || 0,
         dialectPatterns: [],
         language: r.meta?.language || 'English',
         emotion: r.emotion || 'neutral',
         emotionConfidence: r.meta?.emotion_confidence || 0.5,
         emotionTrend: ['neutral'],
         genZScore: 0,
         genZTerms: [],
         codeMixLanguages: '',
         codeMixRatio: 0,
         transcript: parseTranscript(r.transcript),
       }));
       setApiCalls(mapped);
       return;
     }
   } catch {}

   // Fallback: recordings endpoint
   try {
     const { data } = await voiceAgentAPI.listRecordings(undefined, 200);
     if (cancelled || !Array.isArray(data) || data.length === 0) return;
     const mapped = data.map(r => ({
       id: `api-${r.id}`,
       name: r.caller_number || `Call #${r.id}`,
       phone: r.caller_number || '',
       duration: r.duration_seconds ? `${Math.floor(r.duration_seconds / 60)}:${String(r.duration_seconds % 60).padStart(2,'0')}` : '0:00',
       agent: r.agent_voice_id || 'AI Agent',
       agentId: r.agent_voice_id || '',
       outcome: r.post_call_analysis?.outcome || 'Completed',
       sentiment: r.post_call_analysis?.sentiment || 'neutral',
       time: r.created_at ? new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
       date: r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : '',
       direction: r.direction || 'outbound',
       dialect: r.post_call_analysis?.dialect || 'Chennai',
       dialectConfidence: r.post_call_analysis?.dialect_confidence || 0.7,
       dialectPatterns: [],
       language: r.language || 'Tamil',
       emotion: r.post_call_analysis?.emotion || 'neutral',
       emotionConfidence: r.post_call_analysis?.emotion_confidence || 0.5,
       emotionTrend: ['neutral'],
       genZScore: 0,
       genZTerms: [],
       codeMixLanguages: '',
       codeMixRatio: 0,
       transcript: parseTranscript(r.transcript),
     }));
     setApiCalls(mapped);
   } catch {}
 };

 loadCalls();
 return () => { cancelled = true; };
 }, [agentFilter, agents]);

 const allCalls = useMemo(() => [...apiCalls], [apiCalls]);

 // ── Filtering ────────────────────────────────────────────────────────────
 const filtered = useMemo(() => {
 let result = [...allCalls];

 // search filter
 if (search.trim()) {
 const q = search.toLowerCase();
 result = result.filter(
 c =>
 c.name.toLowerCase().includes(q) ||
 c.phone.includes(q) ||
 c.agent.toLowerCase().includes(q) ||
 c.outcome.toLowerCase().includes(q)
 );
 }

 // date filter
 const today ='2026-02-23';
 const yesterday ='2026-02-22';
 if (dateFilter === 'today') result = result.filter(c => c.date === today);
 else if (dateFilter === 'yesterday') result = result.filter(c => c.date === yesterday);
 //'7d','30d','all' keep everything for mock data

 // agent filter (client-side for mock data)
 if (agentFilter !== 'all') {
 result = result.filter(c => c.agentId === agentFilter || c.agent === agentFilter);
 }

 // sorting (table only)
 if (sortField) {
 result.sort((a, b) => {
 let va = a[sortField] ?? '';
 let vb = b[sortField] ?? '';
 if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
 va = String(va).toLowerCase();
 vb = String(vb).toLowerCase();
 return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
 });
 }

 return result;
 }, [search, dateFilter, sortField, sortDir]);

 // ── Pagination ───────────────────────────────────────────────────────────
 const totalItems = filtered.length;
 const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
 const paginatedCalls = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
 const showingStart = totalItems === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
 const showingEnd = Math.min(currentPage * ITEMS_PER_PAGE, totalItems);

 // ── Sort toggle ──────────────────────────────────────────────────────────
 const toggleSort = (field) => {
 if (sortField === field) {
 setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
 } else {
 setSortField(field);
 setSortDir('asc');
 }
 };

 const SortIcon = ({ field }) => {
 if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />;
 return sortDir === 'asc'
 ? <ArrowUp className="w-3.5 h-3.5 text-indigo-500" />
 : <ArrowDown className="w-3.5 h-3.5 text-indigo-500" />;
 };

 // ── Export handler ─────────────────────────────────────────────────────
 const handleExport = () => {
 toast.success('Exporting call logs...');
 };

 // ── Action handler for CallDetailPanel ─────────────────────────────────
 const handleCallAction = (action, call) => {
 toast.success(`${action.charAt(0).toUpperCase() + action.slice(1)} action on ${call.name}`);
 };

 // ── Timeline items ─────────────────────────────────────────────────────
 const timelineItems = paginatedCalls.map(call => {
 const cfg = outcomeConfig[call.outcome] || outcomeConfig['No Answer'];
 return {
 id: call.id,
 icon: cfg.icon,
 type: cfg.type,
 title: call.name,
 subtitle: `${call.phone} · ${call.agent} · ${call.duration}`,
 time: `${call.time} · ${call.date}`,
 badges: (
 <>
 <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${cfg.badge}`}>
 {call.outcome}
 </span>
 <DialectBadge dialect={call.dialect} confidence={call.dialectConfidence} />
 <EmotionIndicator emotion={call.emotion} confidence={call.emotionConfidence} showBar={false} />
 {call.genZScore > 0 && <GenZBadge score={call.genZScore} terms={call.genZTerms} />}
 </>
 ),
 meta: (
 <>
 {call.direction === 'inbound'
 ? <span className="flex items-center gap-0.5"><PhoneIncoming className="w-3 h-3" /> Inbound</span>
 : <span className="flex items-center gap-0.5"><PhoneOutgoing className="w-3 h-3" /> Outbound</span>
 }
 </>
 ),
 onClick: () => setSelectedCall(call),
 };
 });

 // ── Render ─────────────────────────────────────────────────────────────
 return (
 <div className="flex h-full">
 {/* Main content area */}
 <div className="flex-1 flex flex-col overflow-hidden">
 {/* Header */}
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-white">
 <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
 <Phone className="w-5 h-5 text-indigo-500" />
 Call History
 </h1>

 <div className="flex items-center gap-2 flex-wrap">
 {/* Date filter */}
 <div className="relative">
 <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
 <select
 value={dateFilter}
 onChange={e => { setDateFilter(e.target.value); setCurrentPage(1); }}
 className="pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none cursor-pointer"
 >
 {dateFilterOptions.map(o => (
 <option key={o.value} value={o.value}>{o.label}</option>
 ))}
 </select>
 </div>

 {/* Agent filter */}
 <div className="relative">
 <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
 <select
 value={agentFilter}
 onChange={e => { setAgentFilter(e.target.value); setCurrentPage(1); }}
 className="pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none cursor-pointer"
 >
 <option value="all">All Agents</option>
 {agents.map(a => (
 <option key={a.id} value={String(a.id)}>{a.name}</option>
 ))}
 </select>
 </div>

 {/* Export */}
 <button
 onClick={handleExport}
 className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
 >
 <Download className="w-4 h-4" />
 Export
 </button>

 {/* View toggle */}
 <div className="flex rounded-lg border border-slate-200 overflow-hidden">
 <button
 onClick={() => setViewMode('timeline')}
 className={`px-3 py-2 text-sm font-medium transition-colors ${
 viewMode === 'timeline'
 ? 'bg-indigo-600 text-white'
 : 'text-slate-600 hover:bg-slate-50'
 }`}
 >
 <Clock className="w-4 h-4" />
 </button>
 <button
 onClick={() => setViewMode('table')}
 className={`px-3 py-2 text-sm font-medium transition-colors ${
 viewMode === 'table'
 ? 'bg-indigo-600 text-white'
 : 'text-slate-600 hover:bg-slate-50'
 }`}
 >
 <List className="w-4 h-4" />
 </button>
 </div>
 </div>
 </div>

 {/* Search */}
 <div className="px-6 py-3 border-b border-slate-100">
 <div className="relative max-w-md">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
 <input
 type="text"
 placeholder="Search by contact, phone, agent, outcome..."
 value={search}
 onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
 className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
 />
 </div>
 </div>

 {/* Content */}
 <div className="flex-1 overflow-y-auto px-6 py-4">
 {viewMode === 'timeline' ? (
 <Timeline items={timelineItems} />
 ) : (
 /* ── Table View ──────────────────────────────────────────── */
 <div className="overflow-x-auto rounded-xl border border-slate-200">
 <table className="w-full text-sm">
 <thead>
 <tr className="bg-slate-50 text-left">
 {[
 { label: 'Contact',   field: 'name' },
 { label: 'Agent',     field: 'agent' },
 { label: 'Timestamp', field: 'time' },
 { label: 'Duration',  field: 'duration' },
 { label: 'Language',  field: 'language' },
 { label: 'Sentiment', field: 'sentiment' },
 { label: 'Emotion',   field: 'emotion' },
 { label: 'Outcome',   field: 'outcome' },
 { label: 'Transcript', field: null },
 ].map(col => (
 <th
 key={col.label}
 className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap ${col.field ? 'cursor-pointer select-none hover:text-indigo-600' : ''}`}
 onClick={() => col.field && toggleSort(col.field)}
 >
 <span className="inline-flex items-center gap-1">
 {col.label}
 {col.field && <SortIcon field={col.field} />}
 </span>
 </th>
 ))}
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-100">
 {paginatedCalls.map(call => {
 const cfg = outcomeConfig[call.outcome] || outcomeConfig['No Answer'];
 return (
 <tr
 key={call.id}
 onClick={() => setSelectedCall(call)}
 className="hover:bg-slate-50 cursor-pointer transition-colors"
 >
 {/* Contact */}
 <td className="px-4 py-3">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
 <span className="text-xs font-bold text-white">{call.name.charAt(0)}</span>
 </div>
 <div className="min-w-0">
 <p className="font-medium text-slate-900 truncate">{call.name}</p>
 <p className="text-xs text-slate-400">{call.phone}</p>
 </div>
 </div>
 </td>
 {/* Agent */}
 <td className="px-4 py-3 text-slate-600 text-sm">{call.agent}</td>
 {/* Timestamp */}
 <td className="px-4 py-3">
 <div className="flex items-center gap-1 text-slate-500">
 {call.direction === 'inbound' ? <PhoneIncoming className="w-3.5 h-3.5" /> : <PhoneOutgoing className="w-3.5 h-3.5" />}
 <span className="text-xs">{call.time}</span>
 </div>
 <p className="text-xs text-slate-400 mt-0.5">{call.date}</p>
 </td>
 {/* Duration */}
 <td className="px-4 py-3 text-slate-600 font-mono text-sm">{call.duration}</td>
 {/* Language */}
 <td className="px-4 py-3">
 <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-medium">
 {call.language}
 </span>
 </td>
 {/* Sentiment */}
 <td className="px-4 py-3">
 <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
 call.sentiment === 'positive' ? 'bg-emerald-100 text-emerald-700' :
 call.sentiment === 'negative' ? 'bg-red-100 text-red-700' :
 'bg-slate-100 text-slate-600'
 }`}>
 {call.sentiment}
 </span>
 </td>
 {/* Emotion */}
 <td className="px-4 py-3">
 <EmotionIndicator emotion={call.emotion} confidence={call.emotionConfidence} showBar={false} />
 </td>
 {/* Outcome */}
 <td className="px-4 py-3">
 <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.badge}`}>
 {call.outcome}
 </span>
 </td>
 {/* View transcript */}
 <td className="px-4 py-3">
 <button
 onClick={e => { e.stopPropagation(); setTranscriptModal(call); }}
 className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium whitespace-nowrap"
 >
 <FileText className="w-3.5 h-3.5" />
 View transcript
 </button>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 )}
 </div>

 {/* Pagination */}
 <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-white">
 <p className="text-sm text-slate-500">
 Showing <span className="font-medium text-slate-700">{showingStart}-{showingEnd}</span> of{''}
 <span className="font-medium text-slate-700">{totalItems}</span>
 </p>
 <div className="flex items-center gap-2">
 <button
 disabled={currentPage === 1}
 onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
 className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
 >
 <ChevronLeft className="w-4 h-4" />
 Previous
 </button>
 <button
 disabled={currentPage === totalPages}
 onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
 className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
 >
 Next
 <ChevronRight className="w-4 h-4" />
 </button>
 </div>
 </div>
 </div>

 {/* ── Side Panel (CallDetailPanel in ResizablePanel) ──────────────── */}
 {selectedCall && (
 <ResizablePanel defaultWidth={384} minWidth={300} maxWidth={520} storageKey="call-logs-panel">
 <CallDetailPanel
 call={selectedCall}
 onClose={() => setSelectedCall(null)}
 onAction={handleCallAction}
 />
 </ResizablePanel>
 )}

 {/* ── Transcript Modal ─────────────────────────────────────────────── */}
 {transcriptModal && (
 <TranscriptModal call={transcriptModal} onClose={() => setTranscriptModal(null)} />
 )}
 </div>
 );
}

// ── TranscriptModal ──────────────────────────────────────────────────────────

function TranscriptModal({ call, onClose }) {
 const handlePrint = () => window.print();

 const sentimentColor =
 call.sentiment === 'positive' ? 'text-emerald-600' :
 call.sentiment === 'negative' ? 'text-red-600' :
 'text-slate-500';

 return (
 <>
   {/* Print stylesheet — hides everything except the modal content */}
   <style>{`
     @media print {
       body * { visibility: hidden !important; }
       #vm-transcript-root, #vm-transcript-root * { visibility: visible !important; }
       #vm-transcript-root {
         position: fixed !important; inset: 0 !important;
         background: white !important; padding: 24px !important;
         overflow: visible !important; z-index: 9999 !important;
       }
       .vm-no-print { display: none !important; }
     }
   `}</style>

   {/* Backdrop */}
   <div
     className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 vm-no-print-backdrop"
     onClick={e => { if (e.target === e.currentTarget) onClose(); }}
   >
     {/* Modal */}
     <div
       id="vm-transcript-root"
       className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col mx-4"
     >
       {/* Header */}
       <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 vm-no-print">
         <h2 className="font-bold text-lg text-slate-900 flex items-center gap-2">
           <FileText className="w-5 h-5 text-indigo-500" />
           Transcript — {call.name}
         </h2>
         <div className="flex items-center gap-2">
           <button
             onClick={handlePrint}
             className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
           >
             <Printer className="w-4 h-4" />
             Export PDF
           </button>
           <button
             onClick={onClose}
             className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
           >
             <X className="w-5 h-5" />
           </button>
         </div>
       </div>

       {/* Print-only title */}
       <div className="hidden px-6 pt-6 pb-2" style={{ display: 'none' }} id="vm-print-header">
         <h1 className="text-xl font-bold text-slate-900">Call Transcript — {call.name}</h1>
       </div>

       {/* Meta bar */}
       <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-4 text-sm text-slate-600">
         <span className="flex items-center gap-1">
           <Calendar className="w-3.5 h-3.5 text-slate-400" />
           {call.date} {call.time}
         </span>
         <span className="flex items-center gap-1">
           <Clock className="w-3.5 h-3.5 text-slate-400" />
           {call.duration}
         </span>
         <span className="flex items-center gap-1">
           🌐 {call.language}
         </span>
         <span className={`flex items-center gap-1 font-medium ${sentimentColor}`}>
           💬 {call.sentiment}
         </span>
         {call.agent && (
           <span className="flex items-center gap-1 text-slate-500">
             🤖 {call.agent}
           </span>
         )}
       </div>

       {/* Conversation */}
       <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
         {call.transcript.length === 0 ? (
           <p className="text-center text-sm text-slate-400 py-10">No transcript recorded for this call.</p>
         ) : (
           call.transcript.map((line, i) => {
             const isAgent = line.speaker === 'agent';
             return (
               <div key={i} className={`flex gap-2 ${isAgent ? 'flex-row-reverse' : 'flex-row'}`}>
                 <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                   isAgent ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-700'
                 }`}>
                   {isAgent ? 'A' : 'U'}
                 </div>
                 <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                   isAgent
                     ? 'bg-indigo-600 text-white rounded-tr-sm'
                     : 'bg-slate-100 text-slate-800 rounded-tl-sm'
                 }`}>
                   {line.text}
                   {line.time && (
                     <span className={`block text-xs mt-1 ${isAgent ? 'text-indigo-200' : 'text-slate-400'}`}>
                       {line.time}
                     </span>
                   )}
                 </div>
               </div>
             );
           })
         )}
       </div>

       {/* Footer */}
       <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex items-center justify-between vm-no-print">
         <p className="text-xs text-slate-400">
           {call.transcript.length} message{call.transcript.length !== 1 ? 's' : ''}
         </p>
         <button
           onClick={onClose}
           className="px-4 py-1.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-white transition-colors"
         >
           Close
         </button>
       </div>
     </div>
   </div>
 </>
 );
}
