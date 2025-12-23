'use client';

import { useCallback, useRef, useEffect, useState } from 'react';
import { useAppStore, MIN_CONSOLE_WIDTH, MAX_CONSOLE_WIDTH } from '@/lib/store';
import { cn } from '@/lib/utils';

interface ResizableConsoleProps {
  children: React.ReactNode;
}

export function ResizableConsole({ children }: ResizableConsoleProps) {
  const { consoleWidth, consoleCollapsed, setConsoleWidth } = useAppStore();
  const [isResizing, setIsResizing] = useState(false);
  const consoleRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = consoleWidth;
  }, [consoleWidth]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;

    // For right panel, dragging left increases width
    const delta = startXRef.current - e.clientX;
    const newWidth = startWidthRef.current + delta;
    setConsoleWidth(newWidth);
  }, [isResizing, setConsoleWidth]);

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
    setConsoleWidth(410);
  }, [setConsoleWidth]);

  if (consoleCollapsed) {
    return null;
  }

  return (
    <div
      ref={consoleRef}
      className="relative flex flex-shrink-0 bg-cf-bg-tertiary border-l border-cf-border h-full"
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
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            setConsoleWidth(consoleWidth + 10);
          } else if (e.key === 'ArrowRight') {
            setConsoleWidth(consoleWidth - 10);
          }
        }}
      />

      {/* Console Content */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {children}
      </div>
    </div>
  );
}
