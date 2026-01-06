'use client';

import { useRouter } from 'next/navigation';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { SignupForm } from '@/components/auth/SignupForm';

export default function SignupPage() {
  const router = useRouter();

  const handleSuccess = () => {
    // Redirect to login page after successful signup
    router.push('/auth/login');
  };

  return (
    <AuthLayout>
      <SignupForm onSuccess={handleSuccess} />
    </AuthLayout>
  );
}
