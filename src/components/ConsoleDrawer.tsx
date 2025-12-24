'use client';

import { useAppStore } from '@/lib/store';
import { StepsPanel } from './StepsPanel';
import { ChatPanel } from './ChatPanel';
import { Plus, PanelRightClose } from 'lucide-react';

export function ConsoleDrawer() {
  const {
    setConsoleCollapsed,
    createConversation
  } = useAppStore();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-10 border-b border-cf-border bg-cf-bg-secondary">
        <span className="text-sm font-medium text-cf-text">Chat</span>
        <div className="flex items-center gap-1">
          <button
            className="p-1.5 rounded hover:bg-cf-highlight text-cf-text-secondary hover:text-cf-text transition-colors"
            onClick={createConversation}
            aria-label="New conversation"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            className="p-1.5 rounded hover:bg-cf-highlight text-cf-text-secondary hover:text-cf-text transition-colors"
            onClick={() => setConsoleCollapsed(true)}
            aria-label="Close chat panel"
          >
            <PanelRightClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <StepsPanel />
        <ChatPanel />
      </div>
    </div>
  );
}
