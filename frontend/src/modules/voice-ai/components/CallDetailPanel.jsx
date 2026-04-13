import React, { useState } from 'react';
import { Phone, PhoneOff, Volume2, Mic, Clock, User, Bot, MessageSquare, X } from 'lucide-react';
import CollapsibleSection from './CollapsibleSection';
import DialectBadge from './DialectBadge';
import EmotionIndicator from './EmotionIndicator';
import GenZBadge from './GenZBadge';

const tabs = [
  { id: 'transcript', label: 'Transcript' },
  { id: 'details', label: 'Details' },
  { id: 'actions', label: 'Actions' },
];

export default function CallDetailPanel({ call, onClose, onAction }) {
  const [activeTab, setActiveTab] = useState('transcript');

  if (!call) return null;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
            <User className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 dark:text-white truncate">{call.name}</p>
            <p className="text-xs text-slate-500">{call.phone}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Quick info bar */}
      <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-700/50 flex items-center gap-3 flex-wrap">
        {call.dialect && <DialectBadge dialect={call.dialect} confidence={call.dialectConfidence} />}
        {call.emotion && <EmotionIndicator emotion={call.emotion} confidence={call.emotionConfidence} showBar={false} />}
        {call.genZScore > 0 && <GenZBadge score={call.genZScore} terms={call.genZTerms} />}
        {call.codeMixRatio > 0 && (
          <span className="text-xs px-1.5 py-0.5 bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 rounded font-medium">
            Mix {Math.round(call.codeMixRatio * 100)}%
          </span>
        )}
        <span className="ml-auto text-xs text-slate-400 flex items-center gap-1">
          <Clock className="w-3 h-3" /> {call.duration}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'transcript' && (
          <div className="space-y-3">
            {(call.transcript || []).map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.speaker === 'agent' ? '' : 'flex-row-reverse'}`}>
                <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                  msg.speaker === 'agent' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'
                }`}>
                  {msg.speaker === 'agent' ? <Bot className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                </div>
                <div className={`max-w-[80%] ${msg.speaker === 'agent' ? '' : 'text-right'}`}>
                  <p className={`text-sm px-3 py-2 rounded-xl ${
                    msg.speaker === 'agent'
                      ? 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-200'
                  }`}>
                    {msg.text}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-slate-400">{msg.time}</span>
                    {msg.emotion && <EmotionIndicator emotion={msg.emotion} showBar={false} />}
                  </div>
                </div>
              </div>
            ))}
            {(!call.transcript || call.transcript.length === 0) && (
              <p className="text-sm text-slate-400 text-center py-8">No transcript available</p>
            )}
          </div>
        )}

        {activeTab === 'details' && (
          <div className="space-y-4">
            <CollapsibleSection title="Dialect Analysis" badge={call.dialect}>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Primary Dialect</span>
                  <DialectBadge dialect={call.dialect} confidence={call.dialectConfidence} size="lg" />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Language</span>
                  <span className="text-slate-900 dark:text-white">{call.language || 'Tamil'}</span>
                </div>
                {call.dialectPatterns?.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1.5">Detected Patterns</p>
                    <div className="flex flex-wrap gap-1">
                      {call.dialectPatterns.map((p, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Emotion Analysis" badge={call.emotion}>
              <div className="space-y-3">
                <EmotionIndicator emotion={call.emotion} confidence={call.emotionConfidence} size="lg" />
                {call.emotionTrend && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1.5">Emotion Trend</p>
                    <div className="flex items-center gap-1">
                      {call.emotionTrend.map((e, i) => (
                        <React.Fragment key={i}>
                          <EmotionIndicator emotion={e} showBar={false} />
                          {i < call.emotionTrend.length - 1 && <span className="text-slate-300">&rarr;</span>}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="GenZ & Code-Mixing">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">GenZ Score</span>
                  <GenZBadge score={call.genZScore} terms={call.genZTerms} size="lg" />
                </div>
                {call.genZTerms?.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1.5">Detected Terms</p>
                    <div className="flex flex-wrap gap-1">
                      {call.genZTerms.map((t, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 rounded">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Code-Mix Ratio</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {call.codeMixRatio ? `${Math.round(call.codeMixRatio * 100)}%` : 'N/A'}
                  </span>
                </div>
                {call.codeMixLanguages && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Languages Mixed</span>
                    <span className="text-slate-700 dark:text-slate-300">{call.codeMixLanguages}</span>
                  </div>
                )}
              </div>
            </CollapsibleSection>
          </div>
        )}

        {activeTab === 'actions' && (
          <div className="space-y-3">
            <button
              onClick={() => onAction?.('listen', call)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
            >
              <Volume2 className="w-5 h-5" />
              <div className="text-left">
                <p className="text-sm font-medium">Listen In</p>
                <p className="text-xs opacity-70">Monitor this call silently</p>
              </div>
            </button>
            <button
              onClick={() => onAction?.('whisper', call)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-xl hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
            >
              <Mic className="w-5 h-5" />
              <div className="text-left">
                <p className="text-sm font-medium">Whisper</p>
                <p className="text-xs opacity-70">Coach the AI agent live</p>
              </div>
            </button>
            <button
              onClick={() => onAction?.('takeover', call)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
            >
              <Phone className="w-5 h-5" />
              <div className="text-left">
                <p className="text-sm font-medium">Take Over</p>
                <p className="text-xs opacity-70">Switch to human agent</p>
              </div>
            </button>
            <button
              onClick={() => onAction?.('end', call)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            >
              <PhoneOff className="w-5 h-5" />
              <div className="text-left">
                <p className="text-sm font-medium">End Call</p>
                <p className="text-xs opacity-70">Terminate this call</p>
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
