'use client';

import { useAppStore, MIN_CONSOLE_WIDTH, MAX_CONSOLE_WIDTH, DEFAULT_CONSOLE_WIDTH } from '@/lib/store';
import { cn } from '@/lib/utils';
import { useResizable } from '@/hooks/useResizable';

interface ResizableConsoleProps {
  children: React.ReactNode;
}

export function ResizableConsole({ children }: ResizableConsoleProps) {
  const { consoleWidth, consoleCollapsed, setConsoleWidth } = useAppStore();

  const { isResizing, handleMouseDown, handleDoubleClick, handleKeyDown } = useResizable({
    initialWidth: consoleWidth,
    minWidth: MIN_CONSOLE_WIDTH,
    maxWidth: MAX_CONSOLE_WIDTH,
    direction: 'right',
    defaultWidth: DEFAULT_CONSOLE_WIDTH,
    onWidthChange: setConsoleWidth,
  });

  if (consoleCollapsed) {
    return null;
  }

  return (
    <div
      className={cn(
        "relative flex flex-shrink-0 bg-cf-bg border-l border-cf-border h-full",
        !isResizing && "transition-[width] duration-300 ease-out"
      )}
      style={{ width: consoleWidth }}
    >
      {/* Resize Handle - centered on border */}
      <div
        className={cn(
          "absolute top-0 left-0 -translate-x-1/2 w-[4px] h-full cursor-col-resize z-10",
          "hover:bg-cf-border active:bg-cf-text-muted",
          "transition-colors duration-150",
          isResizing && "bg-cf-text-muted"
        )}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={consoleWidth}
        aria-valuemin={MIN_CONSOLE_WIDTH}
        aria-valuemax={MAX_CONSOLE_WIDTH}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      />

      {/* Console Content */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {children}
      </div>
    </div>
  );
}
