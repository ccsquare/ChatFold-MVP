'use client';

import { useAppStore, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH, DEFAULT_SIDEBAR_WIDTH } from '@/lib/store';
import { cn } from '@/lib/utils';
import { useResizable } from '@/hooks/useResizable';

interface ResizableSidebarProps {
  children: React.ReactNode;
}

export function ResizableSidebar({ children }: ResizableSidebarProps) {
  const { sidebarWidth, sidebarCollapsed, setSidebarWidth } = useAppStore();

  const { isResizing, handleMouseDown, handleDoubleClick, handleKeyDown } = useResizable({
    initialWidth: sidebarWidth,
    minWidth: MIN_SIDEBAR_WIDTH,
    maxWidth: MAX_SIDEBAR_WIDTH,
    direction: 'left',
    defaultWidth: DEFAULT_SIDEBAR_WIDTH,
    onWidthChange: setSidebarWidth,
  });

  if (sidebarCollapsed) {
    return null;
  }

  return (
    <div
      className={cn(
        "relative flex flex-shrink-0 bg-cf-bg border-r border-cf-border h-full",
        !isResizing && "transition-[width] duration-300 ease-out"
      )}
      style={{ width: sidebarWidth }}
    >
      {/* Sidebar Content */}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>

      {/* Resize Handle - centered on border */}
      <div
        className={cn(
          "absolute top-0 right-0 translate-x-1/2 w-[4px] h-full cursor-col-resize z-10",
          "hover:bg-cf-border active:bg-cf-text-muted",
          "transition-colors duration-150",
          isResizing && "bg-cf-text-muted"
        )}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={sidebarWidth}
        aria-valuemin={MIN_SIDEBAR_WIDTH}
        aria-valuemax={MAX_SIDEBAR_WIDTH}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
