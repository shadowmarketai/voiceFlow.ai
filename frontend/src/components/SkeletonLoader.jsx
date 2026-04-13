/**
 * Skeleton loaders for perceived-performance improvements.
 *
 * Usage:
 *   <SkeletonCard />            — card with 3 lines
 *   <SkeletonTable rows={5} />  — table with rows
 *   <SkeletonStat />            — stat card
 */

function Shimmer({ className = '' }) {
  return <div className={`animate-pulse bg-gray-100 rounded-lg ${className}`} />
}

export function SkeletonCard() {
  return (
    <div className="card p-5 space-y-3">
      <Shimmer className="h-4 w-2/3" />
      <Shimmer className="h-3 w-full" />
      <Shimmer className="h-3 w-4/5" />
      <Shimmer className="h-9 w-full mt-2 rounded-xl" />
    </div>
  )
}

export function SkeletonStat() {
  return (
    <div className="card p-6 space-y-3">
      <div className="flex items-center justify-between">
        <Shimmer className="h-9 w-9 rounded-xl" />
        <Shimmer className="h-5 w-16 rounded-full" />
      </div>
      <Shimmer className="h-8 w-24" />
      <Shimmer className="h-3 w-32" />
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 5 }) {
  return (
    <div className="table-container">
      <div className="bg-gray-50 px-6 py-4 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Shimmer key={i} className="h-3" style={{ width: `${60 + Math.random() * 40}px` }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 px-6 py-4 border-t border-gray-100">
          {Array.from({ length: cols }).map((_, c) => (
            <Shimmer key={c} className="h-3 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonList({ rows = 4 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4 card">
          <Shimmer className="h-10 w-10 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Shimmer className="h-4 w-2/3" />
            <Shimmer className="h-3 w-1/2" />
          </div>
          <Shimmer className="h-8 w-20 rounded-xl" />
        </div>
      ))}
    </div>
  )
}
