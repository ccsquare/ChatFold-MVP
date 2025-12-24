'use client';

import { FoldStep } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ChevronUp, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimelineBarProps {
  steps: FoldStep[];
  activeIndex: number;
  onStepClick: (index: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  canGoPrevious: boolean;
  canGoNext: boolean;
}

export function TimelineBar({
  steps,
  activeIndex,
  onStepClick,
  onPrevious,
  onNext,
  canGoPrevious,
  canGoNext,
}: TimelineBarProps) {
  return (
    <div className="w-20 flex flex-col items-center bg-cf-bg-tertiary border-r border-cf-border py-4">
      {/* Up arrow */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          'h-8 w-8 mb-2 text-cf-text-secondary',
          !canGoPrevious && 'opacity-30 cursor-not-allowed'
        )}
        onClick={onPrevious}
        disabled={!canGoPrevious}
      >
        <ChevronUp className="w-5 h-5" />
      </Button>

      {/* Timeline milestones */}
      <div className="flex-1 flex flex-col items-center gap-2 py-2 relative">
        {/* Vertical connecting line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-cf-border -translate-x-1/2" />

        {steps.map((step, index) => {
          const isActive = index === activeIndex;
          const isCompleted = step.status === 'completed';
          const isPending = step.status === 'pending';

          return (
            <button
              key={step.id}
              onClick={() => onStepClick(index)}
              className={cn(
                'relative z-10 rounded-full transition-all duration-200',
                'flex items-center justify-center',
                isActive && 'ring-4 ring-cf-accent/30',
                isCompleted && !isActive && 'hover:scale-110',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-cf-accent'
              )}
              style={{
                width: isActive ? '40px' : '24px',
                height: isActive ? '40px' : '24px',
              }}
            >
              {/* Circle background */}
              <div
                className={cn(
                  'absolute inset-0 rounded-full transition-colors',
                  isActive && 'bg-cf-accent',
                  isCompleted && !isActive && 'bg-cf-success',
                  isPending && 'bg-cf-border'
                )}
              />

              {/* Content */}
              <div className="relative z-10">
                {isCompleted && !isActive && (
                  <Check className="w-3 h-3 text-white" />
                )}
                {isActive && (
                  <span className="text-white text-sm font-medium">
                    {step.stepNumber}
                  </span>
                )}
                {isPending && (
                  <div className="w-2 h-2 rounded-full border-2 border-cf-text-muted" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Down arrow */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          'h-8 w-8 mt-2 text-cf-text-secondary',
          !canGoNext && 'opacity-30 cursor-not-allowed'
        )}
        onClick={onNext}
        disabled={!canGoNext}
      >
        <ChevronDown className="w-5 h-5" />
      </Button>
    </div>
  );
}
