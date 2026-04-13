import React from 'react';

export default function GenZBadge({ score, terms = [], size = 'sm' }) {
  if (score == null || score <= 0) return null;

  const intensity = score >= 0.7 ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400'
    : score >= 0.4 ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400';

  const sizeClass = size === 'lg' ? 'px-2.5 py-1 text-sm' : 'px-1.5 py-0.5 text-xs';

  return (
    <span className={`inline-flex items-center gap-1 rounded font-medium ${intensity} ${sizeClass}`}>
      GenZ {score.toFixed(1)}
      {terms.length > 0 && (
        <span className="opacity-60 truncate max-w-[100px]" title={terms.join(', ')}>
          ({terms.slice(0, 2).join(', ')}{terms.length > 2 ? '...' : ''})
        </span>
      )}
    </span>
  );
}
