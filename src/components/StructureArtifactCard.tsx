'use client';

import { StructureArtifact } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Download, ExternalLink, CheckCircle2 } from 'lucide-react';
import { HelixIcon } from '@/components/icons/ProteinIcon';

interface StructureArtifactCardProps {
  artifact: StructureArtifact;
  timestamp?: number;
}

export function StructureArtifactCard({ artifact, timestamp }: StructureArtifactCardProps) {
  const { openStructureTab, thumbnails } = useAppStore();

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

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-lg bg-cf-bg border border-cf-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-cf-success/10 border-b border-cf-border">
          <CheckCircle2 className="w-4 h-4 text-cf-success" />
          <span className="text-xs font-medium text-cf-success">
            {isFinal ? 'Structure Complete' : 'Structure Generated'}
          </span>
        </div>

        {/* Content */}
        <div className="p-3">
          <div className="flex items-start gap-3">
            {/* Thumbnail */}
            <div className="w-16 h-16 rounded-lg bg-cf-bg-secondary flex-shrink-0 overflow-hidden border border-cf-border">
              {thumbnails[artifact.structureId] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbnails[artifact.structureId]}
                  alt={artifact.label}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <HelixIcon className="w-6 h-6 text-cf-text-muted" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-cf-text truncate">
                {artifact.filename}
              </p>
              <div className="flex gap-3 mt-1 text-xs text-cf-text-secondary">
                <span>pLDDT: <span className="text-cf-text">{artifact.metrics.plddtAvg.toFixed(1)}</span></span>
                <span>PAE: <span className="text-cf-text">{artifact.metrics.paeAvg.toFixed(1)}</span></span>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleOpenStructure}
                    >
                      <ExternalLink className="w-3.5 h-3.5 mr-1" />
                      View
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open in 3D viewer</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-cf-text-secondary hover:text-cf-text"
                      onClick={handleDownload}
                    >
                      <Download className="w-3.5 h-3.5 mr-1" />
                      Download
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Download PDB file</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>

        {/* Timestamp */}
        {timestamp && (
          <div className="px-3 pb-2">
            <p className="text-[10px] text-cf-text-muted">
              {new Date(timestamp).toLocaleTimeString()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
