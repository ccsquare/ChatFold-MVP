/**
 * Centralized API client with automatic JWT token injection
 *
 * This module provides a fetch wrapper that automatically adds
 * the Authorization header from the auth store.
 */

import { config } from '@/config';

/**
 * Get the auth token from localStorage (Zustand persist storage)
 * This avoids circular dependency with authStore
 */
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const authStorage = localStorage.getItem('auth-storage');
    if (!authStorage) return null;

    const parsed = JSON.parse(authStorage);
    return parsed?.state?.token || null;
  } catch {
    return null;
  }
}

/**
 * API client configuration
 */
export interface ApiClientConfig {
  /** Base URL for API requests */
  baseUrl?: string;
  /** Whether to include auth token (default: true) */
  includeAuth?: boolean;
}

/**
 * API error class with status code and details
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public detail?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Fetch wrapper with automatic auth token injection
 *
 * @param endpoint - API endpoint (e.g., '/tasks' or full URL)
 * @param options - Fetch options
 * @param config - API client config
 * @returns Response data
 */
export async function apiFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
  clientConfig: ApiClientConfig = {}
): Promise<T> {
  const { baseUrl = config.backend.apiUrl, includeAuth = true } = clientConfig;

  // Build full URL
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

  // Build headers
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add auth token if available and requested
  if (includeAuth) {
    const token = getAuthToken();
    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle non-OK responses
  if (!response.ok) {
    let detail: string | undefined;
    try {
      const errorData = await response.json();
      detail = errorData.detail || errorData.message || errorData.error;
    } catch {
      // Response is not JSON
    }

    throw new ApiError(
      detail || `Request failed with status ${response.status}`,
      response.status,
      detail
    );
  }

  // Handle empty responses
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    return {} as T;
  }

  return response.json();
}

/**
 * API client with pre-configured methods
 */
export const api = {
  /**
   * GET request
   */
  get: <T = unknown>(endpoint: string, config?: ApiClientConfig) =>
    apiFetch<T>(endpoint, { method: 'GET' }, config),

  /**
   * POST request
   */
  post: <T = unknown>(endpoint: string, data?: unknown, config?: ApiClientConfig) =>
    apiFetch<T>(
      endpoint,
      {
        method: 'POST',
        body: data ? JSON.stringify(data) : undefined,
      },
      config
    ),

  /**
   * PUT request
   */
  put: <T = unknown>(endpoint: string, data?: unknown, config?: ApiClientConfig) =>
    apiFetch<T>(
      endpoint,
      {
        method: 'PUT',
        body: data ? JSON.stringify(data) : undefined,
      },
      config
    ),

  /**
   * DELETE request
   */
  delete: <T = unknown>(endpoint: string, config?: ApiClientConfig) =>
    apiFetch<T>(endpoint, { method: 'DELETE' }, config),
};

/**
 * Get URL with auth token as query parameter (for SSE/EventSource)
 * EventSource doesn't support custom headers, so we pass token in URL
 */
export function getAuthenticatedUrl(endpoint: string, params?: Record<string, string>): string {
  const baseUrl = config.backend.url;
  const url = new URL(endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`);

  // Add any provided params
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  // Add token for SSE authentication
  const token = getAuthToken();
  if (token) {
    url.searchParams.set('token', token);
  }

  return url.toString();
}
