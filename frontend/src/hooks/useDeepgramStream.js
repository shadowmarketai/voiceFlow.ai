/**
 * useDeepgramStream — live STT via our server-side Deepgram WebSocket proxy.
 *
 *   const { start, stop, recording, partial, finals, error } = useDeepgramStream({ language: 'en' })
 *
 * What it does:
 *   1. Opens WS to  <API_BASE>/api/v1/stt/stream?language=...
 *   2. Captures mic via getUserMedia @ 16 kHz mono
 *   3. Converts float32 → int16 linear PCM on the fly (AudioWorklet) and
 *      sends 200 ms chunks to the server, which relays to Deepgram Nova-2.
 *   4. Streams back {type: 'partial'|'final', text, speaker, confidence}.
 *
 * `partial` is the rolling in-flight text; `finals` accumulates committed
 * utterances with speaker tags.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001'
const WS_BASE = API_BASE.replace(/^http/, 'ws')

export default function useDeepgramStream({ language = '', diarize = true } = {}) {
  const [recording, setRecording] = useState(false)
  const [partial, setPartial] = useState('')
  const [finals, setFinals] = useState([])          // [{speaker, text}]
  const [error, setError] = useState(null)

  const wsRef = useRef(null)
  const audioCtxRef = useRef(null)
  const streamRef = useRef(null)
  const workletNodeRef = useRef(null)

  const stop = useCallback(() => {
    try { wsRef.current?.send?.('close') } catch {}
    try { wsRef.current?.close?.() } catch {}
    try { workletNodeRef.current?.disconnect?.() } catch {}
    try { audioCtxRef.current?.close?.() } catch {}
    streamRef.current?.getTracks?.().forEach((t) => t.stop())
    wsRef.current = null
    workletNodeRef.current = null
    audioCtxRef.current = null
    streamRef.current = null
    setRecording(false)
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setPartial('')
    setFinals([])
    try {
      // 1. Grab the mic
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      })
      streamRef.current = stream

      // 2. Open the WebSocket
      const qs = new URLSearchParams()
      if (language) qs.set('language', language)
      qs.set('diarize', diarize ? 'true' : 'false')
      const ws = new WebSocket(`${WS_BASE}/api/v1/stt/stream?${qs.toString()}`)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data)
          if (msg.type === 'partial') {
            setPartial(msg.text || '')
          } else if (msg.type === 'final') {
            setPartial('')
            setFinals((prev) => [...prev, {
              speaker: msg.speaker ?? null,
              text: msg.text || '',
              confidence: msg.confidence ?? 1,
            }])
          } else if (msg.type === 'error') {
            setError(msg.message || 'Streaming error')
          }
        } catch {}
      }
      ws.onerror = () => setError('WebSocket error — server unreachable')
      ws.onclose = () => setRecording(false)

      await new Promise((resolve, reject) => {
        ws.onopen = resolve
        ws.onerror = reject
        setTimeout(() => reject(new Error('WS open timeout')), 5000)
      })

      // 3. Audio graph: source → worklet → (no output, side-effect WS send)
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
      audioCtxRef.current = audioCtx

      const processorUrl = URL.createObjectURL(new Blob([`
        class PCM16Processor extends AudioWorkletProcessor {
          process(inputs) {
            const input = inputs[0];
            if (!input || !input[0]) return true;
            const ch = input[0];                          // Float32Array [-1, 1]
            const pcm = new Int16Array(ch.length);
            for (let i = 0; i < ch.length; i++) {
              const s = Math.max(-1, Math.min(1, ch[i]));
              pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            this.port.postMessage(pcm.buffer, [pcm.buffer]);
            return true;
          }
        }
        registerProcessor('pcm16', PCM16Processor);
      `], { type: 'application/javascript' }))

      await audioCtx.audioWorklet.addModule(processorUrl)
      URL.revokeObjectURL(processorUrl)

      const src = audioCtx.createMediaStreamSource(stream)
      const node = new AudioWorkletNode(audioCtx, 'pcm16')
      workletNodeRef.current = node

      node.port.onmessage = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(e.data) } catch {}
        }
      }
      src.connect(node)
      // Don't connect node to destination — we don't want to hear ourselves.

      setRecording(true)
    } catch (e) {
      setError(e.message || 'Failed to start streaming')
      stop()
    }
  }, [language, diarize, stop])

  useEffect(() => () => stop(), [stop])

  return { start, stop, recording, partial, finals, error }
}
