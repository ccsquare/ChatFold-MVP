/**
 * Authentication API client
 * Handles all authentication-related API calls to the backend
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export interface SendCodeRequest {
  email: string;
}

export interface SendCodeResponse {
  message: string;
  code?: string; // Only present in debug/test mode for auto-fill
}

export interface RegisterRequest {
  email: string;
  password: string;
  username: string;
  verification_code: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

export interface UserResponse {
  id: string;
  name: string;
  username: string;
  email: string;
  plan: string;
  onboarding_completed: boolean;
  created_at: number;
}

/**
 * Send verification code to email
 */
export async function sendVerificationCode(email: string): Promise<SendCodeResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/send-verification-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to send verification code');
  }

  return response.json();
}

/**
 * Register a new user
 */
export async function register(data: RegisterRequest): Promise<UserResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Registration failed');
  }

  return response.json();
}

/**
 * Login user
 */
export async function login(data: LoginRequest): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Login failed');
  }

  return response.json();
}

/**
 * Get current user info
 */
export async function getCurrentUser(token: string): Promise<UserResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to get user info');
  }

  return response.json();
}

/**
 * Verify token is still valid
 */
export async function verifyToken(token: string): Promise<boolean> {
  try {
    await getCurrentUser(token);
    return true;
  } catch {
    return false;
  }
}
