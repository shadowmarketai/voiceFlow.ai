/**
 * ErrorBoundary — TypeScript Error Boundary Component (KB-009)
 *
 * Catches rendering errors in child components and displays a fallback UI
 * with a retry button. Logs errors for debugging/monitoring.
 *
 * This file coexists with the JSX ErrorBoundary.jsx. The existing .jsx file
 * is imported by DashboardLayout.jsx. New TypeScript components should import
 * from this file. Once migration is complete, the .jsx version can be removed.
 *
 * Usage:
 *   import TypedErrorBoundary from '../components/TypedErrorBoundary';
 *   <TypedErrorBoundary fallback={<CustomFallback />}>
 *     <MyComponent />
 *   </TypedErrorBoundary>
 */

import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback UI. Receives the error and a reset function. */
  fallback?: ReactNode | ((props: { error: Error; reset: () => void }) => ReactNode);
  /** Optional callback when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

class TypedErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log to console for development
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);

    // Invoke optional callback (e.g., send to Sentry)
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    // Custom fallback
    if (this.props.fallback) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback({
          error: this.state.error!,
          reset: this.handleReset,
        });
      }
      return this.props.fallback;
    }

    // Default fallback UI
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-4">
          <svg
            className="w-8 h-8 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-md">
          {this.state.error?.message ||
            'An unexpected error occurred. Please try refreshing the page.'}
        </p>
        <div className="flex gap-3">
          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
              />
            </svg>
            Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }
}

export default TypedErrorBoundary;
