'use client';

import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import Link from 'next/link';
import { config } from '@/config';

// Test credentials for development mode (use different email for new registrations)
const DEV_TEST_CREDENTIALS = {
  email: 'testuser2@chatfold.ai',
  username: 'testuser2',
  password: 'chatfoldtest123',
};

interface SignupFormProps {
  onSuccess?: () => void;
}

export function SignupForm({ onSuccess }: SignupFormProps) {
  const isDev = config.development.isDev;
  const [email, setEmail] = useState(isDev ? DEV_TEST_CREDENTIALS.email : '');
  const [username, setUsername] = useState(isDev ? DEV_TEST_CREDENTIALS.username : '');
  const [password, setPassword] = useState(isDev ? DEV_TEST_CREDENTIALS.password : '');
  const [confirmPassword, setConfirmPassword] = useState(isDev ? DEV_TEST_CREDENTIALS.password : '');
  const [verificationCode, setVerificationCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(isDev); // Auto-accept in dev mode
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Email validation
  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  // Send verification code
  const handleSendCode = async () => {
    if (!email) {
      setError('Please enter your email address');
      return;
    }

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setError('');
    setSending(true);

    try {
      const response = await fetch(`${config.backend.apiUrl}/auth/send-verification-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to send verification code');
      }

      setSuccess('Verification code sent to your email');

      // In dev mode, auto-fill the verification code if returned by backend
      if (isDev && data.code) {
        setVerificationCode(data.code);
      }

      // Start countdown
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSending(false);
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (!acceptTerms) {
      setError('Please accept the Terms and Conditions');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${config.backend.apiUrl}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          username,
          password,
          verification_code: verificationCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Registration failed');
      }

      setSuccess('Registration successful! You can now log in.');

      // Redirect to login after 2 seconds
      setTimeout(() => {
        window.location.href = '/auth/login';
      }, 2000);

      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Title */}
      <div className="text-center">
        <h1 className="text-[36px] font-normal leading-[1.5] text-[#fdfcfb] tracking-[-0.72px]">
          Create your account
        </h1>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Email */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="email" className="text-sm font-medium text-[#fdfcfb]">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="Your email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-10 bg-[rgba(27,24,24,0.7)] border-[rgba(94,86,86,0.6)] text-[#fdfcfb] placeholder:text-[#86807b]"
          />
        </div>

        {/* Verification code */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="code" className="text-sm font-medium text-[#fdfcfb]">
            Verification code
          </Label>
          <div className="flex gap-2">
            <Input
              id="code"
              type="text"
              placeholder="Your verification code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              required
              maxLength={6}
              className="flex-1 h-10 bg-[rgba(27,24,24,0.7)] border-[rgba(94,86,86,0.6)] text-[#fdfcfb] placeholder:text-[#86807b]"
            />
            <Button
              type="button"
              onClick={handleSendCode}
              disabled={sending || countdown > 0}
              className="h-10 px-4 bg-[rgba(27,24,24,0.7)] border border-[rgba(94,86,86,0.6)] text-[#e0dedd] hover:bg-[rgba(27,24,24,0.9)]"
            >
              {countdown > 0 ? `${countdown}s` : sending ? 'Sending...' : 'Send'}
            </Button>
          </div>
        </div>

        {/* Username */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="username" className="text-sm font-medium text-[#fdfcfb]">
            Username
          </Label>
          <Input
            id="username"
            type="text"
            placeholder="Your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="h-10 bg-[rgba(27,24,24,0.7)] border-[rgba(94,86,86,0.6)] text-[#fdfcfb] placeholder:text-[#86807b]"
          />
        </div>

        {/* Password */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="password" className="text-sm font-medium text-[#fdfcfb]">
            Password
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-10 bg-[rgba(27,24,24,0.7)] border-[rgba(94,86,86,0.6)] text-[#fdfcfb] placeholder:text-[#86807b] pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86807b] hover:text-[#fdfcfb]"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Confirm Password */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirmPassword" className="text-sm font-medium text-[#fdfcfb]">
            Confirm Password
          </Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="h-10 bg-[rgba(27,24,24,0.7)] border-[rgba(94,86,86,0.6)] text-[#fdfcfb] placeholder:text-[#86807b] pr-10"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86807b] hover:text-[#fdfcfb]"
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Terms and Conditions */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="terms"
            checked={acceptTerms}
            onCheckedChange={(checked) => setAcceptTerms(checked as boolean)}
            className="border-[#fdfcfb]"
          />
          <label htmlFor="terms" className="text-sm text-[#d9d1cb] cursor-pointer">
            Accept the <span className="underline decoration-solid">Terms and Conditions</span>
          </label>
        </div>

        {/* Success message */}
        {success && (
          <div className="text-sm text-green-400 bg-green-400/10 px-3 py-2 rounded-md">
            {success}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="text-sm text-red-400 bg-red-400/10 px-3 py-2 rounded-md">{error}</div>
        )}

        {/* Submit button */}
        <Button
          type="submit"
          disabled={loading}
          className="w-full h-9 bg-[#fdfcfb] text-[#110f0f] hover:bg-[#fdfcfb]/90 font-medium rounded-[6px]"
        >
          {loading ? 'Creating account...' : 'Sign up'}
        </Button>
      </form>

      {/* Login link */}
      <div className="text-center text-sm text-[#d9d1cb]">
        Already have an account?{' '}
        <Link
          href="/auth/login"
          className="text-[#fdfcfb] underline decoration-solid hover:text-[#fdfcfb]/80"
        >
          Log in
        </Link>
      </div>
    </div>
  );
}
