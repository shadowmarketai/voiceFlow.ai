import React from 'react';

const defaultColumnColors = {
  active: 'border-t-emerald-500',
  inactive: 'border-t-slate-400',
  training: 'border-t-amber-500',
  paused: 'border-t-amber-500',
  completed: 'border-t-blue-500',
  scheduled: 'border-t-purple-500',
  draft: 'border-t-slate-400',
};

export default function KanbanBoard({ columns, renderCard, onCardClick, emptyMessage = 'No items' }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((col) => {
        const borderColor = defaultColumnColors[col.id] || 'border-t-indigo-500';

        return (
          <div
            key={col.id}
            className={`flex-shrink-0 w-80 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-t-4 ${borderColor} border border-slate-200 dark:border-slate-700`}
          >
            {/* Column header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-sm text-slate-900 dark:text-white capitalize">{col.title}</h3>
                <span className="px-1.5 py-0.5 text-xs font-medium bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 rounded">
                  {col.items.length}
                </span>
              </div>
              {col.headerAction}
            </div>

            {/* Cards */}
            <div className="p-3 space-y-3 max-h-[calc(100vh-320px)] overflow-y-auto">
              {col.items.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-6">{emptyMessage}</p>
              ) : (
                col.items.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => onCardClick?.(item)}
                    className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600 cursor-pointer transition-all"
                  >
                    {renderCard(item, col.id)}
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
