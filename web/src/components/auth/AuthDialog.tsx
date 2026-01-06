'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';

export interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMode?: 'login' | 'register';
}

export function AuthDialog({ open, onOpenChange, defaultMode = 'login' }: AuthDialogProps) {
  const [mode, setMode] = useState<'login' | 'register'>(defaultMode);

  // Update mode when dialog opens with new defaultMode
  useEffect(() => {
    if (open) {
      setMode(defaultMode);
    }
  }, [open, defaultMode]);

  const handleSuccess = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{mode === 'login' ? 'Log in to ChatFold' : 'Create an account'}</DialogTitle>
          <DialogDescription>
            {mode === 'login'
              ? 'Enter your credentials to access your workspace'
              : 'Sign up to start predicting protein structures'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'login' ? (
          <LoginForm onSuccess={handleSuccess} onSwitchToRegister={() => setMode('register')} />
        ) : (
          <RegisterForm onSuccess={handleSuccess} onSwitchToLogin={() => setMode('login')} />
        )}
      </DialogContent>
    </Dialog>
  );
}
