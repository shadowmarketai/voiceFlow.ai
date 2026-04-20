/**
 * Live Calls Page - Three-column layout with call list, transcript, and analysis panels
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, Link } from 'react-router-dom';
import {
 Phone, PhoneCall, PhoneOff, Mic, MicOff, Volume2, Search, Clock,
 ArrowLeft, ChevronRight, User, Bot, Radio, Headphones, Shield,
 MessageSquare, TrendingUp, ArrowDown, Sparkles, Languages, Brain,
 Tag, Calendar, Megaphone, ArrowUpRight, ArrowDownLeft, Info
} from 'lucide-react';
import CollapsibleSection from './components/CollapsibleSection';
import ResizablePanel from './components/ResizablePanel';
import DialectBadge from './components/DialectBadge';
import EmotionIndicator from './components/EmotionIndicator';
import GenZBadge from './components/GenZBadge';
import { callsAPI } from '../../services/api';

/* ═══════════════════════════════════════════════════════════════════
 MOCK DATA — 8 calls with varied dialects, emotions, genZ scores
 ═══════════════════════════════════════════════════════════════════ */
const MOCK_CALLS = [
 {
 id: 'call-001',
 name: 'Rajesh Kumar',
 phone: '+91 98765 43210',
 duration: '3:45',
 sentiment: 'positive',
 agent: 'Sales Bot',
 status: 'active',
 topic: 'Product Demo',
 dialect: 'Kongu',
 dialectConfidence: 0.89,
 dialectPatterns: ['Kongu Tamil verb endings','Regional vocabulary usage'],
 language: 'Tamil',
 emotion: 'happy',
 emotionConfidence: 0.82,
 emotionTrend: ['neutral','neutral','happy','happy','excited'],
 genZScore: 0.2,
 genZTerms: ['vibe'],
 codeMixLanguages: 'Tamil-English',
 codeMixRatio: 0.45,
 direction: 'outbound',
 campaign: 'February Lead Follow-up',
 startTime: '2:15 PM',
 transcript: [
 { speaker: 'agent', text: 'Good afternoon! This is Rajesh from ShadowMarket. How are you today? ', time: '0:00', emotion: 'neutral' },
 { speaker: 'customer', text: 'I am doing well, thank you. I saw your product demo request page.', time: '0:15', emotion: 'neutral' },
 { speaker: 'agent', text: 'That is great to hear! We have a comprehensive AI voice solution. Would you like me to walk you through the features? ', time: '0:32', emotion: 'happy' },
 { speaker: 'customer', text: 'Yes please, especially the Tamil dialect detection. That sounds very interesting for our business.', time: '0:48', emotion: 'happy' },
 { speaker: 'agent', text: 'Absolutely! Our system can detect Kongu, Chennai, Madurai, and Tirunelveli dialects with over 85% accuracy. Let me schedule a demo.', time: '1:05', emotion: 'excited' },
 ],
 },
 {
 id: 'call-002',
 name: 'Priya Sharma',
 phone: '+91 87654 32109',
 duration: '1:22',
 sentiment: 'neutral',
 agent: 'Support Bot',
 status: 'active',
 topic: 'Pricing Inquiry',
 dialect: 'Chennai',
 dialectConfidence: 0.94,
 dialectPatterns: ['Chennai Tamil phonetics','Urban slang mixing'],
 language: 'Tamil',
 emotion: 'neutral',
 emotionConfidence: 0.71,
 emotionTrend: ['neutral','confused','neutral','neutral'],
 genZScore: 0.65,
 genZTerms: ['no cap','slay','lowkey'],
 codeMixLanguages: 'Tamil-English',
 codeMixRatio: 0.72,
 direction: 'inbound',
 campaign: 'Inbound Support',
 startTime: '2:38 PM',
 transcript: [
 { speaker: 'customer', text: 'Hi, I want to know about your pricing plans. Like no cap, I need something affordable.', time: '0:00', emotion: 'neutral' },
 { speaker: 'agent', text: 'Welcome! I would be happy to help you find the right plan. We have three tiers: Starter, Professional, and Enterprise.', time: '0:12', emotion: 'happy' },
 { speaker: 'customer', text: 'What does the Professional plan include? Is the dialect detection included or extra? ', time: '0:28', emotion: 'confused' },
 { speaker: 'agent', text: 'The Professional plan includes full dialect detection for Tamil, Hindi, and English at Rs 4,999 per month.', time: '0:45', emotion: 'neutral' },
 { speaker: 'customer', text: 'That is lowkey a good deal. Let me check with my team and get back to you.', time: '1:02', emotion: 'neutral' },
 ],
 },
 {
 id: 'call-003',
 name: 'Vikram Patel',
 phone: '+91 76543 21098',
 duration: '5:18',
 sentiment: 'positive',
 agent: 'Sales Bot',
 status: 'active',
 topic: 'Enterprise Deal',
 dialect: 'Madurai',
 dialectConfidence: 0.77,
 dialectPatterns: ['Madurai Tamil intonation','Southern region expressions'],
 language: 'Tamil',
 emotion: 'excited',
 emotionConfidence: 0.91,
 emotionTrend: ['neutral','happy','happy','excited','excited'],
 genZScore: 0.0,
 genZTerms: [],
 codeMixLanguages: 'Tamil-English',
 codeMixRatio: 0.38,
 direction: 'outbound',
 campaign: 'Enterprise Outreach',
 startTime: '1:42 PM',
 transcript: [
 { speaker: 'agent', text: 'Good afternoon Mr. Patel! I am following up on the enterprise solution we discussed last week.', time: '0:00', emotion: 'neutral' },
 { speaker: 'customer', text: 'Yes, I have been discussing it with the board. They are very interested in the full package.', time: '0:18', emotion: 'happy' },
 { speaker: 'agent', text: 'That is wonderful! The enterprise package includes unlimited calls, all dialect detection, and custom AI training.', time: '0:35', emotion: 'happy' },
 { speaker: 'customer', text: 'That sounds exactly what we need! Can we finalize the contract this week? ', time: '0:52', emotion: 'excited' },
 { speaker: 'agent', text: 'Absolutely! I will send over the contract today. Welcome aboard, Mr. Patel!', time: '1:10', emotion: 'excited' },
 ],
 },
 {
 id: 'call-004',
 name: 'Anitha Devi',
 phone: '+91 65432 10987',
 duration: '2:10',
 sentiment: 'negative',
 agent: 'Support Bot',
 status: 'active',
 topic: 'Technical Issue',
 dialect: 'Tirunelveli',
 dialectConfidence: 0.86,
 dialectPatterns: ['Tirunelveli Tamil accent','Southern endpoint dialect'],
 language: 'Tamil',
 emotion: 'angry',
 emotionConfidence: 0.78,
 emotionTrend: ['neutral','sad','angry','angry'],
 genZScore: 0.0,
 genZTerms: [],
 codeMixLanguages: 'Tamil-English',
 codeMixRatio: 0.25,
 direction: 'inbound',
 campaign: 'Inbound Support',
 startTime: '2:50 PM',
 transcript: [
 { speaker: 'customer', text: 'I have been having issues with the API integration for three days now. Nobody is helping me!', time: '0:00', emotion: 'angry' },
 { speaker: 'agent', text: 'I sincerely apologize for the inconvenience, Anitha. Let me look into your account right away.', time: '0:14', emotion: 'neutral' },
 { speaker: 'customer', text: 'This is very frustrating. We have a launch deadline next week and nothing is working.', time: '0:30', emotion: 'angry' },
 { speaker: 'agent', text: 'I completely understand. Let me escalate this to our senior technical team immediately. They will contact you within the hour.', time: '0:48', emotion: 'neutral' },
 { speaker: 'customer', text: 'Fine. Please make sure someone actually calls me back this time.', time: '1:05', emotion: 'sad' },
 ],
 },
 {
 id: 'call-005',
 name: 'Karthik Rajan',
 phone: '+91 54321 09876',
 duration: '4:02',
 sentiment: 'positive',
 agent: 'Promo Bot',
 status: 'active',
 topic: 'Feature Interest',
 dialect: 'Kongu',
 dialectConfidence: 0.92,
 dialectPatterns: ['Strong Kongu verb forms','Coimbatore regional terms'],
 language: 'Tamil',
 emotion: 'happy',
 emotionConfidence: 0.85,
 emotionTrend: ['neutral','happy','excited','happy','happy'],
 genZScore: 0.78,
 genZTerms: ['slay','no cap','vibe check','bet'],
 codeMixLanguages: 'Tamil-English',
 codeMixRatio: 0.81,
 direction: 'outbound',
 campaign: 'Product Launch Campaign',
 startTime: '1:58 PM',
 transcript: [
 { speaker: 'agent', text: 'Hi Karthik! We have some exciting new features launching this month. Do you have a moment? ', time: '0:00', emotion: 'happy' },
 { speaker: 'customer', text: 'Oh for sure! I have been waiting for the new GenZ detection. That feature is going to slay!', time: '0:12', emotion: 'excited' },
 { speaker: 'agent', text: 'Glad to hear that! The GenZ detection is now live with support for over 200 slang terms.', time: '0:28', emotion: 'happy' },
 { speaker: 'customer', text: 'No cap, that is exactly what we need. Our target audience is mostly 18-25. Bet, sign us up!', time: '0:45', emotion: 'happy' },
 { speaker: 'agent', text: 'Amazing! I will upgrade your plan right away. The vibe check feature is also included at no extra cost.', time: '1:02', emotion: 'happy' },
 ],
 },
 {
 id: 'call-006',
 name: 'Meena Kumari',
 phone: '+91 43210 98765',
 duration: '0:45',
 sentiment: 'neutral',
 agent: 'Retention Bot',
 status: 'active',
 topic: 'Renewal Discussion',
 dialect: 'Chennai',
 dialectConfidence: 0.88,
 dialectPatterns: ['Chennai urban speech pattern','IT corridor dialect'],
 language: 'Tamil',
 emotion: 'confused',
 emotionConfidence: 0.67,
 emotionTrend: ['neutral','confused','confused'],
 genZScore: 0.35,
 genZTerms: ['lowkey','sus'],
 codeMixLanguages: 'Tamil-English',
 codeMixRatio: 0.65,
 direction: 'outbound',
 campaign: 'Customer Reactivation',
 startTime: '2:55 PM',
 transcript: [
 { speaker: 'agent', text: 'Hello Meena! Your subscription is expiring soon. I wanted to discuss renewal options with you.', time: '0:00', emotion: 'neutral' },
 { speaker: 'customer', text: 'Hmm, I am not sure. I lowkey feel like the pricing has changed a lot since I first signed up.', time: '0:12', emotion: 'confused' },
 { speaker: 'agent', text: 'I understand your concern. Let me check if we can offer you a loyalty discount.', time: '0:25', emotion: 'neutral' },
 { speaker: 'customer', text: 'That would be helpful. The new pricing seems kind of sus to me honestly.', time: '0:35', emotion: 'confused' },
 { speaker: 'agent', text: 'Let me pull up your account history and see what the best option would be for you.', time: '0:42', emotion: 'neutral' },
 ],
 },
 {
 id: 'call-007',
 name: 'Suresh Babu',
 phone: '+91 32109 87654',
 duration: '6:33',
 sentiment: 'positive',
 agent: 'Sales Bot',
 status: 'active',
 topic: 'Multi-location Setup',
 dialect: 'Madurai',
 dialectConfidence: 0.81,
 dialectPatterns: ['Madurai Tamil rhythm','Temple city dialect markers'],
 language: 'Tamil',
 emotion: 'neutral',
 emotionConfidence: 0.74,
 emotionTrend: ['neutral','neutral','happy','neutral','happy'],
 genZScore: 0.0,
 genZTerms: [],
 codeMixLanguages: 'Tamil-Hindi',
 codeMixRatio: 0.33,
 direction: 'inbound',
 campaign: 'Inbound Sales',
 startTime: '1:27 PM',
 transcript: [
 { speaker: 'customer', text: 'I need to set up the voice AI system across 12 locations. Is that possible with your platform? ', time: '0:00', emotion: 'neutral' },
 { speaker: 'agent', text: 'Absolutely! Our enterprise plan supports unlimited locations with centralized management.', time: '0:15', emotion: 'happy' },
 { speaker: 'customer', text: 'Good. Each location has different dialect needs. Madurai, Chennai, and some Hindi-speaking areas.', time: '0:32', emotion: 'neutral' },
 { speaker: 'agent', text: 'Our multi-dialect engine handles all those seamlessly. We can configure dialect preferences per location.', time: '0:50', emotion: 'happy' },
 { speaker: 'customer', text: 'That is exactly what we are looking for. Let us schedule a technical walkthrough.', time: '1:08', emotion: 'happy' },
 ],
 },
 {
 id: 'call-008',
 name: 'Divya Krishnan',
 phone: '+91 21098 76543',
 duration: '1:58',
 sentiment: 'neutral',
 agent: 'Support Bot',
 status: 'active',
 topic: 'Billing Question',
 dialect: 'Tirunelveli',
 dialectConfidence: 0.73,
 dialectPatterns: ['Tirunelveli Tamil softness','Southern coast expressions'],
 language: 'Tamil',
 emotion: 'sad',
 emotionConfidence: 0.69,
 emotionTrend: ['neutral','sad','sad','neutral'],
 genZScore: 0.52,
 genZTerms: ['fr fr','mid','ghosted'],
 codeMixLanguages: 'Tamil-English',
 codeMixRatio: 0.58,
 direction: 'inbound',
 campaign: 'Inbound Support',
 startTime: '2:42 PM',
 transcript: [
 { speaker: 'customer', text: 'Hi, I got an unexpected charge on my account this month. I feel like I was kind of ghosted by support.', time: '0:00', emotion: 'sad' },
 { speaker: 'agent', text: 'I am so sorry to hear that, Divya. Let me review your billing history right away.', time: '0:14', emotion: 'neutral' },
 { speaker: 'customer', text: 'I sent two emails last week and got no response. That is fr fr disappointing.', time: '0:28', emotion: 'sad' },
 { speaker: 'agent', text: 'I completely understand your frustration. I can see the charge here. It appears to be a pro-rated adjustment. Let me reverse it.', time: '0:45', emotion: 'neutral' },
 { speaker: 'customer', text: 'Okay thank you. The previous support experience was kind of mid but I appreciate your help now.', time: '1:02', emotion: 'neutral' },
 ],
 },
];

