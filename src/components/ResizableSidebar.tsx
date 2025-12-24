'use client';

import { useCallback, useRef, useEffect, useState } from 'react';
import { useAppStore, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH } from '@/lib/store';
import { cn } from '@/lib/utils';

interface ResizableSidebarProps {
  children: React.ReactNode;
}

export function ResizableSidebar({ children }: ResizableSidebarProps) {
  const { sidebarWidth, sidebarCollapsed, setSidebarWidth } = useAppStore();
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;

    const delta = e.clientX - startXRef.current;
    const newWidth = startWidthRef.current + delta;
    setSidebarWidth(newWidth);
  }, [isResizing, setSidebarWidth]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // Handle double-click to reset to default width
  const handleDoubleClick = useCallback(() => {
    setSidebarWidth(240);
  }, [setSidebarWidth]);

  if (sidebarCollapsed) {
    return null;
  }

  return (
    <div
      ref={sidebarRef}
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
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            setSidebarWidth(sidebarWidth - 10);
          } else if (e.key === 'ArrowRight') {
            setSidebarWidth(sidebarWidth + 10);
          }
        }}
      />
    </div>
  );
}
