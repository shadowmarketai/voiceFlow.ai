/**
 * Shared voice catalog — used by VoiceLibrary and VoiceStudio
 * 64 voices from 10 TTS providers
 */

export const VOICES = [
  // -- Indic Parler-TTS (ai4bharat) -- 12 emotions, 21 Indian languages
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

  // -- IndicF5 (ai4bharat) -- Highest quality (4.6 MOS)
  { id: 'f5-nila', name: 'Nila', gender: 'female', provider: 'IndicF5', language: 'ta-IN', langLabel: 'Tamil', accent: 'Chennai', description: 'Ultra-high quality Tamil female — 4.6 MOS', emotions: false, quality: 4.6, sample: '/api/v1/tts/preview?voice=nila&engine=indicf5&lang=ta', badge: 'Best Quality' },
  { id: 'f5-anika', name: 'Anika', gender: 'female', provider: 'IndicF5', language: 'hi-IN', langLabel: 'Hindi', accent: 'Delhi', description: 'Studio-grade Hindi female — natural prosody', emotions: false, quality: 4.6, sample: '/api/v1/tts/preview?voice=anika&engine=indicf5&lang=hi', badge: 'Best Quality' },
  { id: 'f5-vikram', name: 'Vikram', gender: 'male', provider: 'IndicF5', language: 'hi-IN', langLabel: 'Hindi', accent: 'Standard', description: 'Deep Hindi male — broadcast quality', emotions: false, quality: 4.5, sample: '/api/v1/tts/preview?voice=vikram&engine=indicf5&lang=hi' },
  { id: 'f5-prithvi', name: 'Prithvi', gender: 'male', provider: 'IndicF5', language: 'ta-IN', langLabel: 'Tamil', accent: 'Standard', description: 'Rich Tamil male — audiobook quality', emotions: false, quality: 4.5, sample: '/api/v1/tts/preview?voice=prithvi&engine=indicf5&lang=ta' },
  { id: 'f5-divya', name: 'Divya', gender: 'female', provider: 'IndicF5', language: 'te-IN', langLabel: 'Telugu', accent: 'Standard', description: 'Pristine Telugu female — highest clarity', emotions: false, quality: 4.5, sample: '/api/v1/tts/preview?voice=divya&engine=indicf5&lang=te' },

  // -- OpenVoice V2 (MyShell) -- Zero-shot multilingual
  { id: 'ov-aria', name: 'Aria', gender: 'female', provider: 'OpenVoice V2', language: 'multi', langLabel: 'Multi-lang', accent: 'Neutral', description: 'Zero-shot voice cloning — any language', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=aria&engine=openvoice_v2', badge: 'Clone' },
  { id: 'ov-kai', name: 'Kai', gender: 'male', provider: 'OpenVoice V2', language: 'multi', langLabel: 'Multi-lang', accent: 'Neutral', description: 'Versatile male — real-time multilingual', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=kai&engine=openvoice_v2', badge: 'Clone' },
  { id: 'ov-zara', name: 'Zara', gender: 'female', provider: 'OpenVoice V2', language: 'multi', langLabel: 'Multi-lang', accent: 'Neutral', description: 'Expressive female — emotion style transfer', emotions: false, quality: 4.1, sample: '/api/v1/tts/preview?voice=zara&engine=openvoice_v2' },

  // -- XTTS-v2 (Coqui) -- Cross-lingual, 32+ languages
  { id: 'xt-elena', name: 'Elena', gender: 'female', provider: 'XTTS v2', language: 'multi', langLabel: 'Multi-lang', accent: 'Global', description: 'Cross-lingual female — 32+ languages', emotions: false, quality: 4.3, sample: '/api/v1/tts/preview?voice=elena&engine=xtts_v2' },
  { id: 'xt-marco', name: 'Marco', gender: 'male', provider: 'XTTS v2', language: 'multi', langLabel: 'Multi-lang', accent: 'Global', description: 'Cross-lingual male — natural in any language', emotions: false, quality: 4.3, sample: '/api/v1/tts/preview?voice=marco&engine=xtts_v2' },
  { id: 'xt-sara', name: 'Sara', gender: 'female', provider: 'XTTS v2', language: 'en-IN', langLabel: 'English', accent: 'Indian', description: 'Indian English female — call center ready', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=sara&engine=xtts_v2&lang=en' },

  // -- Sarvam AI (Indian-built) -- Native Indic TTS, API-based
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

  // -- Svara TTS (Canopy AI) -- Indian languages (GPU only)
  { id: 'svara-amara', name: 'Amara', gender: 'female', provider: 'Svara', language: 'ta-IN', langLabel: 'Tamil', accent: 'Chennai', description: 'Native Tamil female — needs GPU', emotions: false, quality: 4.0, badge: 'GPU' },
  { id: 'svara-rohit', name: 'Rohit', gender: 'male', provider: 'Svara', language: 'hi-IN', langLabel: 'Hindi', accent: 'Standard', description: 'Hindi male — needs GPU', emotions: false, quality: 4.0, badge: 'GPU' },

  // -- OpenAI TTS -- High quality, 6 voices
  { id: 'oai-alloy', name: 'Alloy', gender: 'neutral', provider: 'OpenAI TTS', language: 'multi', langLabel: 'Multi-lang', accent: 'Global', description: 'Balanced and versatile', emotions: false, quality: 4.4, sample: '/api/v1/tts/preview?voice=alloy&engine=openai' },
  { id: 'oai-echo', name: 'Echo', gender: 'male', provider: 'OpenAI TTS', language: 'multi', langLabel: 'Multi-lang', accent: 'Global', description: 'Clear and articulate', emotions: false, quality: 4.4, sample: '/api/v1/tts/preview?voice=echo&engine=openai' },
  { id: 'oai-fable', name: 'Fable', gender: 'male', provider: 'OpenAI TTS', language: 'multi', langLabel: 'Multi-lang', accent: 'British', description: 'Warm storytelling voice', emotions: false, quality: 4.4, sample: '/api/v1/tts/preview?voice=fable&engine=openai' },
  { id: 'oai-onyx', name: 'Onyx', gender: 'male', provider: 'OpenAI TTS', language: 'multi', langLabel: 'Multi-lang', accent: 'Global', description: 'Deep and resonant', emotions: false, quality: 4.3, sample: '/api/v1/tts/preview?voice=onyx&engine=openai' },
  { id: 'oai-nova', name: 'Nova', gender: 'female', provider: 'OpenAI TTS', language: 'multi', langLabel: 'Multi-lang', accent: 'Global', description: 'Friendly and upbeat', emotions: false, quality: 4.5, sample: '/api/v1/tts/preview?voice=nova&engine=openai', badge: 'Popular' },
  { id: 'oai-shimmer', name: 'Shimmer', gender: 'female', provider: 'OpenAI TTS', language: 'multi', langLabel: 'Multi-lang', accent: 'Global', description: 'Warm and inviting', emotions: false, quality: 4.4, sample: '/api/v1/tts/preview?voice=shimmer&engine=openai' },

  // -- Google Cloud TTS -- Wide language coverage
  { id: 'gc-aoede', name: 'Aoede', gender: 'female', provider: 'Google Cloud TTS', language: 'ta-IN', langLabel: 'Tamil', accent: 'Standard', description: 'Google WaveNet Tamil female', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=aoede&engine=google&lang=ta' },
  { id: 'gc-charon', name: 'Charon', gender: 'male', provider: 'Google Cloud TTS', language: 'ta-IN', langLabel: 'Tamil', accent: 'Standard', description: 'Google WaveNet Tamil male', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=charon&engine=google&lang=ta' },
  { id: 'gc-kore', name: 'Kore', gender: 'female', provider: 'Google Cloud TTS', language: 'hi-IN', langLabel: 'Hindi', accent: 'Standard', description: 'Google WaveNet Hindi female', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=kore&engine=google&lang=hi' },
  { id: 'gc-puck', name: 'Puck', gender: 'male', provider: 'Google Cloud TTS', language: 'hi-IN', langLabel: 'Hindi', accent: 'Standard', description: 'Google WaveNet Hindi male', emotions: false, quality: 4.1, sample: '/api/v1/tts/preview?voice=puck&engine=google&lang=hi' },
  { id: 'gc-wavenet-a', name: 'Wavenet A', gender: 'female', provider: 'Google Cloud TTS', language: 'en-IN', langLabel: 'English', accent: 'Indian', description: 'Google WaveNet Indian English', emotions: false, quality: 4.3, sample: '/api/v1/tts/preview?voice=wavenet-a&engine=google&lang=en' },

  // -- Deepgram Aura -- all 12 low-latency voices (~200ms first-byte)
  { id: 'dg-asteria', name: 'Asteria', gender: 'female', provider: 'Deepgram Aura', language: 'en-US', langLabel: 'English', accent: 'American', description: 'Warm, conversational — default', emotions: false, quality: 4.3, sample: '/api/v1/tts/preview?voice=asteria&engine=deepgram', badge: 'Fast' },
  { id: 'dg-luna', name: 'Luna', gender: 'female', provider: 'Deepgram Aura', language: 'en-US', langLabel: 'English', accent: 'American', description: 'Youthful and polite', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=luna&engine=deepgram' },
  { id: 'dg-stella', name: 'Stella', gender: 'female', provider: 'Deepgram Aura', language: 'en-US', langLabel: 'English', accent: 'American', description: 'Friendly, approachable', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=stella&engine=deepgram' },
  { id: 'dg-athena', name: 'Athena', gender: 'female', provider: 'Deepgram Aura', language: 'en-GB', langLabel: 'English', accent: 'British', description: 'Mature, calm British', emotions: false, quality: 4.3, sample: '/api/v1/tts/preview?voice=athena&engine=deepgram' },
  { id: 'dg-hera', name: 'Hera', gender: 'female', provider: 'Deepgram Aura', language: 'en-US', langLabel: 'English', accent: 'American', description: 'Professional, authoritative', emotions: false, quality: 4.3, sample: '/api/v1/tts/preview?voice=hera&engine=deepgram' },
  { id: 'dg-orion', name: 'Orion', gender: 'male', provider: 'Deepgram Aura', language: 'en-US', langLabel: 'English', accent: 'American', description: 'Deep, confident', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=orion&engine=deepgram' },
  { id: 'dg-arcas', name: 'Arcas', gender: 'male', provider: 'Deepgram Aura', language: 'en-US', langLabel: 'English', accent: 'American', description: 'Friendly, casual', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=arcas&engine=deepgram' },
  { id: 'dg-perseus', name: 'Perseus', gender: 'male', provider: 'Deepgram Aura', language: 'en-US', langLabel: 'English', accent: 'American', description: 'Upbeat, energetic', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=perseus&engine=deepgram' },
  { id: 'dg-angus', name: 'Angus', gender: 'male', provider: 'Deepgram Aura', language: 'en-IE', langLabel: 'English', accent: 'Irish', description: 'Gentle, Irish accent', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=angus&engine=deepgram' },
  { id: 'dg-orpheus', name: 'Orpheus', gender: 'male', provider: 'Deepgram Aura', language: 'en-US', langLabel: 'English', accent: 'American', description: 'Smooth, mellow', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=orpheus&engine=deepgram', badge: 'Fast' },
  { id: 'dg-helios', name: 'Helios', gender: 'male', provider: 'Deepgram Aura', language: 'en-GB', langLabel: 'English', accent: 'British', description: 'Bright, youthful British', emotions: false, quality: 4.2, sample: '/api/v1/tts/preview?voice=helios&engine=deepgram' },
  { id: 'dg-zeus', name: 'Zeus', gender: 'male', provider: 'Deepgram Aura', language: 'en-US', langLabel: 'English', accent: 'American', description: 'Deep, commanding', emotions: false, quality: 4.3, sample: '/api/v1/tts/preview?voice=zeus&engine=deepgram' },

  // -- Edge TTS (Microsoft) -- Free, large catalog
  { id: 'edge-neerja', name: 'Neerja', gender: 'female', provider: 'Edge TTS', language: 'hi-IN', langLabel: 'Hindi', accent: 'Standard', description: 'Microsoft Hindi female — free tier', emotions: false, quality: 3.9, sample: '/api/v1/tts/preview?voice=neerja&engine=edge&lang=hi', badge: 'Free' },
  { id: 'edge-madhur', name: 'Madhur', gender: 'male', provider: 'Edge TTS', language: 'hi-IN', langLabel: 'Hindi', accent: 'Standard', description: 'Microsoft Hindi male — free tier', emotions: false, quality: 3.8, sample: '/api/v1/tts/preview?voice=madhur&engine=edge&lang=hi', badge: 'Free' },
  { id: 'edge-pallavi', name: 'Pallavi', gender: 'female', provider: 'Edge TTS', language: 'ta-IN', langLabel: 'Tamil', accent: 'Standard', description: 'Microsoft Tamil female — free tier', emotions: false, quality: 3.8, sample: '/api/v1/tts/preview?voice=pallavi&engine=edge&lang=ta', badge: 'Free' },
  { id: 'edge-valluvar', name: 'Valluvar', gender: 'male', provider: 'Edge TTS', language: 'ta-IN', langLabel: 'Tamil', accent: 'Standard', description: 'Microsoft Tamil male — free tier', emotions: false, quality: 3.8, sample: '/api/v1/tts/preview?voice=valluvar&engine=edge&lang=ta', badge: 'Free' },
  { id: 'edge-ravi-en', name: 'Ravi', gender: 'male', provider: 'Edge TTS', language: 'en-IN', langLabel: 'English', accent: 'Indian', description: 'Microsoft Indian English male — free', emotions: false, quality: 3.9, sample: '/api/v1/tts/preview?voice=ravi&engine=edge&lang=en', badge: 'Free' },
  { id: 'edge-neerja-en', name: 'Neerja', gender: 'female', provider: 'Edge TTS', language: 'en-IN', langLabel: 'English', accent: 'Indian', description: 'Microsoft Indian English female — free', emotions: false, quality: 3.9, sample: '/api/v1/tts/preview?voice=neerja&engine=edge&lang=en', badge: 'Free' },
]

export const PROVIDERS = [...new Set(VOICES.map(v => v.provider))]
export const ALL_LANGUAGES = [...new Set(VOICES.map(v => v.language))].sort()
export const LANGUAGE_LABELS = Object.fromEntries(VOICES.map(v => [v.language, v.langLabel]))
export const UNIQUE_LANG_LABELS = [...new Set(VOICES.map(v => v.langLabel))]

export const PROVIDER_COLORS = {
  'Indic Parler': { gradient: 'from-orange-500 to-orange-600', bg: 'bg-orange-500', bar: 'from-orange-400 to-orange-500' },
  'IndicF5': { gradient: 'from-rose-500 to-rose-600', bg: 'bg-rose-500', bar: 'from-purple-400 to-purple-600' },
  'OpenVoice V2': { gradient: 'from-teal-500 to-teal-600', bg: 'bg-teal-500', bar: 'from-teal-400 to-teal-500' },
  'XTTS v2': { gradient: 'from-blue-500 to-blue-600', bg: 'bg-blue-500', bar: 'from-blue-400 to-blue-500' },
  'Sarvam AI': { gradient: 'from-indigo-500 to-violet-600', bg: 'bg-indigo-500', bar: 'from-indigo-400 to-violet-500' },
  'Svara': { gradient: 'from-purple-500 to-purple-600', bg: 'bg-purple-500', bar: 'from-purple-400 to-purple-500' },
  'OpenAI TTS': { gradient: 'from-slate-700 to-slate-800', bg: 'bg-slate-700', bar: 'from-slate-500 to-slate-700' },
  'Google Cloud TTS': { gradient: 'from-blue-400 to-blue-500', bg: 'bg-blue-400', bar: 'from-blue-300 to-blue-500' },
  'Deepgram Aura': { gradient: 'from-emerald-500 to-emerald-600', bg: 'bg-emerald-500', bar: 'from-emerald-400 to-emerald-500' },
  'Edge TTS': { gradient: 'from-sky-500 to-sky-600', bg: 'bg-sky-500', bar: 'from-sky-400 to-sky-500' },
}

export const BADGE_COLORS = {
  'Best Quality': 'bg-rose-50 text-rose-700 border-rose-100',
  'Popular': 'bg-violet-50 text-violet-700 border-violet-100',
  'Clone': 'bg-teal-50 text-teal-700 border-teal-100',
  'Fast': 'bg-emerald-50 text-emerald-700 border-emerald-100',
  'Free': 'bg-sky-50 text-sky-700 border-sky-100',
  'Indic Native': 'bg-indigo-50 text-indigo-700 border-indigo-100',
  'GPU': 'bg-amber-50 text-amber-700 border-amber-100',
}

export const SAMPLE_TEXTS = {
  'ta-IN': '\u0BB5\u0BA3\u0B95\u0BCD\u0B95\u0BAE\u0BCD! \u0BA8\u0BBE\u0BA9\u0BCD \u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD AI \u0B95\u0BC1\u0BB0\u0BB2\u0BCD \u0B89\u0BA4\u0BB5\u0BBF\u0BAF\u0BBE\u0BB3\u0BB0\u0BCD. \u0B87\u0BA9\u0BCD\u0BB1\u0BC1 \u0BA8\u0BBE\u0BA9\u0BCD \u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BC1\u0B95\u0BCD\u0B95\u0BC1 \u0B8E\u0BAA\u0BCD\u0BAA\u0B9F\u0BBF \u0B89\u0BA4\u0BB5 \u0BAE\u0BC1\u0B9F\u0BBF\u0BAF\u0BC1\u0BAE\u0BCD?',
  'hi-IN': '\u0928\u092E\u0938\u094D\u0924\u0947! \u092E\u0948\u0902 \u0906\u092A\u0915\u093E AI \u0935\u0949\u0907\u0938 \u0905\u0938\u093F\u0938\u094D\u091F\u0947\u0902\u091F \u0939\u0942\u0902\u0964 \u0906\u091C \u092E\u0948\u0902 \u0906\u092A\u0915\u0940 \u0915\u0948\u0938\u0947 \u092E\u0926\u0926 \u0915\u0930 \u0938\u0915\u0924\u093E \u0939\u0942\u0902?',
  'te-IN': '\u0C28\u0C2E\u0C38\u0C4D\u0C15\u0C3E\u0C30\u0C02! \u0C28\u0C47\u0C28\u0C41 \u0C2E\u0C40 AI \u0C35\u0C3E\u0C2F\u0C3F\u0C38\u0C4D \u0C05\u0C38\u0C3F\u0C38\u0C4D\u0C1F\u0C46\u0C02\u0C1F\u0C4D. \u0C08 \u0C30\u0C4B\u0C1C\u0C41 \u0C28\u0C47\u0C28\u0C41 \u0C2E\u0C40\u0C15\u0C41 \u0C0E\u0C32\u0C3E \u0C38\u0C39\u0C3E\u0C2F\u0C02 \u0C1A\u0C47\u0C2F\u0C17\u0C32\u0C28\u0C41?',
  'kn-IN': '\u0CA8\u0CAE\u0CB8\u0CCD\u0C95\u0CBE\u0CB0! \u0CA8\u0CBE\u0CA8\u0CC1 \u0CA8\u0CBF\u0CAE\u0CCD\u0CAE AI \u0CA7\u0CCD\u0CB5\u0CA8\u0CBF \u0CB8\u0CB9\u0CBE\u0CAF\u0C95. \u0C87\u0C82\u0CA6\u0CC1 \u0CA8\u0CBE\u0CA8\u0CC1 \u0CA8\u0CBF\u0CAE\u0C97\u0CC6 \u0CB9\u0CC7\u0C97\u0CC6 \u0CB8\u0CB9\u0CBE\u0CAF \u0CAE\u0CBE\u0CA1\u0CAC\u0CB9\u0CC1\u0CA6\u0CC1?',
  'ml-IN': '\u0D28\u0D2E\u0D38\u0D4D\u0D15\u0D3E\u0D30\u0D02! \u0D1E\u0D3E\u0D28\u0D4D \u0D28\u0D3F\u0D19\u0D4D\u0D19\u0D33\u0D41\u0D1F\u0D46 AI \u0D35\u0D4B\u0D2F\u0D4D\u0D38\u0D4D \u0D05\u0D38\u0D3F\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D28\u0D4D\u0D31\u0D4D \u0D06\u0D23\u0D4D. \u0D07\u0D28\u0D4D\u0D28\u0D4D \u0D0E\u0D28\u0D3F\u0D15\u0D4D\u0D15\u0D4D \u0D28\u0D3F\u0D19\u0D4D\u0D19\u0D33\u0D46 \u0D0E\u0D19\u0D4D\u0D19\u0D28\u0D46 \u0D38\u0D39\u0D3E\u0D2F\u0D3F\u0D15\u0D4D\u0D15\u0D3E\u0D28\u0D3E\u0D15\u0D41\u0D02?',
  'bn-IN': '\u09A8\u09AE\u09B8\u09CD\u0995\u09BE\u09B0! \u0986\u09AE\u09BF \u0986\u09AA\u09A8\u09BE\u09B0 AI \u09AD\u09AF\u09BC\u09C7\u09B8 \u0985\u09CD\u09AF\u09BE\u09B8\u09BF\u09B8\u09CD\u099F\u09CD\u09AF\u09BE\u09A8\u09CD\u099F\u0964 \u0986\u099C \u0986\u09AE\u09BF \u0986\u09AA\u09A8\u09BE\u0995\u09C7 \u0995\u09C0\u09AD\u09BE\u09AC\u09C7 \u09B8\u09BE\u09B9\u09BE\u09AF\u09CD\u09AF \u0995\u09B0\u09A4\u09C7 \u09AA\u09BE\u09B0\u09BF?',
  'mr-IN': '\u0928\u092E\u0938\u094D\u0915\u093E\u0930! \u092E\u0940 \u0924\u0941\u092E\u091A\u093E AI \u0935\u094D\u0939\u0949\u0907\u0938 \u0905\u0938\u093F\u0938\u094D\u091F\u0902\u091F \u0906\u0939\u0947. \u0906\u091C \u092E\u0940 \u0924\u0941\u092E\u094D\u0939\u093E\u0932\u093E \u0915\u0936\u0940 \u092E\u0926\u0924 \u0915\u0930\u0942 \u0936\u0915\u0924\u094B?',
  'gu-IN': '\u0AA8\u0AAE\u0AB8\u0ACD\u0A95\u0ABE\u0AB0! \u0AB9\u0AC1\u0A82 \u0AA4\u0AAE\u0ABE\u0AB0\u0ACB AI \u0AB5\u0ACB\u0A87\u0AB8 \u0A85\u0AB8\u0ABF\u0AB8\u0ACD\u0A9F\u0AA8\u0ACD\u0A9F \u0A9B\u0AC1\u0A82. \u0A86\u0A9C\u0AC7 \u0AB9\u0AC1\u0A82 \u0AA4\u0AAE\u0AA8\u0AC7 \u0A95\u0AC7\u0AB5\u0AC0 \u0AB0\u0AC0\u0AA4\u0AC7 \u0AAE\u0AA6\u0AA6 \u0A95\u0AB0\u0AC0 \u0AB6\u0A95\u0AC1\u0A82?',
  'pa-IN': '\u0A38\u0A24 \u0A38\u0A4D\u0A30\u0A40 \u0A05\u0A15\u0A3E\u0A32! \u0A2E\u0A48\u0A02 \u0A24\u0A41\u0A39\u0A3E\u0A21\u0A3E AI \u0A35\u0A4C\u0A07\u0A38 \u0A05\u0A38\u0A3F\u0A38\u0A1F\u0A48\u0A02\u0A1F \u0A39\u0A3E\u0A02\u0964 \u0A05\u0A71\u0A1C \u0A2E\u0A48\u0A02 \u0A24\u0A41\u0A39\u0A3E\u0A21\u0A40 \u0A15\u0A3F\u0A35\u0A47\u0A02 \u0A2E\u0A26\u0A26 \u0A15\u0A30 \u0A38\u0A15\u0A26\u0A3E \u0A39\u0A3E\u0A02?',
  'en-IN': "Hello! I'm your AI voice assistant. How can I help you today?",
  'en-US': "Hello! I'm your AI voice assistant. How can I help you today?",
  'en-GB': "Hello! I'm your AI voice assistant. How can I help you today?",
  'en-IE': "Hello! I'm your AI voice assistant. How can I help you today?",
  'multi': "Hello! I'm your AI voice assistant. I can speak in many languages. How can I help you today?",
}

/** Get the engine name for a voice (used by Generate Speech) */
export function getVoiceEngine(voice) {
  if (voice.apiProvider) return voice.apiProvider
  if (voice.provider === 'OpenAI TTS') return 'openai'
  if (voice.provider === 'Deepgram Aura') return 'deepgram'
  if (voice.provider === 'Google Cloud TTS') return 'google'
  if (voice.provider === 'Edge TTS') return 'edge'
  if (voice.provider === 'Indic Parler') return 'indic_parler'
  if (voice.provider === 'IndicF5') return 'indicf5'
  if (voice.provider === 'OpenVoice V2') return 'openvoice_v2'
  if (voice.provider === 'XTTS v2') return 'xtts_v2'
  if (voice.provider === 'Svara') return 'svara'
  if (voice.provider === 'Sarvam AI') return 'sarvam'
  return 'edge'
}

/** Get the API voice ID for a voice */
export function getApiVoiceId(voice) {
  if (voice.apiVoice) return voice.apiVoice
  return voice.name.toLowerCase()
}
