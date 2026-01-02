'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, Sparkles } from 'lucide-react';

interface ThinkingSummaryProps {
  /** The chain-of-thought reasoning text */
  text: string;
  /** Thinking duration in seconds (optional) */
  duration?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Scrolling single-line thinking summary component.
 * Shows CoT reasoning text with:
 * - Sparkles icon on the left
 * - Single line truncated with ellipsis when collapsed
 * - Expandable to show full content
 * - No "思考中" header (per timeline.7.png design)
 */
export function ThinkingSummary({
  text,
  duration,
  className,
}: ThinkingSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Check if text needs expansion (more than single line worth of content)
  const needsExpansion = text.length > 80 || text.includes('\n');

  return (
    <div
      className={cn(
        "group cursor-pointer select-none",
        className
      )}
      onClick={() => needsExpansion && setIsExpanded(!isExpanded)}
    >
      <div className={cn(
        "relative flex items-center gap-2 px-3 py-2 rounded-md transition-colors duration-200",
        "bg-cf-bg-tertiary/20 hover:bg-cf-bg-tertiary/40 border border-cf-border/30"
      )}>
        {/* Left icon - Sparkles */}
        <div className="flex-shrink-0">
          <Sparkles className="w-4 h-4 text-purple-400" />
        </div>

        {/* Main content - single line when collapsed */}
        <div className="flex-1 min-w-0 pr-5">
          <p className={cn(
            "text-sm text-cf-text-secondary",
            !isExpanded && "truncate",
            isExpanded && "whitespace-pre-wrap"
          )}>
            {text}
          </p>
        </div>

        {/* Right expand indicator - chevron down */}
        {needsExpansion && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <ChevronDown className={cn(
              "w-4 h-4 text-cf-text-muted transition-transform duration-200",
              isExpanded && "rotate-180"
            )} />
          </div>
        )}
      </div>
    </div>
  );
}
