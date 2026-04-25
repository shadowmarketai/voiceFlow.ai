import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
 Search, LayoutGrid, List, Play, Pause, Download, Share2, Trash2,
 FileAudio, Filter, ChevronDown, Clock, HardDrive, User, Loader2, RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';
import DialectBadge from './components/DialectBadge';
import EmotionIndicator from './components/EmotionIndicator';
import GenZBadge from './components/GenZBadge';
import { ttsAPI, voiceAgentAPI, agentsAPI } from '../../services/api';

const DIALECT_TO_LANG = { Kongu: 'ta', Chennai: 'ta', Madurai: 'ta', Tirunelveli: 'ta' };
const LANG_TO_BCP47 = { ta: 'ta-IN', hi: 'hi-IN', en: 'en-IN', te: 'te-IN', kn: 'kn-IN', ml: 'ml-IN' };

/** Browser-native SpeechSynthesis fallback */
function browserSpeak(text, { lang ='en-IN', rate = 1.0, onStart, onEnd } = {}) {
 return new Promise((resolve, reject) => {
 if (!window.speechSynthesis) { reject(new Error('Not supported')); return; }
 window.speechSynthesis.cancel();
 const utter = new SpeechSynthesisUtterance(text);
 utter.lang = lang;
 utter.rate = Math.max(0.1, Math.min(rate, 10));
 const voices = window.speechSynthesis.getVoices();
 const match = voices.find(v => v.lang === lang) || voices.find(v => v.lang.startsWith(lang.split('-')[0]));
 if (match) utter.voice = match;
 utter.onstart = () => onStart?.();
 utter.onend = () => { onEnd?.(); resolve(); };
 utter.onerror = (e) => { onEnd?.(); reject(e); };
 window.speechSynthesis.speak(utter);
 });
}

