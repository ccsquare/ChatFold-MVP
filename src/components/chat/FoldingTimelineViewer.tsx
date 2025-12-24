'use client';

import { useState, useMemo } from 'react';
import { FoldStep } from '@/lib/types';
import { TimelineBar } from './TimelineBar';
import { StepDetailsPanel } from './StepDetailsPanel';
import { MolstarViewer } from '@/components/MolstarViewer';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/store';

interface FoldingTimelineViewerProps {
  steps: FoldStep[];
  conversationId: string;
  className?: string;
}

export function FoldingTimelineViewer({
  steps,
  conversationId,
  className,
}: FoldingTimelineViewerProps) {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const isMolstarExpanded = useAppStore(state => state.isMolstarExpanded);

  // Ensure we have at least one step to display
  const validSteps = steps.length > 0 ? steps : [];
  const activeStep = validSteps[activeStepIndex];

  // Handle navigation
  const handlePrevious = () => {
    setActiveStepIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setActiveStepIndex((prev) => Math.min(validSteps.length - 1, prev + 1));
  };

  const handleStepClick = (index: number) => {
    setActiveStepIndex(index);
  };

  const canGoPrevious = activeStepIndex > 0;
  const canGoNext = activeStepIndex < validSteps.length - 1;

  if (validSteps.length === 0) {
    return (
      <div
        className={cn(
          'rounded-cf-lg border border-cf-border bg-cf-bg-secondary p-8',
          className
        )}
      >
        <div className="text-center text-cf-text-secondary">
          <p>Initializing protein folding simulation...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-cf-lg border border-cf-border bg-cf-bg-secondary overflow-hidden',
        className
      )}
    >
      <div className="flex h-[600px]">
        {/* Left: Timeline navigation - hide when Mol* is expanded */}
        {!isMolstarExpanded && (
          <TimelineBar
            steps={validSteps}
            activeIndex={activeStepIndex}
            onStepClick={handleStepClick}
            onPrevious={handlePrevious}
            onNext={handleNext}
            canGoPrevious={canGoPrevious}
            canGoNext={canGoNext}
          />
        )}

        {/* Center: Mol* Viewer */}
        <div className="flex-1 relative bg-white">
          {activeStep && activeStep.pdbData ? (
            <MolstarViewer
              tabId={`timeline-${conversationId}-${activeStep.id}`}
              pdbData={activeStep.pdbData}
              structureId={activeStep.structureId}
              showControls={false}
              minimalUI={true}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-cf-bg-tertiary">
              <div className="text-center text-cf-text-secondary">
                <p>Loading structure...</p>
              </div>
            </div>
          )}

          {/* Glass-morphism overlay for controls hint - hide when Mol* is expanded */}
          {!isMolstarExpanded && (
            <div className="absolute top-4 left-4 px-3 py-2 rounded-cf bg-black/20 backdrop-blur-sm text-white text-xs">
              Drag to rotate • Scroll to zoom
            </div>
          )}
        </div>

        {/* Right: Details panel - hide when Mol* is expanded */}
        {!isMolstarExpanded && <StepDetailsPanel step={activeStep} />}
      </div>
    </div>
  );
}
