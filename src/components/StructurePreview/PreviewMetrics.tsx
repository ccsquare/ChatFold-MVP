'use client';

import { cn } from '@/lib/utils';
import { StructureArtifact } from '@/lib/types';

interface PreviewMetricsProps {
  structure: StructureArtifact;
  className?: string;
}

export function PreviewMetrics({ structure, className }: PreviewMetricsProps) {
  const plddtScore = structure.metrics.plddtAvg;
  const paeScore = structure.metrics.paeAvg;

  // Determine confidence level for pLDDT
  const getPlddtColor = (score: number) => {
    if (score >= 90) return 'text-blue-400'; // Very high
    if (score >= 70) return 'text-cyan-400'; // High
    if (score >= 50) return 'text-yellow-400'; // Low
    return 'text-orange-400'; // Very low
  };

  // Determine quality level for PAE (lower is better)
  const getPaeColor = (score: number) => {
    if (score <= 5) return 'text-blue-400'; // Excellent
    if (score <= 10) return 'text-cyan-400'; // Good
    if (score <= 20) return 'text-yellow-400'; // Fair
    return 'text-orange-400'; // Poor
  };

  return (
    <div className={cn(
      "absolute bottom-4 left-4 z-10",
      "bg-cf-bg/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-cf-border/50",
      className
    )}>
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-cf-text-muted">pLDDT</span>
          <span className={cn("font-mono font-medium", getPlddtColor(plddtScore))}>
            {plddtScore.toFixed(1)}
          </span>
        </div>
        <div className="w-px h-3 bg-cf-border" />
        <div className="flex items-center gap-1.5">
          <span className="text-cf-text-muted">PAE</span>
          <span className={cn("font-mono font-medium", getPaeColor(paeScore))}>
            {paeScore.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Structure label badge */}
      {structure.label && structure.label !== 'candidate' && (
        <div className={cn(
          "mt-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider",
          structure.label === 'final'
            ? "bg-cf-success/20 text-cf-success"
            : "bg-cf-text-muted/20 text-cf-text-muted"
        )}>
          {structure.label}
        </div>
      )}
    </div>
  );
}
