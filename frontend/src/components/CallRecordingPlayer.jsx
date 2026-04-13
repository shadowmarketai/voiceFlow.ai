/**
 * Call Recording Player Component
 * Features: Waveform visualization, playback controls, transcription display
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Download,
  Share2,
  Clock,
  User,
  Bot,
  Maximize2
} from 'lucide-react';

// Audio Waveform Visualization Component
const Waveform = ({ audioUrl, currentTime, duration, onSeek }) => {
  const canvasRef = useRef(null);
  const [waveformData, setWaveformData] = useState([]);
  
  useEffect(() => {
    // Generate mock waveform data (in production, analyze actual audio)
    const data = Array.from({ length: 100 }, () => Math.random() * 0.5 + 0.2);
    setWaveformData(data);
  }, [audioUrl]);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || waveformData.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const barWidth = width / waveformData.length;
    const progress = duration > 0 ? currentTime / duration : 0;
    
    ctx.clearRect(0, 0, width, height);
    
    waveformData.forEach((value, index) => {
      const barHeight = value * height;
      const x = index * barWidth;
      const y = (height - barHeight) / 2;
      
      // Color based on playback progress
      const isPlayed = index / waveformData.length < progress;
      ctx.fillStyle = isPlayed ? '#4f46e5' : '#e5e7eb';
      
      ctx.fillRect(x, y, barWidth - 1, barHeight);
    });
  }, [waveformData, currentTime, duration]);
  
  const handleClick = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const progress = x / rect.width;
    onSeek(progress * duration);
  };
  
  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={60}
      className="w-full h-15 cursor-pointer rounded"
      onClick={handleClick}
    />
  );
};

// Format time helper
const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Main Call Recording Player Component
export const CallRecordingPlayer = ({
  recording,
  transcription = [],
  onClose,
  className = ''
}) => {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [activeTranscriptIndex, setActiveTranscriptIndex] = useState(-1);
  
  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);
    
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);
    
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);
  
  // Update active transcript based on current time
  useEffect(() => {
    const index = transcription.findIndex((item, i) => {
      const nextItem = transcription[i + 1];
      return currentTime >= item.startTime && 
             (!nextItem || currentTime < nextItem.startTime);
    });
    setActiveTranscriptIndex(index);
  }, [currentTime, transcription]);
  
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);
  
  const seek = useCallback((time) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(time, duration));
  }, [duration]);
  
  const skip = useCallback((seconds) => {
    seek(currentTime + seconds);
  }, [currentTime, seek]);
  
  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);
  
  const changeVolume = useCallback((value) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = value;
    setVolume(value);
    if (value === 0) {
      setIsMuted(true);
    } else if (isMuted) {
      setIsMuted(false);
    }
  }, [isMuted]);
  
  const changePlaybackRate = useCallback((rate) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = rate;
    setPlaybackRate(rate);
  }, []);
  
  const jumpToTranscript = useCallback((item) => {
    seek(item.startTime);
  }, [seek]);
  
  const downloadRecording = useCallback(() => {
    const link = document.createElement('a');
    link.href = recording.url;
    link.download = `call-${recording.id}.wav`;
    link.click();
  }, [recording]);
  
  return (
    <div className={`bg-white rounded-xl shadow-lg overflow-hidden ${className}`}>
      {/* Hidden audio element */}
      <audio ref={audioRef} src={recording.url} preload="metadata" />
      
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg">{recording.customerName || 'Call Recording'}</h3>
            <p className="text-indigo-200 text-sm flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {recording.date} • {formatTime(duration)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadRecording}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              title="Download"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              title="Share"
            >
              <Share2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
      
      {/* Waveform & Controls */}
      <div className="p-4 border-b">
        <Waveform
          audioUrl={recording.url}
          currentTime={currentTime}
          duration={duration}
          onSeek={seek}
        />
        
        {/* Time display */}
        <div className="flex justify-between text-sm text-gray-500 mt-2">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
        
        {/* Playback controls */}
        <div className="flex items-center justify-center gap-4 mt-4">
          <button
            onClick={() => skip(-10)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            title="Rewind 10s"
          >
            <SkipBack className="w-5 h-5 text-gray-600" />
          </button>
          
          <button
            onClick={togglePlay}
            className="p-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition-colors shadow-lg"
          >
            {isPlaying ? (
              <Pause className="w-6 h-6" />
            ) : (
              <Play className="w-6 h-6 ml-0.5" />
            )}
          </button>
          
          <button
            onClick={() => skip(10)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            title="Forward 10s"
          >
            <SkipForward className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        
        {/* Secondary controls */}
        <div className="flex items-center justify-between mt-4">
          {/* Volume */}
          <div className="flex items-center gap-2">
            <button onClick={toggleMute} className="p-1 hover:bg-gray-100 rounded">
              {isMuted || volume === 0 ? (
                <VolumeX className="w-5 h-5 text-gray-500" />
              ) : (
                <Volume2 className="w-5 h-5 text-gray-500" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={isMuted ? 0 : volume}
              onChange={(e) => changeVolume(parseFloat(e.target.value))}
              className="w-20 accent-indigo-600"
            />
          </div>
          
          {/* Playback speed */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Speed:</span>
            <select
              value={playbackRate}
              onChange={(e) => changePlaybackRate(parseFloat(e.target.value))}
              className="text-sm border rounded px-2 py-1"
            >
              <option value={0.5}>0.5x</option>
              <option value={0.75}>0.75x</option>
              <option value={1}>1x</option>
              <option value={1.25}>1.25x</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2x</option>
            </select>
          </div>
        </div>
      </div>
      
      {/* Transcription */}
      {transcription.length > 0 && (
        <div className="p-4 max-h-80 overflow-y-auto">
          <h4 className="font-semibold text-gray-700 mb-3">Transcription</h4>
          <div className="space-y-3">
            {transcription.map((item, index) => (
              <div
                key={index}
                onClick={() => jumpToTranscript(item)}
                className={`flex gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                  index === activeTranscriptIndex
                    ? 'bg-indigo-50 border border-indigo-200'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  item.speaker === 'agent' || item.speaker === 'ai'
                    ? 'bg-indigo-100 text-indigo-600'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {item.speaker === 'agent' || item.speaker === 'ai' ? (
                    <Bot className="w-4 h-4" />
                  ) : (
                    <User className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 capitalize">
                      {item.speaker}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatTime(item.startTime)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Call Summary */}
      {recording.summary && (
        <div className="p-4 bg-gray-50 border-t">
          <h4 className="font-semibold text-gray-700 mb-2">Call Summary</h4>
          <p className="text-sm text-gray-600">{recording.summary}</p>
          
          {recording.sentiment && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm text-gray-500">Sentiment:</span>
              <span className={`px-2 py-0.5 rounded text-sm font-medium ${
                recording.sentiment === 'positive'
                  ? 'bg-green-100 text-green-700'
                  : recording.sentiment === 'negative'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-gray-100 text-gray-700'
              }`}>
                {recording.sentiment}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Mini Player for list views
export const MiniRecordingPlayer = ({ recording, onExpand }) => {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const togglePlay = (e) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };
  
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const handleTimeUpdate = () => {
      setProgress((audio.currentTime / audio.duration) * 100 || 0);
    };
    const handleEnded = () => setIsPlaying(false);
    
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);
  
  return (
    <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
      <audio ref={audioRef} src={recording.url} preload="metadata" />
      
      <button
        onClick={togglePlay}
        className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition-colors"
      >
        {isPlaying ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" />
        )}
      </button>
      
      <div className="flex-1">
        <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-600 transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      
      <span className="text-xs text-gray-500">{recording.duration}</span>
      
      <button
        onClick={() => onExpand?.(recording)}
        className="p-1 hover:bg-gray-200 rounded"
        title="Expand"
      >
        <Maximize2 className="w-4 h-4 text-gray-500" />
      </button>
    </div>
  );
};

export default CallRecordingPlayer;
