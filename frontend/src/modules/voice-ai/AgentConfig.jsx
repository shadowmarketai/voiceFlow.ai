/**
 * Agent Config - View agent providers, settings, and connection status
 */

import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
 Settings, Wifi, WifiOff, Mic, Brain, Volume2, Phone,
 RefreshCw, CheckCircle, XCircle, Loader2, Server
} from 'lucide-react';

const PROVIDERS = {
 stt: [
 { id: 'deepgram', name: 'Deepgram', tag: 'Fast' },
 { id: 'whisper', name: 'OpenAI Whisper', tag: 'Accurate' },
 { id: 'sarvam', name: 'Sarvam Saaras', tag: 'Indian Languages' },
 { id: 'google', name: 'Google STT', tag: '' },
 ],
 llm: [
 { id: 'groq', name: 'Groq (Llama)', tag: 'Ultra Fast' },
 { id: 'anthropic', name: 'Claude', tag: 'High Quality' },
 { id: 'openai', name: 'OpenAI GPT', tag: '' },
 { id: 'sarvam', name: 'Sarvam-M', tag: 'FREE, Indian' },
 ],
 tts: [
 { id: 'indicf5', name: 'IndicF5', tag: 'Indian Voices' },
 { id: 'edge-tts', name: 'Edge TTS', tag: 'Fallback' },
 { id: 'deepgram', name: 'Deepgram TTS', tag: '' },
 { id: 'elevenlabs', name: 'ElevenLabs', tag: 'Premium' },
 ],
 transport: [
 { id: 'piopiy', name: 'PIOPIY (TeleCMI)', tag: 'India' },
 { id: 'livekit', name: 'LiveKit', tag: 'WebRTC' },
 ],
};

export default function AgentConfigPage() {
 const [backendStatus, setBackendStatus] = useState('checking'); // checking, online, offline
 const [agentStatus, setAgentStatus] = useState('checking');

 useEffect(() => {
 checkStatus();
 }, []);

 const checkStatus = async () => {
 setBackendStatus('checking');
 setAgentStatus('checking');

 // Check main backend
 try {
 const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
 const resp = await fetch(`${baseUrl}/api/v1/health`, { signal: AbortSignal.timeout(5000) });
 setBackendStatus(resp.ok ? 'online' : 'offline');
 } catch {
 setBackendStatus('offline');
 }

 // Check voice agent (port 8001)
 try {
 const resp = await fetch('http://localhost:8001/api/v1/agent/voices', { signal: AbortSignal.timeout(5000) });
 setAgentStatus(resp.ok ? 'online' : 'offline');
 } catch {
 setAgentStatus('offline');
 }
 };

 const StatusBadge = ({ status }) => {
 if (status === 'checking') return <Loader2 className="w-4 h-4 animate-spin text-slate-400" />;
 if (status === 'online') return <div className="flex items-center gap-1.5 text-emerald-600"><CheckCircle className="w-4 h-4" /><span className="text-xs font-medium">Online</span></div>;
 return <div className="flex items-center gap-1.5 text-red-500"><XCircle className="w-4 h-4" /><span className="text-xs font-medium">Offline</span></div>;
 };

 const ProviderSection = ({ title, icon: Icon, iconColor, providers }) => (
 <div className="bg-white rounded-xl border border-slate-200 p-5">
 <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
 <Icon className={`w-5 h-5 ${iconColor}`} /> {title}
 </h3>
 <div className="space-y-2">
 {providers.map((p, i) => (
 <div
 key={p.id}
 className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
 i === 0
 ? 'border-indigo-200 bg-indigo-50'
 : 'border-slate-100 bg-slate-50'
 }`}
 >
 <div className="flex items-center gap-2">
 {i === 0 && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
 <span className={`text-sm ${i === 0 ? 'font-medium text-slate-900' : 'text-slate-600'}`}>
 {p.name}
 </span>
 </div>
 {p.tag && (
 <span className={`text-xs px-2 py-0.5 rounded-full ${
 i === 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-500'
 }`}>
 {p.tag}
 </span>
 )}
 </div>
 ))}
 </div>
 </div>
 );

 return (
 <div className="space-y-6">
 {/* Header */}
 <div className="flex items-center justify-between">
 <div>
 <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
 <Settings className="w-6 h-6 text-indigo-500" />
 Agent Configuration
 </h1>
 <p className="text-sm text-slate-500 mt-1">Voice agent providers, settings, and connection status</p>
 </div>
 <button
 onClick={() => { checkStatus(); toast.success('Refreshing status...'); }}
 className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
 >
 <RefreshCw className="w-4 h-4" /> Refresh
 </button>
 </div>

 {/* Connection Status */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div className="bg-white rounded-xl border border-slate-200 p-5">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
 <Server className="w-5 h-5 text-blue-600" />
 </div>
 <div>
 <h3 className="font-medium text-slate-900">Main Backend</h3>
 <p className="text-xs text-slate-500">API Server (port 8000)</p>
 </div>
 </div>
 <StatusBadge status={backendStatus} />
 </div>
 </div>
 <div className="bg-white rounded-xl border border-slate-200 p-5">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
 <Phone className="w-5 h-5 text-purple-600" />
 </div>
 <div>
 <h3 className="font-medium text-slate-900">Voice Agent</h3>
 <p className="text-xs text-slate-500">Real-time call handler (port 8001)</p>
 </div>
 </div>
 <StatusBadge status={agentStatus} />
 </div>
 </div>
 </div>

 {/* Provider Grid */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <ProviderSection title="Speech-to-Text (STT)" icon={Mic} iconColor="text-blue-500" providers={PROVIDERS.stt} />
 <ProviderSection title="Language Model (LLM)" icon={Brain} iconColor="text-purple-500" providers={PROVIDERS.llm} />
 <ProviderSection title="Text-to-Speech (TTS)" icon={Volume2} iconColor="text-emerald-500" providers={PROVIDERS.tts} />
 <ProviderSection title="Transport / Telephony" icon={Phone} iconColor="text-amber-500" providers={PROVIDERS.transport} />
 </div>

 {/* Agent Settings Info */}
 <div className="bg-white rounded-xl border border-slate-200 p-5">
 <h3 className="font-semibold text-slate-900 mb-3">Configuration Notes</h3>
 <div className="space-y-2 text-sm text-slate-600">
 <p>Provider selection is controlled via environment variables in the voice agent container.</p>
 <p>Set <code className="px-1.5 py-0.5 bg-slate-100 rounded text-xs font-mono">STT_PROVIDER</code>, <code className="px-1.5 py-0.5 bg-slate-100 rounded text-xs font-mono">LLM_PROVIDER</code>, <code className="px-1.5 py-0.5 bg-slate-100 rounded text-xs font-mono">TTS_PROVIDER</code> in your <code className="px-1.5 py-0.5 bg-slate-100 rounded text-xs font-mono">.env</code> file.</p>
 <p>The first provider in each section (highlighted) is the current default.</p>
 </div>
 </div>
 </div>
 );
}
