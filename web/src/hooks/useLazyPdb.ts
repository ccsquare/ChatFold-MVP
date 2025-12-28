'use client';

import { useState, useCallback, useRef } from 'react';

interface UseLazyPdbOptions {
  /** Called when PDB data is successfully fetched */
  onSuccess?: (pdbData: string) => void;
  /** Called when fetch fails */
  onError?: (error: Error) => void;
}

interface UseLazyPdbReturn {
  /** Fetched PDB data (null if not loaded) */
  pdbData: string | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Fetch PDB data for a structure */
  fetchPdb: (structureId: string, sequence?: string) => Promise<string | null>;
  /** Reset state */
  reset: () => void;
}

/**
 * Hook for lazy loading PDB data from the backend.
 * Used to restore structure visualization from historical conversations.
 */
export function useLazyPdb(options: UseLazyPdbOptions = {}): UseLazyPdbReturn {
  const [pdbData, setPdbData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Cache to avoid redundant requests
  const cacheRef = useRef<Map<string, string>>(new Map());

  const fetchPdb = useCallback(async (structureId: string, sequence?: string): Promise<string | null> => {
    // Check cache first
    const cached = cacheRef.current.get(structureId);
    if (cached) {
      setPdbData(cached);
      return cached;
    }

    setIsLoading(true);
    setError(null);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      const url = new URL(`${backendUrl}/api/v1/structures/${structureId}`);
      if (sequence) {
        url.searchParams.set('sequence', sequence);
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error(`Failed to fetch PDB: ${response.status} ${response.statusText}`);
      }

      const data = await response.text();

      // Cache the result
      cacheRef.current.set(structureId, data);
      setPdbData(data);
      options.onSuccess?.(data);

      return data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      options.onError?.(error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [options]);

  const reset = useCallback(() => {
    setPdbData(null);
    setIsLoading(false);
    setError(null);
  }, []);

  return {
    pdbData,
    isLoading,
    error,
    fetchPdb,
    reset,
  };
}

/**
 * Shared PDB cache for multiple components.
 * Prevents redundant fetches when the same structure is accessed from different places.
 */
class PdbCache {
  private cache = new Map<string, string>();
  private pending = new Map<string, Promise<string | null>>();

  async get(structureId: string, sequence?: string): Promise<string | null> {
    // Return from cache if available
    if (this.cache.has(structureId)) {
      return this.cache.get(structureId)!;
    }

    // Return pending request if one exists
    if (this.pending.has(structureId)) {
      return this.pending.get(structureId)!;
    }

    // Start new request
    const promise = this.fetch(structureId, sequence);
    this.pending.set(structureId, promise);

    try {
      const result = await promise;
      if (result) {
        this.cache.set(structureId, result);
      }
      return result;
    } finally {
      this.pending.delete(structureId);
    }
  }

  private async fetch(structureId: string, sequence?: string): Promise<string | null> {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      const url = new URL(`${backendUrl}/api/v1/structures/${structureId}`);
      if (sequence) {
        url.searchParams.set('sequence', sequence);
      }

      const response = await fetch(url.toString());
      if (!response.ok) {
        console.error(`Failed to fetch PDB for ${structureId}: ${response.status}`);
        return null;
      }

      return await response.text();
    } catch (error) {
      console.error(`Error fetching PDB for ${structureId}:`, error);
      return null;
    }
  }

  has(structureId: string): boolean {
    return this.cache.has(structureId);
  }

  set(structureId: string, pdbData: string): void {
    this.cache.set(structureId, pdbData);
  }

  clear(): void {
    this.cache.clear();
    this.pending.clear();
  }
}

// Singleton instance for app-wide caching
export const pdbCache = new PdbCache();
