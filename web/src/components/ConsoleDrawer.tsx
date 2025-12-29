'use client';

import { useAppStore } from '@/lib/store';
import { ChatPanel } from './ChatPanel';
import { PanelRightClose, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';

export function ConsoleDrawer() {
  const {
    setConsoleCollapsed,
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
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-cf-text-secondary hover:text-cf-text hover:bg-cf-highlight transition-colors"
                  onClick={switchToChatMode}
                >
                  <Maximize2 className="w-4 h-4" />
                  <span className="sr-only">Expand to full chat</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Expand to full chat</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-cf-text-secondary hover:text-cf-text hover:bg-cf-highlight transition-colors"
                  onClick={() => setConsoleCollapsed(true)}
                >
                  <PanelRightClose className="w-4 h-4" />
                  <span className="sr-only">Collapse panel</span>
                </Button>
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
