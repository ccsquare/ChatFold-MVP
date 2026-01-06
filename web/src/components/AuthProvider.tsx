'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/stores/authStore';

/**
 * AuthProvider - Initializes authentication state on app load
 * Verifies stored token and loads user data if valid
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { loadUser } = useAuthStore();

  useEffect(() => {
    // Load user from stored token on mount
    loadUser();
  }, [loadUser]);

  return <>{children}</>;
}