// ── Mock Data ────────────────────────────────────────────────────────────────
const mockRecordings = [
 {
 id: 'rec-001',
 name: 'Priya Shanmugam - Outbound',
 agent: 'VoiceBot Alpha',
 duration: '4:32',
 durationSec: 272,
 date: '2026-02-23',
 size: '3.2 MB',
 dialect: 'Kongu',
 dialectConfidence: 0.92,
 emotion: 'happy',
 emotionConfidence: 0.88,
 genZScore: 0.3,
 genZTerms: ['vibe check'],
 transcriptPreview: [
'Agent: Vanakkam! This is VoiceBot Alpha from ShadowMarket.',
'Customer: Hi, I was expecting your call. I saw the demo last week.'
 ],
 playing: false,
 progress: 0,
 },
 {
 id: 'rec-002',
 name: 'Karthik Rajan - Inbound Query',
 agent: 'VoiceBot Beta',
 duration: '2:18',
 durationSec: 138,
 date: '2026-02-23',
 size: '1.7 MB',
 dialect: 'Chennai',
 dialectConfidence: 0.87,
 emotion: 'neutral',
 emotionConfidence: 0.72,
 genZScore: 0.0,
 genZTerms: [],
 transcriptPreview: [
'Customer: I need to understand the pricing for the enterprise plan.',
'Agent: Of course! Let me walk you through the tiers.'
 ],
 playing: false,
 progress: 0,
 },
 {
 id: 'rec-003',
 name: 'Meena Devi - Callback Setup',
 agent: 'VoiceBot Alpha',
 duration: '6:45',
 durationSec: 405,
 date: '2026-02-23',
 size: '5.1 MB',
 dialect: 'Madurai',
 dialectConfidence: 0.95,
 emotion: 'happy',
 emotionConfidence: 0.81,
 genZScore: 0.0,
 genZTerms: [],
 transcriptPreview: [
'Agent: Vanakkam Meena! I am calling regarding your interest.',
'Customer: Aama, I filled the form. But I am busy now.'
 ],
 playing: false,
 progress: 0,
 },
 {
 id: 'rec-004',
 name: 'Ananya Krishnan - Demo Booking',
 agent: 'VoiceBot Beta',
 duration: '3:50',
 durationSec: 230,
 date: '2026-02-22',
 size: '2.9 MB',
 dialect: 'Tirunelveli',
 dialectConfidence: 0.89,
 emotion: 'excited',
 emotionConfidence: 0.91,
 genZScore: 0.8,
 genZTerms: ['slay','no cap','bussin'],
 transcriptPreview: [
'Customer: Hey! I saw your reel. The AI voice thing is slay no cap!',
'Agent: Thank you so much! Would you like to see a live demo? '
 ],
 playing: false,
 progress: 0,
 },
 {
 id: 'rec-005',
 name: 'Ravi Kumar - Escalation',
 agent: 'VoiceBot Alpha',
 duration: '5:12',
 durationSec: 312,
 date: '2026-02-22',
 size: '3.9 MB',
 dialect: 'Kongu',
 dialectConfidence: 0.78,
 emotion: 'angry',
 emotionConfidence: 0.85,
 genZScore: 0.1,
 genZTerms: ['bruh'],
 transcriptPreview: [
'Customer: Bruh, I have been waiting for a week for the setup!',
'Agent: I sincerely apologize. Let me connect you with senior support.'
 ],
 playing: false,
 progress: 0,
 },
 {
 id: 'rec-006',
 name: 'Lakshmi Narayanan - Billing',
 agent: 'VoiceBot Gamma',
 duration: '3:20',
 durationSec: 200,
 date: '2026-02-21',
 size: '2.5 MB',
 dialect: 'Madurai',
 dialectConfidence: 0.90,
 emotion: 'happy',
 emotionConfidence: 0.76,
 genZScore: 0.0,
 genZTerms: [],
 transcriptPreview: [
'Agent: Vanakkam! Following up on your support ticket about billing.',
'Customer: Oh yes, the invoice was confusing. Can you explain? '
 ],
 playing: false,
 progress: 0,
 },
 {
 id: 'rec-007',
 name: 'Deepa Venkatesh - Marketing Suite',
 agent: 'VoiceBot Beta',
 duration: '7:15',
 durationSec: 435,
 date: '2026-02-21',
 size: '5.5 MB',
 dialect: 'Tirunelveli',
 dialectConfidence: 0.82,
 emotion: 'happy',
 emotionConfidence: 0.79,
 genZScore: 0.5,
 genZTerms: ['lowkey','bet'],
 transcriptPreview: [
'Agent: Vanakkam Deepa! Reaching out about our new marketing suite.',
'Customer: Lowkey interested. What does it do exactly? '
 ],
 playing: false,
 progress: 0,
 },
 {
 id: 'rec-008',
 name: 'Divya Prakash - Verification Call',
 agent: 'VoiceBot Alpha',
 duration: '4:55',
 durationSec: 295,
 date: '2026-02-20',
 size: '3.7 MB',
 dialect: 'Kongu',
 dialectConfidence: 0.88,
 emotion: 'confused',
 emotionConfidence: 0.68,
 genZScore: 0.6,
 genZTerms: ['sus','fr fr'],
 transcriptPreview: [
'Customer: Hi, your website is kinda sus. Is this legit? Fr fr.',
'Agent: Absolutely! We are a verified company. Let me schedule a call.'
 ],
 playing: false,
 progress: 0,
 },
];

const dialectOptions = ['All','Kongu','Chennai','Madurai','Tirunelveli'];

