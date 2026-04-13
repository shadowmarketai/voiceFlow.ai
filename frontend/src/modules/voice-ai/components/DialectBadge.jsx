import React from 'react';

const dialectStyles = {
  Kongu:       'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  Chennai:     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Madurai:     'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  Tirunelveli: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  Hindi:       'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  English:     'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
};

export default function DialectBadge({ dialect, confidence, size = 'sm' }) {
  const style = dialectStyles[dialect] || 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400';
  const sizeClass = size === 'lg' ? 'px-2.5 py-1 text-sm' : 'px-1.5 py-0.5 text-xs';

  return (
    <span className={`inline-flex items-center gap-1 rounded font-medium ${style} ${sizeClass}`}>
      {dialect}
      {confidence != null && (
        <span className="opacity-60">{Math.round(confidence * 100)}%</span>
      )}
    </span>
  );
}
