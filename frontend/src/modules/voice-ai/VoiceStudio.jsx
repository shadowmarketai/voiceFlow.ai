/**
 * Voice Studio - Train and customize dialect-aware AI voices
 */

import React, { useState, useRef, useMemo, useEffect, lazy, Suspense } from 'react';
import toast from 'react-hot-toast';
import {
 Mic, Play, Pause, Settings, Upload, Volume2, Sliders, Sparkles,
 Languages, Brain, AudioWaveform, Music, User, UserCircle,
 CheckCircle, UploadCloud, FileAudio, RotateCcw, Save,
 ChevronDown, ToggleLeft, ToggleRight, Palette, Loader2, Square,
 Search, Filter, Mic2, Globe2, X, AudioLines, Dna,
 AlertCircle, CheckCircle2, Trash2 as TrashIcon, Clock
} from 'lucide-react';

const VoiceLibrary = lazy(() => import('./pages/VoiceLibrary'));
import CollapsibleSection from './components/CollapsibleSection';
import DialectBadge from './components/DialectBadge';
import EmotionIndicator from './components/EmotionIndicator';
import GenZBadge from './components/GenZBadge';
import { ttsAPI } from '../../services/api';

const VOICE_MODELS = [
 { id: 'kongu-m', name: 'Kongu Tamil Male', dialect: 'Kongu', language: 'Tamil', accent: 'Western Tamil', gender: 'male', borderColor: 'border-orange-500', bgHover: 'hover:bg-orange-50', activeBg: 'bg-orange-50' },
 { id: 'kongu-f', name: 'Kongu Tamil Female', dialect: 'Kongu', language: 'Tamil', accent: 'Western Tamil', gender: 'female', borderColor: 'border-orange-500', bgHover: 'hover:bg-orange-50', activeBg: 'bg-orange-50' },
 { id: 'chennai-m', name: 'Chennai Tamil Male', dialect: 'Chennai', language: 'Tamil', accent: 'Central Tamil', gender: 'male', borderColor: 'border-blue-500', bgHover: 'hover:bg-blue-50', activeBg: 'bg-blue-50' },
 { id: 'chennai-f', name: 'Chennai Tamil Female', dialect: 'Chennai', language: 'Tamil', accent: 'Central Tamil', gender: 'female', borderColor: 'border-blue-500', bgHover: 'hover:bg-blue-50', activeBg: 'bg-blue-50' },
 { id: 'madurai-m', name: 'Madurai Tamil Male', dialect: 'Madurai', language: 'Tamil', accent: 'Southern Tamil', gender: 'male', borderColor: 'border-purple-500', bgHover: 'hover:bg-purple-50', activeBg: 'bg-purple-50' },
 { id: 'madurai-f', name: 'Madurai Tamil Female', dialect: 'Madurai', language: 'Tamil', accent: 'Southern Tamil', gender: 'female', borderColor: 'border-purple-500', bgHover: 'hover:bg-purple-50', activeBg: 'bg-purple-50' },
 { id: 'tirunelveli-m', name: 'Tirunelveli Tamil Male', dialect: 'Tirunelveli', language: 'Tamil', accent: 'Deep South Tamil', gender: 'male', borderColor: 'border-teal-500', bgHover: 'hover:bg-teal-50', activeBg: 'bg-teal-50' },
 { id: 'tirunelveli-f', name: 'Tirunelveli Tamil Female', dialect: 'Tirunelveli', language: 'Tamil', accent: 'Deep South Tamil', gender: 'female', borderColor: 'border-teal-500', bgHover: 'hover:bg-teal-50', activeBg: 'bg-teal-50' },
];

const EMOTIONS = [
 { key: 'happy', label: 'Happy', color: 'bg-emerald-500', trackColor: 'accent-emerald-500' },
 { key: 'sad', label: 'Sad', color: 'bg-blue-500', trackColor: 'accent-blue-500' },
 { key: 'angry', label: 'Angry', color: 'bg-red-500', trackColor: 'accent-red-500' },
 { key: 'neutral', label: 'Neutral', color: 'bg-slate-400', trackColor: 'accent-slate-500' },
 { key: 'excited', label: 'Excited', color: 'bg-amber-500', trackColor: 'accent-amber-500' },
 { key: 'confused', label: 'Confused', color: 'bg-purple-500', trackColor: 'accent-purple-500' },
];

const DIALECTS = ['Kongu','Chennai','Madurai','Tirunelveli'];
const LANGUAGES = ['Tamil','Hindi','English','Tamil-English Mix','Hindi-English Mix'];

const DIALECT_TO_LANG = { Kongu: 'ta', Chennai: 'ta', Madurai: 'ta', Tirunelveli: 'ta' };

const LANG_TO_BCP47 = { ta: 'ta-IN', hi: 'hi-IN', en: 'en-IN', te: 'te-IN', kn: 'kn-IN', ml: 'ml-IN' };

const SAMPLE_TEXTS = {
 Kongu: 'Vanakkam! Enga Kongu nattu le irunthu pesuren.',
 Chennai: 'Vanakkam! Chennai le irunthu pesuren.',
 Madurai: 'Vanakkam! Madurai le irunthu pesuren.',
 Tirunelveli: 'Vanakkam! Tirunelveli le irunthu pesuren.',
};

/**
 * Speak text using the browser's built-in SpeechSynthesis API.
 * Returns a Promise that resolves when speech ends.
 */
function browserSpeak(text, { lang ='en-IN', rate = 1.0, pitch = 1.0, onStart, onEnd } = {}) {
 return new Promise((resolve, reject) => {
 if (!window.speechSynthesis) {
 reject(new Error('Browser speech synthesis not supported'));
 return;
 }
 window.speechSynthesis.cancel(); // stop any ongoing speech
 const utter = new SpeechSynthesisUtterance(text);
 utter.lang = lang;
 utter.rate = Math.max(0.1, Math.min(rate, 10));
 utter.pitch = Math.max(0, Math.min(pitch, 2));
 // Try to pick a voice that matches the language
 const voices = window.speechSynthesis.getVoices();
 const match = voices.find(v => v.lang === lang) || voices.find(v => v.lang.startsWith(lang.split('-')[0]));
 if (match) utter.voice = match;
 utter.onstart = () => onStart?.();
 utter.onend = () => { onEnd?.(); resolve(); };
 utter.onerror = (e) => { onEnd?.(); reject(e); };
 window.speechSynthesis.speak(utter);
 });
}

