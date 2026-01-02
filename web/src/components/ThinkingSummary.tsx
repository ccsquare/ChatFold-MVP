'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight, Lightbulb } from 'lucide-react';

interface ThinkingSummaryProps {
  /** The chain-of-thought reasoning text */
  text: string;
  /** Thinking duration in seconds (optional) */
  duration?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Collapsible thinking summary component, similar to Claude's "Thinking" UI.
 * Shows CoT reasoning text with:
 * - "思考中（用时 X.X 秒）" header
 * - 2-line truncated preview when collapsed
 * - Expandable to show full content
 */
export function ThinkingSummary({
  text,
  duration,
  className,
}: ThinkingSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Check if text needs expansion (more than ~2 lines worth of content)
  const needsExpansion = text.length > 100 || text.includes('\n');

  return (
    <div
      className={cn(
        "group cursor-pointer select-none",
        className
      )}
      onClick={() => needsExpansion && setIsExpanded(!isExpanded)}
    >
      <div className={cn(
        "relative flex items-start gap-3 px-4 py-3 rounded-lg transition-colors duration-200",
        "bg-cf-bg-tertiary/30 hover:bg-cf-bg-tertiary/50 border border-cf-border/50"
      )}>
        {/* Left icon */}
        <div className="flex-shrink-0 mt-0.5">
          <Lightbulb className="w-4 h-4 text-cf-text-muted" />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 pr-6">
          {/* Header with duration */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-cf-text">
              思考中
              {duration !== undefined && (
                <span className="text-cf-text-muted font-normal">
                  （用时 {duration.toFixed(1)} 秒）
                </span>
              )}
            </span>
          </div>

          {/* Text content - 2 lines when collapsed */}
          <p className={cn(
            "text-sm leading-relaxed text-cf-text-secondary whitespace-pre-wrap",
            !isExpanded && "line-clamp-2"
          )}>
            {text}
          </p>
        </div>

        {/* Right expand indicator */}
        {needsExpansion && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <ChevronRight className={cn(
              "w-4 h-4 text-cf-text-muted transition-transform duration-200",
              isExpanded && "rotate-90"
            )} />
          </div>
        )}
      </div>
    </div>
  );
}
