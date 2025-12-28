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
import { Download, ExternalLink, GitCompareArrows, Loader2 } from 'lucide-react';
import { MolstarViewer } from '@/components/MolstarViewer';
import { pdbCache } from '@/hooks/useLazyPdb';

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
  const { openStructureTab, openCompareTab } = useAppStore();
  const isFinal = artifact.label?.toLowerCase() === 'final';

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

  const handleOpenStructure = async () => {
    let pdbData = effectivePdbData;
    if (!pdbData) {
      pdbData = await loadPdbData();
    }
    if (pdbData) {
      openStructureTab({ ...artifact, pdbData }, pdbData);
    }
  };

  const handleDownload = async () => {
    let pdbData = effectivePdbData;
    if (!pdbData) {
      pdbData = await loadPdbData();
    }
    if (pdbData) {
      downloadPDBFile(pdbData, artifact.filename);
    }
  };

  const handleCompare = async () => {
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

  return (
    <div className={cn(
      "flex-1 min-w-0 rounded-lg border transition-all duration-200 overflow-hidden shadow-sm dark:shadow-none",
      isFinal
        ? "bg-cf-success/10 border-cf-success/40"
        : "bg-cf-bg-tertiary border-cf-border-strong hover:border-cf-accent/40"
    )}>
      {/* Header */}
      <div className={cn(
        "flex items-center justify-between gap-2 px-3 py-1.5 border-b",
        isFinal
          ? "border-cf-success/30 bg-cf-success/15"
          : "border-cf-border bg-cf-bg-secondary"
      )}>
        <div className="flex items-center gap-2 min-w-0">
          {isFinal ? (
            <span className="text-[11px] font-bold text-cf-success flex items-center gap-1.5 uppercase tracking-wider">
              Final Result
              <span className="w-1 h-1 rounded-full bg-cf-success/60 animate-pulse" />
            </span>
          ) : (
            <span className="text-xs font-semibold text-cf-text-secondary">
              Step {stepNumber}
            </span>
          )}

          <span className="text-[10px] text-cf-text-muted/70 truncate">
            {artifact.filename}
          </span>
        </div>

        {/* Actions in header */}
        <div className="flex items-center gap-1">
          {timestamp && (
            <span className="text-[10px] text-cf-text-muted/80 whitespace-nowrap mr-1">
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
                    ? "text-cf-success hover:text-cf-success hover:bg-cf-success/20"
                    : "text-cf-text-secondary hover:text-cf-text hover:bg-cf-highlight"
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
            <TooltipContent>Visualize</TooltipContent>
          </Tooltip>

          {canCompare && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-cf-text-secondary hover:text-cf-accent hover:bg-cf-accent/10 rounded-md transition-all active:scale-95"
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
                className="h-6 w-6 text-cf-text-secondary hover:text-cf-text hover:bg-cf-highlight rounded-md"
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

      {/* Content - Show preview when data is available */}
      {hasPreview && (
        <div className="p-2">
          <div className="rounded-md overflow-hidden border border-cf-border/50 bg-white">
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
        <div className="p-2">
          <div
            className={cn(
              "rounded-md border border-cf-border/50 h-40 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors",
              isLoading
                ? "bg-cf-bg-secondary"
                : "bg-cf-bg-tertiary hover:bg-cf-bg-secondary hover:border-cf-accent/30"
            )}
            onClick={!isLoading ? loadPdbData : undefined}
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
    </div>
  );
}
