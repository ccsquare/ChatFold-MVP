'use client';

import { useState, useCallback } from 'react';
import { StructureArtifact } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { cn, downloadPDBFile, formatTimestamp } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Download, ExternalLink, GitCompareArrows, Loader2, Check } from 'lucide-react';
import { MolstarViewer } from '@/components/MolstarViewer';
import { pdbCache } from '@/hooks/useLazyPdb';

/**
 * Hook to check if this structure is selected for compare
 */
function useIsSelectedForCompare(structureId: string): boolean {
  return useAppStore(state => state.compareSelection?.structureId === structureId);
}

/**
 * Hook to check if there's any compare selection active
 */
function useHasCompareSelection(): boolean {
  return useAppStore(state => !!state.compareSelection);
}

/**
 * Hook to check if a specific structure is currently displayed in the Canvas
 * (either as single structure or in compare mode)
 * Only returns true when Canvas is actually visible (viewer-focus mode)
 */
function useIsDisplayedInCanvas(structureId: string): boolean {
  return useAppStore(state => {
    const { activeTabId, viewerTabs, layoutMode } = state;

    // Only show highlight when Canvas is visible (viewer-focus mode)
    if (layoutMode !== 'viewer-focus') return false;

    if (!activeTabId) return false;

    const activeTab = viewerTabs.find(t => t.id === activeTabId);
    if (!activeTab) return false;

    // Check if this structure is the main one in the active tab
    if (activeTab.structureId === structureId) return true;

    // Check if this structure is the compare target
    if (activeTab.isCompare && activeTab.compareWith?.structureId === structureId) {
      return true;
    }

    return false;
  });
}

interface StructureArtifactCardProps {
  artifact: StructureArtifact;
  /** Previous artifact for comparison (if available) */
  previousArtifact?: StructureArtifact | null;
  timestamp?: number;
  isLast?: boolean;
  stepNumber?: number;
  showPreview?: boolean;        // Enable inline Mol* preview
  /** Camera sync group ID - viewers with same ID sync their camera */
  syncGroupId?: string | null;
  /** Whether camera sync is enabled */
  syncEnabled?: boolean;
}

// Generate organic iteration labels instead of "Step N"
const getIterationLabel = (
  index: number | undefined,
  isFinal: boolean
): string => {
  if (isFinal) return "Converged";
  if (index === undefined || index === 0) return "Initial prediction";
  if (index === 1) return "Refining";
  return `Refinement ${index}`;
};

