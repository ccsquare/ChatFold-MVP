'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, Sparkles } from 'lucide-react';

interface ThinkingSummaryProps {
  /** The chain-of-thought reasoning text */
  text: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Collapsible thinking summary component, similar to ChatGPT's "Thinking" UI.
 * Shows CoT reasoning text that appears before each structure artifact.
 */
export function ThinkingSummary({
  text,
  className,
}: ThinkingSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Truncate text for collapsed view (first ~60 chars)
  const truncatedText = text.length > 60 ? text.slice(0, 60) + '...' : text;
  const needsExpansion = text.length > 60;

  return (
    <div
      className={cn(
        "group cursor-pointer select-none",
        className
      )}
      onClick={() => needsExpansion && setIsExpanded(!isExpanded)}
    >
      <div className={cn(
        "flex items-start gap-1.5 px-2 py-1 rounded-md transition-colors duration-200",
        "bg-cf-bg-tertiary/50 hover:bg-cf-bg-tertiary"
      )}>
        {/* Icon */}
        <Sparkles className="w-3.5 h-3.5 shrink-0 text-cf-accent" />

        {/* Text content */}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] leading-snug text-cf-text-secondary">
            {isExpanded ? text : truncatedText}
          </p>
        </div>

        {/* Expand indicator */}
        {needsExpansion && (
          <ChevronDown className={cn(
            "w-3.5 h-3.5 shrink-0 transition-transform duration-200 text-cf-text-muted",
            isExpanded && "rotate-180"
          )} />
        )}
      </div>
    </div>
  );
}
