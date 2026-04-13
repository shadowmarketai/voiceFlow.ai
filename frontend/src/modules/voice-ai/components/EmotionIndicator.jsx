import React from 'react';

const emotionConfig = {
  happy:    { color: 'bg-emerald-500', label: 'Happy',    bg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  sad:      { color: 'bg-blue-500',    label: 'Sad',      bg: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  angry:    { color: 'bg-red-500',     label: 'Angry',    bg: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  neutral:  { color: 'bg-slate-400',   label: 'Neutral',  bg: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400' },
  excited:  { color: 'bg-amber-500',   label: 'Excited',  bg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  confused: { color: 'bg-purple-500',  label: 'Confused', bg: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
};

export default function EmotionIndicator({ emotion, confidence, showBar = true, size = 'sm' }) {
  const config = emotionConfig[emotion] || emotionConfig.neutral;
  const sizeClass = size === 'lg' ? 'text-sm' : 'text-xs';

  return (
    <div className="inline-flex items-center gap-2">
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium ${config.bg} ${sizeClass}`}>
        {config.label}
      </span>
      {showBar && confidence != null && (
        <div className="flex items-center gap-1.5 min-w-[80px]">
          <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${config.color} transition-all`}
              style={{ width: `${Math.round(confidence * 100)}%` }}
            />
          </div>
          <span className="text-xs text-slate-400 tabular-nums">{Math.round(confidence * 100)}%</span>
        </div>
      )}
    </div>
  );
}
