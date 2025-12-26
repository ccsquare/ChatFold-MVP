'use client';

import { useState, useEffect } from 'react';
import { StructureArtifact } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { cn, downloadPDBFile, formatTimestamp, getPlddtQuality, getPaeQuality, getConstraintQuality } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Download, ExternalLink, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import { MolstarViewer } from '@/components/MolstarViewer';

interface StructureArtifactCardProps {
  artifact: StructureArtifact;
  timestamp?: number;
  isLast?: boolean;
  stepNumber?: number;
  previousPlddt?: number;
  showPreview?: boolean;        // Enable inline Mol* preview
  defaultExpanded?: boolean;    // Default expanded state for preview
}

export function StructureArtifactCard({
  artifact,
  timestamp,
  isLast = false,
  stepNumber,
  previousPlddt,
  showPreview = true,
  defaultExpanded
}: StructureArtifactCardProps) {
  const { openStructureTab } = useAppStore();
  const isFinal = artifact.label?.toLowerCase() === 'final';

  // Determine initial expanded state: Final/Best structures default expanded, others collapsed
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(
    defaultExpanded !== undefined ? defaultExpanded : isFinal
  );

  // Update expanded state if defaultExpanded prop changes
  useEffect(() => {
    if (defaultExpanded !== undefined) {
      setIsPreviewExpanded(defaultExpanded);
    }
  }, [defaultExpanded]);

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

  const togglePreview = () => {
    setIsPreviewExpanded(!isPreviewExpanded);
  };

  const plddtQuality = getPlddtQuality(artifact.metrics.plddtAvg);
  const paeQuality = getPaeQuality(artifact.metrics.paeAvg);
  const constraintQuality = getConstraintQuality(artifact.metrics.constraint ?? 0);

  // Calculate improvement delta
  const delta = previousPlddt ? artifact.metrics.plddtAvg - previousPlddt : null;

  const hasPreview = showPreview && artifact.pdbData;

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
              Best Result
              <span className="w-1 h-1 rounded-full bg-cf-success/60 animate-pulse" />
            </span>
          ) : (
            <span className="text-xs font-semibold text-cf-text-secondary">
              Step {stepNumber}
            </span>
          )}

          {/* Delta Indicator */}
          {!isFinal && delta !== null && (
            <div className={cn(
              "flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold leading-none",
              delta > 0 ? "text-cf-success bg-cf-success/10" :
              delta < 0 ? "text-cf-confidence-poor bg-cf-confidence-poor/10" :
              "text-cf-text-muted bg-cf-text-muted/10"
            )}>
              {delta > 0 ? <TrendingUp className="w-2.5 h-2.5" /> :
               delta < 0 ? <TrendingDown className="w-2.5 h-2.5" /> :
               <Minus className="w-2.5 h-2.5" />}
              <span>{Math.abs(delta).toFixed(1)}</span>
            </div>
          )}

          <span className="text-[10px] text-cf-text-muted/70 truncate">
            {artifact.filename}
          </span>
        </div>

        {timestamp && (
          <span className="text-[10px] text-cf-text-muted/80 whitespace-nowrap">
            {formatTimestamp(timestamp)}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-3">
        {/* Quality metrics grid - 3 columns */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {/* pLDDT */}
          <div className={cn(
            "flex flex-col gap-0.5 p-2 rounded-md border",
            "bg-cf-bg-input/60 border-cf-border"
          )}>
            <span className="text-[9px] font-bold uppercase tracking-widest text-cf-text-muted/80">pLDDT</span>
            <div className="flex items-baseline gap-1">
              <span className={cn("text-base font-black leading-none tracking-tight", plddtQuality.color)}>
                {artifact.metrics.plddtAvg.toFixed(1)}
              </span>
            </div>
          </div>

          {/* PAE */}
          <div className={cn(
            "flex flex-col gap-0.5 p-2 rounded-md border",
            "bg-cf-bg-input/60 border-cf-border"
          )}>
            <span className="text-[9px] font-bold uppercase tracking-widest text-cf-text-muted/80">PAE</span>
            <div className="flex items-baseline gap-1">
              <span className={cn("text-base font-black leading-none tracking-tight", paeQuality.color)}>
                {artifact.metrics.paeAvg.toFixed(1)}
              </span>
              <span className="text-[9px] font-bold text-cf-text-muted/80 hidden sm:inline">Å</span>
            </div>
          </div>

          {/* Constraint */}
          <div className={cn(
            "flex flex-col gap-0.5 p-2 rounded-md border",
            "bg-cf-bg-input/60 border-cf-border"
          )}>
            <span className="text-[9px] font-bold uppercase tracking-widest text-cf-text-muted/80">Constraint</span>
            <div className="flex items-baseline gap-1">
              <span className={cn("text-base font-black leading-none tracking-tight", constraintQuality.color)}>
                {(artifact.metrics.constraint ?? 0).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* Preview toggle button */}
        {hasPreview && (
          <button
            onClick={togglePreview}
            className={cn(
              "w-full flex items-center justify-center gap-1.5 py-1.5 mb-2 rounded-md",
              "text-[11px] font-medium text-cf-text-secondary",
              "bg-cf-bg hover:bg-cf-bg-secondary border border-cf-border",
              "transition-colors duration-150"
            )}
          >
            {isPreviewExpanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                Hide Preview
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                Show 3D Preview
              </>
            )}
          </button>
        )}

        {/* Inline Mol* Preview - Collapsible */}
        {hasPreview && isPreviewExpanded && (
          <div className="mb-3 rounded-md overflow-hidden border border-cf-border/50 bg-white">
            <div className="relative h-40">
              <MolstarViewer
                tabId={`card-preview-${artifact.structureId}`}
                pdbData={artifact.pdbData!}
                structureId={artifact.structureId}
                showControls={false}
                minimalUI={true}
              />
              <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/30 backdrop-blur-sm text-white text-[10px]">
                Drag to rotate
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant={isFinal ? "default" : "secondary"}
            size="sm"
            className={cn(
              "h-7 flex-1 text-[11px] font-bold shadow-sm transition-all active:scale-95",
              isFinal
                ? "bg-cf-success hover:bg-cf-success/90 text-white border-0 shadow-green-500/20"
                : "bg-cf-bg-secondary hover:bg-cf-bg-tertiary text-cf-text border border-cf-border-strong"
            )}
            onClick={handleOpenStructure}
          >
            <ExternalLink className="w-3 h-3 mr-1.5 opacity-80" />
            Visualize
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-cf-text-secondary hover:text-cf-text hover:bg-cf-highlight rounded-md"
                onClick={handleDownload}
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
