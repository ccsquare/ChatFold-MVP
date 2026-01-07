'use client';

import { useRouter } from 'next/navigation';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  const router = useRouter();

  const handleSuccess = () => {
    // Redirect to main app after successful login
    router.push('/');
  };

  const handleSwitchToRegister = () => {
    router.push('/auth/signup');
  };

  return (
    <AuthLayout>
      <LoginForm onSuccess={handleSuccess} onSwitchToRegister={handleSwitchToRegister} />
    </AuthLayout>
  );
}
