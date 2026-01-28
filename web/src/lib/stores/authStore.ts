/**
 * Authentication Store
 * Manages user authentication state and token persistence
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  login as apiLogin,
  register as apiRegister,
  sendVerificationCode as apiSendCode,
  getCurrentUser,
  verifyToken,
  type LoginRequest,
  type RegisterRequest,
  type UserResponse,
  type SendCodeResponse,
} from '../api/auth';
import { useAppStore } from '../store';

export interface AuthState {
  // State
  user: UserResponse | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
  sendCode: (email: string) => Promise<SendCodeResponse>;
  loadUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // Send verification code
      sendCode: async (email: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiSendCode(email);
          set({ isLoading: false });
          return response;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to send code';
          set({ isLoading: false, error: message });
          throw error;
        }
      },

      // Register
      register: async (data: RegisterRequest) => {
        set({ isLoading: true, error: null });
        try {
          const user = await apiRegister(data);

          // After registration, automatically log in
          const authResponse = await apiLogin({
            email: data.email,
            password: data.password,
          });

          // Sync user to app store (this will clear data if user changed)
          useAppStore.getState().setCurrentUser({
            id: user.id,
            name: user.name || user.username,
            email: user.email,
            plan: (user.plan as 'free' | 'pro') || 'free',
            createdAt: user.created_at || Date.now(),
          });

          set({
            user,
            token: authResponse.access_token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Registration failed';
          set({ isLoading: false, error: message });
          throw error;
        }
      },

      // Login
      login: async (data: LoginRequest) => {
        set({ isLoading: true, error: null });
        try {
          const authResponse = await apiLogin(data);
          const user = await getCurrentUser(authResponse.access_token);

          // Sync user to app store (this will clear data if user changed)
          useAppStore.getState().setCurrentUser({
            id: user.id,
            name: user.name || user.username,
            email: user.email,
            plan: (user.plan as 'free' | 'pro') || 'free',
            createdAt: user.created_at || Date.now(),
          });

          set({
            user,
            token: authResponse.access_token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Login failed';
          set({ isLoading: false, error: message });
          throw error;
        }
      },

      // Logout
      logout: () => {
        // Don't clear app store data on logout - preserve it for the same user
        // Data will be cleared by setCurrentUser() if a different user logs in
        // This allows the same user to logout and login again without losing their work

        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null,
        });
      },

      // Load user from token
      loadUser: async () => {
        const { token } = get();
        if (!token) {
          return;
        }

        set({ isLoading: true });
        try {
          const isValid = await verifyToken(token);
          if (isValid) {
            const user = await getCurrentUser(token);

            // Sync user to app store (this will clear data if user changed)
            useAppStore.getState().setCurrentUser({
              id: user.id,
              name: user.name || user.username,
              email: user.email,
              plan: (user.plan as 'free' | 'pro') || 'free',
              createdAt: user.created_at || Date.now(),
            });

            set({
              user,
              isAuthenticated: true,
              isLoading: false,
            });
          } else {
            // Token is invalid, clear auth state only
            // Don't clear app store data - preserve it for re-login
            set({
              user: null,
              token: null,
              isAuthenticated: false,
              isLoading: false,
            });
          }
        } catch (error) {
          // Error loading user, clear auth state only
          // Don't clear app store data - preserve it for re-login
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      // Clear error
      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
