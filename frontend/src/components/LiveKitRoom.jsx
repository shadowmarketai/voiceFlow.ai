/**
 * LiveKitRoom — Real-time voice call component using LiveKit WebRTC
 *
 * Usage:
 *   <LiveKitRoom agentId="sales-bot" onEnd={() => ...} />
 */

import { useState, useEffect, useCallback } from 'react';
import { LiveKitRoom as LKRoom, useRoomContext, useParticipants, AudioTrack, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Phone, PhoneOff, Mic, MicOff, Volume2, Loader2 } from 'lucide-react';
import { livekitAPI } from '../services/api';

function CallUI({ onEnd }) {
  const room = useRoomContext();
  const participants = useParticipants();
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);

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
    room.disconnect();
    onEnd?.();
  }, [room, onEnd]);

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // Render audio tracks from remote participants (AI agent)
  const audioTracks = useTracks([Track.Source.Microphone], { onlySubscribed: true });

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

        <button className="p-4 rounded-full bg-gray-100 text-gray-700">
          <Volume2 className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}

export default function LiveKitVoiceRoom({ agentId = '', agentName = 'AI Assistant', userName = 'User', onEnd }) {
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
      <CallUI onEnd={handleEnd} />
    </LKRoom>
  );
}
