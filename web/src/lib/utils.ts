import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Get the backend API URL from environment or default to localhost.
 * Uses ?? instead of || so empty string uses relative path in production.
 */
export function getBackendUrl(): string {
  return process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
}

/**
 * Generate a unique ID with optional prefix
 */
export function generateId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
}

export function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  // Less than 1 minute
  if (diff < 60000) {
    return 'Just now';
  }

  // Less than 1 hour
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes}m ago`;
  }

  // Less than 24 hours
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  }

  // Same year
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function downloadFile(content: string, filename: string, mimeType: string = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Convenience function for downloading PDB files
export function downloadPDBFile(pdbData: string, filename: string) {
  downloadFile(pdbData, filename, 'chemical/x-pdb');
}

// Quality assessment types
export interface QualityResult {
  label: string;
  color: string;
  bgColor: string;
}

// pLDDT quality assessment following AlphaFold conventions
export function getPlddtQuality(plddt: number): QualityResult {
  if (plddt >= 90) return { label: 'Very High', color: 'text-cf-confidence-excellent', bgColor: 'bg-cf-confidence-excellent/15' };
  if (plddt >= 70) return { label: 'Confident', color: 'text-cf-confidence-good', bgColor: 'bg-cf-confidence-good/15' };
  if (plddt >= 50) return { label: 'Low', color: 'text-cf-confidence-fair', bgColor: 'bg-cf-confidence-fair/15' };
  return { label: 'Very Low', color: 'text-cf-confidence-poor', bgColor: 'bg-cf-confidence-poor/15' };
}

// PAE quality (lower is better)
export function getPaeQuality(pae: number): Omit<QualityResult, 'label'> {
  if (pae <= 5) return { color: 'text-cf-confidence-excellent', bgColor: 'bg-cf-confidence-excellent/15' };
  if (pae <= 10) return { color: 'text-cf-confidence-good', bgColor: 'bg-cf-confidence-good/15' };
  if (pae <= 20) return { color: 'text-cf-confidence-fair', bgColor: 'bg-cf-confidence-fair/15' };
  return { color: 'text-cf-confidence-poor', bgColor: 'bg-cf-confidence-poor/15' };
}

// Constraint satisfaction quality (higher is better)
export function getConstraintQuality(constraint: number): QualityResult {
  if (constraint >= 90) return { label: 'Excellent', color: 'text-cf-confidence-excellent', bgColor: 'bg-cf-confidence-excellent/15' };
  if (constraint >= 70) return { label: 'Good', color: 'text-cf-confidence-good', bgColor: 'bg-cf-confidence-good/15' };
  if (constraint >= 50) return { label: 'Fair', color: 'text-cf-confidence-fair', bgColor: 'bg-cf-confidence-fair/15' };
  return { label: 'Poor', color: 'text-cf-confidence-poor', bgColor: 'bg-cf-confidence-poor/15' };
}
