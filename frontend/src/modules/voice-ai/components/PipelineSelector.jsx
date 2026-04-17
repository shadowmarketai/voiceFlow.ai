/**
 * PipelineSelector — 5-preset pipeline picker for the Agent Builder.
 *
 * Shows all 5 pricing presets with per-minute cost, description, and
 * recommended use case. Selecting a preset fires onChange(preset) so the
 * parent can update STT/LLM/TTS provider fields.
 *
 * Props:
 *   selected        — current preset id (string)
 *   onChange        — (presetId: string) => void
 *   isSuperAdmin    — show cost-of-goods column (default false)
 *   className       — extra Tailwind classes
 */

import { Zap, Sparkles, CreditCard, Globe, Crown, CheckCircle2 } from 'lucide-react'

const PRESETS = [
  {
    id: 'budget',
    icon: CreditCard,
    label: 'Budget',
    tagline: 'Cost-effective',
    desc: 'Edge TTS + Whisper · serial mode',
    client_price: '₹2.50',
    your_cost: '₹1.40',
    margin: '44%',
    color: 'text-slate-600',
    ring: 'ring-slate-300',
    bg: 'bg-slate-50',
    bgActive: 'bg-slate-100',
    badge: null,
    pipeline: { stt: 'groq_whisper', tts: 'edge_tts', telephony: 'airtel' },
  },
  {
    id: 'low_latency',
    icon: Zap,
    label: 'Low Latency',
    tagline: 'Fastest response',
    desc: 'Deepgram Nova-2 + Groq + Cartesia',
    client_price: '₹3.50',
    your_cost: '₹2.00',
    margin: '43%',
    color: 'text-blue-600',
    ring: 'ring-blue-300',
    bg: 'bg-blue-50',
    bgActive: 'bg-blue-100',
    badge: null,
    pipeline: { stt: 'deepgram_nova2', tts: 'cartesia', telephony: 'exotel' },
  },
  {
    id: 'tamil_native',
    icon: Globe,
    label: 'Tamil Native',
    tagline: 'Sarvam ensemble STT',
    desc: 'Tanglish detection · Bulbul V2 TTS',
    client_price: '₹4.50',
    your_cost: '₹2.50',
    margin: '44%',
    color: 'text-emerald-600',
    ring: 'ring-emerald-300',
    bg: 'bg-emerald-50',
    bgActive: 'bg-emerald-100',
    badge: 'TN Market',
    pipeline: { stt: 'sarvam', tts: 'sarvam_bulbul', telephony: 'exotel' },
  },
  {
    id: 'high_quality',
    icon: Sparkles,
    label: 'High Quality',
    tagline: 'Best accuracy',
    desc: 'Claude + Deepgram + ElevenLabs Flash',
    client_price: '₹5.00',
    your_cost: '₹2.90',
    margin: '42%',
    color: 'text-violet-600',
    ring: 'ring-violet-300',
    bg: 'bg-violet-50',
    bgActive: 'bg-violet-100',
    badge: null,
    pipeline: { stt: 'deepgram_nova2', tts: 'elevenlabs_flash', telephony: 'twilio' },
  },
  {
    id: 'premium',
    icon: Crown,
    label: 'Premium S2S',
    tagline: 'Gemini Live end-to-end',
    desc: 'Audio-in → audio-out · native emotion',
    client_price: '₹8.00',
    your_cost: '₹3.50',
    margin: '56%',
    color: 'text-amber-600',
    ring: 'ring-amber-300',
    bg: 'bg-amber-50',
    bgActive: 'bg-amber-100',
    badge: 'Enterprise',
    pipeline: { stt: 'gemini_s2s', tts: 'gemini_s2s', telephony: 'twilio' },
  },
]

export default function PipelineSelector({ selected, onChange, isSuperAdmin = false, className = '' }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 ${className}`}>
      {PRESETS.map(p => {
        const isActive = selected === p.id
        const Icon     = p.icon
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange?.(p.id)}
            className={[
              'relative flex flex-col items-start gap-1.5 rounded-2xl border p-4 text-left',
              'transition-all duration-150 focus:outline-none',
              isActive
                ? `${p.bgActive} ring-2 ${p.ring} border-transparent shadow-sm`
                : `${p.bg} border-gray-200 hover:border-gray-300 hover:shadow-sm`,
            ].join(' ')}
          >
            {/* Selected indicator */}
            {isActive && (
              <CheckCircle2
                className={`absolute top-3 right-3 w-4 h-4 ${p.color}`}
                strokeWidth={2.5}
              />
            )}

            {/* Badge */}
            {p.badge && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${p.bg} ${p.color} border ${p.ring} mb-0.5`}>
                {p.badge}
              </span>
            )}

            <Icon className={`w-5 h-5 ${p.color}`} strokeWidth={1.8} />

            <div>
              <p className="text-sm font-semibold text-gray-900 leading-tight">{p.label}</p>
              <p className={`text-xs font-medium ${p.color}`}>{p.tagline}</p>
            </div>

            <p className="text-[11px] text-gray-500 leading-snug">{p.desc}</p>

            {/* Pricing */}
            <div className="mt-auto pt-2 w-full border-t border-gray-200">
              <p className={`text-base font-bold ${p.color}`}>
                {p.client_price}<span className="text-xs font-normal text-gray-400">/min</span>
              </p>
              {isSuperAdmin && (
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Cost {p.your_cost} · Margin {p.margin}
                </p>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// Export preset map so AgentBuilder can sync provider dropdowns
export const PRESET_PIPELINE_MAP = Object.fromEntries(
  PRESETS.map(p => [p.id, p.pipeline])
)

export { PRESETS }
