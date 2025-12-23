'use client';

import { useState } from 'react';
import { ViewerTab } from '@/lib/types';
import { cn } from '@/lib/utils';
import { PanelRightClose, PanelRightOpen, Info, Gauge, NotebookPen, MousePointerClick } from 'lucide-react';

interface InspectorPanelProps {
  tab: ViewerTab;
}

export function InspectorPanel({ tab }: InspectorPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className="w-8 border-l border-cf-border bg-cf-bg-secondary flex flex-col items-center py-2">
        <button
          className="p-1.5 rounded hover:bg-cf-highlight"
          onClick={() => setCollapsed(false)}
          aria-label="Expand inspector"
        >
          <PanelRightOpen className="w-4 h-4 text-cf-text-secondary" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-[200px] border-l border-cf-border bg-cf-bg-secondary flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-cf-border">
        <span className="text-xs font-medium text-cf-text-secondary uppercase tracking-wider">
          Inspector
        </span>
        <button
          className="p-1 rounded hover:bg-cf-highlight"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse inspector"
        >
          <PanelRightClose className="w-4 h-4 text-cf-text-secondary" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Selection Info */}
        <div className="p-3 border-b border-cf-border bg-cf-bg-tertiary/50">
          <div className="flex items-center gap-1.5 mb-2">
            <MousePointerClick className="w-3.5 h-3.5 text-cf-text-muted" />
            <span className="text-xs font-medium text-cf-text-secondary">Selection</span>
          </div>
          {tab.selection ? (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between border-b border-cf-border pb-1">
                <span className="text-sm font-semibold text-cf-text">
                  {tab.selection.residueName} {tab.selection.authResidueId}
                </span>
                <span className="text-xs text-cf-text-muted">
                  {tab.selection.authChainId}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs">
                <div className="flex flex-col">
                  <span className="text-[10px] text-cf-text-muted uppercase">Atom</span>
                  <span className="font-medium text-cf-text">{tab.selection.atomName}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-cf-text-muted uppercase">Element</span>
                  <span className="font-medium text-cf-text">{tab.selection.element}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-cf-text-muted uppercase">Chain</span>
                  <span className="font-medium text-cf-text" title={`Label: ${tab.selection.chainId}`}>
                    {tab.selection.authChainId}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-cf-text-muted uppercase">B-Factor</span>
                  <span className={cn(
                    "font-medium",
                    tab.selection.bFactor > 70 ? "text-blue-500" :
                    tab.selection.bFactor > 50 ? "text-cf-success" :
                    "text-yellow-500"
                  )}>
                    {tab.selection.bFactor.toFixed(1)}
                  </span>
                </div>
              </div>
              <div className="text-[10px] text-cf-text-muted font-mono mt-1 border-t border-cf-border pt-1 truncate" title="Label ID scheme (Chain:Residue:Atom)">
                {tab.selection.chainId}:{tab.selection.residueName}{tab.selection.residueId}:{tab.selection.atomName}
              </div>
            </div>
          ) : (
            <div className="text-xs text-cf-text-muted italic py-2 text-center">
              Click an atom to view details
            </div>
          )}
        </div>

        {/* Structure Info */}
        <div className="p-3 border-b border-cf-border">
          <div className="flex items-center gap-1.5 mb-2">
            <Info className="w-3.5 h-3.5 text-cf-text-muted" />
            <span className="text-xs font-medium text-cf-text-secondary">Structure</span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-cf-text-muted">Ref:</span>
              <span className="text-cf-text font-mono text-[10px] truncate max-w-[100px]" title={tab.structureId}>{tab.structureId}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-cf-text-muted">Label:</span>
              <span className="text-cf-text truncate max-w-[100px]" title={tab.label}>{tab.label}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-cf-text-muted">File:</span>
              <span className="text-cf-text truncate max-w-[100px]" title={tab.filename}>{tab.filename}</span>
            </div>
            {tab.atomCount !== undefined && tab.atomCount > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-cf-text-muted">Atoms:</span>
                <span className="text-cf-text font-medium">{tab.atomCount.toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Metrics Section */}
        {tab.metrics && (
          <div className="p-3 border-b border-cf-border">
            <div className="flex items-center gap-1.5 mb-2">
              <Gauge className="w-3.5 h-3.5 text-cf-text-muted" />
              <span className="text-xs font-medium text-cf-text-secondary">Metrics</span>
            </div>
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-cf-text-muted">pLDDT</span>
                  <span className={cn(
                    "font-medium",
                    tab.metrics.plddtAvg >= 70 ? "text-cf-success" : "text-yellow-500"
                  )}>
                    {tab.metrics.plddtAvg.toFixed(1)}
                  </span>
                </div>
                <div className="h-1.5 bg-cf-bg rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      tab.metrics.plddtAvg >= 70 ? "bg-cf-success" : "bg-yellow-500"
                    )}
                    style={{ width: `${tab.metrics.plddtAvg}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-cf-text-muted">PAE</span>
                  <span className="text-cf-text font-medium">{tab.metrics.paeAvg.toFixed(1)} Å</span>
                </div>
                <div className="h-1.5 bg-cf-bg rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${Math.min(100, (30 - tab.metrics.paeAvg) / 30 * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notes Section */}
        <div className="p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <NotebookPen className="w-3.5 h-3.5 text-cf-text-muted" />
            <span className="text-xs font-medium text-cf-text-secondary">Notes</span>
          </div>
          <textarea
            className="w-full h-20 bg-cf-bg border border-cf-border rounded p-2 text-xs text-cf-text placeholder:text-cf-text-muted resize-none focus:outline-none focus:border-cf-accent"
            placeholder="Add notes about this structure..."
          />
        </div>
      </div>
    </div>
  );
}
