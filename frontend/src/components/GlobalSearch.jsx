import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, Phone, Users, Bot, Megaphone, FileText, Headphones, ArrowRight, Clock } from 'lucide-react'
import { leadsAPI, callsAPI, assistantsAPI, campaignsAPI } from '../services/api'

const RECENT_KEY = 'voiceflow_recent_searches'

function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
}
function saveRecent(query) {
  if (!query.trim()) return
  const prev = getRecent().filter(q => q !== query).slice(0, 4)
  localStorage.setItem(RECENT_KEY, JSON.stringify([query, ...prev]))
}

const CATEGORY_META = {
  leads:     { label: 'Leads',      icon: Users,     color: 'text-blue-500',   path: '/leads' },
  calls:     { label: 'Calls',      icon: Phone,     color: 'text-green-500',  path: '/calls' },
  assistants:{ label: 'Assistants', icon: Bot,       color: 'text-purple-500', path: '/assistants' },
  campaigns: { label: 'Campaigns',  icon: Megaphone, color: 'text-orange-500', path: '/campaigns' },
}

export default function GlobalSearch({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState({})
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(0)
  const [recent, setRecent] = useState(getRecent)
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const debounceRef = useRef(null)

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
      setResults({})
      setSelected(0)
      setRecent(getRecent())
    }
  }, [open])

  // Keyboard: close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults({}); setLoading(false); return }
    setLoading(true)
    const searches = await Promise.allSettled([
      leadsAPI.getAll({ search: q, limit: 3 }),
      callsAPI.getAll({ search: q, limit: 3 }),
      assistantsAPI.getAll(),
      campaignsAPI.getAll({ search: q, limit: 3 }),
    ])
    const [leadsRes, callsRes, assistantsRes, campaignsRes] = searches
    const newResults = {}

    const leads = leadsRes.status === 'fulfilled' ? leadsRes.value.data?.leads || [] : []
    if (leads.length) newResults.leads = leads.slice(0, 3).map(l => ({ id: l.id, title: l.name, subtitle: l.phone || l.email || '', path: '/leads' }))

    const calls = callsRes.status === 'fulfilled' ? callsRes.value.data?.calls || [] : []
    if (calls.length) newResults.calls = calls.slice(0, 3).map(c => ({ id: c.id, title: c.contact_name || c.phone_number, subtitle: `${c.duration_seconds || 0}s · ${c.status}`, path: '/calls' }))

    const allAssistants = assistantsRes.status === 'fulfilled' ? assistantsRes.value.data?.assistants || [] : []
    const filteredA = allAssistants.filter(a => a.name?.toLowerCase().includes(q.toLowerCase()))
    if (filteredA.length) newResults.assistants = filteredA.slice(0, 3).map(a => ({ id: a.id, title: a.name, subtitle: a.voice || '', path: '/assistants' }))

    const campaigns = campaignsRes.status === 'fulfilled' ? campaignsRes.value.data?.campaigns || [] : []
    if (campaigns.length) newResults.campaigns = campaigns.slice(0, 3).map(c => ({ id: c.id, title: c.name, subtitle: c.status || '', path: '/campaigns' }))

    setResults(newResults)
    setLoading(false)
    setSelected(0)
  }, [])

  const handleQueryChange = (val) => {
    setQuery(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(val), 300)
  }

  // Flatten all results for keyboard nav
  const flatItems = Object.entries(results).flatMap(([cat, items]) =>
    items.map(item => ({ ...item, category: cat }))
  )

  const handleSelect = (item) => {
    saveRecent(query || item.title)
    setRecent(getRecent())
    navigate(item.path)
    onClose()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, flatItems.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter' && flatItems[selected]) handleSelect(flatItems[selected])
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-start justify-center pt-20 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search leads, calls, assistants, campaigns..."
            className="flex-1 text-base outline-none text-gray-900 placeholder-gray-400"
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {loading && <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />}
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {!query && (
            <div className="p-4">
              {recent.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">Recent Searches</p>
                  {recent.map((r, i) => (
                    <button
                      key={i}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 text-left"
                      onClick={() => handleQueryChange(r)}
                    >
                      <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-sm text-gray-600">{r}</span>
                    </button>
                  ))}
                </>
              )}
              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">Quick Navigate</p>
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(CATEGORY_META).map(([key, meta]) => {
                    const Icon = meta.icon
                    return (
                      <button
                        key={key}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-50 text-left"
                        onClick={() => { navigate(meta.path); onClose() }}
                      >
                        <Icon className={`w-4 h-4 ${meta.color}`} />
                        <span className="text-sm text-gray-700">{meta.label}</span>
                        <ArrowRight className="w-3 h-3 text-gray-300 ml-auto" />
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {query && Object.keys(results).length === 0 && !loading && (
            <div className="py-12 text-center">
              <Search className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">No results for "<span className="font-medium">{query}</span>"</p>
            </div>
          )}

          {query && Object.entries(results).map(([cat, items]) => {
            const meta = CATEGORY_META[cat]
            const Icon = meta.icon
            return (
              <div key={cat} className="px-2 py-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 mb-1">{meta.label}</p>
                {items.map((item, idx) => {
                  const globalIdx = flatItems.findIndex(f => f.id === item.id && f.category === cat)
                  const isSelected = globalIdx === selected
                  return (
                    <button
                      key={item.id}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${isSelected ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                      onClick={() => handleSelect({ ...item, category: cat })}
                    >
                      <div className={`w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`w-4 h-4 ${meta.color}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                        {item.subtitle && <p className="text-xs text-gray-400 truncate">{item.subtitle}</p>}
                      </div>
                      <ArrowRight className="w-3 h-3 text-gray-300 ml-auto flex-shrink-0" />
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-400">
          <span><kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">↑↓</kbd> navigate</span>
          <span><kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">↵</kbd> select</span>
          <span><kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">Esc</kbd> close</span>
          <span className="ml-auto">Press <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">⌘K</kbd> anytime</span>
        </div>
      </div>
    </div>
  )
}
