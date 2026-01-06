'use client';

import { useState } from 'react';
import { useAuthStore } from '@/lib/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export interface RegisterFormProps {
  onSuccess: () => void;
  onSwitchToLogin: () => void;
}

export function RegisterForm({ onSuccess, onSwitchToLogin }: RegisterFormProps) {
  const { register, sendCode, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);

  const handleSendCode = async () => {
    clearError();

    if (!email) {
      toast.error('Please enter your email');
      return;
    }

    setSendingCode(true);
    try {
      await sendCode(email);
      setCodeSent(true);
      toast.success('Verification code sent to your email!');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send code';
      toast.error(message);
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (!email || !password || !username || !verificationCode) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      await register({
        email,
        password,
        username,
        verification_code: verificationCode,
      });
      toast.success('Account created successfully!');
      onSuccess();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      toast.error(message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <div className="flex gap-2">
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading || codeSent}
            required
            className="flex-1"
          />
          <Button
            type="button"
            onClick={handleSendCode}
            disabled={sendingCode || codeSent || !email}
            variant="outline"
            className="whitespace-nowrap"
          >
            {sendingCode ? 'Sending...' : codeSent ? 'Sent' : 'Send Code'}
          </Button>
        </div>
      </div>

      {codeSent && (
        <div className="space-y-2">
          <label htmlFor="code" className="text-sm font-medium">
            Verification Code
          </label>
          <Input
            id="code"
            type="text"
            placeholder="Enter 6-digit code"
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value)}
            disabled={isLoading}
            required
            maxLength={6}
          />
          <p className="text-xs text-muted-foreground">
            Check your email for the verification code
          </p>
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="username" className="text-sm font-medium">
          Username
        </label>
        <Input
          id="username"
          type="text"
          placeholder="johndoe"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={isLoading}
          required
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <Input
          id="password"
          type="password"
          placeholder="Create a password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
          required
        />
      </div>

      {error && <div className="text-sm text-red-500">{error}</div>}

      <div className="space-y-3">
        <Button type="submit" className="w-full" disabled={isLoading || !codeSent}>
          {isLoading ? 'Creating account...' : 'Create account'}
        </Button>

        <div className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <button type="button" onClick={onSwitchToLogin} className="text-primary hover:underline">
            Log in
          </button>
        </div>
      </div>
    </form>
  );
}
