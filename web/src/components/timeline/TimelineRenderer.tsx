'use client';

import React, { useMemo, useRef, useEffect, useState, useCallback, useId } from 'react';
import { TimelineItem } from '@/hooks/useConversationTimeline';
import { StructureArtifact, ChatMessage } from '@/lib/types';
import { cn, formatTimestamp } from '@/lib/utils';
import { Trophy, Loader2, Link2, Link2Off, RotateCcw } from 'lucide-react';
import { StructureArtifactCard } from '@/components/StructureArtifactCard';
import { resetSyncGroupCamera } from '@/hooks/useCameraSync';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';

/**
 * Grouped timeline items for rendering.
 * Messages are standalone, artifacts are grouped together for continuous timeline display.
 */
type TimelineGroup =
  | { type: 'message'; data: ChatMessage }
  | { type: 'artifact-group'; artifacts: Array<{ data: StructureArtifact; timestamp: number; index: number }> };

interface TimelineRendererProps {
  /** Timeline items to render */
  timeline: TimelineItem[];
  /** Layout variant: compact for sidebar, wide for main view */
  variant?: 'compact' | 'wide';
  /** Whether currently streaming */
  isStreaming?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Shared timeline renderer used by both ChatView and ChatPanel.
 * Handles grouping, timeline node rendering, and responsive layout.
 *
 * Features:
 * - Messages displayed as chat bubbles
 * - Artifacts grouped with timeline nodes and connecting lines
 * - Auto-scroll to latest content
 * - Responsive layout via variant prop
 */
export function TimelineRenderer({
  timeline,
  variant = 'wide',
  isStreaming = false,
  className,
}: TimelineRendererProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const isCompact = variant === 'compact';

  // Generate unique sync group ID for this timeline instance
  const syncGroupId = useId();

  // Camera sync state - enabled by default for better comparison
  const [cameraSyncEnabled, setCameraSyncEnabled] = useState(true);

  // Toggle camera sync
  const handleToggleCameraSync = useCallback(() => {
    setCameraSyncEnabled(prev => !prev);
  }, []);

  // Reset all synced cameras to default view
  const handleResetAllCameras = useCallback(() => {
    resetSyncGroupCamera(syncGroupId);
  }, [syncGroupId]);

  // Auto-scroll to bottom when new items arrive
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [timeline.length]);

  // Pre-calculate all artifacts for step numbering and delta calculation
  const allArtifacts = useMemo(() =>
    timeline.filter((item): item is TimelineItem & { type: 'artifact' } =>
      item.type === 'artifact'
    ),
    [timeline]
  );

  // Group timeline: messages standalone, artifacts grouped together
  const groups = useMemo(() => {
    const result: TimelineGroup[] = [];
    let currentArtifactGroup: Array<{ data: StructureArtifact; timestamp: number; index: number }> = [];
    let globalArtifactIndex = 0;

    timeline.forEach((item) => {
      if (item.type === 'message') {
        // Flush pending artifact group
        if (currentArtifactGroup.length > 0) {
          result.push({ type: 'artifact-group', artifacts: currentArtifactGroup });
          currentArtifactGroup = [];
        }
        result.push({ type: 'message', data: item.data });
      } else {
        currentArtifactGroup.push({
          data: item.data,
          timestamp: item.timestamp,
          index: globalArtifactIndex++,
        });
      }
    });

    // Flush remaining artifacts
    if (currentArtifactGroup.length > 0) {
      result.push({ type: 'artifact-group', artifacts: currentArtifactGroup });
    }

    return result;
  }, [timeline]);

  if (timeline.length === 0) {
    return null;
  }

