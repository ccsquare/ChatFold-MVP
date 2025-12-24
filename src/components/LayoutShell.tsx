'use client';

import { ReactNode } from 'react';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { ResizableSidebar } from './ResizableSidebar';
import { ResizableConsole } from './ResizableConsole';
import { Button } from '@/components/ui/button';
import { PanelLeftOpen, PanelRightOpen } from 'lucide-react';

interface LayoutShellProps {
  sidebar: ReactNode;
  canvas: ReactNode;
  console: ReactNode;
  chat: ReactNode;  // Full-width chat view for chat-focus mode
}

export function LayoutShell({ sidebar, canvas, console: consoleContent, chat }: LayoutShellProps) {
  const {
    layoutMode,
    sidebarCollapsed,
    setSidebarCollapsed,
    consoleCollapsed,
    setConsoleCollapsed,
    isMolstarExpanded
  } = useAppStore();

  const isChatFocus = layoutMode === 'chat-focus';

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-cf-bg">
      {/* Left Sidebar (Resizable) - hide when Mol* is expanded */}
      {!isMolstarExpanded && (
        sidebarCollapsed ? (
          <div className="flex-shrink-0 w-10 border-r border-cf-border bg-cf-bg-secondary flex flex-col items-center transition-all duration-300 ease-out">
            <div className="h-10 flex items-center justify-center">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-60 hover:opacity-100"
                onClick={() => setSidebarCollapsed(false)}
              >
                <PanelLeftOpen className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          <ResizableSidebar>
            {sidebar}
          </ResizableSidebar>
        )
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden min-w-0">
        {isChatFocus ? (
          /* Chat Focus Mode: Full-width chat */
          <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in duration-200">
            {chat}
          </div>
        ) : (
          /* Viewer Focus Mode: Canvas + Console */
          <>
            {/* Center Canvas */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0 transition-all duration-300 ease-out">
              {canvas}
            </div>

            {/* Right Console (Resizable) - hide when Mol* is expanded */}
            {!isMolstarExpanded && (
              consoleCollapsed ? (
                <div className="flex-shrink-0 w-10 border-l border-cf-border bg-cf-bg-tertiary flex flex-col items-center transition-all duration-300 ease-out">
                  <div className="h-10 flex items-center justify-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-60 hover:opacity-100"
                      onClick={() => setConsoleCollapsed(false)}
                    >
                      <PanelRightOpen className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <ResizableConsole>
                  {consoleContent}
                </ResizableConsole>
              )
            )}
          </>
        )}
      </main>
    </div>
  );
}
