'use client';

import React, { useState } from 'react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
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
      const response = await fetch('/api/v1/auth/send-verification-code', {
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

    setLoading(true);

    try {
      // TODO: Implement password reset endpoint
      // For now, just show a success message
      setSuccess('Password reset link sent to your email');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="flex flex-col gap-6">
        {/* Title */}
        <div className="text-center">
          <h1 className="text-[36px] font-normal leading-[1.5] text-[#fdfcfb] tracking-[-0.72px]">
            Reset login password
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
            {loading ? 'Processing...' : 'Next'}
          </Button>
        </form>

        {/* Back to login link */}
        <div className="text-center text-sm text-[#d9d1cb]">
          <Link
            href="/auth/login"
            className="text-[#fdfcfb] underline decoration-solid hover:text-[#fdfcfb]/80"
          >
            Back to login
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
