'use client';

import { useAppStore } from '@/lib/store';
import { ChatPanel } from './ChatPanel';
import { Plus, PanelRightClose, Maximize2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';

export function ConsoleDrawer() {
  const {
    setConsoleCollapsed,
    createConversation,
    switchToChatMode
  } = useAppStore();

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-3 h-10 border-b border-cf-border bg-cf-bg-secondary">
          <span className="text-sm font-medium text-cf-text">Chat</span>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="p-1.5 rounded hover:bg-cf-highlight text-cf-text-secondary hover:text-cf-text transition-colors"
                  onClick={createConversation}
                  aria-label="New conversation"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">New conversation</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="p-1.5 rounded hover:bg-cf-highlight text-cf-text-secondary hover:text-cf-text transition-colors"
                  onClick={switchToChatMode}
                  aria-label="Expand to full chat"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Expand to full chat</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="p-1.5 rounded hover:bg-cf-highlight text-cf-text-secondary hover:text-cf-text transition-colors"
                  onClick={() => setConsoleCollapsed(true)}
                  aria-label="Collapse panel"
                >
                  <PanelRightClose className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Collapse panel</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Content - Only ChatPanel, no StepsPanel */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <ChatPanel />
        </div>
      </div>
    </TooltipProvider>
  );
}