export default function RecordingsPage() {
 const [viewMode, setViewMode] = useState('grid'); //'grid' |'list'
 const [search, setSearch] = useState('');
 const [dialectFilter, setDialectFilter] = useState('All');
 const [agentFilter, setAgentFilter] = useState('all');
 const [agents, setAgents] = useState([]);
 const [playingId, setPlayingId] = useState(null);
 const [loadingId, setLoadingId] = useState(null);
 const [showFilterDropdown, setShowFilterDropdown] = useState(false);
 const [apiRecordings, setApiRecordings] = useState([]);
 const audioRef = useRef(null);
 const audioCache = useRef({}); // cache generated audio URLs by recording id
 const [audioSrcs, setAudioSrcs] = useState({}); // blob URLs for actual recording audio
 const [refreshCounter, setRefreshCounter] = useState(0);
 const [isRefreshing, setIsRefreshing] = useState(false);

 // Load agents list
 useEffect(() => {
 agentsAPI.list()
   .then(({ data }) => {
     const list = data?.agents || data || [];
     setAgents(Array.isArray(list) ? list : []);
   })
   .catch(() => {});
 }, []);

 // Fetch real recordings from backend
 useEffect(() => {
 let cancelled = false;
 setIsRefreshing(true);
 voiceAgentAPI.listRecordings(undefined, 100)
 .then(({ data }) => {
 if (cancelled || !Array.isArray(data)) return;
 const mapped = data.map(r => ({
 id: `api-${r.id}`,
 apiId: r.id,
 name: r.caller_number ? `${r.caller_number} - Call` : `Recording #${r.id}`,
 agent: r.agent_voice_id || 'AI Agent',
 duration: r.duration_seconds ? `${Math.floor(r.duration_seconds / 60)}:${String(Math.floor(r.duration_seconds % 60)).padStart(2,'0')}` : '0:00',
 durationSec: r.duration_seconds || 0,
 date: r.created_at ? r.created_at.split('T')[0] : '',
 size: r.recording_size_bytes ? `${(r.recording_size_bytes / 1048576).toFixed(1)} MB` : '—',
 dialect: 'Unknown',
 dialectConfidence: 0,
 emotion: r.caller_emotion || 'neutral',
 emotionConfidence: 0.7,
 genZScore: 0,
 genZTerms: [],
 transcriptPreview: r.full_transcript ? [r.full_transcript.slice(0, 100)] : [],
 playing: false,
 progress: 0,
 isApi: true,
 }));
 setApiRecordings(mapped);
 })
 .catch(() => {})
 .finally(() => { if (!cancelled) setIsRefreshing(false); });
 return () => { cancelled = true; };
 }, [refreshCounter]);

 const allRecordings = useMemo(() => [...apiRecordings], [apiRecordings]);

 // ── Filtering ──────────────────────────────────────────────────────────
 const filtered = useMemo(() => {
 let result = [...allRecordings];
 if (search.trim()) {
 const q = search.toLowerCase();
 result = result.filter(
 r => r.name.toLowerCase().includes(q) || r.agent.toLowerCase().includes(q)
 );
 }
 if (dialectFilter !=='All') {
 result = result.filter(r => r.dialect === dialectFilter);
 }
 if (agentFilter !== 'all') {
 result = result.filter(r => r.agent === agentFilter || r.agentId === agentFilter);
 }
 return result;
 }, [search, dialectFilter, agentFilter]);

 const browserSpeakingId = useRef(null);

 // Fetch actual recording audio from backend and return a blob URL.
 // Result is cached in audioSrcs so subsequent plays are instant.
 const loadRecordingAudio = useCallback(async (rec) => {
   if (audioSrcs[rec.id]) return audioSrcs[rec.id];
   const { data: blob } = await voiceAgentAPI.getRecordingAudio(rec.apiId);
   const url = URL.createObjectURL(blob);
   setAudioSrcs(prev => ({ ...prev, [rec.id]: url }));
   return url;
 }, [audioSrcs]);

 // ── Play toggle ────────────────────────────────────────────────────────
 const togglePlay = useCallback(async (rec) => {
 const id = typeof rec === 'string' ? rec : rec.id;
 const recording = allRecordings.find(r => r.id === id);
 if (!recording) return;

 // If currently playing this recording, pause/stop it
 if (playingId === id) {
 if (browserSpeakingId.current === id) {
 window.speechSynthesis?.cancel();
 browserSpeakingId.current = null;
 }
 if (audioRef.current) { audioRef.current.pause(); }
 setPlayingId(null);
 return;
 }

 // Stop any currently playing audio
 window.speechSynthesis?.cancel();
 browserSpeakingId.current = null;
 if (audioRef.current) { audioRef.current.pause(); }

 // Check cache first (from a previous successful API call)
 if (audioCache.current[id]) {
 audioRef.current.src = audioCache.current[id];
 audioRef.current.play().catch(() => {});
 setPlayingId(id);
 return;
 }

 // For API recordings, play the actual stored audio (not TTS re-synthesis)
 if (recording.isApi && recording.apiId) {
   setLoadingId(id);
   try {
     const audioUrl = await loadRecordingAudio(recording);
     if (audioRef.current) {
       audioRef.current.src = audioUrl;
       audioRef.current.play().catch(() => {});
     }
     setPlayingId(id);
     setLoadingId(null);
     return;
   } catch (_audioErr) {
     setLoadingId(null);
     // no real audio stored — fall through to TTS preview
   }
 }

 const text = recording.transcriptPreview.join('');
 const lang = DIALECT_TO_LANG[recording.dialect] || 'ta';

 // Try backend TTS API first
 setLoadingId(id);
 try {
 const { data } = await ttsAPI.synthesize({
 text,
 language: lang,
 dialect: recording.dialect.toLowerCase(),
 emotion: recording.emotion || 'neutral',
 });
 const audioUrl = `data:audio/${data.format || data.audio_format || 'wav'};base64,${data.audio_base64}`;
 audioCache.current[id] = audioUrl;
 if (audioRef.current) {
 audioRef.current.src = audioUrl;
 audioRef.current.play().catch(() => {});
 }
 setPlayingId(id);
 setLoadingId(null);
 return;
 } catch (_apiErr) {
 // API unavailable — fall through to browser TTS
 }

 // Fallback: browser speech synthesis
 try {
 setLoadingId(null);
 setPlayingId(id);
 browserSpeakingId.current = id;
 await browserSpeak(text, {
 lang: LANG_TO_BCP47[lang] || 'en-IN',
 rate: 1.0,
 onStart: () => {},
 onEnd: () => {
 if (browserSpeakingId.current === id) {
 setPlayingId(null);
 browserSpeakingId.current = null;
 }
 },
 });
 } catch (err) {
 toast.error('Playback failed — no TTS engine available');
 setPlayingId(null);
 setLoadingId(null);
 }
 }, [playingId]);

 // ── Actions ────────────────────────────────────────────────────────────
 const handleDownload = (rec) => toast.success(`Downloading"${rec.name}"...`);
 const handleShare = (rec) => toast.success(`Sharing"${rec.name}"...`);
 const handleDelete = (rec) => toast.success(`Deleting"${rec.name}"...`);

 // ── Grid Card Component ────────────────────────────────────────────────
 const RecordingCard = ({ rec }) => {
 const isPlaying = playingId === rec.id;
 return (
 <div className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-lg hover:border-indigo-300 transition-all group">
 {/* Card header */}
 <div className="px-4 pt-4 pb-3">
 <div className="flex items-start gap-3">
 <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
 <FileAudio className="w-5 h-5 text-indigo-600" />
 </div>
 <div className="flex-1 min-w-0">
 <p className="font-medium text-sm text-slate-900 truncate" title={rec.name}>
 {rec.name}
 </p>
 <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
 <User className="w-3 h-3" />
 {rec.agent}
 </p>
 </div>
 </div>

 {/* Meta row */}
 <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
 <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{rec.duration}</span>
 <span>{rec.date}</span>
 <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" />{rec.size}</span>
 </div>

 {/* Badges */}
 <div className="flex items-center gap-1.5 mt-3 flex-wrap">
 <DialectBadge dialect={rec.dialect} confidence={rec.dialectConfidence} />
 <EmotionIndicator emotion={rec.emotion} confidence={rec.emotionConfidence} showBar={false} />
 {rec.genZScore > 0 && <GenZBadge score={rec.genZScore} terms={rec.genZTerms} />}
 </div>

 {/* Transcript preview */}
 <div className="mt-3 space-y-1">
 {rec.transcriptPreview.map((line, i) => (
 <p key={i} className="text-xs text-slate-500 truncate" title={line}>
 {line}
 </p>
 ))}
 </div>
 </div>

 {/* Audio player placeholder */}
 <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
 <div className="flex items-center gap-3">
 <button
 onClick={() => togglePlay(rec.id)}
 disabled={loadingId === rec.id}
 className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
 isPlaying
 ? 'bg-indigo-600 text-white'
 : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
 } disabled:opacity-50`}
 >
 {loadingId === rec.id ? <Loader2 className="w-4 h-4 animate-spin" /> : isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
 </button>
 <div className="flex-1">
 <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
 <div
 className="h-full bg-indigo-500 rounded-full transition-all"
 style={{ width: isPlaying ? '35%' : '0%' }}
 />
 </div>
 </div>
 <span className="text-xs text-slate-400 font-mono tabular-nums whitespace-nowrap">
 {isPlaying ? '1:35' : '0:00'} / {rec.duration}
 </span>
 </div>
 </div>

 {/* Native audio player — shown once the recording blob is fetched */}
 {rec.isApi && audioSrcs[rec.id] && (
 <div className="px-4 pb-2">
   <audio
     src={audioSrcs[rec.id]}
     controls
     className="w-full h-8"
     onPlay={() => setPlayingId(rec.id)}
     onPause={() => setPlayingId(null)}
     onEnded={() => setPlayingId(null)}
   />
 </div>
 )}

 {/* Action buttons */}
 <div className="flex border-t border-slate-100 divide-x divide-slate-100">
 <button
 onClick={() => togglePlay(rec.id)}
 disabled={loadingId === rec.id}
 className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
 >
 {loadingId === rec.id ? (
 <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading</>
 ) : playingId === rec.id ? (
 <><Pause className="w-3.5 h-3.5" /> Pause</>
 ) : (
 <><Play className="w-3.5 h-3.5" /> Play</>
 )}
 </button>
 <button
 onClick={() => handleDownload(rec)}
 className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
 >
 <Download className="w-3.5 h-3.5" />
 Download
 </button>
 <button
 onClick={() => handleShare(rec)}
 className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
 >
 <Share2 className="w-3.5 h-3.5" />
 Share
 </button>
 <button
 onClick={() => handleDelete(rec)}
 className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"
 >
 <Trash2 className="w-3.5 h-3.5" />
 Delete
 </button>
 </div>
 </div>
 );
 };

 // ── Render ─────────────────────────────────────────────────────────────
 return (
 <div className="flex flex-col h-full">
 {/* Header */}
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-white">
 <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
 <FileAudio className="w-5 h-5 text-indigo-500" />
 Recordings
 </h1>

 <div className="flex items-center gap-2 flex-wrap">
 {/* Search */}
 <div className="relative">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
 <input
 type="text"
 placeholder="Search by name, agent..."
 value={search}
 onChange={e => setSearch(e.target.value)}
 className="pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-56"
 />
 </div>

 {/* Agent filter */}
 <select
 value={agentFilter}
 onChange={e => setAgentFilter(e.target.value)}
 className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none cursor-pointer"
 >
 <option value="all">All Agents</option>
 {agents.map(a => (
 <option key={a.id} value={a.name}>{a.name}</option>
 ))}
 </select>

 {/* Dialect filter */}
 <div className="relative">
 <button
 onClick={() => setShowFilterDropdown(!showFilterDropdown)}
 className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
 >
 <Filter className="w-4 h-4" />
 {dialectFilter ==='All' ? 'Dialect' : dialectFilter}
 <ChevronDown className="w-3.5 h-3.5" />
 </button>
 {showFilterDropdown && (
 <>
 <div className="fixed inset-0 z-10" onClick={() => setShowFilterDropdown(false)} />
 <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[140px]">
 {dialectOptions.map(option => (
 <button
 key={option}
 onClick={() => { setDialectFilter(option); setShowFilterDropdown(false); }}
 className={`w-full text-left px-3 py-2 text-sm transition-colors ${
 dialectFilter === option
 ? 'bg-indigo-50 text-indigo-700 font-medium'
 : 'text-slate-700 hover:bg-slate-50'
 }`}
 >
 {option}
 </button>
 ))}
 </div>
 </>
 )}
 </div>

 {/* Refresh */}
 <button
   onClick={() => setRefreshCounter(c => c + 1)}
   disabled={isRefreshing}
   className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
   title="Refresh recordings"
 >
   <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
 </button>

 {/* View toggle */}
 <div className="flex rounded-lg border border-slate-200 overflow-hidden">
 <button
 onClick={() => setViewMode('grid')}
 className={`px-3 py-2 text-sm font-medium transition-colors ${
 viewMode === 'grid'
 ? 'bg-indigo-600 text-white'
 : 'text-slate-600 hover:bg-slate-50'
 }`}
 >
 <LayoutGrid className="w-4 h-4" />
 </button>
 <button
 onClick={() => setViewMode('list')}
 className={`px-3 py-2 text-sm font-medium transition-colors ${
 viewMode === 'list'
 ? 'bg-indigo-600 text-white'
 : 'text-slate-600 hover:bg-slate-50'
 }`}
 >
 <List className="w-4 h-4" />
 </button>
 </div>
 </div>
 </div>

 {/* Content */}
 <div className="flex-1 overflow-y-auto px-6 py-4">
 {filtered.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-20 text-slate-400">
 <FileAudio className="w-12 h-12 mb-3 opacity-40" />
 <p className="text-sm">No recordings found matching your filters.</p>
 </div>
 ) : viewMode === 'grid' ? (
 /* ── Grid View ──────────────────────────────────────────── */
 <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
 {filtered.map(rec => (
 <RecordingCard key={rec.id} rec={rec} />
 ))}
 </div>
 ) : (
 /* ── List View ──────────────────────────────────────────── */
 <div className="overflow-x-auto rounded-xl border border-slate-200">
 <table className="w-full text-sm">
 <thead>
 <tr className="bg-slate-50 text-left">
 {['Name','Agent','Duration','Dialect','Emotion','GenZ','Date','Size','Actions'].map(col => (
 <th
 key={col}
 className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap"
 >
 {col}
 </th>
 ))}
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-100">
 {filtered.map(rec => {
 const isPlaying = playingId === rec.id;
 return (
 <tr key={rec.id} className="hover:bg-slate-50 transition-colors">
 {/* Name */}
 <td className="px-4 py-3">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
 <FileAudio className="w-4 h-4 text-indigo-600" />
 </div>
 <span className="font-medium text-slate-900 truncate max-w-[180px]" title={rec.name}>
 {rec.name}
 </span>
 </div>
 </td>

 {/* Agent */}
 <td className="px-4 py-3 text-slate-600">{rec.agent}</td>

 {/* Duration */}
 <td className="px-4 py-3 text-slate-600 font-mono">{rec.duration}</td>

 {/* Dialect */}
 <td className="px-4 py-3">
 <DialectBadge dialect={rec.dialect} confidence={rec.dialectConfidence} />
 </td>

 {/* Emotion */}
 <td className="px-4 py-3">
 <EmotionIndicator emotion={rec.emotion} confidence={rec.emotionConfidence} showBar={false} />
 </td>

 {/* GenZ */}
 <td className="px-4 py-3">
 {rec.genZScore > 0
 ? <GenZBadge score={rec.genZScore} terms={rec.genZTerms} />
 : <span className="text-xs text-slate-400">--</span>
 }
 </td>

 {/* Date */}
 <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{rec.date}</td>

 {/* Size */}
 <td className="px-4 py-3 text-slate-500">{rec.size}</td>

 {/* Actions */}
 <td className="px-4 py-3">
 <div className="flex items-center gap-1">
 <button
 onClick={() => togglePlay(rec.id)}
 disabled={loadingId === rec.id}
 className={`p-1.5 rounded-lg transition-colors ${
 isPlaying
 ? 'bg-indigo-600 text-white'
 : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
 } disabled:opacity-50`}
 title={loadingId === rec.id ? 'Loading...' : isPlaying ? 'Pause' : 'Play'}
 >
 {loadingId === rec.id ? <Loader2 className="w-4 h-4 animate-spin" /> : isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
 </button>
 <button
 onClick={() => handleDownload(rec)}
 className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
 title="Download"
 >
 <Download className="w-4 h-4" />
 </button>
 <button
 onClick={() => handleShare(rec)}
 className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
 title="Share"
 >
 <Share2 className="w-4 h-4" />
 </button>
 <button
 onClick={() => handleDelete(rec)}
 className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
 title="Delete"
 >
 <Trash2 className="w-4 h-4" />
 </button>
 </div>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 )}
 </div>

 {/* Hidden audio element */}
 <audio ref={audioRef} onEnded={() => setPlayingId(null)} className="hidden" />

 {/* Footer summary */}
 <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-white">
 <p className="text-sm text-slate-500">
 Showing <span className="font-medium text-slate-700">{filtered.length}</span> recording{filtered.length !== 1 ? 's' : ''}
 {dialectFilter !=='All' && (
 <span> filtered by <span className="font-medium text-slate-700">{dialectFilter}</span></span>
 )}
 </p>
 <p className="text-sm text-slate-500">
 Total size: <span className="font-medium text-slate-700">
 {(filtered.reduce((sum, r) => sum + (parseFloat(r.size) || 0), 0)).toFixed(1)} MB
 </span>
 </p>
 </div>
 </div>
 );
}
