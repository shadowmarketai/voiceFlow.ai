/**
 * RealtimeContext — Singleton WebSocket connection for the whole app.
 *
 * Connects to /api/v1/ws using the JWT from localStorage. Auto-reconnects on
 * disconnect with exponential backoff. Exposes:
 *
 *   const { connected, subscribe, lastEvent } = useRealtime()
 *   subscribe('ticket.created', (payload) => { ... })
 *
 * Subscriptions are React-friendly: unsubscribe automatically on unmount via
 * the useRealtimeEvent helper hook.
 */

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from './AuthContext'

const RealtimeContext = createContext(null)

// Build WS URL based on the Vite API URL (http://localhost:8000 → ws://localhost:8000)
function buildWsUrl(token) {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const wsBase = base.replace(/^https?:/, base.startsWith('https') ? 'wss:' : 'ws:')
  return `${wsBase}/api/v1/ws?token=${encodeURIComponent(token)}`
}

export function RealtimeProvider({ children }) {
  const { user } = useAuth()
  const [connected, setConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState(null)
  const wsRef = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef(null)
  const subscribersRef = useRef(new Map()) // event_type → Set<callback>

  const dispatch = useCallback((envelope) => {
    setLastEvent(envelope)
    const subs = subscribersRef.current.get(envelope.type)
    if (subs) {
      subs.forEach((cb) => {
        try { cb(envelope.payload, envelope) } catch (e) { console.error('WS subscriber error', e) }
      })
    }
    // Wildcard subscribers
    const wildcards = subscribersRef.current.get('*')
    if (wildcards) {
      wildcards.forEach((cb) => {
        try { cb(envelope.payload, envelope) } catch (e) { console.error('WS wildcard error', e) }
      })
    }
  }, [])

  const connect = useCallback(() => {
    const token = localStorage.getItem('swetha_token')
    if (!token || token === 'demo-token-123') {
      // No real JWT — skip WS
      return
    }
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return
    }

    const url = buildWsUrl(token)
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('[WS] connected')
      setConnected(true)
      reconnectAttemptsRef.current = 0
    }

    ws.onmessage = (event) => {
      try {
        const envelope = JSON.parse(event.data)
        dispatch(envelope)
      } catch (e) {
        console.warn('[WS] non-JSON message', event.data)
      }
    }

    ws.onerror = (event) => {
      console.warn('[WS] error', event)
    }

    ws.onclose = (event) => {
      console.log('[WS] closed', event.code, event.reason)
      setConnected(false)
      wsRef.current = null
      // Auto-reconnect with exponential backoff (max 30s) — unless cleanly closed
      if (event.code !== 1000 && event.code !== 4401) {
        const attempt = reconnectAttemptsRef.current + 1
        reconnectAttemptsRef.current = attempt
        const delay = Math.min(1000 * Math.pow(1.5, attempt), 30000)
        console.log(`[WS] reconnecting in ${delay}ms (attempt ${attempt})`)
        reconnectTimerRef.current = setTimeout(connect, delay)
      }
    }
  }, [dispatch])

  // Connect when user logs in; disconnect on logout
  useEffect(() => {
    if (user && !user.is_super_admin === false) {
      // Both tenant and super admin should connect
      connect()
    } else if (user) {
      connect()
    } else {
      // Logged out — close
      if (wsRef.current) {
        wsRef.current.close(1000, 'logout')
        wsRef.current = null
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      setConnected(false)
    }
    return () => {
      // cleanup on user change
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }
  }, [user, connect])

  // Heartbeat ping every 30s
  useEffect(() => {
    if (!connected) return
    const interval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [connected])

  const subscribe = useCallback((eventType, callback) => {
    if (!subscribersRef.current.has(eventType)) {
      subscribersRef.current.set(eventType, new Set())
    }
    subscribersRef.current.get(eventType).add(callback)
    return () => {
      const subs = subscribersRef.current.get(eventType)
      if (subs) {
        subs.delete(callback)
        if (subs.size === 0) subscribersRef.current.delete(eventType)
      }
    }
  }, [])

  return (
    <RealtimeContext.Provider value={{ connected, lastEvent, subscribe }}>
      {children}
    </RealtimeContext.Provider>
  )
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext)
  if (!ctx) throw new Error('useRealtime must be used within RealtimeProvider')
  return ctx
}

/**
 * Convenience hook: subscribe to a specific event type and auto-unsub on unmount.
 *
 *   useRealtimeEvent('ticket.created', (payload) => {
 *     setTickets((t) => [payload, ...t])
 *   })
 */
export function useRealtimeEvent(eventType, handler) {
  const { subscribe } = useRealtime()
  const handlerRef = useRef(handler)
  useEffect(() => { handlerRef.current = handler }, [handler])

  useEffect(() => {
    const unsub = subscribe(eventType, (payload, envelope) => {
      handlerRef.current(payload, envelope)
    })
    return unsub
  }, [eventType, subscribe])
}
