'use client';

import { useEffect } from 'react';
import { initCrossTabSync } from '@/lib/store-sync';

/**
 * Provider component that initializes cross-tab state synchronization.
 * Should be placed near the root of the app, inside ThemeProvider.
 *
 * This enables:
 * - Folders sync across tabs
 * - Conversations sync across tabs
 * - Task status sync across tabs
 * - Active selection sync across tabs
 */
export function CrossTabSyncProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Initialize cross-tab sync on mount
    const cleanup = initCrossTabSync();

    // Cleanup on unmount
    return cleanup;
  }, []);

  return <>{children}</>;
}
