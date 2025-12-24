'use client';

import { StructureArtifact } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Download, ExternalLink, Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { HelixIcon } from '@/components/icons/ProteinIcon';

interface StructureArtifactCardProps {
  artifact: StructureArtifact;
  timestamp?: number;
  isLast?: boolean;
  stepNumber?: number;
  previousPlddt?: number;
}

// pLDDT quality assessment following AlphaFold conventions
// Using distinct colors: blue (very high), teal (confident), yellow (low), orange (very low)
function getPlddtQuality(plddt: number): { label: string; color: string; bgColor: string } {
  if (plddt >= 90) return { label: 'Very High', color: 'text-blue-400', bgColor: 'bg-blue-400/15' };
  if (plddt >= 70) return { label: 'Confident', color: 'text-teal-400', bgColor: 'bg-teal-400/15' };
  if (plddt >= 50) return { label: 'Low', color: 'text-yellow-500', bgColor: 'bg-yellow-500/15' };
  return { label: 'Very Low', color: 'text-orange-500', bgColor: 'bg-orange-500/15' };
}

// PAE quality (lower is better)
// Using distinct colors: teal (excellent), blue (good), yellow (moderate), orange (poor)
function getPaeQuality(pae: number): { color: string; bgColor: string } {
  if (pae <= 5) return { color: 'text-teal-400', bgColor: 'bg-teal-400/15' };
  if (pae <= 10) return { color: 'text-blue-400', bgColor: 'bg-blue-400/15' };
  if (pae <= 20) return { color: 'text-yellow-500', bgColor: 'bg-yellow-500/15' };
  return { color: 'text-orange-500', bgColor: 'bg-orange-500/15' };
}

// Format relative time
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function StructureArtifactCard({
  artifact,
  timestamp,
  isLast = false,
  stepNumber,
  previousPlddt
}: StructureArtifactCardProps) {
  const { openStructureTab } = useAppStore();

  const handleOpenStructure = () => {
    if (artifact.pdbData) {
      openStructureTab(artifact, artifact.pdbData);
    }
  };

  const handleDownload = () => {
    if (artifact.pdbData) {
      const blob = new Blob([artifact.pdbData], { type: 'chemical/x-pdb' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = artifact.filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const isFinal = artifact.label === 'final';
  const plddtQuality = getPlddtQuality(artifact.metrics.plddtAvg);
  const paeQuality = getPaeQuality(artifact.metrics.paeAvg);

  // Calculate improvement delta
  const delta = previousPlddt ? artifact.metrics.plddtAvg - previousPlddt : null;

  return (
    <div className={cn(
      "flex-1 min-w-0 rounded-lg border transition-all duration-200 overflow-hidden",
      isFinal
        ? "bg-green-50/40 dark:bg-emerald-950/20 border-cf-success/40 dark:border-emerald-500/40 shadow-sm"
        : "bg-cf-bg-tertiary/60 dark:bg-zinc-800/40 hover:bg-cf-bg-tertiary/80 dark:hover:bg-zinc-800/60 border-cf-border-strong dark:border-zinc-700/80 hover:border-cf-accent/40"
    )}>
      {/* Header */}
      <div className={cn(
        "flex items-center justify-between gap-2 px-3 py-1.5 border-b",
        isFinal 
          ? "border-green-200/50 dark:border-emerald-800/40 bg-green-100/40 dark:bg-emerald-900/30" 
          : "border-cf-border/50 dark:border-zinc-700/50 bg-cf-bg-secondary/60 dark:bg-zinc-900/40"
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
              delta > 0 ? "text-cf-success bg-green-500/10" : 
              delta < 0 ? "text-orange-400 bg-orange-500/10" : 
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
            {formatRelativeTime(timestamp)}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-3">
        {/* Quality metrics grid */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className={cn(
            "flex flex-col gap-0.5 p-2 rounded-md border",
            "bg-white/40 dark:bg-zinc-900/40 border-black/5 dark:border-white/5"
          )}>
            <span className="text-[9px] font-bold uppercase tracking-widest text-cf-text-muted/80">pLDDT</span>
            <div className="flex items-baseline gap-1.5">
              <span className={cn("text-lg font-black leading-none tracking-tight", plddtQuality.color)}>
                {artifact.metrics.plddtAvg.toFixed(1)}
              </span>
              <span className={cn("text-[10px] font-bold opacity-90", plddtQuality.color)}>
                {plddtQuality.label}
              </span>
            </div>
          </div>

          <div className={cn(
            "flex flex-col gap-0.5 p-2 rounded-md border",
            "bg-white/40 dark:bg-zinc-900/40 border-black/5 dark:border-white/5"
          )}>
            <span className="text-[9px] font-bold uppercase tracking-widest text-cf-text-muted/80">PAE</span>
            <div className="flex items-baseline gap-1.5">
              <span className={cn("text-lg font-black leading-none tracking-tight", paeQuality.color)}>
                {artifact.metrics.paeAvg.toFixed(1)}
              </span>
              <span className="text-[10px] font-bold text-cf-text-muted/80">Avg Error</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant={isFinal ? "default" : "secondary"}
            size="sm"
            className={cn(
              "h-7 flex-1 text-[11px] font-bold shadow-sm transition-all active:scale-95",
              isFinal 
                ? "bg-cf-success hover:bg-cf-success/90 text-white border-0 shadow-green-500/20" 
                : "bg-cf-bg-secondary dark:bg-zinc-800 hover:bg-cf-bg-tertiary dark:hover:bg-zinc-700 text-cf-text border border-cf-border-strong dark:border-zinc-600/50"
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
