import { useCallback, useRef, useEffect, useState } from 'react';

export interface UseResizableOptions {
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  direction: 'left' | 'right';  // 'left' = drag right edge, 'right' = drag left edge
  defaultWidth: number;         // width to reset on double-click
  onWidthChange: (width: number) => void;
}

export interface UseResizableReturn {
  isResizing: boolean;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleDoubleClick: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
}

export function useResizable({
  initialWidth,
  minWidth,
  maxWidth,
  direction,
  defaultWidth,
  onWidthChange,
}: UseResizableOptions): UseResizableReturn {
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = initialWidth;
  }, [initialWidth]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;

    // For left direction (sidebar): dragging right increases width
    // For right direction (console): dragging left increases width
    const delta = direction === 'left'
      ? e.clientX - startXRef.current
      : startXRef.current - e.clientX;

    const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta));
    onWidthChange(newWidth);
  }, [isResizing, direction, minWidth, maxWidth, onWidthChange]);

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

  const handleDoubleClick = useCallback(() => {
    onWidthChange(defaultWidth);
  }, [defaultWidth, onWidthChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = 10;
    if (e.key === 'ArrowLeft') {
      // Left arrow: decrease width for left panels, increase for right panels
      const newWidth = direction === 'left'
        ? Math.max(minWidth, initialWidth - step)
        : Math.min(maxWidth, initialWidth + step);
      onWidthChange(newWidth);
    } else if (e.key === 'ArrowRight') {
      // Right arrow: increase width for left panels, decrease for right panels
      const newWidth = direction === 'left'
        ? Math.min(maxWidth, initialWidth + step)
        : Math.max(minWidth, initialWidth - step);
      onWidthChange(newWidth);
    }
  }, [initialWidth, minWidth, maxWidth, direction, onWidthChange]);

  return {
    isResizing,
    handleMouseDown,
    handleDoubleClick,
    handleKeyDown,
  };
}