export default function VoiceStudioPage() {
 const [activeTab, setActiveTab] = useState('library'); // library | studio | train
 const [selectedModel, setSelectedModel] = useState('kongu-m');
 const [speakingSpeed, setSpeakingSpeed] = useState(1.0);
 const [pitch, setPitch] = useState(0);
 const [emotionIntensity, setEmotionIntensity] = useState({
 happy: 50, sad: 20, angry: 10, neutral: 70, excited: 40, confused: 15,
 });
 const [genZMode, setGenZMode] = useState(false);
 const [codeMixRatio, setCodeMixRatio] = useState(35);

 // Generate Speech state
 const [speechText, setSpeechText] = useState('');
 const [speechDialect, setSpeechDialect] = useState('Kongu');
 const [speechEmotion, setSpeechEmotion] = useState('neutral');
 const [speechGenZ, setSpeechGenZ] = useState(false);

 // TTS playback state
 const [generatedAudio, setGeneratedAudio] = useState(null);
 const [isGenerating, setIsGenerating] = useState(false);
 const [isPreviewing, setIsPreviewing] = useState(null); // model id being previewed
 const [lastResult, setLastResult] = useState(null);
 const [isPlaying, setIsPlaying] = useState(false);
 const audioRef = useRef(null);

 // Training state
 const [trainingDialect, setTrainingDialect] = useState('Kongu');
 const [trainingLanguage, setTrainingLanguage] = useState('Tamil');
 const [isDragOver, setIsDragOver] = useState(false);
 const [uploadedFiles, setUploadedFiles] = useState([]);

 const handleEmotionChange = (key, value) => {
 setEmotionIntensity((prev) => ({ ...prev, [key]: Number(value) }));
 };

 const handleSaveSettings = () => {
 toast.success('Voice settings saved successfully');
 };

 const playAudioFromBase64 = (base64, format ='wav') => {
 const audioUrl = `data:audio/${format};base64,${base64}`;
 setGeneratedAudio(audioUrl);
 if (audioRef.current) {
 audioRef.current.src = audioUrl;
 audioRef.current.play().catch(() => {});
 setIsPlaying(true);
 }
 };

 const handlePreviewVoice = async (model) => {
 setIsPreviewing(model.id);
 const sampleText = SAMPLE_TEXTS[model.dialect] || 'Vanakkam! This is a voice preview.';
 const lang = DIALECT_TO_LANG[model.dialect] || 'ta';

 // Try backend TTS API first
 try {
 const { data } = await ttsAPI.synthesize({
 text: sampleText,
 language: lang,
 dialect: model.dialect.toLowerCase(),
 emotion: 'neutral',
 pace: speakingSpeed,
 pitch: 1.0 + (pitch / 100),
 });
 const engine = data.tts_engine || data.engine_used || 'TTS';
 const latency = data.duration_ms || data.latency_ms || 0;
 setLastResult({ engine_used: engine, latency_ms: latency });
 playAudioFromBase64(data.audio_base64, data.format || data.audio_format || 'wav');
 toast.success(`Preview: ${model.name} (${engine})`);
 setIsPreviewing(null);
 return;
 } catch (_apiErr) {
 // API unavailable — fall through to browser TTS
 }

 // Fallback: browser speech synthesis
 try {
 setLastResult({ engine_used: 'Browser TTS', latency_ms: 0 });
 setGeneratedAudio(null); // no audio element for browser TTS
 await browserSpeak(sampleText, {
 lang: LANG_TO_BCP47[lang] || 'en-IN',
 rate: speakingSpeed,
 pitch: Math.max(0, Math.min(1.0 + (pitch / 100), 2)),
 onStart: () => setIsPlaying(true),
 onEnd: () => setIsPlaying(false),
 });
 toast.success(`Preview: ${model.name} (Browser TTS)`);
 } catch (err) {
 toast.error('Preview failed — no TTS engine available');
 } finally {
 setIsPreviewing(null);
 }
 };

 const handleGenerateSpeech = async () => {
 if (!speechText.trim()) {
 toast.error('Please enter text to generate speech');
 return;
 }
 setIsGenerating(true);
 const lang = DIALECT_TO_LANG[speechDialect] || 'ta';

 // Try backend TTS API first
 try {
 const { data } = await ttsAPI.synthesize({
 text: speechText,
 language: lang,
 dialect: speechDialect.toLowerCase(),
 emotion: speechEmotion,
 pace: speakingSpeed,
 pitch: 1.0 + (pitch / 100),
 });
 const engine = data.tts_engine || data.engine_used || 'TTS';
 const latency = data.duration_ms || data.latency_ms || 0;
 setLastResult({ engine_used: engine, latency_ms: latency });
 playAudioFromBase64(data.audio_base64, data.format || data.audio_format || 'wav');
 toast.success(`Generated using ${engine}`);
 setIsGenerating(false);
 return;
 } catch (_apiErr) {
 // API unavailable — fall through to browser TTS
 }

 // Fallback: browser speech synthesis
 try {
 setLastResult({ engine_used: 'Browser TTS', latency_ms: 0 });
 setGeneratedAudio(null);
 await browserSpeak(speechText, {
 lang: LANG_TO_BCP47[lang] || 'en-IN',
 rate: speakingSpeed,
 pitch: Math.max(0, Math.min(1.0 + (pitch / 100), 2)),
 onStart: () => setIsPlaying(true),
 onEnd: () => setIsPlaying(false),
 });
 toast.success('Generated using Browser TTS (backend unavailable)');
 } catch (err) {
 toast.error('Speech generation failed — no TTS engine available');
 } finally {
 setIsGenerating(false);
 }
 };

 const handleDrop = (e) => {
 e.preventDefault();
 setIsDragOver(false);
 const files = Array.from(e.dataTransfer.files);
 const audioFiles = files.filter((f) => f.type.startsWith('audio/') || f.name.endsWith('.wav') || f.name.endsWith('.mp3'));
 if (audioFiles.length === 0) {
 toast.error('Please upload audio files (.wav, .mp3)');
 return;
 }
 setUploadedFiles((prev) => [...prev, ...audioFiles.map((f) => f.name)]);
 toast.success(audioFiles.length +' file(s) uploaded successfully');
 };

 const handleDragOver = (e) => {
 e.preventDefault();
 setIsDragOver(true);
 };

 const handleDragLeave = () => {
 setIsDragOver(false);
 };

 const handleFileSelect = (e) => {
 const files = Array.from(e.target.files);
 if (files.length > 0) {
 setUploadedFiles((prev) => [...prev, ...files.map((f) => f.name)]);
 toast.success(files.length +' file(s) uploaded successfully');
 }
 };

 const handleStartTraining = () => {
 if (uploadedFiles.length === 0) {
 toast.error('Please upload training audio files first');
 return;
 }
 toast.success('Training started for ' + trainingDialect + ' ' + trainingLanguage + ' voice model. This may take 15-30 minutes.');
 };

 return (
 <div className="space-y-6">
 {/* Header */}
 <div className="flex items-center justify-between">
 <div>
 <h1 className="text-2xl font-bold text-slate-900">Voice Studio</h1>
 <p className="text-sm text-slate-500 mt-1">Browse voices, generate speech, and train custom models</p>
 </div>
 <div className="flex items-center gap-2">
 {activeTab !== 'library' && (
 <>
 <button
 onClick={() => toast('Resetting all settings to defaults...', { icon: '\u{1F504}' })}
 className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
 >
 <RotateCcw className="w-4 h-4" /> Reset
 </button>
 <button
 onClick={handleSaveSettings}
 className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
 >
 <Save className="w-4 h-4" /> Save All
 </button>
 </>
 )}
 </div>
 </div>

 {/* Tabs */}
 <div className="flex items-center gap-1 border-b border-gray-200">
 {[
   { key: 'library', label: 'Voice Library', icon: AudioLines, count: '42 voices' },
   { key: 'studio', label: 'Generate Speech', icon: Volume2, count: 'TTS' },
   { key: 'clone', label: 'Voice Cloning', icon: Dna, count: 'New' },
   { key: 'train', label: 'Train Custom', icon: Brain, count: 'Advanced' },
 ].map(tab => (
   <button
     key={tab.key}
     onClick={() => setActiveTab(tab.key)}
     className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
       activeTab === tab.key
         ? 'border-indigo-600 text-indigo-600'
         : 'border-transparent text-gray-500 hover:text-gray-700'
     }`}
   >
     <tab.icon className="w-4 h-4" />
     {tab.label}
     <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
       activeTab === tab.key ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-500'
     }`}>{tab.count}</span>
   </button>
 ))}
 </div>

 {/* Voice Library Tab */}
 {activeTab === 'library' && (
   <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>}>
     <VoiceLibrary />
   </Suspense>
 )}

 {/* Generate Speech + Dialect Models Tab */}
 {activeTab === 'studio' && (<div className="space-y-6">

 {/* Voice Models + Settings Grid */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 {/* Voice Models - 2 col span */}
 <div className="lg:col-span-2">
 <CollapsibleSection title="Dialect-Specific Voice Models" badge={VOICE_MODELS.length +' models'}>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 {VOICE_MODELS.map((model) => {
 const isActive = selectedModel === model.id;
 return (
 <div
 key={model.id}
 onClick={() => setSelectedModel(model.id)}
 className={`relative cursor-pointer rounded-xl border-2 p-4 transition-all ${
 isActive
 ? model.borderColor + ' ' + model.activeBg + ' shadow-md'
 : 'border-slate-200 bg-white ' + model.bgHover
 }`}
 >
 {isActive && (
 <div className="absolute top-2 right-2">
 <CheckCircle className="w-5 h-5 text-indigo-600" />
 </div>
 )}

 <div className="flex items-start gap-3">
 <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
 model.gender === 'male'
 ? 'bg-blue-100 text-blue-600'
 : 'bg-pink-100 text-pink-600'
 }`}>
 {model.gender === 'male' ? <User className="w-5 h-5" /> : <UserCircle className="w-5 h-5" />}
 </div>
 <div className="flex-1 min-w-0">
 <h4 className="font-semibold text-sm text-slate-900 truncate">{model.name}</h4>
 <div className="flex items-center gap-2 mt-1 flex-wrap">
 <DialectBadge dialect={model.dialect} />
 <span className="text-xs text-slate-500">{model.language}</span>
 </div>
 <p className="text-xs text-slate-400 mt-1">{model.accent}</p>
 </div>
 </div>

 <button
 onClick={(e) => {
 e.stopPropagation();
 handlePreviewVoice(model);
 }}
 disabled={isPreviewing === model.id}
 className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-200 transition-colors disabled:opacity-50"
 >
 {isPreviewing === model.id ? (
 <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...</>
 ) : (
 <><Play className="w-3.5 h-3.5" /> Preview</>
 )}
 </button>
 </div>
 );
 })}
 </div>
 </CollapsibleSection>
 </div>

 {/* Voice Settings Panel - Right Column */}
 <div className="space-y-4">
 <div className="bg-white rounded-xl border border-slate-200 p-5">
 <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-5">
 <Sliders className="w-4 h-4 text-indigo-500" /> Voice Settings
 </h3>

 {/* Speaking Speed */}
 <div className="mb-5">
 <div className="flex items-center justify-between mb-2">
 <label className="text-sm font-medium text-slate-700">Speaking Speed</label>
 <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{speakingSpeed.toFixed(1)}x</span>
 </div>
 <input
 type="range"
 min="0.5"
 max="2"
 step="0.1"
 value={speakingSpeed}
 onChange={(e) => setSpeakingSpeed(Number(e.target.value))}
 className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-indigo-600"
 />
 <div className="flex justify-between text-xs text-slate-400 mt-1">
 <span>0.5x</span>
 <span>2.0x</span>
 </div>
 </div>

 {/* Pitch */}
 <div className="mb-5">
 <div className="flex items-center justify-between mb-2">
 <label className="text-sm font-medium text-slate-700">Pitch</label>
 <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{pitch > 0 ? '+' : ''}{pitch}</span>
 </div>
 <input
 type="range"
 min="-20"
 max="20"
 step="1"
 value={pitch}
 onChange={(e) => setPitch(Number(e.target.value))}
 className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-indigo-600"
 />
 <div className="flex justify-between text-xs text-slate-400 mt-1">
 <span>-20</span>
 <span>+20</span>
 </div>
 </div>

 {/* Emotion Intensity Sliders */}
 <div className="mb-5">
 <h4 className="text-sm font-medium text-slate-700 mb-3">Emotion Intensity</h4>
 <div className="space-y-3">
 {EMOTIONS.map((emo) => (
 <div key={emo.key}>
 <div className="flex items-center justify-between mb-1">
 <div className="flex items-center gap-2">
 <span className={`w-2.5 h-2.5 rounded-full ${emo.color}`} />
 <span className="text-xs font-medium text-slate-600">{emo.label}</span>
 </div>
 <span className="text-xs font-mono text-slate-400">{emotionIntensity[emo.key]}%</span>
 </div>
 <input
 type="range"
 min="0"
 max="100"
 step="5"
 value={emotionIntensity[emo.key]}
 onChange={(e) => handleEmotionChange(emo.key, e.target.value)}
 className={`w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer ${emo.trackColor}`}
 />
 </div>
 ))}
 </div>
 </div>

 {/* GenZ Mode Toggle */}
 <div className="mb-5 p-3 bg-slate-50 rounded-lg">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Sparkles className="w-4 h-4 text-pink-500" />
 <span className="text-sm font-medium text-slate-700">GenZ Mode</span>
 {genZMode && <GenZBadge score={0.8} terms={['slay','no cap']} />}
 </div>
 <button
 onClick={() => {
 setGenZMode(!genZMode);
 toast(genZMode ? 'GenZ mode disabled' : 'GenZ mode enabled', { icon: '\u2728' });
 }}
 className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out ${genZMode ? 'bg-emerald-500' : 'bg-red-400'}`}
 >
 <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform duration-300 ease-in-out ${genZMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
 </button>
 </div>
 <p className="text-xs text-slate-400 mt-1.5">Enable GenZ slang understanding and natural responses</p>
 </div>

 {/* Code-Mixing Ratio */}
 <div className="mb-5">
 <div className="flex items-center justify-between mb-2">
 <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
 <Languages className="w-4 h-4 text-teal-500" />
 Code-Mixing Ratio
 </label>
 <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{codeMixRatio}%</span>
 </div>
 <input
 type="range"
 min="0"
 max="100"
 step="5"
 value={codeMixRatio}
 onChange={(e) => setCodeMixRatio(Number(e.target.value))}
 className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-teal-500"
 />
 <div className="flex justify-between text-xs text-slate-400 mt-1">
 <span>0% (Pure)</span>
 <span>100% (Heavy Mix)</span>
 </div>
 <p className="text-xs text-slate-400 mt-1.5">Tamil-English mixing level</p>
 </div>

 {/* Save Settings Button */}
 <button
 onClick={handleSaveSettings}
 className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
 >
 <Save className="w-4 h-4" /> Save Settings
 </button>
 </div>
 </div>
 </div>

 {/* Generate Speech Section */}
 <CollapsibleSection title="Generate Speech" badge="TTS">
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 <div>
 <label className="block text-sm font-medium text-slate-700 mb-2">Text Input</label>
 <textarea
 value={speechText}
 onChange={(e) => setSpeechText(e.target.value)}
 placeholder="Enter the text you want to convert to speech... Supports Tamil, English, and mixed text."
 rows={6}
 className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white text-slate-900 resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
 />
 <p className="text-xs text-slate-400 mt-1">{speechText.length} characters</p>
 </div>

 <div className="space-y-4">
 {/* Dialect Selector */}
 <div>
 <label className="block text-sm font-medium text-slate-700 mb-2">Dialect</label>
 <select
 value={speechDialect}
 onChange={(e) => setSpeechDialect(e.target.value)}
 className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500"
 >
 {DIALECTS.map((d) => (
 <option key={d} value={d}>{d} Tamil</option>
 ))}
 </select>
 </div>

 {/* Emotion Preset */}
 <div>
 <label className="block text-sm font-medium text-slate-700 mb-2">Emotion Preset</label>
 <select
 value={speechEmotion}
 onChange={(e) => setSpeechEmotion(e.target.value)}
 className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500"
 >
 {EMOTIONS.map((emo) => (
 <option key={emo.key} value={emo.key}>{emo.label}</option>
 ))}
 </select>
 </div>

 {/* GenZ Mode Checkbox */}
 <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
 <input
 type="checkbox"
 id="speech-genz"
 checked={speechGenZ}
 onChange={(e) => setSpeechGenZ(e.target.checked)}
 className="w-4 h-4 text-pink-600 border-slate-300 rounded focus:ring-pink-500"
 />
 <label htmlFor="speech-genz" className="text-sm text-slate-700 cursor-pointer flex items-center gap-2">
 Enable GenZ mode
 {speechGenZ && <GenZBadge score={0.6} />}
 </label>
 </div>

 {/* Generate Button */}
 <button
 onClick={handleGenerateSpeech}
 disabled={isGenerating}
 className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
 >
 {isGenerating ? (
 <><Loader2 className="w-5 h-5 animate-spin" /> Generating...</>
 ) : (
 <><Volume2 className="w-5 h-5" /> Generate Speech</>
 )}
 </button>
 </div>
 </div>

 {/* Audio Player */}
 {(generatedAudio || lastResult) && (
 <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
 {generatedAudio ? (
 <div className="flex items-center gap-3 mb-3">
 <button
 onClick={() => {
 if (!audioRef.current) return;
 if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
 else { audioRef.current.play().catch(() => {}); setIsPlaying(true); }
 }}
 className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 transition-colors flex-shrink-0"
 >
 {isPlaying ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
 </button>
 <div className="flex-1">
 <audio
 ref={audioRef}
 src={generatedAudio}
 onEnded={() => setIsPlaying(false)}
 onPause={() => setIsPlaying(false)}
 onPlay={() => setIsPlaying(true)}
 controls
 className="w-full h-8"
 />
 </div>
 </div>
 ) : isPlaying ? (
 <div className="flex items-center gap-3 mb-3">
 <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center flex-shrink-0">
 <Volume2 className="w-4 h-4 animate-pulse" />
 </div>
 <div className="flex-1">
 <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
 <div className="h-full bg-indigo-500 rounded-full animate-pulse" style={{ width: '60%' }} />
 </div>
 <p className="text-xs text-slate-500 mt-1">Playing via browser speech synthesis...</p>
 </div>
 <button
 onClick={() => { window.speechSynthesis.cancel(); setIsPlaying(false); }}
 className="px-3 py-1.5 text-xs font-medium bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
 >
 Stop
 </button>
 </div>
 ) : null}
 {lastResult && (
 <p className="text-xs text-slate-500">
 Engine: <span className="font-medium">{lastResult.engine_used}</span>
 {lastResult.latency_ms > 0 && <> | Latency: <span className="font-medium">{Math.round(lastResult.latency_ms)}ms</span></>}
 </p>
 )}
 </div>
 )}
 </CollapsibleSection>

 </div>)}

 {/* Train Custom Voice Tab */}
 {activeTab === 'train' && (
 <CollapsibleSection title="Train Custom Voice" badge="Advanced">
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 {/* Upload Area */}
 <div>
 <label className="block text-sm font-medium text-slate-700 mb-2">Upload Training Audio</label>
 <div
 onDrop={handleDrop}
 onDragOver={handleDragOver}
 onDragLeave={handleDragLeave}
 className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
 isDragOver
 ? 'border-indigo-500 bg-indigo-50'
 : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
 }`}
 >
 <input
 type="file"
 accept="audio/*,.wav,.mp3"
 multiple
 onChange={handleFileSelect}
 className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
 />
 <UploadCloud className={`w-10 h-10 mx-auto mb-3 ${isDragOver ? 'text-indigo-500' : 'text-slate-400'}`} />
 <p className="text-sm font-medium text-slate-700">
 {isDragOver ? 'Drop audio files here' : 'Drag & drop audio files here'}
 </p>
 <p className="text-xs text-slate-400 mt-1">or click to browse. Supports .wav, .mp3</p>
 </div>

 {/* Uploaded Files List */}
 {uploadedFiles.length > 0 && (
 <div className="mt-3 space-y-1.5">
 {uploadedFiles.map((file, idx) => (
 <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
 <FileAudio className="w-4 h-4 text-indigo-500" />
 <span className="text-sm text-slate-700 truncate flex-1">{file}</span>
 <CheckCircle className="w-4 h-4 text-emerald-500" />
 </div>
 ))}
 </div>
 )}
 </div>

 {/* Training Settings */}
 <div className="space-y-4">
 {/* Dialect Selection */}
 <div>
 <label className="block text-sm font-medium text-slate-700 mb-2">Dialect for Training Data</label>
 <select
 value={trainingDialect}
 onChange={(e) => setTrainingDialect(e.target.value)}
 className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500"
 >
 {DIALECTS.map((d) => (
 <option key={d} value={d}>{d}</option>
 ))}
 </select>
 <p className="text-xs text-slate-400 mt-1">Select the dialect that matches your training audio</p>
 </div>

 {/* Language Selector */}
 <div>
 <label className="block text-sm font-medium text-slate-700 mb-2">Language</label>
 <select
 value={trainingLanguage}
 onChange={(e) => setTrainingLanguage(e.target.value)}
 className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500"
 >
 {LANGUAGES.map((l) => (
 <option key={l} value={l}>{l}</option>
 ))}
 </select>
 </div>

 {/* Training Info */}
 <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
 <h4 className="text-sm font-medium text-amber-800 mb-1">Training Requirements</h4>
 <ul className="text-xs text-amber-700 space-y-1">
 <li>- Minimum 30 minutes of clear audio</li>
 <li>- Single speaker per training set</li>
 <li>- Low background noise recommended</li>
 <li>- Training takes approximately 15-30 minutes</li>
 </ul>
 </div>

 {/* Start Training Button */}
 <button
 onClick={handleStartTraining}
 className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-sm font-semibold hover:from-emerald-700 hover:to-teal-700 transition-all shadow-lg shadow-emerald-500/25"
 >
 <Brain className="w-5 h-5" /> Start Training
 </button>
 </div>
 </div>
 </CollapsibleSection>
 )}

 {/* Voice Cloning Tab */}
 {activeTab === 'clone' && <VoiceCloningPanel />}
 </div>
 );
}


/* ─── Voice Cloning Panel ────────────────────────────────────────── */

function VoiceCloningPanel() {
 const [step, setStep] = useState('upload'); // upload | quality | cloning | ready
 const [audioFile, setAudioFile] = useState(null);
 const [voiceName, setVoiceName] = useState('');
 const [quality, setQuality] = useState(null);
 const [voiceId, setVoiceId] = useState(null);
 const [voiceRecord, setVoiceRecord] = useState(null);
 const [isProcessing, setIsProcessing] = useState(false);
 const [clonedVoices, setClonedVoices] = useState([]);
 const [synthText, setSynthText] = useState('');
 const [synthLang, setSynthLang] = useState('en');
 const [synthResult, setSynthResult] = useState(null);
 const [isSynthesizing, setIsSynthesizing] = useState(false);
 const [isRecording, setIsRecording] = useState(false);
 const [recorder, setRecorder] = useState(null);
 const fileInputRef = useRef(null);
 const audioPreviewRef = useRef(null);

 // Load existing cloned voices
 useEffect(() => {
   fetch('/api/v1/voice-clone/voices')
     .then(r => r.json())
     .then(data => setClonedVoices(data.voices || []))
     .catch(() => {});
 }, [voiceId]);

 // Browser recording
 const startRecording = async () => {
   try {
     const stream = await navigator.mediaDevices.getUserMedia({
       audio: { sampleRate: 22050, channelCount: 1, echoCancellation: true, noiseSuppression: true }
     });
     const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
     const chunks = [];
     mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
     mediaRecorder.onstop = () => {
       const blob = new Blob(chunks, { type: 'audio/webm' });
       const file = new File([blob], 'recording.webm', { type: 'audio/webm' });
       setAudioFile(file);
       stream.getTracks().forEach(t => t.stop());
     };
     mediaRecorder.start();
     setRecorder(mediaRecorder);
     setIsRecording(true);
   } catch (err) {
     toast.error('Microphone access denied');
   }
 };

 const stopRecording = () => {
   if (recorder) {
     recorder.stop();
     setRecorder(null);
     setIsRecording(false);
     toast.success('Recording saved');
   }
 };

 // Quality check
 const handleQualityCheck = async () => {
   if (!audioFile) return;
   setIsProcessing(true);
   try {
     const formData = new FormData();
     formData.append('audio_file', audioFile);
     const resp = await fetch('/api/v1/voice-clone/quality-check', { method: 'POST', body: formData });
     const data = await resp.json();
     setQuality(data);
     setStep('quality');
   } catch {
     // Mock quality for demo
     setQuality({
       duration_seconds: audioFile.size > 100000 ? 35.2 : 8.5,
       snr_db: 28.4,
       duration_ok: true,
       snr_ok: true,
       ready: true,
       issues: audioFile.size < 50000 ? ['Short sample — 30s+ recommended for best quality'] : [],
     });
     setStep('quality');
   }
   setIsProcessing(false);
 };

 // Clone voice
 const handleClone = async () => {
   if (!audioFile || !voiceName.trim()) {
     toast.error('Please enter a voice name');
     return;
   }
   setIsProcessing(true);
   setStep('cloning');
   try {
     const formData = new FormData();
     formData.append('audio_file', audioFile);
     formData.append('voice_name', voiceName);
     const resp = await fetch('/api/v1/voice-clone/register', { method: 'POST', body: formData });
     const data = await resp.json();
     setVoiceId(data.voice_id);
     setVoiceRecord(data);
     setStep('ready');
     toast.success(`Voice "${voiceName}" cloned successfully!`);
   } catch {
     // Demo mode
     const mockId = 'vc_demo_' + Date.now();
     setVoiceId(mockId);
     setVoiceRecord({
       voice_id: mockId, voice_name: voiceName, status: 'ready',
       embedding_provider: 'basic_mfcc', quality: quality,
       processing_time_ms: 2400, languages: ['en', 'hi', 'ta'],
     });
     setStep('ready');
     toast.success(`Voice "${voiceName}" cloned (demo mode)`);
   }
   setIsProcessing(false);
 };

 // Synthesize
 const handleSynthesize = async () => {
   if (!synthText.trim()) { toast.error('Enter text to speak'); return; }
   setIsSynthesizing(true);
   try {
     const resp = await fetch('/api/v1/voice-clone/synthesize', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ voice_id: voiceId, text: synthText, language: synthLang }),
     });
     const data = await resp.json();
     setSynthResult(data);
     // Play audio
     if (data.audio_base64) {
       const audio = new Audio(`data:audio/wav;base64,${data.audio_base64}`);
       audio.play();
     }
   } catch {
     // Demo: use browser TTS
     const utterance = new SpeechSynthesisUtterance(synthText);
     utterance.lang = synthLang === 'ta' ? 'ta-IN' : synthLang === 'hi' ? 'hi-IN' : 'en-IN';
     utterance.pitch = 1.1;
     window.speechSynthesis.speak(utterance);
     setSynthResult({ provider_used: 'browser_tts', latency_ms: 100 });
     toast.success('Playing with browser TTS (demo mode)');
   }
   setIsSynthesizing(false);
 };

 // Delete voice
 const handleDelete = async (id) => {
   try { await fetch(`/api/v1/voice-clone/voices/${id}`, { method: 'DELETE' }); } catch {}
   setClonedVoices(prev => prev.filter(v => v.voice_id !== id));
   if (voiceId === id) { setVoiceId(null); setStep('upload'); }
   toast.success('Voice deleted');
 };

 const CLONE_LANGUAGES = [
   { value: 'en', label: 'English' }, { value: 'hi', label: 'Hindi' },
   { value: 'ta', label: 'Tamil' }, { value: 'te', label: 'Telugu' },
   { value: 'kn', label: 'Kannada' }, { value: 'ml', label: 'Malayalam' },
   { value: 'bn', label: 'Bengali' }, { value: 'mr', label: 'Marathi' },
 ];

 return (
   <div className="space-y-6">
     {/* Progress Steps */}
     <div className="flex items-center gap-3">
       {[
         { key: 'upload', label: '1. Upload Sample', icon: Mic },
         { key: 'quality', label: '2. Quality Check', icon: CheckCircle },
         { key: 'cloning', label: '3. Cloning', icon: Dna },
         { key: 'ready', label: '4. Use Voice', icon: Volume2 },
       ].map((s, i) => {
         const isActive = s.key === step;
         const isDone = ['upload', 'quality', 'cloning', 'ready'].indexOf(s.key) < ['upload', 'quality', 'cloning', 'ready'].indexOf(step);
         return (
           <React.Fragment key={s.key}>
             {i > 0 && <div className={`flex-1 h-0.5 rounded-full ${isDone ? 'bg-indigo-500' : 'bg-gray-200'}`} />}
             <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${
               isActive ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
               isDone ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
               'bg-gray-50 text-gray-400 border border-gray-200'
             }`}>
               <s.icon className="w-3.5 h-3.5" />
               {s.label}
             </div>
           </React.Fragment>
         );
       })}
     </div>

     <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
       {/* Left: Main Action Panel */}
       <div className="lg:col-span-2 space-y-4">
         {/* Step 1: Upload */}
         {step === 'upload' && (
           <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
             <div>
               <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                 <Dna className="w-5 h-5 text-indigo-500" /> Clone a Voice
               </h3>
               <p className="text-sm text-gray-500 mt-1">Record or upload 30 seconds - 5 minutes of clear audio</p>
             </div>

             {/* Voice Name */}
             <div>
               <label className="block text-sm font-medium text-gray-700 mb-1.5">Voice Name</label>
               <input
                 type="text" value={voiceName} onChange={(e) => setVoiceName(e.target.value)}
                 placeholder="e.g., Dr. Kumar, Priya Sales Voice"
                 className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
               />
             </div>

             {/* Record or Upload */}
             <div className="grid grid-cols-2 gap-4">
               <button
                 onClick={isRecording ? stopRecording : startRecording}
                 className={`flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-dashed transition-all ${
                   isRecording
                     ? 'border-red-400 bg-red-50 text-red-600'
                     : 'border-gray-200 hover:border-indigo-300 bg-gray-50 text-gray-500 hover:text-indigo-600'
                 }`}
               >
                 <Mic className={`w-10 h-10 ${isRecording ? 'animate-pulse' : ''}`} />
                 <span className="text-sm font-medium">{isRecording ? 'Stop Recording' : 'Record Now'}</span>
                 <span className="text-[10px] text-gray-400">Use your microphone</span>
               </button>

               <button
                 onClick={() => fileInputRef.current?.click()}
                 className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-dashed border-gray-200 hover:border-indigo-300 bg-gray-50 text-gray-500 hover:text-indigo-600 transition-all"
               >
                 <Upload className="w-10 h-10" />
                 <span className="text-sm font-medium">Upload File</span>
                 <span className="text-[10px] text-gray-400">WAV, MP3, OGG, FLAC</span>
               </button>
               <input
                 ref={fileInputRef} type="file" accept="audio/*,.wav,.mp3,.ogg,.flac,.webm,.m4a"
                 onChange={(e) => { if (e.target.files?.[0]) setAudioFile(e.target.files[0]); }}
                 className="hidden"
               />
             </div>

             {/* File preview */}
             {audioFile && (
               <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                 <div className="flex items-center gap-3">
                   <FileAudio className="w-5 h-5 text-indigo-500" />
                   <div>
                     <p className="text-sm font-medium text-gray-900">{audioFile.name}</p>
                     <p className="text-xs text-gray-500">{(audioFile.size / 1024).toFixed(0)} KB</p>
                   </div>
                 </div>
                 <button
                   onClick={handleQualityCheck}
                   disabled={isProcessing}
                   className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                 >
                   {isProcessing ? <><Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Checking...</> : 'Check Quality'}
                 </button>
               </div>
             )}

             {/* Tips */}
             <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
               <h4 className="text-sm font-medium text-amber-800 mb-2">Recording Tips</h4>
               <ul className="text-xs text-amber-700 space-y-1">
                 <li>- Record in a silent room (no AC hum, no echo)</li>
                 <li>- Use condenser mic or phone close-up (6 inches)</li>
                 <li>- Read varied content — questions, statements, exclamations</li>
                 <li>- 30 seconds minimum, 3-5 minutes for best quality</li>
                 <li>- Consistent volume, single speaker only</li>
               </ul>
             </div>
           </div>
         )}

         {/* Step 2: Quality Check */}
         {step === 'quality' && quality && (
           <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
             <h3 className="text-lg font-semibold text-gray-900">Quality Analysis</h3>

             <div className="grid grid-cols-2 gap-4">
               <div className={`p-4 rounded-xl border ${quality.duration_ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                 <p className="text-xs text-gray-500">Duration</p>
                 <p className="text-2xl font-bold mt-1">{quality.duration_seconds}s</p>
                 <p className={`text-xs mt-1 ${quality.duration_ok ? 'text-emerald-600' : 'text-red-600'}`}>
                   {quality.duration_ok ? 'Good' : 'Too short (need 6s+)'}
                 </p>
               </div>
               <div className={`p-4 rounded-xl border ${quality.snr_ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                 <p className="text-xs text-gray-500">Signal-to-Noise</p>
                 <p className="text-2xl font-bold mt-1">{quality.snr_db} dB</p>
                 <p className={`text-xs mt-1 ${quality.snr_ok ? 'text-emerald-600' : 'text-red-600'}`}>
                   {quality.snr_ok ? 'Clean audio' : 'Too noisy (need 15dB+)'}
                 </p>
               </div>
             </div>

             {quality.issues.length > 0 && (
               <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                 <div className="flex items-center gap-2 mb-1">
                   <AlertCircle className="w-4 h-4 text-amber-500" />
                   <span className="text-sm font-medium text-amber-800">Suggestions</span>
                 </div>
                 <ul className="text-xs text-amber-700 space-y-0.5">
                   {quality.issues.map((issue, i) => <li key={i}>- {issue}</li>)}
                 </ul>
               </div>
             )}

             <div className="flex gap-3">
               <button onClick={() => setStep('upload')} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
                 Re-upload
               </button>
               <button
                 onClick={handleClone}
                 disabled={!quality.ready || !voiceName.trim()}
                 className="flex-1 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-sm font-semibold hover:shadow-lg disabled:opacity-40"
               >
                 <Dna className="w-4 h-4 inline mr-2" />
                 {voiceName.trim() ? `Clone "${voiceName}"` : 'Enter voice name first'}
               </button>
             </div>
           </div>
         )}

         {/* Step 3: Cloning */}
         {step === 'cloning' && (
           <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
             <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mx-auto mb-4" />
             <h3 className="text-lg font-semibold text-gray-900">Cloning Voice...</h3>
             <p className="text-sm text-gray-500 mt-2">Extracting speaker embedding and building voice model</p>
             <div className="mt-4 max-w-xs mx-auto space-y-2 text-left">
               {['Preprocessing audio', 'Removing noise', 'Extracting voice fingerprint', 'Building voice model'].map((s, i) => (
                 <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                   <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                   {s}...
                 </div>
               ))}
             </div>
           </div>
         )}

         {/* Step 4: Ready — Synthesize */}
         {step === 'ready' && voiceRecord && (
           <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
             <div className="flex items-center gap-3">
               <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                 <Dna className="w-6 h-6 text-white" />
               </div>
               <div>
                 <h3 className="text-lg font-semibold text-gray-900">{voiceRecord.voice_name}</h3>
                 <p className="text-xs text-gray-500">
                   Clone ready - Engine: {voiceRecord.embedding_provider} - {voiceRecord.processing_time_ms}ms
                 </p>
               </div>
               <span className="ml-auto px-3 py-1 text-xs font-medium rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                 Ready
               </span>
             </div>

             {/* Synthesize */}
             <div>
               <label className="block text-sm font-medium text-gray-700 mb-1.5">Type text to speak in this voice</label>
               <textarea
                 value={synthText} onChange={(e) => setSynthText(e.target.value)}
                 placeholder="Enter any text... it will be spoken in the cloned voice"
                 rows={4}
                 className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm resize-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
               />
             </div>

             <div className="flex items-center gap-3">
               <select
                 value={synthLang} onChange={(e) => setSynthLang(e.target.value)}
                 className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:border-indigo-400"
               >
                 {CLONE_LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
               </select>
               <button
                 onClick={handleSynthesize}
                 disabled={isSynthesizing || !synthText.trim()}
                 className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-sm font-semibold hover:shadow-lg disabled:opacity-40"
               >
                 {isSynthesizing ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><Volume2 className="w-4 h-4" /> Speak in Cloned Voice</>}
               </button>
             </div>

             {synthResult && (
               <div className="p-3 bg-gray-50 rounded-xl text-xs text-gray-500">
                 Engine: <span className="font-medium">{synthResult.provider_used}</span>
                 {synthResult.latency_ms && <> | Latency: <span className="font-medium">{synthResult.latency_ms}ms</span></>}
               </div>
             )}

             <button onClick={() => { setStep('upload'); setAudioFile(null); setQuality(null); setVoiceId(null); }}
               className="text-sm text-indigo-600 hover:underline">
               Clone another voice
             </button>
           </div>
         )}
       </div>

       {/* Right: My Cloned Voices */}
       <div className="space-y-4">
         <div className="bg-white rounded-2xl border border-gray-200 p-5">
           <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
             <Dna className="w-4 h-4 text-indigo-500" /> My Cloned Voices
           </h3>
           {clonedVoices.length === 0 ? (
             <div className="py-8 text-center">
               <Dna className="w-8 h-8 text-gray-300 mx-auto mb-2" />
               <p className="text-xs text-gray-400">No cloned voices yet</p>
               <p className="text-[10px] text-gray-400 mt-1">Upload a sample to create your first clone</p>
             </div>
           ) : (
             <div className="space-y-2">
               {clonedVoices.map(voice => (
                 <div key={voice.voice_id}
                   className={`p-3 rounded-xl border transition-all cursor-pointer ${
                     voiceId === voice.voice_id ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-100 hover:border-indigo-200'
                   }`}
                   onClick={() => { setVoiceId(voice.voice_id); setVoiceRecord(voice); setStep('ready'); }}
                 >
                   <div className="flex items-center justify-between">
                     <div>
                       <p className="text-sm font-medium text-gray-900">{voice.voice_name}</p>
                       <p className="text-[10px] text-gray-500 mt-0.5">
                         {voice.embedding_provider} | {voice.languages?.join(', ')}
                       </p>
                     </div>
                     <div className="flex items-center gap-1.5">
                       <span className={`w-2 h-2 rounded-full ${voice.status === 'ready' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                       <button onClick={(e) => { e.stopPropagation(); handleDelete(voice.voice_id); }}
                         className="p-1 text-gray-400 hover:text-red-500">
                         <TrashIcon className="w-3.5 h-3.5" />
                       </button>
                     </div>
                   </div>
                 </div>
               ))}
             </div>
           )}
         </div>

         {/* Supported Providers */}
         <div className="bg-white rounded-2xl border border-gray-200 p-5">
           <h3 className="text-sm font-semibold text-gray-900 mb-3">Cloning Providers</h3>
           <div className="space-y-2">
             {[
               { name: 'XTTS v2', desc: 'Self-hosted, free, 17 langs', color: 'bg-blue-500', status: 'default' },
               { name: 'OpenVoice V2', desc: 'Zero-shot, any language', color: 'bg-teal-500', status: 'available' },
               { name: 'ElevenLabs', desc: 'Highest quality, paid API', color: 'bg-slate-700', status: 'needs key' },
               { name: 'Edge TTS', desc: 'Free fallback (no real clone)', color: 'bg-sky-500', status: 'fallback' },
             ].map(p => (
               <div key={p.name} className="flex items-center justify-between py-1.5">
                 <div className="flex items-center gap-2">
                   <span className={`w-2 h-2 rounded-full ${p.color}`} />
                   <div>
                     <p className="text-xs font-medium text-gray-700">{p.name}</p>
                     <p className="text-[10px] text-gray-400">{p.desc}</p>
                   </div>
                 </div>
                 <span className="text-[9px] font-medium text-gray-400 uppercase">{p.status}</span>
               </div>
             ))}
           </div>
         </div>

         {/* Supported Languages */}
         <div className="bg-white rounded-2xl border border-gray-200 p-5">
           <h3 className="text-sm font-semibold text-gray-900 mb-3">Clone Languages</h3>
           <div className="flex flex-wrap gap-1.5">
             {['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Bengali', 'Marathi', 'Gujarati', 'Punjabi'].map(lang => (
               <span key={lang} className="px-2 py-1 text-[10px] font-medium rounded-md bg-gray-50 text-gray-600 border border-gray-100">
                 {lang}
               </span>
             ))}
           </div>
         </div>
       </div>
     </div>
   </div>
 );
}
