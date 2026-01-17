'use client';

import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HelixIcon, ProteinFoldIcon } from '@/components/icons/ProteinIcon';
import { EXAMPLE_SEQUENCES, ExampleSequence } from '@/lib/constants/sequences';

interface ChatEmptyStateProps {
  onExampleClick: (example: ExampleSequence) => void;
  variant?: 'compact' | 'wide';
}

/**
 * Shared empty state component for chat interfaces.
 * Used by both ChatView and ChatPanel for consistent empty state UI.
 */
export function ChatEmptyState({ onExampleClick, variant = 'wide' }: ChatEmptyStateProps) {
  const isCompact = variant === 'compact';

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center',
        isCompact ? 'min-h-[200px]' : 'h-full px-4 py-8'
      )}
    >
      <div className={cn('w-full', isCompact ? '' : 'max-w-xl')}>
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <ProteinFoldIcon className="w-12 h-12 text-cf-accent/40" />
          </div>
          <p className="text-cf-text-secondary text-sm mb-1">How can I help you?</p>
          <p className="text-cf-text-muted text-xs">
            Paste a protein sequence to predict its structure
          </p>
        </div>

        {/* Example sequences section */}
        <div className={cn('w-full', isCompact ? 'max-w-lg px-2' : '')}>
          {/* Section header */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="w-3.5 h-3.5 text-cf-accent/60" />
            <span className="text-xs font-medium text-cf-text-muted uppercase tracking-wide">
              试试示例序列
            </span>
          </div>

          {/* Cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {EXAMPLE_SEQUENCES.map((example, index) => (
              <button
                key={index}
                onClick={() => onExampleClick(example)}
                style={{ animationDelay: `${index * 50}ms` }}
                className={cn(
                  // Animation on mount
                  'animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-backwards',
                  // Base card styling
                  'group relative flex flex-col items-start gap-1.5 p-3 text-left',
                  'rounded-xl border border-cf-border/60',
                  'bg-cf-bg-tertiary/40',
                  // Hover state
                  isCompact
                    ? 'hover:bg-[var(--cf-card-hover-bg)] hover:border-cf-accent/60 hover:shadow-[var(--cf-card-shadow-hover)]'
                    : 'hover:bg-cf-bg-tertiary hover:border-cf-accent/60',
                  'hover:-translate-y-0.5',
                  // Active/pressed state
                  'active:scale-[0.98] active:shadow-none active:translate-y-0',
                  // Focus state for keyboard navigation
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cf-accent',
                  'focus-visible:ring-offset-2 focus-visible:ring-offset-cf-bg',
                  // Smooth transitions
                  'transition-all duration-200 ease-out',
                  'cursor-pointer'
                )}
              >
                {/* Decorative icon */}
                <div className="absolute top-2.5 right-2.5">
                  <HelixIcon className="w-4 h-4 text-cf-text-muted opacity-30 group-hover:text-cf-accent group-hover:opacity-100 group-hover:scale-110 transition-all duration-200" />
                </div>

                {/* Content */}
                <span className="text-sm font-medium text-cf-text group-hover:text-cf-text pr-6 transition-colors duration-200">
                  {example.name}
                </span>
                <span className="text-xs text-cf-text-muted line-clamp-1">
                  {example.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
