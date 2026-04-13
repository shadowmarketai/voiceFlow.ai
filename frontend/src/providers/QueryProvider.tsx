/**
 * React Query Provider — wraps the app with a configured QueryClient.
 *
 * Defaults:
 *   - staleTime: 5 minutes (data considered fresh, no background refetch)
 *   - retry: 1 (retry failed requests once before reporting error)
 *   - refetchOnWindowFocus: false (don't refetch when tab regains focus)
 *   - gcTime: 10 minutes (keep unused cache for 10 minutes)
 *
 * Usage in main.tsx or App wrapper:
 *   import { QueryProvider } from '@/providers/QueryProvider';
 *   <QueryProvider>
 *     <App />
 *   </QueryProvider>
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (was cacheTime in v4)
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0, // Don't auto-retry mutations
    },
  },
});

interface QueryProviderProps {
  children: React.ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

/**
 * Export the queryClient for imperative use outside React (e.g., in tests).
 */
export { queryClient };
