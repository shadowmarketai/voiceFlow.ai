/**
 * Reusable empty state component for zero-data views.
 * Usage:
 *   <EmptyState icon={Users} title="No leads yet" description="Add your first lead" action={<button>Add Lead</button>} />
 */
export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-6">
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <Icon className="w-8 h-8 text-gray-300" />
        </div>
      )}
      <h3 className="text-base font-semibold text-gray-700 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-400 mb-6 max-w-sm">{description}</p>}
      {action}
    </div>
  )
}
