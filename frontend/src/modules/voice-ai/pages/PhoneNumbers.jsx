/**
 * Phone Numbers — Premium phone number management page
 */

import { motion } from 'framer-motion'
import { Phone, Plus, Upload, Settings, ArrowRight, PhoneCall } from 'lucide-react'

const numberFeatures = [
  {
    title: 'Buy Indian +91 Numbers',
    description: 'Purchase local and toll-free Indian phone numbers directly from our marketplace.',
    icon: Phone,
    gradient: 'from-indigo-500 to-indigo-600',
  },
  {
    title: 'Import from Twilio / Exotel',
    description: 'Bring your existing numbers from Twilio, Exotel, or other telephony providers.',
    icon: Upload,
    gradient: 'from-violet-500 to-violet-600',
  },
  {
    title: 'SIP Trunk Configuration',
    description: 'Connect your SIP trunks for enterprise-grade call routing and redundancy.',
    icon: Settings,
    gradient: 'from-blue-500 to-blue-600',
  },
  {
    title: 'Number-to-Agent Assignment',
    description: 'Map phone numbers to specific AI agents for automatic call handling.',
    icon: ArrowRight,
    gradient: 'from-emerald-500 to-emerald-600',
  },
]

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
}

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}

export default function PhoneNumbers() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Phone Numbers</h1>
          <p className="text-gray-500 mt-1">Manage your voice numbers and telephony configuration</p>
        </div>
        <button
          disabled
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-medium shadow-sm shadow-indigo-200 opacity-50 cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          Add Number
        </button>
      </div>

      {/* Feature Cards */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {numberFeatures.map((feature) => {
          const Icon = feature.icon
          return (
            <motion.div
              key={feature.title}
              variants={item}
              className="group relative p-6 bg-white rounded-2xl border border-gray-200/60 shadow-sm hover:shadow-md hover:border-gray-300/60 transition-all duration-200"
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl bg-gradient-to-br ${feature.gradient} shadow-sm`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-gray-900 font-semibold">{feature.title}</h3>
                    <span className="px-2.5 py-0.5 text-[11px] font-medium rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                      Coming Soon
                    </span>
                  </div>
                  <p className="text-gray-500 text-sm mt-1.5 leading-relaxed">{feature.description}</p>
                </div>
              </div>
            </motion.div>
          )
        })}
      </motion.div>

      {/* Empty State */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        className="p-14 bg-white rounded-2xl border border-gray-200/60 shadow-sm text-center"
      >
        <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center mb-5">
          <PhoneCall className="w-9 h-9 text-indigo-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">No Phone Numbers Yet</h3>
        <p className="text-gray-500 mt-2 max-w-md mx-auto leading-relaxed">
          Phone number management is coming soon. You will be able to purchase, import, and assign numbers to your AI agents.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-medium shadow-sm shadow-indigo-200 hover:shadow-md hover:shadow-indigo-300 transition-all duration-200 opacity-50 cursor-not-allowed">
            Get Notified
          </button>
          <button className="px-5 py-2.5 rounded-xl bg-gray-50 text-gray-700 text-sm font-medium border border-gray-200 hover:bg-gray-100 transition-all duration-200">
            Learn More
          </button>
        </div>
      </motion.div>
    </div>
  )
}
