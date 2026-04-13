/**
 * Integrations — Premium marketplace for third-party connections
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Search, ExternalLink, Check, ArrowUpRight } from 'lucide-react'

const categories = ['All', 'Telephony', 'CRM', 'Automation', 'Calendar']

const categoryColors = {
  Telephony: { bg: 'bg-indigo-50', text: 'text-indigo-600', ring: 'from-indigo-500 to-indigo-600' },
  CRM: { bg: 'bg-blue-50', text: 'text-blue-600', ring: 'from-blue-500 to-blue-600' },
  Automation: { bg: 'bg-amber-50', text: 'text-amber-600', ring: 'from-amber-500 to-amber-600' },
  Calendar: { bg: 'bg-emerald-50', text: 'text-emerald-600', ring: 'from-emerald-500 to-emerald-600' },
}

const integrations = [
  { id: 'twilio', name: 'Twilio', category: 'Telephony', description: 'Programmable voice, SMS, and messaging APIs for global reach.', connected: false, logo: 'TW' },
  { id: 'exotel', name: 'Exotel', category: 'Telephony', description: 'Cloud telephony for Indian businesses with IVR and call tracking.', connected: false, logo: 'EX' },
  { id: 'knowlarity', name: 'Knowlarity', category: 'Telephony', description: 'Enterprise cloud communication platform with smart IVR.', connected: false, logo: 'KN' },
  { id: 'hubspot', name: 'HubSpot', category: 'CRM', description: 'Sync contacts, deals, and call logs with HubSpot CRM.', connected: true, logo: 'HS' },
  { id: 'salesforce', name: 'Salesforce', category: 'CRM', description: 'Push call outcomes and lead data to Salesforce automatically.', connected: false, logo: 'SF' },
  { id: 'zoho', name: 'Zoho CRM', category: 'CRM', description: 'Bi-directional sync with Zoho CRM for contacts and activities.', connected: false, logo: 'ZO' },
  { id: 'leadsquared', name: 'LeadSquared', category: 'CRM', description: 'Indian CRM integration for lead capture and nurturing.', connected: false, logo: 'LS' },
  { id: 'zapier', name: 'Zapier', category: 'Automation', description: 'Connect VoiceFlow AI with 5,000+ apps via automated workflows.', connected: false, logo: 'ZP' },
  { id: 'n8n', name: 'n8n', category: 'Automation', description: 'Self-hosted workflow automation with full control over your data.', connected: false, logo: 'N8' },
  { id: 'make', name: 'Make', category: 'Automation', description: 'Visual automation platform for complex multi-step workflows.', connected: false, logo: 'MK' },
  { id: 'google-calendar', name: 'Google Calendar', category: 'Calendar', description: 'Schedule and manage appointments directly from voice conversations.', connected: true, logo: 'GC' },
  { id: 'calcom', name: 'Cal.com', category: 'Calendar', description: 'Open-source scheduling infrastructure for booking meetings.', connected: false, logo: 'CC' },
]

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}

export default function Integrations() {
  const [activeCategory, setActiveCategory] = useState('All')
  const [search, setSearch] = useState('')

  const filtered = integrations.filter((i) => {
    const matchesCategory = activeCategory === 'All' || i.category === activeCategory
    const matchesSearch =
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.description.toLowerCase().includes(search.toLowerCase())
    return matchesCategory && matchesSearch
  })

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Integrations</h1>
        <p className="text-gray-500 mt-1">Connect your favorite tools and services with VoiceFlow AI</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeCategory === cat
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search integrations..."
            className="w-full bg-gray-50/50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
          />
        </div>
      </div>

      {/* Integration Cards */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        variants={container}
        initial="hidden"
        animate="show"
        key={activeCategory + search}
      >
        {filtered.map((integration) => {
          const colors = categoryColors[integration.category] || categoryColors.CRM
          return (
            <motion.div
              key={integration.id}
              variants={item}
              className="group p-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm hover:shadow-md hover:border-gray-300/60 transition-all duration-200"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors.ring} flex items-center justify-center text-sm font-bold text-white shadow-sm`}
                  >
                    {integration.logo}
                  </div>
                  <div>
                    <h3 className="text-gray-900 font-semibold text-sm">{integration.name}</h3>
                    <span className={`text-[11px] font-medium ${colors.text}`}>
                      {integration.category}
                    </span>
                  </div>
                </div>
                {integration.connected ? (
                  <span className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                    <Check className="w-3 h-3" />
                    Connected
                  </span>
                ) : (
                  <span className="px-2.5 py-1 text-[11px] font-medium rounded-full bg-gray-50 text-gray-500 border border-gray-200">
                    Not Connected
                  </span>
                )}
              </div>

              <p className="text-gray-500 text-sm leading-relaxed mb-4">{integration.description}</p>

              <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gradient-to-r hover:from-indigo-600 hover:to-violet-600 hover:text-white hover:border-transparent hover:shadow-sm hover:shadow-indigo-200 transition-all duration-200">
                {integration.connected ? (
                  <>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    Manage
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-3.5 h-3.5" />
                    Connect
                  </>
                )}
              </button>
            </motion.div>
          )
        })}
      </motion.div>

      {filtered.length === 0 && (
        <div className="p-12 text-center bg-white rounded-2xl border border-gray-200/60 shadow-sm">
          <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No integrations found</p>
          <p className="text-gray-400 text-sm mt-1">Try adjusting your search or category filter</p>
        </div>
      )}
    </div>
  )
}
