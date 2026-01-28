'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';

/** Routes that don't require authentication */
const PUBLIC_ROUTES = ['/auth/login', '/auth/signup', '/auth/forgot-password'];

/**
 * AuthProvider - Initializes authentication state on app load
 * Verifies stored token and loads user data if valid
 * Redirects unauthenticated users to login page
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { loadUser, isAuthenticated, token } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Load user from stored token on mount
    const initAuth = async () => {
      await loadUser();
      setIsInitialized(true);
    };
    initAuth();
  }, [loadUser]);

  useEffect(() => {
    // Wait for auth state to initialize before redirecting
    if (!isInitialized) return;

    const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname?.startsWith(route));

    // Redirect unauthenticated users to login (except for public routes)
    if (!isAuthenticated && !token && !isPublicRoute) {
      router.push('/auth/login');
    }

    // Redirect authenticated users away from auth pages
    if (isAuthenticated && isPublicRoute) {
      router.push('/');
    }
  }, [isInitialized, isAuthenticated, token, pathname, router]);

  // Show nothing while checking auth state to prevent flash
  if (!isInitialized) {
    return null;
  }

  // For protected routes, don't render until authenticated
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname?.startsWith(route));
  if (!isAuthenticated && !token && !isPublicRoute) {
    return null;
  }

  return <>{children}</>;
}
