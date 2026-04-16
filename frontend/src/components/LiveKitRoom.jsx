/**
 * LiveKitRoom — Real-time voice call component using LiveKit WebRTC
 *
 * Usage:
 *   <LiveKitRoom agentId="sales-bot" onEnd={() => ...} />
 */

import { useState, useEffect, useCallback } from 'react';
import { LiveKitRoom as LKRoom, useRoomContext, useParticipants, AudioTrack, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Phone, PhoneOff, Mic, MicOff, Volume2, Loader2, Captions } from 'lucide-react';
import { livekitAPI } from '../services/api';
import useDeepgramStream from '../hooks/useDeepgramStream';
import { qualityAPI } from '../services/api';
import toast from 'react-hot-toast';

function CallUI({ onEnd, language = 'en', agentId }) {
  const room = useRoomContext();
  const participants = useParticipants();
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [showCaptions, setShowCaptions] = useState(true);
  const [showCsat, setShowCsat] = useState(false);

  // Phase-1 W1.1: streaming STT on top of the LiveKit WebRTC call.
  // Deepgram Nova-2 gives us ~200ms first-word latency vs ~1100ms batch.
  const { start: startStt, stop: stopStt, partial, finals, error: sttError } =
    useDeepgramStream({ language, diarize: true });

  // Start streaming once the call is connected; stop on unmount
  useEffect(() => {
    startStt();
    return () => stopStt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track duration
  useEffect(() => {
    const interval = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleMute = useCallback(() => {
    const localParticipant = room.localParticipant;
    if (localParticipant) {
      localParticipant.setMicrophoneEnabled(muted);
      setMuted(!muted);
    }
  }, [room, muted]);

  const handleEnd = useCallback(() => {
    // Before tearing down, show a quick CSAT rating; the actual disconnect
    // happens once the user picks a score (or dismisses).
    if (duration >= 10 && !showCsat) {
      setShowCsat(true);
      stopStt();
      return;
    }
    room.disconnect();
    onEnd?.();
  }, [room, onEnd, duration, showCsat, stopStt]);

  const submitCsat = async (score) => {
    try {
      await qualityAPI.submitCsat({
        score,
        agent_id: agentId || null,
        language: language || null,
        call_id: room?.name || null,
      });
      toast.success(`Thanks — rated ${score}★`);
    } catch {
      // silent — telemetry never blocks
    }
    setShowCsat(false);
    room.disconnect();
    onEnd?.();
  };

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // Render audio tracks from remote participants (AI agent)
  const audioTracks = useTracks([Track.Source.Microphone], { onlySubscribed: true });

  // CSAT modal — lands after the user hits "End"
  if (showCsat) {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <p className="text-sm text-gray-500">Call ended · {formatTime(duration)}</p>
        <h3 className="text-lg font-semibold text-gray-900">How was this call?</h3>
        <p className="text-xs text-gray-500 -mt-2">Your rating helps us improve — 30d average is shown on the Quality dashboard.</p>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => submitCsat(n)}
              className="w-12 h-12 rounded-full border-2 border-gray-200 hover:border-indigo-500 hover:bg-indigo-50 text-lg font-bold text-gray-700">
              {n}★
            </button>
          ))}
        </div>
        <button onClick={() => { setShowCsat(false); room.disconnect(); onEnd?.() }}
          className="text-xs text-gray-400 hover:text-gray-600">Skip</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      {/* Audio tracks (hidden — just play audio) */}
      {audioTracks.map((track) => (
        <AudioTrack key={track.participant.sid + track.source} trackRef={track} />
      ))}

      {/* Call status */}
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-sm font-medium text-emerald-700">Connected via LiveKit</span>
      </div>

      {/* Duration */}
      <p className="text-3xl font-mono font-bold text-gray-900">{formatTime(duration)}</p>

      {/* Participants */}
      <p className="text-xs text-gray-500">
        {participants.length} participant{participants.length !== 1 ? 's' : ''} in room
      </p>

      {/* Live captions (Deepgram streaming STT) */}
      {showCaptions && (
        <div className="w-full max-w-md min-h-[80px] p-3 rounded-xl bg-gray-50 border border-gray-200 space-y-1.5 max-h-[140px] overflow-y-auto">
          {finals.slice(-4).map((f, i) => (
            <p key={i} className="text-xs text-gray-800 leading-snug">
              {f.speaker != null && (
                <span className="inline-block px-1 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[9px] font-mono mr-1">
                  S{f.speaker}
                </span>
              )}
              {f.text}
            </p>
          ))}
          {partial && (
            <p className="text-xs text-gray-400 italic leading-snug">
              {partial}<span className="inline-block w-1 h-3 bg-gray-400 ml-0.5 animate-pulse" />
            </p>
          )}
          {!finals.length && !partial && (
            <p className="text-xs text-gray-400 text-center">Listening — live captions will appear here</p>
          )}
          {sttError && (
            <p className="text-xs text-red-600">{sttError}</p>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleMute}
          className={`p-4 rounded-full transition-all ${
            muted
              ? 'bg-red-100 text-red-600 hover:bg-red-200'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>

        <button
          onClick={handleEnd}
          className="p-4 rounded-full bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-200 transition-all"
        >
          <PhoneOff className="w-6 h-6" />
        </button>

        <button
          onClick={() => setShowCaptions(v => !v)}
          className={`p-4 rounded-full transition-all ${showCaptions ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          title="Toggle live captions"
        >
          <Captions className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}

export default function LiveKitVoiceRoom({ agentId = '', agentName = 'AI Assistant', userName = 'User', language = 'en', onEnd }) {
  const [token, setToken] = useState(null);
  const [livekitUrl, setLivekitUrl] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);

  const startCall = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const { data } = await livekitAPI.createRoom({
        agent_id: agentId,
        agent_name: agentName,
        user_name: userName,
      });
      setToken(data.token);
      setLivekitUrl(data.livekit_url);
      setConnected(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to connect to LiveKit');
    }
    setConnecting(false);
  }, [agentId, agentName, userName]);

  const handleEnd = useCallback(() => {
    setToken(null);
    setConnected(false);
    onEnd?.();
  }, [onEnd]);

  // Not connected — show start button
  if (!connected || !token) {
    return (
      <div className="flex flex-col items-center gap-4 p-8">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-200">
          <Phone className="w-10 h-10 text-white" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">Voice Call</h3>
        <p className="text-sm text-gray-500 text-center max-w-xs">
          Start a real-time voice conversation with the AI agent using LiveKit WebRTC.
        </p>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl">{error}</p>
        )}
        <button
          onClick={startCall}
          disabled={connecting}
          className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold shadow-lg shadow-emerald-200 hover:shadow-xl transition-all disabled:opacity-50"
        >
          {connecting ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Connecting...</>
          ) : (
            <><Phone className="w-5 h-5" /> Start Voice Call</>
          )}
        </button>
        <p className="text-[10px] text-gray-400">Powered by LiveKit WebRTC — zero telephony cost</p>
      </div>
    );
  }

  // Connected — show LiveKit room
  return (
    <LKRoom
      serverUrl={livekitUrl}
      token={token}
      connect={true}
      audio={true}
      video={false}
      onDisconnected={handleEnd}
    >
      <CallUI onEnd={handleEnd} language={language} agentId={agentId} />
    </LKRoom>
  );
}
