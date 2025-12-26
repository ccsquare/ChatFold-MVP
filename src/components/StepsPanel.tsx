'use client';

import { useAppStore } from '@/lib/store';
import { cn, downloadPDBFile } from '@/lib/utils';
import { StepEvent, StructureArtifact } from '@/lib/types';
import { useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Loader2,
  Download,
  ExternalLink,
  Timer,
  CheckCircle2,
} from 'lucide-react';
import { HelixIcon } from '@/components/icons/ProteinIcon';
import { STAGE_ICONS, STAGE_LABELS } from '@/lib/constants/stages';

export function StepsPanel() {
  const { activeTask, isStreaming, openStructureTab, thumbnails } = useAppStore();
  const stepsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest step
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeTask && activeTask.steps.length > 0) {
      stepsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeTask?.steps]);

  if (!activeTask) {
    return (
      <div className="p-4 border-b border-cf-border">
        <div className="text-center py-8 text-cf-text-secondary text-sm">
          <HelixIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No active folding task</p>
          <p className="text-xs text-cf-text-muted mt-1">
            Upload a FASTA file to start
          </p>
        </div>
      </div>
    );
  }

  // Group steps by stage
  const stageGroups = (activeTask.steps || []).reduce((acc, step) => {
    if (!acc[step.stage]) {
      acc[step.stage] = [];
    }
    acc[step.stage].push(step);
    return acc;
  }, {} as Record<string, StepEvent[]>);

  const stages = Object.keys(stageGroups);
  const currentStage = stages[stages.length - 1] || 'QUEUED';

  const handleOpenStructure = (artifact: StructureArtifact) => {
    if (artifact.pdbData) {
      openStructureTab(artifact, artifact.pdbData);
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex-shrink min-h-0 max-h-[40%] border-b border-cf-border flex flex-col">
        {/* Progress Header */}
        <div className="sticky top-0 bg-cf-bg-tertiary/95 backdrop-blur-sm border-b border-cf-border px-3 py-2 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            {isStreaming ? (
              <Loader2 className="w-4 h-4 text-cf-success animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-cf-success" />
            )}
            <span className="text-sm font-medium text-cf-text">
              {isStreaming ? 'Thinking...' : 'Complete'}
            </span>
          </div>
        </div>

        {/* Steps Timeline */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3">
            {(activeTask.steps || []).map((step, index) => {
              const Icon = STAGE_ICONS[step.stage] || Timer;
              const isLatest = index === (activeTask.steps?.length || 0) - 1;
              const hasArtifacts = step.artifacts && step.artifacts.length > 0;

              return (
                <div key={step.eventId} className="relative">
                  {/* Timeline line */}
                  {index < activeTask.steps.length - 1 && (
                    <div className="absolute left-3 top-6 w-px h-full bg-cf-border" />
                  )}

                  <div className={cn(
                    "flex items-start gap-3 py-2",
                    isLatest && isStreaming && "animate-pulse-subtle"
                  )}>
                    {/* Icon */}
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
                      step.status === 'complete' ? "bg-cf-success/20" :
                        step.status === 'running' ? "bg-cf-info/20" :
                          step.status === 'failed' ? "bg-cf-error/20" :
                            "bg-cf-bg"
                    )}>
                      <Icon className={cn(
                        "w-3.5 h-3.5",
                        step.status === 'complete' ? "text-cf-success" :
                          step.status === 'running' ? "text-cf-info" :
                            step.status === 'failed' ? "text-cf-error" :
                              "text-cf-text-secondary"
                      )} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-cf-text">
                          {STAGE_LABELS[step.stage]}
                        </span>
                        <span className="text-[10px] text-cf-text-muted">
                          {new Date(step.ts).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs text-cf-text-secondary mt-0.5 truncate">
                        {step.message}
                      </p>

                      {/* Structure Artifacts */}
                      {hasArtifacts && (
                        <div className="mt-2 space-y-1.5">
                          {step.artifacts!.map(artifact => (
                            <div
                              key={artifact.structureId}
                              className="flex items-center gap-2 bg-cf-bg rounded p-2"
                            >
                              {/* Thumbnail */}
                              <div className="w-10 h-10 rounded bg-cf-bg-secondary flex-shrink-0 overflow-hidden">
                                {thumbnails[artifact.structureId] ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={thumbnails[artifact.structureId]}
                                    alt={artifact.label}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <HelixIcon className="w-4 h-4 text-cf-text-muted" />
                                  </div>
                                )}
                              </div>

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-cf-text truncate">
                                  {artifact.filename}
                                </p>
                                <div className="flex gap-2 text-[10px] text-cf-text-muted">
                                  <span>pLDDT: {artifact.metrics.plddtAvg.toFixed(1)}</span>
                                  <span>PAE: {artifact.metrics.paeAvg.toFixed(1)}</span>
                                </div>
                              </div>

                              {/* Actions */}
                              <div className="flex gap-1">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-cf-text-secondary hover:text-cf-text"
                                      onClick={() => handleOpenStructure(artifact)}
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                      <span className="sr-only">Open in full viewer</span>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Open in full viewer</TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-cf-text-secondary hover:text-cf-text"
                                      onClick={() => {
                                        if (artifact.pdbData) {
                                          downloadPDBFile(artifact.pdbData, artifact.filename);
                                        }
                                      }}
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                      <span className="sr-only">Download PDB</span>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Download PDB</TooltipContent>
                                </Tooltip>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Empty state */}
            {(activeTask.steps?.length || 0) === 0 && (
              <div className="flex items-center gap-3 py-2">
                <div className="w-6 h-6 rounded-full bg-cf-bg flex items-center justify-center">
                  <Loader2 className="w-3.5 h-3.5 text-cf-text-secondary animate-spin" />
                </div>
                <span className="text-xs text-cf-text-secondary">Initializing...</span>
              </div>
            )}

            {/* Auto-scroll anchor */}
            <div ref={stepsEndRef} />
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
