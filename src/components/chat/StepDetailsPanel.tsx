'use client';

import { FoldStep } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/store';
import { Maximize2 } from 'lucide-react';

interface StepDetailsPanelProps {
  step: FoldStep | null;
  className?: string;
}

export function StepDetailsPanel({ step, className }: StepDetailsPanelProps) {
  const openStructureTab = useAppStore(state => state.openStructureTab);

  const handleOpenInCanvas = () => {
    if (!step || !step.pdbData) return;

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
  };

  if (!step) {
    return (
      <div
        className={cn(
          'w-48 bg-cf-bg-tertiary border-l border-cf-border p-4',
          className
        )}
      >
        <div className="text-cf-text-secondary text-sm text-center">
          No step selected
        </div>
      </div>
    );
  }

  const { metrics, label, stepNumber, stage } = step;

  return (
    <div
      className={cn(
        'w-48 bg-cf-bg-tertiary border-l border-cf-border p-4 overflow-y-auto',
        className
      )}
    >
      {/* Glass-morphism card */}
      <div className="rounded-cf-md bg-cf-bg-secondary/80 backdrop-blur-sm border border-cf-border p-3 space-y-4">
        {/* Header */}
        <div>
          <h3 className="text-sm font-semibold text-cf-text mb-1">
            Step {stepNumber} Details
          </h3>
          <p className="text-xs text-cf-text-secondary">
            {label}
          </p>
          <p className="text-xs text-cf-text-muted mt-1">
            Stage: {stage}
          </p>
        </div>

        {/* Open in Canvas button */}
        {step.pdbData && (
          <button
            onClick={handleOpenInCanvas}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium text-cf-text-secondary hover:text-cf-text bg-cf-highlight hover:bg-cf-highlight-strong border border-cf-border rounded-cf transition-colors"
          >
            <Maximize2 className="w-3 h-3" />
            Open in Canvas
          </button>
        )}

        {/* Metrics */}
        <div className="space-y-3">
          {/* RMSD */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-cf-text-secondary">RMSD</span>
              <span className="text-xs font-medium text-cf-text">
                {metrics.rmsd.toFixed(2)} Å
              </span>
            </div>
            <div className="h-1 bg-cf-bg rounded-full overflow-hidden">
              <div
                className="h-full bg-cf-accent"
                style={{ width: `${Math.min(100, (metrics.rmsd / 5) * 100)}%` }}
              />
            </div>
          </div>

          {/* Energy */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-cf-text-secondary">Energy</span>
              <span className="text-xs font-medium text-cf-text">
                {metrics.energy.toFixed(1)} kcal/mol
              </span>
            </div>
            <div className="h-1 bg-cf-bg rounded-full overflow-hidden">
              <div
                className="h-full bg-cf-success"
                style={{
                  width: `${Math.min(100, Math.abs(metrics.energy) / 100 * 100)}%`,
                }}
              />
            </div>
          </div>

          {/* Time */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-cf-text-secondary">Time</span>
              <span className="text-xs font-medium text-cf-text">
                {metrics.time.toFixed(1)} ns
              </span>
            </div>
          </div>

          {/* H-Bonds */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-cf-text-secondary">H-Bonds</span>
              <span className="text-xs font-medium text-cf-text">
                {metrics.hBonds}
              </span>
            </div>
            <div className="h-1 bg-cf-bg rounded-full overflow-hidden">
              <div
                className="h-full bg-cf-info"
                style={{ width: `${Math.min(100, (metrics.hBonds / 100) * 100)}%` }}
              />
            </div>
          </div>

          {/* Hydrophobic contacts */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-cf-text-secondary">
                Hydrophobic
              </span>
              <span className="text-xs font-medium text-cf-text">
                {metrics.hydrophobic}
              </span>
            </div>
            <div className="h-1 bg-cf-bg rounded-full overflow-hidden">
              <div
                className="h-full bg-cf-confidence-poor"
                style={{
                  width: `${Math.min(100, (metrics.hydrophobic / 100) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
