import type { Metadata } from 'next';
import './globals.css';
import 'molstar/build/viewer/molstar.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { CrossTabSyncProvider } from '@/components/CrossTabSyncProvider';
import { AuthProvider } from '@/components/AuthProvider';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'ChatFold - Protein Folding Workbench',
  description: 'AI-powered protein structure prediction workbench',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <AuthProvider>
            <CrossTabSyncProvider>{children}</CrossTabSyncProvider>
          </AuthProvider>
          <Toaster
            position="top-center"
            richColors
            closeButton
            toastOptions={{
              className: 'text-sm',
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
