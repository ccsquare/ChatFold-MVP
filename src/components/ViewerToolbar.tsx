'use client';

import { useAppStore } from '@/lib/store';
import { downloadFile } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Download,
  Camera,
  RotateCcw,
  Layers,
  GitCompare,
  Maximize2,
  Minimize2
} from 'lucide-react';

interface ViewerToolbarProps {
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export function ViewerToolbar({ isExpanded = false, onToggleExpand }: ViewerToolbarProps) {
  const viewerTabs = useAppStore(state => state.viewerTabs);
  const activeTabId = useAppStore(state => state.activeTabId);
  const activeTab = viewerTabs.find(t => t.id === activeTabId);

  const handleDownload = () => {
    if (!activeTab) return;
    downloadFile(activeTab.pdbData, activeTab.filename, 'chemical/x-pdb');
  };

  const handleScreenshot = () => {
    // Find the canvas and capture
    const canvas = document.querySelector('.molstar-viewer-container canvas') as HTMLCanvasElement;
    if (canvas) {
      const link = document.createElement('a');
      link.download = `${activeTab?.filename || 'structure'}_screenshot.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  };

  const handleReset = () => {
    // Will be connected to Mol* plugin reset
    window.dispatchEvent(new CustomEvent('molstar-reset-view'));
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center justify-between h-10 px-4 border-b border-cf-border bg-cf-bg-tertiary">
        <div className="flex items-center gap-1">
          {/* Structure selector (placeholder) */}
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-cf-text">
            <Layers className="w-4 h-4" />
            <span className="text-[13px]">Structure</span>
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-cf-text-secondary hover:text-cf-text"
                onClick={handleDownload}
              >
                <Download className="w-4 h-4" />
                <span className="sr-only">Download PDB</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download PDB</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-cf-text-secondary hover:text-cf-text"
                onClick={handleScreenshot}
              >
                <Camera className="w-4 h-4" />
                <span className="sr-only">Screenshot</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Screenshot</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-cf-text-secondary hover:text-cf-text disabled:opacity-40"
                disabled
              >
                <GitCompare className="w-4 h-4" />
                <span className="sr-only">Compare</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Compare (coming soon)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-cf-text-secondary hover:text-cf-text"
                onClick={handleReset}
              >
                <RotateCcw className="w-4 h-4" />
                <span className="sr-only">Reset View</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset View</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-cf-text-secondary hover:text-cf-text"
                onClick={onToggleExpand}
              >
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                <span className="sr-only">{isExpanded ? 'Exit Fullscreen' : 'Fullscreen'}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isExpanded ? 'Exit Fullscreen' : 'Fullscreen'}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
