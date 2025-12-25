/**
 * @deprecated This component uses the legacy FoldStep type.
 * Use StructureArtifactCard with the new unified API instead.
 * This component is kept for backward compatibility but will be removed in a future version.
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { FoldStep } from '@/lib/types';
import { MolstarViewer } from '@/components/MolstarViewer';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Timer,
  AlignJustify,
  Brain,
  Waves,
  ShieldCheck,
  CircleAlert,
  Loader2,
  Download,
  ExternalLink,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Trophy,
} from 'lucide-react';
import { HelixIcon } from '@/components/icons/ProteinIcon';

// Stage icons matching StepsPanel
const stageIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'QUEUED': Timer,
  'MSA': AlignJustify,
  'MODEL': Brain,
  'RELAX': Waves,
  'QA': ShieldCheck,
  'DONE': CheckCircle2,
  'ERROR': CircleAlert,
};

// Stage labels matching StepsPanel
const stageLabels: Record<string, string> = {
  'QUEUED': 'Queued',
  'MSA': 'Sequence Alignment',
  'MODEL': 'Structure Prediction',
  'RELAX': 'Energy Relaxation',
  'QA': 'Quality Assessment',
  'DONE': 'Complete',
  'ERROR': 'Error',
};

// Module-level Set to track which messages have auto-opened their best structure
// This persists across component remounts but resets on page refresh
const autoOpenedMessages = new Set<string>();

interface FoldingTimelineViewerProps {
  steps: FoldStep[];
  conversationId: string;
  messageId: string;  // Used to track if this message has auto-opened its best structure
  className?: string;
}

export function FoldingTimelineViewer({
  steps,
  conversationId,
  messageId,
  className,
}: FoldingTimelineViewerProps) {
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const openStructureTab = useAppStore(state => state.openStructureTab);
  const stepsEndRef = useRef<HTMLDivElement>(null);

  // Ensure we have at least one step to display
  const validSteps = steps.length > 0 ? steps : [];

  // Find the best step (lowest RMSD = best structure)
  const bestStep = validSteps.length > 0
    ? validSteps.reduce((best, current) =>
        current.metrics.rmsd < best.metrics.rmsd ? current : best
      )
    : null;

  // Helper to open a step in Canvas
  const openStepInCanvas = useCallback((step: FoldStep) => {
    if (!step.pdbData) return;

    // Convert FoldStep metrics to StructureArtifact metrics
    // pLDDT (0-100, higher is better): inversely related to RMSD
    // PAE (0-30, lower is better): proportional to RMSD
    const plddt = Math.min(95, Math.max(30, 100 - step.metrics.rmsd * 20));
    const pae = Math.max(3, step.metrics.rmsd * 10);

    // Calculate constraint satisfaction based on energy (lower energy = better constraint)
    const constraint = Math.min(100, Math.max(0, 50 + Math.abs(step.metrics.energy) / 2));

    const structure = {
      type: 'structure' as const,
      structureId: step.structureId,
      label: step.label,
      filename: `step-${step.stepNumber}.pdb`,
      metrics: {
        plddtAvg: Math.round(plddt * 10) / 10,
        paeAvg: Math.round(pae * 10) / 10,
        constraint: Math.round(constraint * 10) / 10
      },
      pdbData: step.pdbData
    };

    openStructureTab(structure, step.pdbData);
  }, [openStructureTab]);

  // Auto-expand best step on initial load (not first step)
  useEffect(() => {
    if (bestStep && expandedStepId === null) {
      setExpandedStepId(bestStep.id);
    }
  }, [bestStep, expandedStepId]);

  // Auto-open best structure in Canvas on completion (only once per message)
  // Uses module-level Set to persist across component remounts
  useEffect(() => {
    if (bestStep && bestStep.pdbData && messageId && !autoOpenedMessages.has(messageId)) {
      // Mark as opened BEFORE scheduling the timeout to prevent race conditions
      autoOpenedMessages.add(messageId);
      // Slight delay to ensure the viewer is ready
      const timer = setTimeout(() => {
        openStepInCanvas(bestStep);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [bestStep, messageId, openStepInCanvas]);

  const handleStepClick = useCallback((stepId: string) => {
    setExpandedStepId(prev => prev === stepId ? null : stepId);
  }, []);

  const handleOpenInCanvas = useCallback((step: FoldStep) => {
    openStepInCanvas(step);
  }, [openStepInCanvas]);

  const handleDownload = useCallback((step: FoldStep) => {
    if (!step.pdbData) return;

    const blob = new Blob([step.pdbData], { type: 'chemical/x-pdb' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `step-${step.stepNumber}.pdb`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  if (validSteps.length === 0) {
    return (
      <div className={cn('space-y-2', className)}>
        <p className="text-cf-text-secondary text-sm">
          Initializing protein folding simulation...
        </p>
        <div className="rounded-cf-lg border border-cf-border bg-cf-bg-secondary p-8 animate-pulse">
          <div className="h-4 bg-cf-bg-tertiary rounded w-1/3 mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn('space-y-2', className)}>
        {/* Header - consistent with StepsPanel style */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-cf-success" />
            <span className="text-sm font-medium text-cf-text">
              Folding Complete
            </span>
          </div>
          <div className="flex items-center gap-2">
            {bestStep && (
              <span className="flex items-center gap-1 text-xs text-cf-warning">
                <Trophy className="w-3 h-3" />
                Best: Step {bestStep.stepNumber}
              </span>
            )}
            <span className="text-xs text-cf-text-secondary">
              {validSteps.length} steps
            </span>
          </div>
        </div>

        {/* Timeline card - vertical list style matching StepsPanel */}
        <div className="rounded-cf-lg border border-cf-border bg-cf-bg-secondary overflow-hidden">
          {/* Progress Bar */}
          <div className="h-1 bg-cf-bg">
            <div className="h-full bg-cf-success w-full" />
          </div>

          {/* Steps List */}
          <ScrollArea className="max-h-[600px]">
            <div className="p-3">
              {validSteps.map((step, index) => {
                const Icon = stageIcons[step.stage] || Timer;
                const isExpanded = expandedStepId === step.id;
                const isCompleted = step.status === 'completed';
                const isPending = step.status === 'pending';
                const isActive = step.status === 'active';
                const isBest = bestStep?.id === step.id;

                return (
                  <div key={step.id} className="relative">
                    {/* Timeline line */}
                    {index < validSteps.length - 1 && (
                      <div className="absolute left-3 top-6 w-px h-full bg-cf-border" />
                    )}

                    <div className="py-2">
                      {/* Step Header - clickable */}
                      <button
                        onClick={() => handleStepClick(step.id)}
                        className={cn(
                          "flex items-start gap-3 w-full text-left rounded-lg p-2 -m-2 transition-colors",
                          "hover:bg-cf-highlight focus:outline-none focus-visible:ring-2 focus-visible:ring-cf-accent",
                          isExpanded && "bg-cf-highlight"
                        )}
                      >
                        {/* Icon */}
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
                          isCompleted ? "bg-cf-success/20" :
                            isActive ? "bg-cf-info/20" :
                              isPending ? "bg-cf-bg" :
                                "bg-cf-bg"
                        )}>
                          <Icon className={cn(
                            "w-3.5 h-3.5",
                            isCompleted ? "text-cf-success" :
                              isActive ? "text-cf-info" :
                                "text-cf-text-secondary"
                          )} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-cf-text">
                                Step {step.stepNumber}: {stageLabels[step.stage] || step.stage}
                              </span>
                              {isBest && (
                                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-cf-warning/20 text-cf-warning text-[10px] font-medium">
                                  <Trophy className="w-2.5 h-2.5" />
                                  Best
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-cf-text-muted">
                                {step.metrics.time.toFixed(1)} ns
                              </span>
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5 text-cf-text-muted" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-cf-text-muted" />
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-cf-text-secondary mt-0.5 truncate">
                            {step.label}
                          </p>

                          {/* Metrics summary - always visible */}
                          <div className="flex gap-3 mt-1 text-[10px] text-cf-text-muted">
                            <span>RMSD: {step.metrics.rmsd.toFixed(2)} Å</span>
                            <span>Energy: {step.metrics.energy.toFixed(1)} kcal/mol</span>
                          </div>
                        </div>
                      </button>

                      {/* Expanded Content */}
                      {isExpanded && step.pdbData && (
                        <div className="mt-3 ml-9 space-y-3">
                          {/* Structure Preview */}
                          <div className="rounded-cf bg-cf-bg overflow-hidden">
                            {/* Mol* Viewer */}
                            <div className="relative h-48 bg-white">
                              <MolstarViewer
                                tabId={`timeline-${conversationId}-${step.id}`}
                                pdbData={step.pdbData}
                                structureId={step.structureId}
                                showControls={false}
                                minimalUI={true}
                              />
                              <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/20 backdrop-blur-sm text-white text-[10px]">
                                Drag to rotate • Scroll to zoom
                              </div>
                            </div>

                            {/* Detailed Metrics */}
                            <div className="p-3 space-y-2 border-t border-cf-border">
                              {/* RMSD */}
                              <div>
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-xs text-cf-text-secondary">RMSD</span>
                                  <span className="text-xs font-medium text-cf-text">
                                    {step.metrics.rmsd.toFixed(2)} Å
                                  </span>
                                </div>
                                <div className="h-1 bg-cf-bg-tertiary rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-cf-accent"
                                    style={{ width: `${Math.min(100, (step.metrics.rmsd / 5) * 100)}%` }}
                                  />
                                </div>
                              </div>

                              {/* Energy */}
                              <div>
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-xs text-cf-text-secondary">Energy</span>
                                  <span className="text-xs font-medium text-cf-text">
                                    {step.metrics.energy.toFixed(1)} kcal/mol
                                  </span>
                                </div>
                                <div className="h-1 bg-cf-bg-tertiary rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-cf-success"
                                    style={{ width: `${Math.min(100, Math.abs(step.metrics.energy) / 100 * 100)}%` }}
                                  />
                                </div>
                              </div>

                              {/* H-Bonds */}
                              <div>
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-xs text-cf-text-secondary">H-Bonds</span>
                                  <span className="text-xs font-medium text-cf-text">
                                    {step.metrics.hBonds}
                                  </span>
                                </div>
                                <div className="h-1 bg-cf-bg-tertiary rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-cf-info"
                                    style={{ width: `${Math.min(100, (step.metrics.hBonds / 100) * 100)}%` }}
                                  />
                                </div>
                              </div>

                              {/* Hydrophobic */}
                              <div>
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-xs text-cf-text-secondary">Hydrophobic</span>
                                  <span className="text-xs font-medium text-cf-text">
                                    {step.metrics.hydrophobic}
                                  </span>
                                </div>
                                <div className="h-1 bg-cf-bg-tertiary rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-cf-confidence-poor"
                                    style={{ width: `${Math.min(100, (step.metrics.hydrophobic / 100) * 100)}%` }}
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2 p-3 pt-0">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="flex-1 h-7 text-xs text-cf-text-secondary hover:text-cf-text"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenInCanvas(step);
                                    }}
                                  >
                                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                                    Open in Canvas
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Open in Canvas</TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs text-cf-text-secondary hover:text-cf-text"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownload(step);
                                    }}
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Download PDB</TooltipContent>
                              </Tooltip>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Auto-scroll anchor */}
              <div ref={stepsEndRef} />
            </div>
          </ScrollArea>
        </div>
      </div>
    </TooltipProvider>
  );
}
