'use client';

import { useState, useCallback, useId, useRef } from 'react';
import { ViewerTab } from '@/lib/types';
import { cn, downloadFile } from '@/lib/utils';
import { MolstarViewer } from './MolstarViewer';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Link2,
  Link2Off,
  RotateCcw,
  Layers,
  Download,
  Camera,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { resetSyncGroupCamera } from '@/hooks/useCameraSync';

interface CompareViewerProps {
  tab: ViewerTab;
  className?: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

/**
 * Compare two protein structures side by side with synchronized camera.
 * Shows current structure on the right and previous structure on the left.
 */
export function CompareViewer({ tab, className, isExpanded = false, onToggleExpand }: CompareViewerProps) {
  // Generate unique sync group ID for this comparison
  const syncGroupId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  // Camera sync enabled by default
  const [cameraSyncEnabled, setCameraSyncEnabled] = useState(true);

  // Toggle camera sync
  const handleToggleCameraSync = useCallback(() => {
    setCameraSyncEnabled(prev => !prev);
  }, []);

  // Reset all cameras to default view
  const handleResetCameras = useCallback(() => {
    resetSyncGroupCamera(syncGroupId);
  }, [syncGroupId]);

  // Download a structure
  const handleDownload = useCallback((pdbData: string, filename: string) => {
    downloadFile(pdbData, filename, 'chemical/x-pdb');
  }, []);

  // Screenshot the comparison view
  const handleScreenshot = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // Find all canvases in the comparison view
    const canvases = container.querySelectorAll('canvas');
    if (canvases.length === 0) return;

    // Create a combined canvas for the screenshot
    const combinedCanvas = document.createElement('canvas');
    const ctx = combinedCanvas.getContext('2d');
    if (!ctx) return;

    // Calculate total dimensions
    let totalWidth = 0;
    let maxHeight = 0;
    canvases.forEach(canvas => {
      totalWidth += canvas.width;
      maxHeight = Math.max(maxHeight, canvas.height);
    });

    combinedCanvas.width = totalWidth;
    combinedCanvas.height = maxHeight;

    // Draw each canvas
    let xOffset = 0;
    canvases.forEach(canvas => {
      ctx.drawImage(canvas, xOffset, 0);
      xOffset += canvas.width;
    });

    // Download
    const link = document.createElement('a');
    link.download = `comparison_${tab.compareWith?.label || 'prev'}_${tab.label.replace('Compare: ', '')}_screenshot.png`;
    link.href = combinedCanvas.toDataURL('image/png');
    link.click();
  }, [tab]);

  if (!tab.isCompare || !tab.compareWith) {
    return (
      <div className="flex-1 flex items-center justify-center text-cf-text-muted">
        <p>No comparison data available</p>
      </div>
    );
  }

  const current = {
    structureId: tab.structureId,
    label: tab.label.replace('Compare: ', ''),
    filename: tab.filename,
    pdbData: tab.pdbData
  };

  const previous = tab.compareWith;

  return (
    <TooltipProvider delayDuration={300}>
    <div ref={containerRef} className={cn("flex flex-col h-full", className)}>
      {/* Unified Toolbar */}
      <div className="flex items-center justify-between h-10 px-4 border-b border-cf-border bg-cf-bg-tertiary">
        {/* Left: Title and comparison info */}
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-cf-text" />
          <span className="text-[13px] font-medium text-cf-text">Comparison</span>
          <span className="text-xs text-cf-text-muted hidden sm:inline">
            {previous.label} → {current.label}
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          {/* Download dropdown */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost-icon"
                    size="icon"
                    className="h-8 w-8"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Download PDB</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleDownload(previous.pdbData, previous.filename)}>
                <Download className="w-4 h-4 mr-2" />
                {previous.label} (Previous)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDownload(current.pdbData, current.filename)}>
                <Download className="w-4 h-4 mr-2" />
                {current.label} (Current)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Screenshot */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost-icon"
                size="icon"
                className="h-8 w-8"
                onClick={handleScreenshot}
              >
                <Camera className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Screenshot comparison</TooltipContent>
          </Tooltip>

          {/* Reset cameras */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost-icon"
                size="icon"
                className="h-8 w-8"
                onClick={handleResetCameras}
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset camera views</TooltipContent>
          </Tooltip>

          {/* Separator */}
          <div className="w-px h-5 bg-cf-border mx-1" />

          {/* Camera sync toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={cameraSyncEnabled ? "ghost-icon-active" : "ghost-icon"}
                size="icon"
                onClick={handleToggleCameraSync}
                className="h-8 w-8"
              >
                {cameraSyncEnabled ? (
                  <Link2 className="w-4 h-4" />
                ) : (
                  <Link2Off className="w-4 h-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {cameraSyncEnabled ? 'Camera sync enabled' : 'Camera sync disabled'}
            </TooltipContent>
          </Tooltip>

          {/* Fullscreen toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost-icon"
                size="icon"
                className="h-8 w-8"
                onClick={onToggleExpand}
              >
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isExpanded ? 'Exit fullscreen' : 'Fullscreen'}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Side-by-side comparison */}
      <div className="flex-1 flex overflow-hidden">
        {/* Previous structure (left) */}
        <div className="flex-1 flex flex-col border-r border-cf-border">
          <StructurePanel
            title="Previous"
            label={previous.label}
            filename={previous.filename}
            structureId={previous.structureId}
            pdbData={previous.pdbData}
            syncGroupId={syncGroupId}
            syncEnabled={cameraSyncEnabled}
            tabId={`compare-prev-${tab.id}`}
          />
        </div>

        {/* Current structure (right) */}
        <div className="flex-1 flex flex-col">
          <StructurePanel
            title="Current"
            label={current.label}
            filename={current.filename}
            structureId={current.structureId}
            pdbData={current.pdbData}
            syncGroupId={syncGroupId}
            syncEnabled={cameraSyncEnabled}
            tabId={`compare-curr-${tab.id}`}
            isCurrent
          />
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}

/**
 * Individual structure panel with header and viewer
 * Uses Molstar's native UI panels for structure manipulation
 */
function StructurePanel({
  title,
  label,
  filename,
  structureId,
  pdbData,
  syncGroupId,
  syncEnabled,
  tabId,
  isCurrent = false
}: {
  title: string;
  label: string;
  filename: string;
  structureId: string;
  pdbData: string;
  syncGroupId: string;
  syncEnabled: boolean;
  tabId: string;
  isCurrent?: boolean;
}) {
  return (
    <>
      {/* Panel header */}
      <div className={cn(
        "flex items-center justify-between px-3 py-1.5 border-b",
        isCurrent
          ? "bg-cf-accent/5 border-cf-accent/20"
          : "bg-cf-bg-tertiary border-cf-border"
      )}>
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-xs font-semibold uppercase tracking-wide",
            isCurrent ? "text-cf-accent" : "text-cf-text-muted"
          )}>
            {title}
          </span>
          <span className="text-xs text-cf-text-secondary truncate max-w-[120px]">
            {label}
          </span>
        </div>
      </div>

      {/* Mol* viewer with native UI panels */}
      <div className="flex-1 relative">
        <MolstarViewer
          tabId={tabId}
          pdbData={pdbData}
          structureId={structureId}
          showControls={true}
          minimalUI={false}
          syncGroupId={syncGroupId}
          syncEnabled={syncEnabled}
        />
      </div>
    </>
  );
}


