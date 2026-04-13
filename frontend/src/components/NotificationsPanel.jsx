import { useState, useEffect, useRef } from 'react'
import { Bell, Phone, Users, Megaphone, CheckCircle, X, Check, Dot } from 'lucide-react'

const MOCK_NOTIFICATIONS = [
  { id: '1', type: 'call', title: 'New call completed', body: 'Priya Sharma — 4m 32s · Interested', time: '2m ago', read: false },
  { id: '2', type: 'lead', title: 'New lead added', body: 'Raj Kumar via Landing Page', time: '15m ago', read: false },
  { id: '3', type: 'campaign', title: 'Campaign launched', body: 'Q1 Real Estate Follow-up — 250 contacts', time: '1h ago', read: false },
  { id: '4', type: 'call', title: 'Call transferred', body: 'Ananya Das → Sales team', time: '2h ago', read: true },
  { id: '5', type: 'lead', title: 'Lead status updated', body: 'Vikram Nair → Qualified', time: '3h ago', read: true },
  { id: '6', type: 'campaign', title: 'Campaign completed', body: 'Diwali Offer blast — 89% connect rate', time: '5h ago', read: true },
  { id: '7', type: 'call', title: 'Missed call follow-up', body: 'Meera Pillai — callback scheduled', time: '1d ago', read: true },
]

const TYPE_META = {
  call:     { icon: Phone,     color: 'bg-green-100 text-green-600' },
  lead:     { icon: Users,     color: 'bg-blue-100 text-blue-600' },
  campaign: { icon: Megaphone, color: 'bg-orange-100 text-orange-600' },
}

export default function NotificationsPanel() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS)
  const panelRef = useRef(null)

  const unreadCount = notifications.filter(n => !n.read).length

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const markRead = (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const dismiss = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        className="relative p-2 hover:bg-gray-100 rounded-xl"
        onClick={() => setOpen(!open)}
      >
        <Bell className="w-6 h-6 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-danger-500 rounded-full border-2 border-white flex items-center justify-center text-[10px] text-white font-bold leading-none px-0.5">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900">Notifications</h3>
              {unreadCount > 0 && (
                <span className="text-xs font-semibold bg-danger-100 text-danger-600 px-2 py-0.5 rounded-full">{unreadCount} new</span>
              )}
            </div>
            <button
              onClick={markAllRead}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
            >
              <Check className="w-3 h-3" /> Mark all read
            </button>
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <div className="py-12 text-center">
                <Bell className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No notifications</p>
              </div>
            ) : (
              notifications.map(notif => {
                const meta = TYPE_META[notif.type] || TYPE_META.call
                const Icon = meta.icon
                return (
                  <div
                    key={notif.id}
                    className={`flex items-start gap-3 px-5 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors ${!notif.read ? 'bg-brand-50/30' : ''}`}
                    onClick={() => markRead(notif.id)}
                  >
                    {/* Icon */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={`text-sm font-medium truncate ${!notif.read ? 'text-gray-900' : 'text-gray-700'}`}>{notif.title}</p>
                        {!notif.read && <span className="w-2 h-2 bg-brand-500 rounded-full flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{notif.body}</p>
                      <p className="text-xs text-gray-400 mt-1">{notif.time}</p>
                    </div>

                    {/* Dismiss */}
                    <button
                      className="p-1 hover:bg-gray-200 rounded-lg opacity-0 group-hover:opacity-100 flex-shrink-0 mt-0.5"
                      onClick={e => { e.stopPropagation(); dismiss(notif.id) }}
                    >
                      <X className="w-3 h-3 text-gray-400" />
                    </button>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-100 text-center">
              <button
                className="text-sm text-brand-600 hover:text-brand-700 font-medium"
                onClick={() => setOpen(false)}
              >
                View all activity →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