/* ─── Emotion color map for transcript bubbles ──────────────────── */
const emotionColors = {
 happy: 'border-l-emerald-400',
 sad: 'border-l-blue-400',
 angry: 'border-l-red-400',
 neutral: 'border-l-slate-300',
 excited: 'border-l-amber-400',
 confused: 'border-l-purple-400',
};

const emotionDotColors = {
 happy: 'bg-emerald-400',
 sad: 'bg-blue-400',
 angry: 'bg-red-400',
 neutral: 'bg-slate-400',
 excited: 'bg-amber-400',
 confused: 'bg-purple-400',
};

/* ═══════════════════════════════════════════════════════════════════
 MAIN LIVE CALLS COMPONENT
 ═══════════════════════════════════════════════════════════════════ */
export default function LiveCallsPage() {
 const navigate = useNavigate();
 const transcriptEndRef = useRef(null);

 /* ── State ────────────────────────────────────────────────── */
 const [searchQuery, setSearchQuery] = useState('');
 const [selectedCallId, setSelectedCallId] = useState(null);
 const [apiCalls, setApiCalls] = useState([]);

 /* ── Poll live calls from API every 5 seconds ──────────────── */
 useEffect(() => {
 let active = true;
 const fetchLive = async () => {
   // Try dashboard/live first (new endpoint), fallback to calls/live
   for (const url of ['/api/v1/dashboard/live', '/api/v1/calls/live']) {
     try {
       const resp = await fetch(url);
       if (!resp.ok) continue;
       const data = await resp.json();
       const calls = data.calls || data || [];
       if (!active || !Array.isArray(calls)) continue;
       const mapped = calls.map(c => ({
         id: c.id || `live-${Math.random()}`,
         name: c.phone || `Call #${c.id}`,
         phone: c.phone || '',
         duration: c.duration || '0:00',
         sentiment: c.sentiment || 'neutral',
         agent: c.agent || 'AI Agent',
         status: c.status || 'active',
         topic: c.direction || 'Call',
         dialect: 'General',
         dialectConfidence: 0,
         dialectPatterns: [],
         language: c.language || 'en',
         emotion: c.emotion || 'neutral',
         emotionConfidence: 0.7,
         emotionTrend: [],
         genZScore: 0,
         genZTerms: [],
         codeMixLanguages: '',
         codeMixRatio: 0,
         direction: c.direction || 'test',
         campaign: '',
         startTime: c.started_at ? new Date(c.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
         transcript: c.transcript_preview ? [{ speaker: 'agent', text: c.transcript_preview, time: '0:00', emotion: c.emotion || 'neutral' }] : [],
       }));
       setApiCalls(mapped);
       return; // success — stop trying
     } catch {}
   }
 };
 fetchLive();
 const interval = setInterval(fetchLive, 5000);
 return () => { active = false; clearInterval(interval); };
 }, []);

 const allCalls = useMemo(() => [...apiCalls], [apiCalls]);

 /* ── Filtered calls ───────────────────────────────────────── */
 const filteredCalls = useMemo(() => {
 if (!searchQuery.trim()) return allCalls;
 const q = searchQuery.toLowerCase();
 return allCalls.filter(c =>
 c.name.toLowerCase().includes(q) ||
 c.phone.includes(q) ||
 c.agent.toLowerCase().includes(q) ||
 c.dialect.toLowerCase().includes(q) ||
 c.topic.toLowerCase().includes(q)
 );
 }, [searchQuery, allCalls]);

 /* ── Selected call ────────────────────────────────────────── */
 const selectedCall = useMemo(() => {
 if (!selectedCallId) return null;
 return allCalls.find(c => c.id === selectedCallId) || null;
 }, [selectedCallId, allCalls]);

 /* ── Auto-scroll transcript ───────────────────────────────── */
 useEffect(() => {
 if (selectedCall && transcriptEndRef.current) {
 transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
 }
 }, [selectedCall]);

 /* ── Handlers ─────────────────────────────────────────────── */
 const handleListen = () => {
 if (!selectedCall) return;
 toast.success('Now listening to call with ' + selectedCall.name);
 };

 const handleWhisper = () => {
 if (!selectedCall) return;
 toast.success('Whispering to agent on call with ' + selectedCall.name);
 };

 const handleTakeOver = () => {
 if (!selectedCall) return;
 toast('Taking over call with ' + selectedCall.name +'...', { icon: '\uD83C\uDFA4' });
 };

 const handleEndCall = () => {
 if (!selectedCall) return;
 toast.success('Call with ' + selectedCall.name +' ended');
 setSelectedCallId(null);
 };

 /* ═══════════════════════════════════════════════════════════
 RENDER
 ═══════════════════════════════════════════════════════════ */
 return (
 <div className="flex flex-col h-[calc(100vh-8rem)]">
 {/* Page Header */}
 <div className="flex items-center justify-between mb-4 flex-shrink-0">
 <div className="flex items-center gap-3">
 <button
 onClick={() => navigate('/voice/dashboard')}
 className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
 >
 <ArrowLeft className="w-5 h-5" />
 </button>
 <div>
 <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
 <span className="relative flex h-2.5 w-2.5">
 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
 <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
 </span>
 Live Calls
 <span className="text-sm font-normal text-slate-500 ml-1">({allCalls.length} active)</span>
 </h1>
 </div>
 </div>
 <div className="flex items-center gap-2">
 <button
 onClick={() => toast.success('Auto-refresh enabled')}
 className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
 >
 Auto-refresh: ON
 </button>
 </div>
 </div>

 {/* ── Three-Column Layout ──────────────────────────────── */}
 <div className="flex flex-1 gap-0 overflow-hidden rounded-xl border border-slate-200 bg-white">

 {/* ════════════════════════════════════════════════════
 LEFT PANEL — Call List (fixed w-80)
 ════════════════════════════════════════════════════ */}
 <div className="w-80 flex-shrink-0 border-r border-slate-200 flex flex-col bg-slate-50">
 {/* Search */}
 <div className="p-3 border-b border-slate-200">
 <div className="relative">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
 <input
 type="text"
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 placeholder="Search calls, agents, dialects..."
 className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
 />
 </div>
 </div>

 {/* Call List */}
 <div className="flex-1 overflow-y-auto">
 {filteredCalls.length === 0 ? (
 <div className="p-6 text-center text-sm text-slate-400">
 No calls match your search
 </div>
 ) : (
 filteredCalls.map((call) => {
 const isSelected = selectedCallId === call.id;
 return (
 <button
 key={call.id}
 onClick={() => setSelectedCallId(call.id)}
 className={`w-full text-left p-3 border-b border-slate-100 transition-colors ${
 isSelected
 ? 'bg-indigo-50 border-l-2 border-l-indigo-500'
 : 'hover:bg-white border-l-2 border-l-transparent'
 }`}
 >
 <div className="flex items-start justify-between mb-1.5">
 <div className="flex items-center gap-2">
 {/* Green pulse dot for active */}
 <span className="relative flex h-2 w-2 flex-shrink-0">
 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
 <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
 </span>
 <span className="font-medium text-sm text-slate-900 truncate">{call.name}</span>
 </div>
 <span className="text-xs font-mono text-slate-500 flex-shrink-0">{call.duration}</span>
 </div>
 <div className="flex items-center gap-1.5 mb-1.5 ml-4">
 <span className="text-xs text-slate-500">{call.phone}</span>
 <span className="text-slate-300">&middot;</span>
 <span className="text-xs text-slate-500">{call.agent}</span>
 </div>
 <div className="flex items-center gap-1.5 ml-4 flex-wrap">
 <DialectBadge dialect={call.dialect} confidence={call.dialectConfidence} />
 <EmotionIndicator emotion={call.emotion} confidence={call.emotionConfidence} showBar={false} size="sm" />
 </div>
 </button>
 );
 })
 )}
 </div>
 </div>

 {/* ════════════════════════════════════════════════════
 CENTER PANEL — Selected Call Transcript (flex-1)
 ════════════════════════════════════════════════════ */}
 <div className="flex-1 flex flex-col min-w-0">
 {!selectedCall ? (
 /* Empty state */
 <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
 <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
 <MessageSquare className="w-8 h-8 text-slate-400" />
 </div>
 <h3 className="text-lg font-semibold text-slate-900 mb-2">Select a call to view details</h3>
 <p className="text-sm text-slate-500 max-w-xs">
 Click on any active call from the list on the left to view the live transcript, emotion analysis, and dialect detection.
 </p>
 </div>
 ) : (
 <>
 {/* Sticky Header */}
 <div className="flex-shrink-0 px-5 py-3 border-b border-slate-200 bg-white">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="relative">
 <div className="w-10 h-10 bg-gradient-to-br from-indigo-400 to-indigo-600 rounded-full flex items-center justify-center">
 <Phone className="w-5 h-5 text-white" />
 </div>
 <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white animate-pulse" />
 </div>
 <div>
 <h2 className="font-semibold text-slate-900">{selectedCall.name}</h2>
 <div className="flex items-center gap-2 text-xs text-slate-500">
 <span>{selectedCall.phone}</span>
 <span>&middot;</span>
 <span>{selectedCall.agent}</span>
 <span>&middot;</span>
 <span className="font-mono">{selectedCall.duration}</span>
 <span>&middot;</span>
 {selectedCall.direction === 'inbound' ? (
 <span className="flex items-center gap-0.5 text-blue-500"><ArrowDownLeft className="w-3 h-3" /> Inbound</span>
 ) : (
 <span className="flex items-center gap-0.5 text-emerald-500"><ArrowUpRight className="w-3 h-3" /> Outbound</span>
 )}
 </div>
 </div>
 </div>
 <div className="flex items-center gap-2">
 <button
 onClick={handleListen}
 className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-200 transition-colors"
 >
 <Headphones className="w-4 h-4" /> Listen
 </button>
 <button
 onClick={handleWhisper}
 className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors"
 >
 <Volume2 className="w-4 h-4" /> Whisper
 </button>
 <button
 onClick={handleTakeOver}
 className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-200 transition-colors"
 >
 <Mic className="w-4 h-4" /> Take Over
 </button>
 <button
 onClick={handleEndCall}
 className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors"
 >
 <PhoneOff className="w-4 h-4" /> End
 </button>
 </div>
 </div>
 </div>

 {/* Transcript Area */}
 <div className="flex-1 overflow-y-auto p-5 space-y-4">
 {selectedCall.transcript.map((msg, i) => {
 const isAgent = msg.speaker === 'agent';
 return (
 <div
 key={i}
 className={`flex ${isAgent ? 'justify-start' : 'justify-end'}`}
 >
 <div className={`max-w-[75%] ${isAgent ? 'order-1' : 'order-1'}`}>
 {/* Speaker label */}
 <div className={`flex items-center gap-1.5 mb-1 ${isAgent ? '' : 'justify-end'}`}>
 {isAgent ? (
 <Bot className="w-3.5 h-3.5 text-indigo-500" />
 ) : (
 <User className="w-3.5 h-3.5 text-slate-400" />
 )}
 <span className="text-xs font-medium text-slate-500">
 {isAgent ? selectedCall.agent : selectedCall.name}
 </span>
 <span className="text-[10px] text-slate-400 font-mono">{msg.time}</span>
 <span className={`w-1.5 h-1.5 rounded-full ${emotionDotColors[msg.emotion] || 'bg-slate-400'}`} title={msg.emotion} />
 </div>
 {/* Bubble */}
 <div
 className={`rounded-2xl px-4 py-2.5 border-l-3 ${
 isAgent
 ? `bg-indigo-50 text-slate-800 ${emotionColors[msg.emotion] || ''} rounded-tl-md`
 : `bg-slate-100 text-slate-800 ${emotionColors[msg.emotion] || ''} rounded-tr-md`
 }`}
 >
 <p className="text-sm leading-relaxed">{msg.text}</p>
 </div>
 </div>
 </div>
 );
 })}
 {/* Scroll anchor */}
 <div ref={transcriptEndRef} />

 {/* Live indicator */}
 <div className="flex justify-center">
 <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-full">
 <span className="relative flex h-2 w-2">
 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
 <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
 </span>
 <span className="text-xs text-slate-500">Live - Listening...</span>
 </div>
 </div>
 </div>
 </>
 )}
 </div>

 {/* ════════════════════════════════════════════════════
 RIGHT PANEL — Analysis (ResizablePanel)
 ════════════════════════════════════════════════════ */}
 {selectedCall && (
 <ResizablePanel defaultWidth={352} minWidth={280} maxWidth={480} storageKey="live-calls-right-panel">
 <div className="space-y-3 py-3 pr-2">
 {/* Dialect Analysis */}
 <CollapsibleSection title="Dialect Analysis" defaultOpen={true} badge={selectedCall.dialect}>
 <div className="space-y-3">
 <div className="flex items-center gap-2">
 <DialectBadge dialect={selectedCall.dialect} confidence={selectedCall.dialectConfidence} size="lg" />
 </div>
 <div>
 <p className="text-xs text-slate-500 mb-1">Confidence</p>
 <div className="flex items-center gap-2">
 <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
 <div
 className="h-full bg-orange-500 rounded-full transition-all"
 style={{ width: `${Math.round(selectedCall.dialectConfidence * 100)}%` }}
 />
 </div>
 <span className="text-sm font-medium text-slate-900">
 {Math.round(selectedCall.dialectConfidence * 100)}%
 </span>
 </div>
 </div>
 <div>
 <p className="text-xs text-slate-500 mb-1.5">Detected Patterns</p>
 <div className="space-y-1">
 {selectedCall.dialectPatterns.map((p, i) => (
 <div key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
 <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
 {p}
 </div>
 ))}
 </div>
 </div>
 <div>
 <p className="text-xs text-slate-500 mb-1">Language</p>
 <span className="text-sm font-medium text-slate-900">{selectedCall.language}</span>
 </div>
 </div>
 </CollapsibleSection>

 {/* Emotion Analysis */}
 <CollapsibleSection title="Emotion Analysis" defaultOpen={true} badge={selectedCall.emotion}>
 <div className="space-y-3">
 <EmotionIndicator emotion={selectedCall.emotion} confidence={selectedCall.emotionConfidence} showBar={true} size="lg" />
 <div>
 <p className="text-xs text-slate-500 mb-1.5">Emotion Trend</p>
 <div className="flex items-center gap-1">
 {selectedCall.emotionTrend.map((e, i) => (
 <div key={i} className="flex flex-col items-center gap-0.5">
 <div
 className={`w-6 h-6 rounded-full flex items-center justify-center ${emotionDotColors[e]} bg-opacity-20`}
 title={e}
 >
 <span className={`w-2.5 h-2.5 rounded-full ${emotionDotColors[e]}`} />
 </div>
 {i < selectedCall.emotionTrend.length - 1 && (
 <div className="w-0.5 h-0 bg-transparent" />
 )}
 </div>
 ))}
 {selectedCall.emotionTrend.length > 0 && (
 <span className="text-[10px] text-slate-400 ml-1">
 {selectedCall.emotionTrend[0]} &rarr; {selectedCall.emotionTrend[selectedCall.emotionTrend.length - 1]}
 </span>
 )}
 </div>
 </div>
 </div>
 </CollapsibleSection>

 {/* GenZ Detection */}
 <CollapsibleSection
 title="GenZ Detection"
 defaultOpen={selectedCall.genZScore > 0}
 badge={selectedCall.genZScore > 0 ? `${(selectedCall.genZScore * 10).toFixed(1)}/10` : 'N/A'}
 >
 <div className="space-y-3">
 {selectedCall.genZScore > 0 ? (
 <>
 <div className="flex items-center gap-2">
 <GenZBadge score={selectedCall.genZScore} terms={selectedCall.genZTerms} size="lg" />
 </div>
 <div>
 <p className="text-xs text-slate-500 mb-1">Score</p>
 <div className="flex items-center gap-2">
 <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
 <div
 className="h-full bg-gradient-to-r from-pink-500 to-violet-500 rounded-full"
 style={{ width: `${selectedCall.genZScore * 100}%` }}
 />
 </div>
 <span className="text-sm font-medium text-slate-900">
 {(selectedCall.genZScore * 10).toFixed(1)}/10
 </span>
 </div>
 </div>
 {selectedCall.genZTerms.length > 0 && (
 <div>
 <p className="text-xs text-slate-500 mb-1.5">Detected Terms</p>
 <div className="flex flex-wrap gap-1.5">
 {selectedCall.genZTerms.map((t, i) => (
 <span key={i} className="px-2 py-0.5 bg-pink-50 text-pink-600 text-xs rounded-full font-medium">
 {t}
 </span>
 ))}
 </div>
 </div>
 )}
 </>
 ) : (
 <p className="text-sm text-slate-400">No GenZ language patterns detected in this call.</p>
 )}
 </div>
 </CollapsibleSection>

 {/* Code-Mixing */}
 <CollapsibleSection
 title="Code-Mixing"
 defaultOpen={true}
 badge={`${Math.round(selectedCall.codeMixRatio * 100)}%`}
 >
 <div className="space-y-3">
 <div>
 <p className="text-xs text-slate-500 mb-1">Mix Ratio</p>
 <div className="flex items-center gap-2">
 <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
 <div
 className="h-full bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-full"
 style={{ width: `${selectedCall.codeMixRatio * 100}%` }}
 />
 </div>
 <span className="text-sm font-medium text-slate-900">
 {Math.round(selectedCall.codeMixRatio * 100)}%
 </span>
 </div>
 </div>
 <div>
 <p className="text-xs text-slate-500 mb-1">Languages</p>
 <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded-full font-medium">
 <Languages className="w-3 h-3" />
 {selectedCall.codeMixLanguages}
 </span>
 </div>
 </div>
 </CollapsibleSection>

 {/* Call Metadata */}
 <CollapsibleSection title="Call Metadata" defaultOpen={false}>
 <div className="space-y-2.5">
 <div className="flex items-center justify-between text-sm">
 <span className="text-slate-500 flex items-center gap-1.5">
 {selectedCall.direction === 'inbound' ? (
 <ArrowDownLeft className="w-3.5 h-3.5 text-blue-500" />
 ) : (
 <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
 )}
 Direction
 </span>
 <span className="font-medium text-slate-900 capitalize">{selectedCall.direction}</span>
 </div>
 <div className="flex items-center justify-between text-sm">
 <span className="text-slate-500 flex items-center gap-1.5">
 <Bot className="w-3.5 h-3.5 text-indigo-500" />
 Agent
 </span>
 <span className="font-medium text-slate-900">{selectedCall.agent}</span>
 </div>
 <div className="flex items-center justify-between text-sm">
 <span className="text-slate-500 flex items-center gap-1.5">
 <Megaphone className="w-3.5 h-3.5 text-purple-500" />
 Campaign
 </span>
 <span className="font-medium text-slate-900 text-right text-xs">{selectedCall.campaign}</span>
 </div>
 <div className="flex items-center justify-between text-sm">
 <span className="text-slate-500 flex items-center gap-1.5">
 <Tag className="w-3.5 h-3.5 text-amber-500" />
 Topic
 </span>
 <span className="font-medium text-slate-900">{selectedCall.topic}</span>
 </div>
 <div className="flex items-center justify-between text-sm">
 <span className="text-slate-500 flex items-center gap-1.5">
 <Clock className="w-3.5 h-3.5 text-slate-400" />
 Start Time
 </span>
 <span className="font-medium text-slate-900">{selectedCall.startTime}</span>
 </div>
 <div className="flex items-center justify-between text-sm">
 <span className="text-slate-500 flex items-center gap-1.5">
 <Clock className="w-3.5 h-3.5 text-slate-400" />
 Duration
 </span>
 <span className="font-medium text-slate-900 font-mono">{selectedCall.duration}</span>
 </div>
 </div>
 </CollapsibleSection>
 </div>
 </ResizablePanel>
 )}
 </div>
 </div>
 );
}
