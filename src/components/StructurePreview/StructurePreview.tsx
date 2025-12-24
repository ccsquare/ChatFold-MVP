'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { StructureArtifact } from '@/lib/types';
import { MolstarViewer } from '@/components/MolstarViewer';
import { StructureTimeline } from './StructureTimeline';
import { PreviewControls } from './PreviewControls';
import { PreviewMetrics } from './PreviewMetrics';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Loader2 } from 'lucide-react';
import { HelixIcon } from '@/components/icons/ProteinIcon';

interface StructurePreviewProps {
  structures: StructureArtifact[];
  isStreaming?: boolean;
  className?: string;
}

export function StructurePreview({
  structures,
  isStreaming,
  className
}: StructurePreviewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const openStructureTab = useAppStore(state => state.openStructureTab);

  // Auto-advance to newest structure when streaming
  useEffect(() => {
    if (autoAdvance && structures.length > 0) {
      setCurrentIndex(structures.length - 1);
    }
  }, [structures.length, autoAdvance]);

  const currentStructure = structures[currentIndex];

  // Navigation handlers
  const handlePrevious = useCallback(() => {
    setAutoAdvance(false); // Disable auto-advance when user navigates manually
    setCurrentIndex(prev => Math.max(0, prev - 1));
  }, []);

  const handleNext = useCallback(() => {
    setAutoAdvance(false);
    setCurrentIndex(prev => Math.min(structures.length - 1, prev + 1));
  }, [structures.length]);

  const handleSelect = useCallback((index: number) => {
    setAutoAdvance(false);
    setCurrentIndex(index);
  }, []);

  const handleOpenFull = useCallback(() => {
    if (currentStructure?.pdbData) {
      openStructureTab(currentStructure, currentStructure.pdbData);
    }
  }, [currentStructure, openStructureTab]);

  const handleResetView = useCallback(() => {
    // Dispatch custom event for MolstarViewer to handle
    window.dispatchEvent(new CustomEvent('molstar-reset-view'));
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if container or its children are focused
      if (!container.contains(document.activeElement) && document.activeElement !== document.body) {
        return;
      }

      switch (e.key) {
        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          handlePrevious();
          break;
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          handleNext();
          break;
        case 'Enter':
        case 'o':
          e.preventDefault();
          handleOpenFull();
          break;
        case 'Home':
          e.preventDefault();
          setAutoAdvance(false);
          setCurrentIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setAutoAdvance(false);
          setCurrentIndex(structures.length - 1);
          break;
        default:
          // Number keys 1-9 for quick jump
          if (e.key >= '1' && e.key <= '9') {
            const targetIndex = parseInt(e.key) - 1;
            if (targetIndex < structures.length) {
              e.preventDefault();
              setAutoAdvance(false);
              setCurrentIndex(targetIndex);
            }
          }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrevious, handleNext, handleOpenFull, structures.length]);

  // Empty state when no structures yet
  if (structures.length === 0) {
    return (
      <div className={cn("flex flex-col h-full flex-1", className)}>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-cf-bg-tertiary flex items-center justify-center">
              {isStreaming ? (
                <Loader2 className="w-10 h-10 text-cf-accent animate-spin" />
              ) : (
                <HelixIcon className="w-10 h-10 text-cf-text-muted opacity-50" />
              )}
            </div>
            <p className="text-cf-text-secondary mb-1">
              {isStreaming ? 'Generating structures...' : 'No structures yet'}
            </p>
            <p className="text-sm text-cf-text-muted">
              {isStreaming
                ? 'First structure will appear shortly'
                : 'Upload a FASTA file to start prediction'
              }
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div
        ref={containerRef}
        className={cn("flex flex-col h-full flex-1", className)}
        tabIndex={0}
        role="region"
        aria-label="Structure preview"
      >
        {/* Timeline at top */}
        <div className="flex-shrink-0 border-b border-cf-border bg-cf-bg-secondary/50">
          <StructureTimeline
            structures={structures}
            currentIndex={currentIndex}
            onSelect={handleSelect}
            isStreaming={isStreaming}
          />
        </div>

        {/* Main preview area */}
        <div
          className="flex-1 relative min-h-0 bg-white cursor-pointer"
          onDoubleClick={(e) => {
            // Only trigger if double-clicked directly on the viewer area (not on controls)
            if ((e.target as HTMLElement).closest('button')) return;
            handleOpenFull();
          }}
        >
          {currentStructure && (
            <>
              {/* Preview badge */}
              <div className="absolute top-3 left-3 z-10 pointer-events-none">
                <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-medium uppercase tracking-wider bg-cf-bg/80 backdrop-blur-sm text-cf-text-muted border border-cf-border/50">
                  Preview
                </span>
              </div>

              {/* Molstar viewer with minimal UI - must fill the container */}
              <div className="absolute inset-0">
                <MolstarViewer
                  key={currentStructure.structureId}
                  tabId={`preview-${currentStructure.structureId}`}
                  pdbData={currentStructure.pdbData}
                  structureId={currentStructure.structureId}
                  minimalUI={true}
                  showControls={false}
                />
              </div>

              {/* Metrics overlay */}
              <PreviewMetrics structure={currentStructure} />

              {/* Navigation controls */}
              <PreviewControls
                currentIndex={currentIndex}
                totalCount={structures.length}
                onPrevious={handlePrevious}
                onNext={handleNext}
                onOpenFull={handleOpenFull}
                onResetView={handleResetView}
                canGoPrevious={currentIndex > 0}
                canGoNext={currentIndex < structures.length - 1}
              />

              {/* Double-click hint */}
              <div className="absolute top-3 right-3 z-10 pointer-events-none">
                <span className="text-[10px] text-cf-text-muted opacity-60">
                  Double-click to open full viewer
                </span>
              </div>
            </>
          )}
        </div>

      </div>
    </TooltipProvider>
  );
}
