/**
 * Voice Library — Browse and preview voices from all TTS providers
 * Inspired by Vani/Edesy voice library with India-first voice catalog
 */

import { useState, useRef, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Volume2, Play, Pause, Search, Filter, Mic2, Globe2,
  Sparkles, Star, Heart, ChevronDown, X, AudioLines,
  Languages, SlidersHorizontal
} from 'lucide-react'

/* ─── Voice Data — Real voices from 8 TTS providers ──────────────── */

const VOICES = [
  // ── Indic Parler-TTS (ai4bharat) — 12 emotions, 21 Indian languages ──
  { id: 'ip-priya', name: 'Priya', gender: 'female', provider: 'Indic Parler', language: 'ta-IN', langLabel: 'Tamil', accent: 'Chennai', description: 'Natural female Tamil voice with warm tone', emotions: true, quality: 4.3, sample: '/api/v1/tts/preview?voice=priya&engine=indic_parler&lang=ta' },
  { id: 'ip-meera', name: 'Meera', gender: 'female', provider: 'Indic Parler', language: 'hi-IN', langLabel: 'Hindi', accent: 'Standard', description: 'Expressive Hindi female with emotional range', emotions: true, quality: 4.3, sample: '/api/v1/tts/preview?voice=meera&engine=indic_parler&lang=hi' },
  { id: 'ip-arjun', name: 'Arjun', gender: 'male', provider: 'Indic Parler', language: 'hi-IN', langLabel: 'Hindi', accent: 'Standard', description: 'Professional Hindi male voice for business', emotions: true, quality: 4.3, sample: '/api/v1/tts/preview?voice=arjun&engine=indic_parler&lang=hi' },
  { id: 'ip-kavitha', name: 'Kavitha', gender: 'female', provider: 'Indic Parler', language: 'te-IN', langLabel: 'Telugu', accent: 'Hyderabad', description: 'Clear Telugu female with pleasant delivery', emotions: true, quality: 4.2, sample: '/api/v1/tts/preview?voice=kavitha&engine=indic_parler&lang=te' },
  { id: 'ip-ravi', name: 'Ravi', gender: 'male', provider: 'Indic Parler', language: 'ta-IN', langLabel: 'Tamil', accent: 'Madurai', description: 'Energetic Tamil male with regional flair', emotions: true, quality: 4.2, sample: '/api/v1/tts/preview?voice=ravi&engine=indic_parler&lang=ta' },
  { id: 'ip-ananya', name: 'Ananya', gender: 'female', provider: 'Indic Parler', language: 'kn-IN', langLabel: 'Kannada', accent: 'Bangalore', description: 'Smooth Kannada female voice', emotions: true, quality: 4.1, sample: '/api/v1/tts/preview?voice=ananya&engine=indic_parler&lang=kn' },
  { id: 'ip-lakshmi', name: 'Lakshmi', gender: 'female', provider: 'Indic Parler', language: 'ml-IN', langLabel: 'Malayalam', accent: 'Kochi', description: 'Natural Malayalam female voice', emotions: true, quality: 4.1, sample: '/api/v1/tts/preview?voice=lakshmi&engine=indic_parler&lang=ml' },
  { id: 'ip-suresh', name: 'Suresh', gender: 'male', provider: 'Indic Parler', language: 'bn-IN', langLabel: 'Bengali', accent: 'Kolkata', description: 'Warm Bengali male with clarity', emotions: true, quality: 4.1, sample: '/api/v1/tts/preview?voice=suresh&engine=indic_parler&lang=bn' },
  { id: 'ip-deepa', name: 'Deepa', gender: 'female', provider: 'Indic Parler', language: 'mr-IN', langLabel: 'Marathi', accent: 'Pune', description: 'Articulate Marathi female voice', emotions: true, quality: 4.1, sample: '/api/v1/tts/preview?voice=deepa&engine=indic_parler&lang=mr' },
  { id: 'ip-arun', name: 'Arun', gender: 'male', provider: 'Indic Parler', language: 'en-IN', langLabel: 'English', accent: 'Indian', description: 'Indian English male — clear, professional', emotions: true, quality: 4.3, sample: '/api/v1/tts/preview?voice=arun&engine=indic_parler&lang=en' },

  // ── IndicF5 (ai4bharat) — Highest quality (4.6 MOS) ──
  { id: 'f5-nila', name: 'Nila', gender: 'female', provider: 'IndicF5', language: 'ta-IN', langLabel: 'Tamil', accent: 'Chennai', description: 'Ultra-high quality Tamil female — 4.6 MOS', emotions: false, quality: 4.6, sample: '/api/v1/tts/preview?voice=nila&engine=indicf5&lang=ta', badge: 'Best Quality' },
  { id: 'f5-anika', name: 'Anika', gender: 'female', provider: 'IndicF5', language: 'hi-IN', langLabel: 'Hindi', accent: 'Delhi', description: 'Studio-grade Hindi female — natural prosody', emotions: false, quality: 4.6, sample: '/api/v1/tts/preview?voice=anika&engine=indicf5&lang=hi', badge: 'Best Quality' },
  { id: 'f5-vikram', name: 'Vikram', gender: 'male', provider: 'IndicF5', language: 'hi-IN', langLabel: 'Hindi', accent: 'Standard', description: 'Deep Hindi male — broadcast quality', emotions: false, quality: 4.5, sample: '/api/v1/tts/preview?voice=vikram&engine=indicf5&lang=hi' },
  { id: 'f5-prithvi', name: 'Prithvi', gender: 'male', provider: 'IndicF5', language: 'ta-IN', langLabel: 'Tamil', accent: 'Standard', description: 'Rich Tamil male — audiobook quality', emotions: false, quality: 4.5, sample: '/api/v1/tts/preview?voice=prithvi&engine=indicf5&lang=ta' },
  { id: 'f5-divya', name: 'Divya', gender: 'female', provider: 'IndicF5', language: 'te-IN', langLabel: 'Telugu', accent: 'Standard', description: 'Pristine Telugu female — highest clarity', emotions: false, quality: 4.5, sample: '/api/v1/tts/preview?voice=divya&engine=indicf5&lang=te' },

  // ── OpenVoice V2 (MyShell) — Zero-shot multilingual ──
  { id: 'ov-aria', name: 'Aria', gender: 'female', provider: 'OpenVoice V2', language: 'multi', langLabel: 'Multi-lang', accent: 'Neutral', description: 'Zero-shot voice cloning — any language', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=aria&engine=openvoice_v2', badge: 'Clone' },
  { id: 'ov-kai', name: 'Kai', gender: 'male', provider: 'OpenVoice V2', language: 'multi', langLabel: 'Multi-lang', accent: 'Neutral', description: 'Versatile male — real-time multilingual', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=kai&engine=openvoice_v2', badge: 'Clone' },
  { id: 'ov-zara', name: 'Zara', gender: 'female', provider: 'OpenVoice V2', language: 'multi', langLabel: 'Multi-lang', accent: 'Neutral', description: 'Expressive female — emotion style transfer', emotions: false, quality: 4.1, sample: '/api/v1/tts/preview?voice=zara&engine=openvoice_v2' },

  // ── XTTS-v2 (Coqui) — Cross-lingual, 32+ languages ──
  { id: 'xt-elena', name: 'Elena', gender: 'female', provider: 'XTTS v2', language: 'multi', langLabel: 'Multi-lang', accent: 'Global', description: 'Cross-lingual female — 32+ languages', emotions: false, quality: 4.3, sample: '/api/v1/tts/preview?voice=elena&engine=xtts_v2' },
  { id: 'xt-marco', name: 'Marco', gender: 'male', provider: 'XTTS v2', language: 'multi', langLabel: 'Multi-lang', accent: 'Global', description: 'Cross-lingual male — natural in any language', emotions: false, quality: 4.3, sample: '/api/v1/tts/preview?voice=marco&engine=xtts_v2' },
  { id: 'xt-sara', name: 'Sara', gender: 'female', provider: 'XTTS v2', language: 'en-IN', langLabel: 'English', accent: 'Indian', description: 'Indian English female — call center ready', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=sara&engine=xtts_v2&lang=en' },

  // ── Sarvam AI (Indian-built) — Native Indic TTS, API-based ──
  { id: 'sa-anushka', name: 'Anushka', gender: 'female', provider: 'Sarvam AI', language: 'ta-IN', langLabel: 'Tamil', accent: 'Chennai', description: 'Native Tamil female — Sarvam Bulbul v2', emotions: false, quality: 4.4, badge: 'Indic Native', apiProvider: 'sarvam', apiVoice: 'anushka' },
  { id: 'sa-abhilash', name: 'Abhilash', gender: 'male', provider: 'Sarvam AI', language: 'hi-IN', langLabel: 'Hindi', accent: 'Standard', description: 'Professional Hindi male — native quality', emotions: false, quality: 4.4, badge: 'Indic Native', apiProvider: 'sarvam', apiVoice: 'abhilash' },
  { id: 'sa-manisha', name: 'Manisha', gender: 'female', provider: 'Sarvam AI', language: 'ml-IN', langLabel: 'Malayalam', accent: 'Kerala', description: 'Natural Malayalam female', emotions: false, quality: 4.3, apiProvider: 'sarvam', apiVoice: 'manisha' },
  { id: 'sa-arya', name: 'Arya', gender: 'female', provider: 'Sarvam AI', language: 'te-IN', langLabel: 'Telugu', accent: 'Hyderabad', description: 'Clear Telugu female voice', emotions: false, quality: 4.3, apiProvider: 'sarvam', apiVoice: 'arya' },
  { id: 'sa-vidya', name: 'Vidya', gender: 'female', provider: 'Sarvam AI', language: 'en-IN', langLabel: 'English', accent: 'Indian', description: 'Indian English female — professional', emotions: false, quality: 4.3, apiProvider: 'sarvam', apiVoice: 'vidya' },
  { id: 'sa-karun', name: 'Karun', gender: 'male', provider: 'Sarvam AI', language: 'kn-IN', langLabel: 'Kannada', accent: 'Bangalore', description: 'Warm Kannada male voice', emotions: false, quality: 4.2, apiProvider: 'sarvam', apiVoice: 'karun' },
  { id: 'sa-priya-kn', name: 'Priya', gender: 'female', provider: 'Sarvam AI', language: 'kn-IN', langLabel: 'Kannada', accent: 'Standard', description: 'Smooth Kannada female', emotions: false, quality: 4.2, apiProvider: 'sarvam', apiVoice: 'priya' },
  { id: 'sa-ritu', name: 'Ritu', gender: 'female', provider: 'Sarvam AI', language: 'gu-IN', langLabel: 'Gujarati', accent: 'Standard', description: 'Native Gujarati female', emotions: false, quality: 4.2, apiProvider: 'sarvam', apiVoice: 'ritu' },
  { id: 'sa-neha', name: 'Neha', gender: 'female', provider: 'Sarvam AI', language: 'bn-IN', langLabel: 'Bengali', accent: 'Kolkata', description: 'Bengali female — clear and warm', emotions: false, quality: 4.2, apiProvider: 'sarvam', apiVoice: 'neha' },
  { id: 'sa-kavya', name: 'Kavya', gender: 'female', provider: 'Sarvam AI', language: 'mr-IN', langLabel: 'Marathi', accent: 'Pune', description: 'Marathi female — natural prosody', emotions: false, quality: 4.2, apiProvider: 'sarvam', apiVoice: 'kavya' },
  { id: 'sa-rahul', name: 'Rahul', gender: 'male', provider: 'Sarvam AI', language: 'hi-IN', langLabel: 'Hindi', accent: 'Delhi', description: 'Confident Hindi male — Sarvam native', emotions: false, quality: 4.3, apiProvider: 'sarvam', apiVoice: 'rahul' },
  { id: 'sa-simran', name: 'Simran', gender: 'female', provider: 'Sarvam AI', language: 'pa-IN', langLabel: 'Punjabi', accent: 'Standard', description: 'Punjabi female — native speaker', emotions: false, quality: 4.1, apiProvider: 'sarvam', apiVoice: 'simran' },

  // ── Svara TTS (Canopy AI) — Indian languages (GPU only) ──
  { id: 'svara-amara', name: 'Amara', gender: 'female', provider: 'Svara', language: 'ta-IN', langLabel: 'Tamil', accent: 'Chennai', description: 'Native Tamil female — needs GPU', emotions: false, quality: 4.0, badge: 'GPU' },
  { id: 'svara-rohit', name: 'Rohit', gender: 'male', provider: 'Svara', language: 'hi-IN', langLabel: 'Hindi', accent: 'Standard', description: 'Hindi male — needs GPU', emotions: false, quality: 4.0, badge: 'GPU' },

  // ── OpenAI TTS — High quality, 6 voices ──
  { id: 'oai-alloy', name: 'Alloy', gender: 'neutral', provider: 'OpenAI TTS', language: 'multi', langLabel: 'Multi-lang', accent: 'Global', description: 'Balanced and versatile', emotions: false, quality: 4.4, sample: '/api/v1/tts/preview?voice=alloy&engine=openai' },
  { id: 'oai-echo', name: 'Echo', gender: 'male', provider: 'OpenAI TTS', language: 'multi', langLabel: 'Multi-lang', accent: 'Global', description: 'Clear and articulate', emotions: false, quality: 4.4, sample: '/api/v1/tts/preview?voice=echo&engine=openai' },
  { id: 'oai-fable', name: 'Fable', gender: 'male', provider: 'OpenAI TTS', language: 'multi', langLabel: 'Multi-lang', accent: 'British', description: 'Warm storytelling voice', emotions: false, quality: 4.4, sample: '/api/v1/tts/preview?voice=fable&engine=openai' },
  { id: 'oai-onyx', name: 'Onyx', gender: 'male', provider: 'OpenAI TTS', language: 'multi', langLabel: 'Multi-lang', accent: 'Global', description: 'Deep and resonant', emotions: false, quality: 4.3, sample: '/api/v1/tts/preview?voice=onyx&engine=openai' },
  { id: 'oai-nova', name: 'Nova', gender: 'female', provider: 'OpenAI TTS', language: 'multi', langLabel: 'Multi-lang', accent: 'Global', description: 'Friendly and upbeat', emotions: false, quality: 4.5, sample: '/api/v1/tts/preview?voice=nova&engine=openai', badge: 'Popular' },
  { id: 'oai-shimmer', name: 'Shimmer', gender: 'female', provider: 'OpenAI TTS', language: 'multi', langLabel: 'Multi-lang', accent: 'Global', description: 'Warm and inviting', emotions: false, quality: 4.4, sample: '/api/v1/tts/preview?voice=shimmer&engine=openai' },

  // ── Google Cloud TTS — Wide language coverage ──
  { id: 'gc-aoede', name: 'Aoede', gender: 'female', provider: 'Google Cloud TTS', language: 'ta-IN', langLabel: 'Tamil', accent: 'Standard', description: 'Google WaveNet Tamil female', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=aoede&engine=google&lang=ta' },
  { id: 'gc-charon', name: 'Charon', gender: 'male', provider: 'Google Cloud TTS', language: 'ta-IN', langLabel: 'Tamil', accent: 'Standard', description: 'Google WaveNet Tamil male', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=charon&engine=google&lang=ta' },
  { id: 'gc-kore', name: 'Kore', gender: 'female', provider: 'Google Cloud TTS', language: 'hi-IN', langLabel: 'Hindi', accent: 'Standard', description: 'Google WaveNet Hindi female', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=kore&engine=google&lang=hi' },
  { id: 'gc-puck', name: 'Puck', gender: 'male', provider: 'Google Cloud TTS', language: 'hi-IN', langLabel: 'Hindi', accent: 'Standard', description: 'Google WaveNet Hindi male', emotions: false, quality: 4.1, sample: '/api/v1/tts/preview?voice=puck&engine=google&lang=hi' },
  { id: 'gc-wavenet-a', name: 'Wavenet A', gender: 'female', provider: 'Google Cloud TTS', language: 'en-IN', langLabel: 'English', accent: 'Indian', description: 'Google WaveNet Indian English', emotions: false, quality: 4.3, sample: '/api/v1/tts/preview?voice=wavenet-a&engine=google&lang=en' },

  // ── Deepgram Aura — all 12 low-latency voices (~200ms first-byte) ──
  { id: 'dg-asteria', name: 'Asteria', gender: 'female', provider: 'Deepgram Aura', language: 'en-US', langLabel: 'English', accent: 'American',  description: 'Warm, conversational — default',          emotions: false, quality: 4.3, sample: '/api/v1/tts/preview?voice=asteria&engine=deepgram', badge: 'Fast' },
  { id: 'dg-luna',    name: 'Luna',    gender: 'female', provider: 'Deepgram Aura', language: 'en-US', langLabel: 'English', accent: 'American',  description: 'Youthful and polite',                     emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=luna&engine=deepgram' },
  { id: 'dg-stella',  name: 'Stella',  gender: 'female', provider: 'Deepgram Aura', language: 'en-US', langLabel: 'English', accent: 'American',  description: 'Friendly, approachable',                  emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=stella&engine=deepgram' },
  { id: 'dg-athena',  name: 'Athena',  gender: 'female', provider: 'Deepgram Aura', language: 'en-GB', langLabel: 'English', accent: 'British',   description: 'Mature, calm British',                    emotions: false, quality: 4.3, sample: '/api/v1/tts/preview?voice=athena&engine=deepgram' },
  { id: 'dg-hera',    name: 'Hera',    gender: 'female', provider: 'Deepgram Aura', language: 'en-US', langLabel: 'English', accent: 'American',  description: 'Professional, authoritative',             emotions: false, quality: 4.3, sample: '/api/v1/tts/preview?voice=hera&engine=deepgram' },
  { id: 'dg-orion',   name: 'Orion',   gender: 'male',   provider: 'Deepgram Aura', language: 'en-US', langLabel: 'English', accent: 'American',  description: 'Deep, confident',                         emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=orion&engine=deepgram' },
  { id: 'dg-arcas',   name: 'Arcas',   gender: 'male',   provider: 'Deepgram Aura', language: 'en-US', langLabel: 'English', accent: 'American',  description: 'Friendly, casual',                        emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=arcas&engine=deepgram' },
  { id: 'dg-perseus', name: 'Perseus', gender: 'male',   provider: 'Deepgram Aura', language: 'en-US', langLabel: 'English', accent: 'American',  description: 'Upbeat, energetic',                       emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=perseus&engine=deepgram' },
  { id: 'dg-angus',   name: 'Angus',   gender: 'male',   provider: 'Deepgram Aura', language: 'en-IE', langLabel: 'English', accent: 'Irish',     description: 'Gentle, Irish accent',                    emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=angus&engine=deepgram' },
  { id: 'dg-orpheus', name: 'Orpheus', gender: 'male',   provider: 'Deepgram Aura', language: 'en-US', langLabel: 'English', accent: 'American',  description: 'Smooth, mellow',                          emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=orpheus&engine=deepgram', badge: 'Fast' },
  { id: 'dg-helios',  name: 'Helios',  gender: 'male',   provider: 'Deepgram Aura', language: 'en-GB', langLabel: 'English', accent: 'British',   description: 'Bright, youthful British',                emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=helios&engine=deepgram' },
  { id: 'dg-zeus',    name: 'Zeus',    gender: 'male',   provider: 'Deepgram Aura', language: 'en-US', langLabel: 'English', accent: 'American',  description: 'Deep, commanding',                        emotions: false, quality: 4.3, sample: '/api/v1/tts/preview?voice=zeus&engine=deepgram' },

  // ── Edge TTS (Microsoft) — Free, large catalog ──
  { id: 'edge-neerja', name: 'Neerja', gender: 'female', provider: 'Edge TTS', language: 'hi-IN', langLabel: 'Hindi', accent: 'Standard', description: 'Microsoft Hindi female — free tier', emotions: false, quality: 3.9, sample: '/api/v1/tts/preview?voice=neerja&engine=edge&lang=hi', badge: 'Free' },
  { id: 'edge-madhur', name: 'Madhur', gender: 'male', provider: 'Edge TTS', language: 'hi-IN', langLabel: 'Hindi', accent: 'Standard', description: 'Microsoft Hindi male — free tier', emotions: false, quality: 3.8, sample: '/api/v1/tts/preview?voice=madhur&engine=edge&lang=hi', badge: 'Free' },
  { id: 'edge-pallavi', name: 'Pallavi', gender: 'female', provider: 'Edge TTS', language: 'ta-IN', langLabel: 'Tamil', accent: 'Standard', description: 'Microsoft Tamil female — free tier', emotions: false, quality: 3.8, sample: '/api/v1/tts/preview?voice=pallavi&engine=edge&lang=ta', badge: 'Free' },
  { id: 'edge-valluvar', name: 'Valluvar', gender: 'male', provider: 'Edge TTS', language: 'ta-IN', langLabel: 'Tamil', accent: 'Standard', description: 'Microsoft Tamil male — free tier', emotions: false, quality: 3.8, sample: '/api/v1/tts/preview?voice=valluvar&engine=edge&lang=ta', badge: 'Free' },
  { id: 'edge-ravi-en', name: 'Ravi', gender: 'male', provider: 'Edge TTS', language: 'en-IN', langLabel: 'English', accent: 'Indian', description: 'Microsoft Indian English male — free', emotions: false, quality: 3.9, sample: '/api/v1/tts/preview?voice=ravi&engine=edge&lang=en', badge: 'Free' },
  { id: 'edge-neerja-en', name: 'Neerja', gender: 'female', provider: 'Edge TTS', language: 'en-IN', langLabel: 'English', accent: 'Indian', description: 'Microsoft Indian English female — free', emotions: false, quality: 3.9, sample: '/api/v1/tts/preview?voice=neerja&engine=edge&lang=en', badge: 'Free' },
]

const PROVIDERS = [...new Set(VOICES.map(v => v.provider))]
const LANGUAGES = [...new Set(VOICES.map(v => v.language))].sort()
const LANGUAGE_LABELS = Object.fromEntries(VOICES.map(v => [v.language, v.langLabel]))

const providerColors = {
  'Indic Parler': 'from-orange-500 to-orange-600',
  'IndicF5': 'from-rose-500 to-rose-600',
  'OpenVoice V2': 'from-teal-500 to-teal-600',
  'XTTS v2': 'from-blue-500 to-blue-600',
  'Sarvam AI': 'from-indigo-500 to-violet-600',
  'Svara': 'from-purple-500 to-purple-600',
  'OpenAI TTS': 'from-slate-700 to-slate-800',
  'Google Cloud TTS': 'from-blue-400 to-blue-500',
  'Deepgram Aura': 'from-emerald-500 to-emerald-600',
  'Edge TTS': 'from-sky-500 to-sky-600',
}

const badgeColors = {
  'Best Quality': 'bg-rose-50 text-rose-700 border-rose-100',
  'Popular': 'bg-violet-50 text-violet-700 border-violet-100',
  'Clone': 'bg-teal-50 text-teal-700 border-teal-100',
  'Fast': 'bg-emerald-50 text-emerald-700 border-emerald-100',
  'Free': 'bg-sky-50 text-sky-700 border-sky-100',
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.03 } },
}
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
}

/* ─── Voice Card ──────────────────────────────────────────────────── */

function VoiceCard({ voice, isPlaying, onPlay }) {
  const gradient = providerColors[voice.provider] || 'from-gray-500 to-gray-600'

  return (
    <motion.div
      variants={item}
      className="group p-4 bg-white rounded-2xl border border-gray-200/60 shadow-sm hover:shadow-md hover:border-gray-300/60 transition-all duration-200"
    >
      <div className="flex items-start justify-between mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
            voice.gender === 'female'
              ? 'bg-pink-100 text-pink-600'
              : voice.gender === 'male'
                ? 'bg-blue-100 text-blue-600'
                : 'bg-gray-100 text-gray-600'
          }`}>
            {voice.gender === 'female' ? '\u2640' : voice.gender === 'male' ? '\u2642' : '\u25CE'}
          </div>
          <h3 className="text-sm font-semibold text-gray-900">{voice.name}</h3>
          {voice.badge && (
            <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded-full border ${badgeColors[voice.badge] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
              {voice.badge}
            </span>
          )}
        </div>
        <button
          onClick={() => onPlay(voice.id)}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 shrink-0 ${
            isPlaying
              ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-200 scale-110'
              : 'bg-gray-100 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600'
          }`}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
      </div>

      {/* Provider + Language tags */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`px-2 py-0.5 text-[10px] font-medium rounded-md text-white bg-gradient-to-r ${gradient}`}>
          {voice.provider}
        </span>
        <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-gray-100 text-gray-600">
          {voice.emotions ? '🎭' : '✦'} {voice.langLabel}
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-500 leading-relaxed mb-2.5">{voice.description}</p>

      {/* Quality bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-500 transition-all"
            style={{ width: `${(voice.quality / 5) * 100}%` }}
          />
        </div>
        <span className="text-[10px] font-mono font-medium text-gray-500">{voice.quality.toFixed(1)}</span>
      </div>
    </motion.div>
  )
}

/* ─── Main Component ──────────────────────────────────────────────── */

export default function VoiceLibrary() {
  const [search, setSearch] = useState('')
  const [providerFilter, setProviderFilter] = useState('all')
  const [languageFilter, setLanguageFilter] = useState('all')
  const [genderFilter, setGenderFilter] = useState('all')
  const [playingId, setPlayingId] = useState(null)
  const [favorites, setFavorites] = useState(new Set())
  const [browserVoices, setBrowserVoices] = useState([])
  const audioRef = useRef(null)

  // Load browser voices (they load async on some browsers)
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis?.getVoices() || []
      if (voices.length > 0) setBrowserVoices(voices)
    }
    loadVoices()
    window.speechSynthesis?.addEventListener('voiceschanged', loadVoices)
    return () => {
      window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices)
      window.speechSynthesis?.cancel()
    }
  }, [])

  const filtered = useMemo(() => {
    return VOICES.filter(v => {
      if (providerFilter !== 'all' && v.provider !== providerFilter) return false
      if (languageFilter !== 'all' && v.language !== languageFilter) return false
      if (genderFilter !== 'all' && v.gender !== genderFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          v.name.toLowerCase().includes(q) ||
          v.provider.toLowerCase().includes(q) ||
          v.langLabel.toLowerCase().includes(q) ||
          v.description.toLowerCase().includes(q) ||
          v.accent.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [search, providerFilter, languageFilter, genderFilter])

  const stats = useMemo(() => ({
    total: VOICES.length,
    providers: PROVIDERS.length,
    languages: new Set(VOICES.map(v => v.langLabel)).size,
    filtered: filtered.length,
  }), [filtered])

  // Sample texts per language — proper native text
  const SAMPLE_TEXTS = {
    'ta-IN': 'வணக்கம்! நான் உங்கள் AI குரல் உதவியாளர். இன்று நான் உங்களுக்கு எப்படி உதவ முடியும்?',
    'hi-IN': 'नमस्ते! मैं आपका AI वॉइस असिस्टेंट हूं। आज मैं आपकी कैसे मदद कर सकता हूं?',
    'te-IN': 'నమస్కారం! నేను మీ AI వాయిస్ అసిస్టెంట్. ఈ రోజు నేను మీకు ఎలా సహాయం చేయగలను?',
    'kn-IN': 'ನಮಸ್ಕಾರ! ನಾನು ನಿಮ್ಮ AI ಧ್ವನಿ ಸಹಾಯಕ. ಇಂದು ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?',
    'ml-IN': 'നമസ്കാരം! ഞാൻ നിങ്ങളുടെ AI വോയ്സ് അസിസ്റ്റന്റ് ആണ്. ഇന്ന് എനിക്ക് നിങ്ങളെ എങ്ങനെ സഹായിക്കാനാകും?',
    'bn-IN': 'নমস্কার! আমি আপনার AI ভয়েস অ্যাসিস্ট্যান্ট। আজ আমি আপনাকে কীভাবে সাহায্য করতে পারি?',
    'mr-IN': 'नमस्कार! मी तुमचा AI व्हॉइस असिस्टंट आहे. आज मी तुम्हाला कशी मदत करू शकतो?',
    'en-IN': "Hello! I'm your AI voice assistant. How can I help you today?",
    'en-US': "Hello! I'm your AI voice assistant. How can I help you today?",
    'multi': "Hello! I'm your AI voice assistant. I can speak in many languages. How can I help you today?",
  }

  /**
   * Pick a browser SpeechSynthesis voice that best matches
   * the target language and gender.
   */
  const pickBrowserVoice = (langCode, gender) => {
    if (browserVoices.length === 0) return null
    const langPrefix = langCode === 'multi' ? 'en' : langCode.split('-')[0]
    const fullLang = langCode === 'multi' ? 'en-US' : langCode

    // Filter by language match
    let candidates = browserVoices.filter(v => v.lang === fullLang)
    if (candidates.length === 0) {
      candidates = browserVoices.filter(v => v.lang.startsWith(langPrefix))
    }
    if (candidates.length === 0) {
      candidates = browserVoices.filter(v => v.lang.startsWith('en'))
    }

    // Try to match gender by name heuristics
    if (candidates.length > 1 && gender !== 'neutral') {
      const femaleKeywords = ['female', 'woman', 'zira', 'hazel', 'susan', 'linda', 'heera', 'kalpana', 'neerja', 'pallavi', 'swara', 'priya', 'shruti', 'hemant']
      const maleKeywords = ['male', 'man', 'david', 'mark', 'james', 'ravi', 'madhur', 'prabhat', 'hemant']
      const keywords = gender === 'female' ? femaleKeywords : maleKeywords
      const genderMatch = candidates.filter(v =>
        keywords.some(kw => v.name.toLowerCase().includes(kw))
      )
      if (genderMatch.length > 0) return genderMatch[0]
    }

    return candidates[0] || null
  }

  const handlePlay = async (voiceId) => {
    // Stop current playback
    if (playingId === voiceId) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
      window.speechSynthesis?.cancel()
      setPlayingId(null)
      return
    }

    const voice = VOICES.find(v => v.id === voiceId)
    if (!voice) return

    setPlayingId(voiceId)
    if (audioRef.current) { audioRef.current.pause(); }
    window.speechSynthesis?.cancel()

    const sampleText = SAMPLE_TEXTS[voice.language] || SAMPLE_TEXTS['en-US']
    const langCode = voice.language?.split('-')[0] || 'en'

    // Try real TTS API first (Sarvam, OpenAI, Edge TTS etc.)
    if (voice.apiProvider || voice.provider === 'OpenAI TTS' || voice.provider === 'Edge TTS' || voice.provider === 'Deepgram Aura' || voice.provider === 'Google Cloud TTS') {
      try {
        const provider = voice.apiProvider || (
          voice.provider === 'OpenAI TTS' ? 'openai' :
          voice.provider === 'Deepgram Aura' ? 'deepgram' :
          voice.provider === 'Google Cloud TTS' ? 'google' :
          'edge'
        )
        const apiVoice = voice.apiVoice || (
          voice.provider === 'OpenAI TTS' ? voice.name.toLowerCase() :
          voice.provider === 'Deepgram Aura' ? `aura-${voice.name.toLowerCase()}-en` :
          undefined
        )

        const params = new URLSearchParams({
          text: sampleText,
          provider,
          language: langCode,
        })
        if (apiVoice) params.set('voice', apiVoice)

        const resp = await fetch(`/api/v1/tts/preview?${params}`)
        if (resp.ok) {
          const data = await resp.json()
          if (data.audio_base64) {
            const format = data.format || 'mp3'
            const audioUrl = `data:audio/${format};base64,${data.audio_base64}`
            audioRef.current.src = audioUrl
            audioRef.current.onended = () => setPlayingId(null)
            audioRef.current.onerror = () => setPlayingId(null)
            await audioRef.current.play()
            return
          }
        }
      } catch (e) {
        console.warn('API TTS failed, falling back to browser:', e)
      }
    }

    // Fallback: Browser SpeechSynthesis
    if (window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance(sampleText)
      utterance.lang = voice.language === 'multi' ? 'en-US' : voice.language
      const browserVoice = pickBrowserVoice(voice.language, voice.gender)
      if (browserVoice) utterance.voice = browserVoice
      utterance.pitch = voice.gender === 'female' ? 1.15 : voice.gender === 'male' ? 0.8 : 1.0
      utterance.rate = 0.9
      utterance.onend = () => setPlayingId(null)
      utterance.onerror = () => setPlayingId(null)
      window.speechSynthesis.speak(utterance)
    } else {
      setPlayingId(null)
    }
  }

  const clearFilters = () => {
    setSearch('')
    setProviderFilter('all')
    setLanguageFilter('all')
    setGenderFilter('all')
  }

  const hasFilters = search || providerFilter !== 'all' || languageFilter !== 'all' || genderFilter !== 'all'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Voice Library</h1>
          <Volume2 className="w-5 h-5 text-indigo-500" />
        </div>
        <p className="text-gray-500">
          Explore and preview {VOICES.length} voices from {PROVIDERS.length} TTS providers
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Mic2, label: 'Total Voices', value: stats.total, color: 'indigo' },
          { icon: Sparkles, label: 'TTS Providers', value: stats.providers, color: 'emerald' },
          { icon: Languages, label: 'Languages', value: stats.languages, color: 'blue' },
          { icon: Filter, label: 'Filtered Results', value: stats.filtered, color: 'violet' },
        ].map(s => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl bg-${s.color}-50`}>
                <s.icon className={`w-5 h-5 text-${s.color}-500`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="p-4 bg-white rounded-2xl border border-gray-200/60 shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 w-full lg:max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search voices by name, language, provider..."
              className="w-full bg-gray-50/50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
            />
          </div>

          {/* Dropdowns */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-indigo-300 appearance-none cursor-pointer pr-8"
            >
              <option value="all">All Providers</option>
              {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>

            <select
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
              className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-indigo-300 appearance-none cursor-pointer pr-8"
            >
              <option value="all">All Languages</option>
              {LANGUAGES.map(l => <option key={l} value={l}>{LANGUAGE_LABELS[l] || l}</option>)}
            </select>

            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-indigo-300 appearance-none cursor-pointer pr-8"
            >
              <option value="all">All Genders</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="neutral">Neutral</option>
            </select>

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-gray-500 hover:text-red-600 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Voice Grid */}
      {filtered.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-2xl border border-gray-200/60 shadow-sm">
          <AudioLines className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No voices match your filters</p>
          <p className="text-gray-400 text-sm mt-1">Try adjusting your search or filters</p>
          <button onClick={clearFilters} className="mt-4 px-4 py-2 rounded-xl bg-indigo-50 text-indigo-600 text-sm font-medium hover:bg-indigo-100 transition-colors">
            Clear all filters
          </button>
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          variants={container}
          initial="hidden"
          animate="show"
          key={`${providerFilter}-${languageFilter}-${genderFilter}-${search}`}
        >
          {filtered.map(voice => (
            <VoiceCard
              key={voice.id}
              voice={voice}
              isPlaying={playingId === voice.id}
              onPlay={handlePlay}
            />
          ))}
        </motion.div>
      )}

      <audio ref={audioRef} hidden />
    </div>
  )
}
