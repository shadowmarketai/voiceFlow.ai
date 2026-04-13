import React from 'react';

const iconColors = {
  call: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400',
  success: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
  warning: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
  error: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
  info: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
  default: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
};

export default function Timeline({ items }) {
  if (!items?.length) {
    return <p className="text-sm text-slate-500 text-center py-8">No activity to display</p>;
  }

  return (
    <div className="relative">
      {/* Vertical connector line */}
      <div className="absolute left-5 top-3 bottom-3 w-0.5 bg-slate-200 dark:bg-slate-700" />

      <div className="space-y-1">
        {items.map((item, i) => {
          const Icon = item.icon;
          const colorClass = iconColors[item.type] || iconColors.default;

          return (
            <div
              key={item.id || i}
              className="relative flex gap-4 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group"
              onClick={item.onClick}
            >
              {/* Icon node */}
              <div className={`relative z-10 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${colorClass}`}>
                {Icon && <Icon className="w-4 h-4" />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{item.title}</p>
                  <span className="text-xs text-slate-400 whitespace-nowrap">{item.time}</span>
                </div>
                {item.subtitle && (
                  <p className="text-sm text-slate-500 mt-0.5 truncate">{item.subtitle}</p>
                )}
                {item.badges && (
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {item.badges}
                  </div>
                )}
                {item.meta && (
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                    {item.meta}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