  // Check if there are multiple artifacts (sync makes sense only with 2+)
  const hasMultipleArtifacts = allArtifacts.length >= 2;

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Camera sync controls - only show when multiple structures exist */}
      {hasMultipleArtifacts && (
        <div className="flex items-center justify-end gap-1 mb-3 px-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetAllCameras}
                className={cn(
                  "h-7 px-2 text-xs gap-1.5",
                  "text-cf-text-secondary hover:text-cf-text hover:bg-cf-highlight"
                )}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset All</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset all structure views</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleCameraSync}
                className={cn(
                  "h-7 px-2 text-xs gap-1.5",
                  cameraSyncEnabled
                    ? "text-cf-accent hover:text-cf-accent/80 bg-cf-accent/10 hover:bg-cf-accent/15"
                    : "text-cf-text-secondary hover:text-cf-text hover:bg-cf-highlight"
                )}
              >
                {cameraSyncEnabled ? (
                  <Link2 className="w-3.5 h-3.5" />
                ) : (
                  <Link2Off className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">
                  {cameraSyncEnabled ? 'Synced' : 'Sync Off'}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {cameraSyncEnabled
                ? 'Views are synced - drag one to rotate all'
                : 'Enable view sync to rotate all structures together'
              }
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      {groups.map((group, groupIndex) => {
        if (group.type === 'message') {
          return (
            <MessageBubble
              key={group.data.id}
              message={group.data}
              isCompact={isCompact}
            />
          );
        } else {
          // Artifact group with timeline nodes
          return (
            <ArtifactGroup
              key={`artifact-group-${groupIndex}`}
              artifacts={group.artifacts}
              allArtifacts={allArtifacts}
              isCompact={isCompact}
              isStreaming={isStreaming}
              syncGroupId={syncGroupId}
              syncEnabled={cameraSyncEnabled}
            />
          );
        }
      })}

      {/* Streaming indicator at bottom */}
      {isStreaming && (
        <div className="flex items-center gap-2 py-2 text-cf-text-secondary">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">Thinking...</span>
        </div>
      )}

      {/* Auto-scroll anchor */}
      <div ref={endRef} />
    </div>
  );
}

/**
 * Message bubble component
 */
function MessageBubble({
  message,
  isCompact,
}: {
  message: ChatMessage;
  isCompact: boolean;
}) {
  const isUser = message.role === 'user';

  return (
    <div className={cn("flex pb-3", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "rounded-lg px-3 py-2 overflow-hidden shadow-sm",
          isCompact ? "max-w-[85%]" : "max-w-[70%]",
          isUser
            ? "bg-cf-accent text-white"
            : "bg-cf-bg border border-cf-border text-cf-text"
        )}
      >
        <p className="text-sm whitespace-pre-wrap break-all [overflow-wrap:anywhere]">
          {message.content}
        </p>
        <p
          className={cn(
            "text-[10px] mt-1",
            isUser ? "text-white/60" : "text-cf-text-muted"
          )}
        >
          {formatTimestamp(message.timestamp)}
        </p>
      </div>
    </div>
  );
}

/**
 * Artifact group with timeline visualization
 */
function ArtifactGroup({
  artifacts,
  allArtifacts,
  isCompact,
  isStreaming,
  syncGroupId,
  syncEnabled,
}: {
  artifacts: Array<{ data: StructureArtifact; timestamp: number; index: number }>;
  allArtifacts: Array<{ type: 'artifact'; data: StructureArtifact; timestamp: number }>;
  isCompact: boolean;
  isStreaming: boolean;
  syncGroupId: string;
  syncEnabled: boolean;
}) {
  return (
    <div className="pb-4">
      {artifacts.map((artifactItem, localIndex) => {
        const artifact = artifactItem.data;
        const currentIndex = artifactItem.index;

        // Determine if this is the best result
        const isFinalByLabel = artifact.label?.toLowerCase() === 'final';
        const isLastInGroup = localIndex === artifacts.length - 1;
        const highestPlddt = Math.max(...artifacts.map(a => a.data.metrics.plddtAvg));
        const isBestByPlddt = artifact.metrics.plddtAvg === highestPlddt && isLastInGroup;
        const isFinal = isFinalByLabel || isBestByPlddt;

        const hasNextInGroup = localIndex < artifacts.length - 1;
        const hasNextArtifact = currentIndex < allArtifacts.length - 1;
        const nodeCenter = isFinal ? 12 : 6; // Half of node diameter (24px or 12px)

        // Show streaming indicator on the last artifact during streaming
        const isLastAndStreaming = isStreaming && currentIndex === allArtifacts.length - 1;

        return (
          <div
            key={artifact.structureId}
            className={cn("flex gap-3 group relative", hasNextInGroup && "pb-4")}
          >
            {/* Timeline node column */}
            <div className="relative flex-shrink-0 w-6 self-stretch">
              {/* Connecting line */}
              {(hasNextArtifact || isLastAndStreaming) && (
                <div
                  aria-hidden="true"
                  className={cn(
                    "absolute left-1/2 -translate-x-1/2 w-0.5",
                    isLastAndStreaming ? "bg-cf-success/20 animate-pulse" : "bg-cf-success/40"
                  )}
                  style={{
                    top: `${nodeCenter}px`,
                    bottom: 0,
                  }}
                />
              )}
              {/* Timeline node */}
              <div
                className={cn(
                  "relative z-10 flex items-center justify-center rounded-full border-2 transition-all duration-300 mx-auto",
                  isFinal
                    ? "w-6 h-6 border-cf-success bg-cf-bg text-cf-success shadow-[0_0_12px_rgba(34,197,94,0.3)] dark:shadow-[0_0_15px_rgba(103,218,122,0.2)]"
                    : "w-3 h-3 border-cf-success/60 bg-cf-bg group-hover:border-cf-success group-hover:scale-110 group-hover:shadow-[0_0_8px_rgba(103,218,122,0.15)]"
                )}
              >
                {isFinal && <Trophy className="w-3 h-3" />}
              </div>
            </div>

            {/* Artifact card */}
            <div className="flex-1 min-w-0">
              <StructureArtifactCard
                artifact={artifact}
                timestamp={artifactItem.timestamp}
                stepNumber={currentIndex + 1}
                showPreview={true} // Always show 3D preview
                syncGroupId={syncGroupId}
                syncEnabled={syncEnabled}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
