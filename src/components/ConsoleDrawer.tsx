'use client';

import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { ChatPanel } from './ChatPanel';
import { ChartsPanel } from './ChartsPanel';
import {
  Plus,
  PanelRightClose,
  MessageSquare,
  BarChart3
} from 'lucide-react';

export function ConsoleDrawer() {
  const {
    activeConsoleTab,
    setActiveConsoleTab,
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
            className="p-1.5 rounded hover:bg-cf-highlight opacity-60 hover:opacity-100"
            onClick={createConversation}
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            className="p-1.5 rounded hover:bg-cf-highlight opacity-60 hover:opacity-100"
            onClick={() => setConsoleCollapsed(true)}
            aria-label="Close console"
          >
            <PanelRightClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-cf-bg-secondary border-b border-cf-border h-10">
        <button
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 px-4 text-sm transition-colors -mb-px",
            activeConsoleTab === 'chat'
              ? "text-cf-text font-medium border-b-2 border-cf-accent"
              : "text-cf-text-secondary hover:text-cf-text border-b-2 border-transparent"
          )}
          onClick={() => setActiveConsoleTab('chat')}
        >
          <MessageSquare className="w-4 h-4" />
          Chat
        </button>
        <button
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 px-4 text-sm transition-colors -mb-px",
            activeConsoleTab === 'charts'
              ? "text-cf-text font-medium border-b-2 border-cf-accent"
              : "text-cf-text-secondary hover:text-cf-text border-b-2 border-transparent"
          )}
          onClick={() => setActiveConsoleTab('charts')}
        >
          <BarChart3 className="w-4 h-4" />
          Charts
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {activeConsoleTab === 'chat' ? (
          <ChatPanel />
        ) : (
          <ChartsPanel />
        )}
      </div>
    </div>
  );
}
