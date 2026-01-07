'use client';

import { getBackendUrl } from '@/config';

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
      const url = new URL(`${getBackendUrl()}/api/v1/structures/${structureId}`);
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
