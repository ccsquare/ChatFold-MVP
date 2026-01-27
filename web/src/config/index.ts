/**
 * ChatFold-MVP Frontend Configuration
 *
 * Centralized configuration management for the frontend application.
 * Handles environment variables and provides type-safe configuration access.
 */

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

export interface AppConfig {
  /** Application environment */
  environment: 'development' | 'production' | 'test';

  /** Frontend configuration */
  frontend: {
    /** Frontend server port */
    port: number;
    /** Frontend application URL */
    url: string;
  };

  /** Backend configuration */
  backend: {
    /** Backend server port */
    port: number;
    /** Backend base URL (for SSE and direct API calls) */
    url: string;
    /** Backend API endpoint URL (for REST API calls) */
    apiUrl: string;
  };

  /** Development features */
  development: {
    /** Is debug mode enabled */
    debug: boolean;
    /** Is this a development build */
    isDev: boolean;
  };
}

// =============================================================================
// ENVIRONMENT VARIABLE HELPERS
// =============================================================================

/**
 * Get environment variable with fallback
 */
function getEnvVar(key: string, defaultValue: string): string {
  if (typeof window !== 'undefined') {
    // Client-side: only NEXT_PUBLIC_ variables are available
    // Use ?? to preserve empty string as intentional value (e.g. relative path)
    return (window as any).__NEXT_PUBLIC_ENV__?.[key] ?? process.env[key] ?? defaultValue;
  }
  // Server-side: all variables available
  return process.env[key] ?? defaultValue;
}

/**
 * Get numeric environment variable with fallback
 */
function getEnvNumber(key: string, defaultValue: number): number {
  const value = getEnvVar(key, defaultValue.toString());
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Get boolean environment variable with fallback
 */
function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = getEnvVar(key, defaultValue.toString()).toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

// =============================================================================
// CONFIGURATION BUILDING
// =============================================================================

/**
 * Build configuration from environment variables
 */
function buildConfig(): AppConfig {
  // Determine environment
  const nodeEnv = getEnvVar('NODE_ENV', 'development');
  const environment = (nodeEnv === 'production' || nodeEnv === 'test')
    ? nodeEnv as 'production' | 'test'
    : 'development';

  // Get port configuration - use standard ports for all environments
  const frontendPort = getEnvNumber('FRONTEND_PORT', 3000);
  const backendPort = getEnvNumber('BACKEND_PORT', 8000);

  // Build URLs with environment-aware defaults
  const frontendUrl = getEnvVar(
    'FRONTEND_URL',
    `http://localhost:${frontendPort}`
  );

  // NEXT_PUBLIC_* must use direct property access (process.env.NEXT_PUBLIC_XXX)
  // because Next.js only inlines statically-analyzed property names at build time.
  // Dynamic bracket access like process.env[key] returns undefined in the browser.
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? `http://localhost:${backendPort}`;

  const backendApiUrl = process.env.NEXT_PUBLIC_API_URL ?? `${backendUrl}/api/v1`;

  return {
    environment,
    frontend: {
      port: frontendPort,
      url: frontendUrl,
    },
    backend: {
      port: backendPort,
      url: backendUrl,
      apiUrl: backendApiUrl,
    },
    development: {
      debug: getEnvBoolean('CHATFOLD_DEBUG', environment !== 'production'),
      isDev: environment === 'development',
    },
  };
}

// =============================================================================
// CONFIGURATION INSTANCE
// =============================================================================

/**
 * Application configuration instance
 *
 * This is the main configuration object used throughout the application.
 * It automatically detects the environment and provides appropriate defaults.
 *
 * @example
 * ```typescript
 * import { config } from '@/config';
 *
 * // Get backend URL for API calls
 * const apiUrl = config.backend.apiUrl;
 *
 * // Get backend URL for SSE connections
 * const eventSource = new EventSource(`${config.backend.url}/api/v1/stream`);
 * ```
 */
export const config: AppConfig = buildConfig();

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get backend URL for API calls
 *
 * This function replaces the previous getBackendUrl() utility.
 * It provides backward compatibility while using the new configuration system.
 *
 * @returns Backend base URL
 */
export function getBackendUrl(): string {
  return config.backend.url;
}

/**
 * Get backend API URL for REST API calls
 *
 * @returns Backend API endpoint URL
 */
export function getBackendApiUrl(): string {
  return config.backend.apiUrl;
}

/**
 * Validate configuration on startup
 *
 * This function performs runtime validation to ensure the configuration is valid.
 * It should be called during application initialization.
 *
 * @throws Error if configuration is invalid
 */
export function validateConfig(): void {
  // Port validation
  if (config.frontend.port === config.backend.port) {
    throw new Error(
      `Port conflict: Frontend and backend cannot use the same port ${config.frontend.port}`
    );
  }

  // URL validation (skip relative paths — they mean access via ingress)
  const isAbsoluteUrl = (url: string) => url.startsWith('http://') || url.startsWith('https://');
  try {
    if (isAbsoluteUrl(config.frontend.url)) new URL(config.frontend.url);
    if (isAbsoluteUrl(config.backend.url)) new URL(config.backend.url);
    if (isAbsoluteUrl(config.backend.apiUrl)) new URL(config.backend.apiUrl);
  } catch (error) {
    throw new Error(`Invalid URL configuration: ${error}`);
  }

  // Environment validation
  if (!['development', 'production', 'test'].includes(config.environment)) {
    throw new Error(`Invalid environment: ${config.environment}`);
  }
}

// =============================================================================
// DEVELOPMENT HELPERS
// =============================================================================

/**
 * Log configuration for debugging
 *
 * Only logs in development mode to avoid leaking configuration in production.
 */
export function logConfig(): void {
  if (config.development.debug && typeof console !== 'undefined') {
    console.group('🔧 ChatFold Configuration');
    console.log('Environment:', config.environment);
    console.log('Frontend Port:', config.frontend.port);
    console.log('Backend Port:', config.backend.port);
    console.log('Frontend URL:', config.frontend.url);
    console.log('Backend URL:', config.backend.url);
    console.log('Backend API URL:', config.backend.apiUrl);
    console.groupEnd();
  }
}

// =============================================================================
// AUTOMATIC VALIDATION
// =============================================================================

// Validate configuration on module load (server-side only to avoid hydration issues)
if (typeof window === 'undefined') {
  try {
    validateConfig();
  } catch (error) {
    console.error('❌ Configuration validation failed:', error);
    if (config.environment === 'production') {
      throw error; // Fail fast in production
    }
  }
}