/**
 * LoadingSpinner — Shared loading indicator component
 *
 * A consistent, reusable spinner used throughout the application.
 * Supports multiple sizes and optional label text.
 *
 * Usage:
 *   import LoadingSpinner from '../components/ui/LoadingSpinner';
 *   <LoadingSpinner />
 *   <LoadingSpinner size="xl" label="Fetching data..." />
 */

import React from 'react';

type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl';

interface LoadingSpinnerProps {
  /** Size of the spinner */
  size?: SpinnerSize;
  /** Optional label text displayed below the spinner */
  label?: string;
  /** Additional CSS classes for the container */
  className?: string;
  /** Whether to center the spinner in its container */
  center?: boolean;
}

const sizeClasses: Record<SpinnerSize, string> = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-[3px]',
  xl: 'w-12 h-12 border-4',
};

export default function LoadingSpinner({
  size = 'md',
  label,
  className = '',
  center = false,
}: LoadingSpinnerProps): React.JSX.Element {
  const spinner = (
    <div
      className={`
        ${sizeClasses[size]}
        border-indigo-500 border-t-transparent
        rounded-full animate-spin
      `}
      role="status"
      aria-label={label || 'Loading'}
    />
  );

  if (center) {
    return (
      <div className={`flex flex-col items-center justify-center ${className}`}>
        {spinner}
        {label && (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            {label}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={`inline-flex flex-col items-center ${className}`}>
      {spinner}
      {label && (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {label}
        </p>
      )}
    </div>
  );
}
