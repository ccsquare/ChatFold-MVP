'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ChevronUp, ChevronDown, Maximize2, RotateCcw } from 'lucide-react';

interface PreviewControlsProps {
  currentIndex: number;
  totalCount: number;
  onPrevious: () => void;
  onNext: () => void;
  onOpenFull: () => void;
  onResetView?: () => void;
  canGoPrevious: boolean;
  canGoNext: boolean;
}

export function PreviewControls({
  currentIndex,
  totalCount,
  onPrevious,
  onNext,
  onOpenFull,
  onResetView,
  canGoPrevious,
  canGoNext
}: PreviewControlsProps) {
  return (
    <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-10">
      {/* Navigation stack */}
      <div className="flex flex-col bg-cf-bg-secondary/90 backdrop-blur-sm rounded-lg border border-cf-border shadow-lg">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onPrevious}
              disabled={!canGoPrevious}
              className={cn(
                "h-8 w-8 rounded-b-none",
                !canGoPrevious && "opacity-30"
              )}
              aria-label="Previous structure"
            >
              <ChevronUp className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Previous (k or ArrowUp)</TooltipContent>
        </Tooltip>

        {/* Counter display */}
        <div className="h-6 flex items-center justify-center border-y border-cf-border text-xs text-cf-text-secondary font-mono">
          {currentIndex + 1}/{totalCount}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onNext}
              disabled={!canGoNext}
              className={cn(
                "h-8 w-8 rounded-t-none",
                !canGoNext && "opacity-30"
              )}
              aria-label="Next structure"
            >
              <ChevronDown className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Next (j or ArrowDown)</TooltipContent>
        </Tooltip>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col bg-cf-bg-secondary/90 backdrop-blur-sm rounded-lg border border-cf-border shadow-lg">
        {onResetView && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onResetView}
                className="h-8 w-8 rounded-b-none"
                aria-label="Reset view"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Reset view</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenFull}
              className={cn(
                "h-8 w-8",
                onResetView ? "rounded-t-none border-t border-cf-border" : ""
              )}
              aria-label="Open in full viewer"
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Open full viewer (Enter)</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
