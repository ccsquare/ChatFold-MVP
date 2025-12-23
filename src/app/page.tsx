'use client';

import { LayoutShell } from '@/components/LayoutShell';
import { Sidebar } from '@/components/Sidebar';
import { Canvas } from '@/components/Canvas';
import { ConsoleDrawer } from '@/components/ConsoleDrawer';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function Home() {
  return (
    <ErrorBoundary>
      <LayoutShell
        sidebar={
          <ErrorBoundary>
            <Sidebar />
          </ErrorBoundary>
        }
        canvas={
          <ErrorBoundary>
            <Canvas />
          </ErrorBoundary>
        }
        console={
          <ErrorBoundary>
            <ConsoleDrawer />
          </ErrorBoundary>
        }
      />
    </ErrorBoundary>
  );
}
