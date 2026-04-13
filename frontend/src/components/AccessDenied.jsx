import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldX } from 'lucide-react';
import { usePermissions } from '../hooks/usePermissions';

/**
 * Access denied fallback page shown when a user navigates
 * to a module they don't have permission to access.
 */
export default function AccessDenied({ module }) {
  const { role } = usePermissions();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
        <ShieldX className="w-8 h-8 text-red-500" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
        Access Denied
      </h1>
      <p className="text-slate-600 dark:text-slate-400 max-w-md mb-1">
        You don't have permission to access {module ? `the ${module} module` : 'this page'}.
      </p>
      <p className="text-sm text-slate-500 dark:text-slate-500 mb-6">
        Your current role: <span className="font-medium capitalize">{role}</span>. Contact your administrator to request access.
      </p>
      <Link
        to="/"
        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
