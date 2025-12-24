'use client';

import { cn } from '@/lib/utils';
import { StructureArtifact } from '@/lib/types';
import { Check } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface StructureTimelineProps {
  structures: StructureArtifact[];
  currentIndex: number;
  onSelect: (index: number) => void;
  isStreaming?: boolean;
}

export function StructureTimeline({
  structures,
  currentIndex,
  onSelect,
  isStreaming
}: StructureTimelineProps) {
  if (structures.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-2 px-4 py-3">
      {/* Progress line background */}
      <div className="flex items-center gap-1.5">
        {structures.map((structure, index) => {
          const isSelected = index === currentIndex;
          const isFinal = structure.label === 'final';
          const isIntermediate = structure.label === 'intermediate';

          return (
            <Tooltip key={structure.structureId}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onSelect(index)}
                  className={cn(
                    "relative w-4 h-4 rounded-full border-2 transition-all duration-200",
                    "hover:scale-110 focus:outline-none focus:ring-2 focus:ring-cf-accent/50 focus:ring-offset-2 focus:ring-offset-cf-bg",
                    isSelected
                      ? "border-cf-accent bg-cf-accent"
                      : isFinal
                        ? "border-cf-success bg-cf-success/20 hover:bg-cf-success/40"
                        : isIntermediate
                          ? "border-cf-border bg-transparent hover:border-cf-text-secondary"
                          : "border-cf-text-muted bg-cf-bg-secondary hover:border-cf-text-secondary"
                  )}
                  aria-label={`Structure ${index + 1}${isFinal ? ' (Final)' : ''}`}
                  aria-pressed={isSelected}
                >
                  {isFinal && isSelected && (
                    <Check className="w-2.5 h-2.5 text-white absolute inset-0 m-auto" />
                  )}
                  {isSelected && !isFinal && (
                    <span className="absolute inset-0 m-auto w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <div className="space-y-0.5">
                  <p className="font-medium">{structure.filename}</p>
                  <p className="text-cf-text-muted">
                    pLDDT: {structure.metrics.plddtAvg.toFixed(1)} | PAE: {structure.metrics.paeAvg.toFixed(1)}
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}

        {/* Streaming indicator */}
        {isStreaming && (
          <div className="w-4 h-4 rounded-full border-2 border-dashed border-cf-text-muted animate-pulse flex items-center justify-center">
            <span className="w-1 h-1 rounded-full bg-cf-text-muted" />
          </div>
        )}
      </div>

      {/* Counter */}
      <span className="text-xs text-cf-text-muted ml-2">
        {currentIndex + 1}/{structures.length}
      </span>
    </div>
  );
}
