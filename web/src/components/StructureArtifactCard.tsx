'use client';

import { StructureArtifact } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { cn, downloadPDBFile, formatTimestamp } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Download, ExternalLink, GitCompareArrows } from 'lucide-react';
import { MolstarViewer } from '@/components/MolstarViewer';

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

  const handleOpenStructure = () => {
    if (artifact.pdbData) {
      openStructureTab(artifact, artifact.pdbData);
    }
  };

  const handleDownload = () => {
    if (artifact.pdbData) {
      downloadPDBFile(artifact.pdbData, artifact.filename);
    }
  };

  const handleCompare = () => {
    if (artifact.pdbData && previousArtifact?.pdbData) {
      openCompareTab(artifact, previousArtifact);
    }
  };

  const hasPreview = showPreview && artifact.pdbData;
  const canCompare = !!previousArtifact?.pdbData;

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
              >
                <ExternalLink className="w-3.5 h-3.5" />
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
              >
                <Download className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download PDB</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Content */}
      {hasPreview && (
        <div className="p-2">
          {/* Inline Mol* Preview - Always visible */}
          <div className="rounded-md overflow-hidden border border-cf-border/50 bg-white">
            <div className="relative h-40">
              <MolstarViewer
                tabId={`card-preview-${artifact.structureId}`}
                pdbData={artifact.pdbData!}
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
    </div>
  );
}
