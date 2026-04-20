/**
 * OnboardingWizard — shown once to new users after first login.
 * Dismissed by completing steps or skipping. State persisted in localStorage.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, X, ArrowRight, Zap, Users, Bot, Megaphone, ChevronRight } from 'lucide-react'

const ONBOARDING_KEY = 'voiceflow_onboarding_done'

const STEPS = [
  {
    id: 'assistant',
    icon: Bot,
    color: 'from-purple-500 to-purple-700',
    title: 'Create your first AI Assistant',
    description: 'Set up a voice assistant with your brand name, language (Tamil/Hindi/English), and system prompt.',
    cta: 'Create Assistant',
    path: '/assistants',
  },
  {
    id: 'leads',
    icon: Users,
    color: 'from-blue-500 to-blue-700',
    title: 'Import your leads',
    description: 'Upload a CSV of your contacts or add leads manually. 5 demo leads are already loaded.',
    cta: 'Go to Leads',
    path: '/leads',
  },
  {
    id: 'campaign',
    icon: Megaphone,
    color: 'from-orange-500 to-orange-700',
    title: 'Launch your first campaign',
    description: 'Create an auto-dialer campaign, assign your assistant, and start calling your leads automatically.',
    cta: 'Create Campaign',
    path: '/campaigns',
  },
]

export function shouldShowOnboarding() {
  return !localStorage.getItem(ONBOARDING_KEY)
}

export function markOnboardingDone() {
  localStorage.setItem(ONBOARDING_KEY, '1')
}

export default function OnboardingWizard({ onClose }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [completed, setCompleted] = useState([])
  const navigate = useNavigate()

  const step = STEPS[currentStep]
  const Icon = step.icon
  const isLast = currentStep === STEPS.length - 1

  const handleCta = () => {
    setCompleted(prev => [...prev, step.id])
    navigate(step.path)
    onClose()
  }

  const handleNext = () => {
    setCompleted(prev => [...prev, step.id])
    if (isLast) {
      markOnboardingDone()
      onClose()
    } else {
      setCurrentStep(s => s + 1)
    }
  }

  const handleSkip = () => {
    markOnboardingDone()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-slide-up overflow-hidden">
        {/* Header */}
        <div className={`bg-gradient-to-br ${step.color} p-8 text-white relative`}>
          <button
            onClick={handleSkip}
            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 mb-6">
            <Zap className="w-5 h-5 text-yellow-300" />
            <span className="text-sm font-semibold text-white/90">Setup Guide · Step {currentStep + 1} of {STEPS.length}</span>
          </div>

          <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center mb-4">
            <Icon className="w-7 h-7 text-white" />
          </div>

          <h2 className="text-2xl font-display font-bold mb-2">{step.title}</h2>
          <p className="text-white/80 text-sm leading-relaxed">{step.description}</p>

          {/* Progress dots */}
          <div className="flex items-center gap-2 mt-6">
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                className={`h-2 rounded-full transition-all ${
                  i === currentStep ? 'w-8 bg-white' :
                  completed.includes(s.id) ? 'w-4 bg-white/60' :
                  'w-4 bg-white/30'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Steps overview */}
        <div className="p-6 space-y-2">
          {STEPS.map((s, i) => {
            const SIcon = s.icon
            const done = completed.includes(s.id)
            const active = i === currentStep
            return (
              <div
                key={s.id}
                className={`flex items-center gap-3 p-3 rounded-xl transition-colors cursor-pointer ${
                  active ? 'bg-gray-50 border border-gray-200' : ''
                }`}
                onClick={() => setCurrentStep(i)}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  done ? 'bg-success-100' : active ? 'bg-gray-100' : 'bg-gray-50'
                }`}>
                  {done
                    ? <CheckCircle className="w-4 h-4 text-success-500" />
                    : <SIcon className={`w-4 h-4 ${active ? 'text-gray-700' : 'text-gray-400'}`} />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${active ? 'text-gray-900' : done ? 'text-gray-500 line-through' : 'text-gray-600'}`}>
                    {s.title}
                  </p>
                </div>
                {active && <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
              </div>
            )
          })}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex items-center gap-3">
          <button onClick={handleSkip} className="btn btn-secondary flex-1 text-sm">
            Skip setup
          </button>
          <button onClick={handleCta} className="btn btn-primary flex-1">
            {step.cta} <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {!isLast && (
          <div className="px-6 pb-4 -mt-2 text-center">
            <button onClick={handleNext} className="text-xs text-gray-400 hover:text-gray-600">
              Mark as done, go to step {currentStep + 2} →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
