'use client';

import { ChatView } from '@/components/chat/ChatView';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function ChatPage() {
  return (
    <ErrorBoundary>
      <ChatView />
    </ErrorBoundary>
  );
}