export function StructureArtifactCard({
  artifact,
  previousArtifact,
  timestamp,
  isLast = false,
  stepNumber,
  showPreview = true,
  syncGroupId = null,
  syncEnabled = false,
}: StructureArtifactCardProps) {
  const { openStructureTab, openCompareTab, selectForCompare } = useAppStore();
  const isFinal = artifact.label?.toLowerCase() === 'final';

  // Check if this structure is currently displayed in the Canvas
  const isDisplayedInCanvas = useIsDisplayedInCanvas(artifact.structureId);

  // Compare selection state
  const isSelectedForCompare = useIsSelectedForCompare(artifact.structureId);
  const hasCompareSelection = useHasCompareSelection();

  // Lazy loading state
  const [loadedPdbData, setLoadedPdbData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Use either the artifact's pdbData or lazy-loaded data
  const effectivePdbData = artifact.pdbData || loadedPdbData;
  const needsLazyLoad = !artifact.pdbData && !loadedPdbData;

  // Lazy load PDB data
  const loadPdbData = useCallback(async (): Promise<string | null> => {
    if (effectivePdbData) return effectivePdbData;
    if (isLoading) return null;

    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await pdbCache.get(artifact.structureId);
      if (data) {
        setLoadedPdbData(data);
        return data;
      } else {
        setLoadError('Failed to load structure');
        return null;
      }
    } catch {
      setLoadError('Failed to load structure');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [artifact.structureId, effectivePdbData, isLoading]);

  const handleOpenStructure = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    let pdbData = effectivePdbData;
    if (!pdbData) {
      pdbData = await loadPdbData();
    }
    if (pdbData) {
      openStructureTab({ ...artifact, pdbData }, pdbData);
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    let pdbData = effectivePdbData;
    if (!pdbData) {
      pdbData = await loadPdbData();
    }
    if (pdbData) {
      downloadPDBFile(pdbData, artifact.filename);
    }
  };

  const handleCompare = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    // Load current structure if needed
    let currentPdb = effectivePdbData;
    if (!currentPdb) {
      currentPdb = await loadPdbData();
    }
    if (!currentPdb) return;

    // Load previous structure if needed
    let previousPdb: string | undefined = previousArtifact?.pdbData;
    if (!previousPdb && previousArtifact) {
      const loaded = await pdbCache.get(previousArtifact.structureId);
      if (loaded) previousPdb = loaded;
    }
    if (!previousPdb || !previousArtifact) return;

    openCompareTab(
      { ...artifact, pdbData: currentPdb },
      { ...previousArtifact, pdbData: previousPdb }
    );
  };

  const hasPreview = showPreview && effectivePdbData;
  const canShowPreviewPlaceholder = showPreview && needsLazyLoad;
  const canCompare = !!previousArtifact;

  // Handle card click for compare selection
  const handleCardClick = useCallback(() => {
    selectForCompare(artifact);
  }, [artifact, selectForCompare]);

  return (
    <div
      onClick={handleCardClick}
      className={cn(
        "relative group flex-1 min-w-0 rounded-xl border transition-all duration-300 overflow-hidden bg-cf-bg-secondary/60 cursor-pointer",
        // Selected for compare - highest priority visual state
        isSelectedForCompare
          ? "border-cf-accent border-2 ring-2 ring-cf-accent/30 shadow-[0_0_12px_rgba(139,92,246,0.3)]"
          // Active display highlight with gradient glow
          : isDisplayedInCanvas
            ? "border-cf-accent border-2 shadow-[0_0_8px_rgba(139,92,246,0.25),0_0_20px_rgba(139,92,246,0.12),0_0_40px_rgba(99,102,241,0.06)]"
            : isFinal
              ? "border-cf-success/40 hover:border-cf-accent/40 hover:shadow-md"
              : "border-cf-border/60 hover:border-cf-accent/40 hover:shadow-md",
        // Show hint when another card is selected
        hasCompareSelection && !isSelectedForCompare && "hover:ring-2 hover:ring-cf-accent/20"
      )}
    >
      {/* Selection indicator */}
      {isSelectedForCompare && (
        <div className="absolute top-2 right-2 z-20 flex items-center justify-center w-6 h-6 rounded-full bg-cf-accent text-white shadow-lg">
          <Check className="w-4 h-4" strokeWidth={3} />
        </div>
      )}

      {/* Selection hint when another is selected */}
      {hasCompareSelection && !isSelectedForCompare && (
        <div className="absolute top-2 right-2 z-20 px-2 py-1 rounded-full bg-cf-bg-secondary/90 text-[10px] text-cf-text-muted border border-cf-border/50 opacity-0 group-hover:opacity-100 transition-opacity">
          Click to compare
        </div>
      )}

      {/* 3D Preview */}
      {hasPreview && (
        <div className="px-3 py-3">
          <div className="rounded-lg overflow-hidden border border-cf-border/30 bg-white dark:bg-cf-bg-secondary">
            <div className="relative h-40">
              <MolstarViewer
                tabId={`card-preview-${artifact.structureId}`}
                pdbData={effectivePdbData!}
                structureId={artifact.structureId}
                showControls={false}
                minimalUI={true}
                syncGroupId={syncGroupId}
                syncEnabled={syncEnabled}
              />
              <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/30 backdrop-blur-sm text-white text-[10px]">
                {syncEnabled ? 'Drag to rotate all' : 'Drag to rotate'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Placeholder when PDB needs lazy loading */}
      {canShowPreviewPlaceholder && (
        <div className="px-3 py-3">
          <div
            className={cn(
              "rounded-lg border border-cf-border/30 h-40 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors",
              isLoading
                ? "bg-cf-bg-secondary"
                : "bg-cf-bg-tertiary hover:bg-cf-bg-secondary hover:border-cf-accent/30"
            )}
            onClick={(e) => {
              e.stopPropagation(); // Prevent card click
              if (!isLoading) loadPdbData();
            }}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-6 h-6 text-cf-accent animate-spin" />
                <span className="text-xs text-cf-text-muted">Loading structure...</span>
              </>
            ) : loadError ? (
              <>
                <span className="text-xs text-cf-error">{loadError}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLoadError(null);
                    loadPdbData();
                  }}
                >
                  Retry
                </Button>
              </>
            ) : (
              <>
                {/* Show thumbnail if available */}
                {artifact.thumbnail ? (
                  <div className="relative w-full h-full">
                    <img
                      src={artifact.thumbnail}
                      alt={artifact.filename}
                      className="w-full h-full object-contain opacity-60"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <div className="flex flex-col items-center gap-1 text-white">
                        <ExternalLink className="w-5 h-5" />
                        <span className="text-xs font-medium">Click to load</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-full bg-cf-bg-secondary flex items-center justify-center">
                      <ExternalLink className="w-5 h-5 text-cf-text-muted" />
                    </div>
                    <span className="text-xs text-cf-text-muted">Click to load preview</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Footer Metadata Bar */}
      <div className={cn(
        "flex items-center justify-between gap-2 px-4 py-2 border-t",
        isFinal
          ? "border-cf-success/20 bg-cf-success/5"
          : "border-cf-border/50 bg-cf-bg-secondary/30"
      )}>
        {/* Left: Filename */}
        <div className="flex items-center min-w-0">
          <span className="text-[10px] text-cf-text-muted/70 truncate">
            {artifact.filename}
          </span>
        </div>

        {/* Right: Time + Actions */}
        <div className="flex items-center gap-1">
          {timestamp && (
            <span className="text-[10px] text-cf-text-muted/60 mr-1">
              {formatTimestamp(timestamp)}
            </span>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-6 w-6 rounded-md transition-all active:scale-95",
                  isFinal
                    ? "text-cf-success hover:text-cf-success hover:bg-cf-success/15"
                    : "text-cf-text-muted hover:text-cf-text hover:bg-cf-highlight"
                )}
                onClick={handleOpenStructure}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="w-3.5 h-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open in viewer</TooltipContent>
          </Tooltip>

          {canCompare && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-cf-text-muted hover:text-cf-accent hover:bg-cf-accent/10 rounded-md transition-all active:scale-95"
                  onClick={handleCompare}
                  disabled={isLoading}
                >
                  <GitCompareArrows className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Compare with previous</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-cf-text-muted hover:text-cf-text hover:bg-cf-highlight rounded-md"
                onClick={handleDownload}
                disabled={isLoading}
              >
                <Download className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download PDB</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
