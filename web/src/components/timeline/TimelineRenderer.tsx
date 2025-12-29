'use client';

import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { TimelineItem } from '@/hooks/useConversationTimeline';
import { StructureArtifact, ChatMessage } from '@/lib/types';
import { cn, formatTimestamp } from '@/lib/utils';
import { Trophy, Loader2, Link2, Link2Off, RotateCcw, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
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
  /** Status message from backend during streaming */
  statusMessage?: string | null;
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
  statusMessage,
  className,
}: TimelineRendererProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const isCompact = variant === 'compact';

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

  return (
    <div className={cn("flex flex-col", className)}>
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
              groupIndex={groupIndex}
              artifacts={group.artifacts}
              allArtifacts={allArtifacts}
              isCompact={isCompact}
              isStreaming={isStreaming}
              statusMessage={statusMessage}
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
 * Artifact group with timeline visualization wrapped in a container
 */
function ArtifactGroup({
  groupIndex,
  artifacts,
  allArtifacts,
  isCompact,
  isStreaming,
  statusMessage,
}: {
  groupIndex: number;
  artifacts: Array<{ data: StructureArtifact; timestamp: number; index: number }>;
  allArtifacts: Array<{ type: 'artifact'; data: StructureArtifact; timestamp: number }>;
  isCompact: boolean;
  isStreaming: boolean;
  statusMessage?: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isComplete = !isStreaming || artifacts[artifacts.length - 1]?.index < allArtifacts.length - 1;
  const [isExpanded, setIsExpanded] = useState(false);

  // Unique sync group ID for this artifact group
  const syncGroupId = `artifact-group-${groupIndex}`;

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

  // Check if there are multiple artifacts (sync makes sense only with 2+)
  const hasMultipleArtifacts = artifacts.length >= 2;

  // Auto-scroll to the bottom when new artifacts arrive (only when collapsed)
  useEffect(() => {
    if (scrollRef.current && !isExpanded) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [artifacts.length, isExpanded]);

  return (
    <div className="pb-4">
      {/* Container wrapper with border */}
      <div className={cn(
        "rounded-lg border-l-4 bg-cf-bg-secondary/50 overflow-hidden transition-all duration-300",
        isComplete
          ? "border-l-cf-success"
          : "border-l-cf-accent"
      )}>
        {/* Header - consolidated single row */}
        <div className={cn(
          "flex items-center justify-between px-4 py-2.5 border-b",
          isComplete
            ? "border-cf-success/20 bg-cf-success/5"
            : "border-cf-accent/20 bg-cf-accent/5"
        )}>
          {/* Left: Status */}
          <div className="flex items-center gap-2">
            {isComplete ? (
              <CheckCircle2 className="w-4 h-4 text-cf-success" />
            ) : (
              <Loader2 className="w-4 h-4 text-cf-accent animate-spin" />
            )}
            <span className={cn(
              "text-sm font-medium",
              isComplete ? "text-cf-text" : "text-cf-text-secondary"
            )}>
              {isComplete ? 'Folding Completed.' : (statusMessage || 'Folding in Progress...')}
            </span>
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-1.5">
            {/* Camera controls - only for multiple structures */}
            {hasMultipleArtifacts && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleResetAllCameras}
                      className="h-6 w-6 text-cf-text-secondary hover:text-cf-text hover:bg-cf-highlight"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Reset all views</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={cameraSyncEnabled ? "ghost-icon-active" : "ghost-icon"}
                      size="icon"
                      onClick={handleToggleCameraSync}
                      className={cn(
                        "h-6 w-6",
                        cameraSyncEnabled && "bg-cf-accent/10 hover:bg-cf-accent/15"
                      )}
                    >
                      {cameraSyncEnabled ? (
                        <Link2 className="w-3.5 h-3.5" />
                      ) : (
                        <Link2Off className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {cameraSyncEnabled ? 'Views synced - click to unlink' : 'Sync all views'}
                  </TooltipContent>
                </Tooltip>

                {/* Subtle divider */}
                <div className="w-px h-4 bg-cf-border/50 mx-1" />
              </>
            )}

            {/* Expand/Collapse */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-6 w-6 text-cf-text-secondary hover:text-cf-text hover:bg-cf-highlight"
            >
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {/* Artifacts list - vertical scroll */}
        <div
          ref={scrollRef}
          className={cn(
            "p-3 overflow-y-auto scrollbar-thin scrollbar-thumb-cf-border scrollbar-track-transparent transition-all duration-300",
            !isExpanded && "max-h-[480px]"
          )}
        >
          <div className="flex flex-col gap-3">
            {artifacts.map((artifactItem, localIndex) => {
              const artifact = artifactItem.data;
              const currentIndex = artifactItem.index;

              // Determine if this is the best result (based on label or last in group)
              const isFinalByLabel = artifact.label?.toLowerCase() === 'final';
              const isLastInGroup = localIndex === artifacts.length - 1;
              const isFinal = isFinalByLabel || isLastInGroup;

              const hasNextInGroup = localIndex < artifacts.length - 1;
              const hasNextArtifact = currentIndex < allArtifacts.length - 1;

              // Show streaming indicator on the last artifact during streaming
              const isLastAndStreaming = isStreaming && currentIndex === allArtifacts.length - 1;

              return (
                <div
                  key={artifact.structureId}
                  className="flex gap-3 group relative"
                >
                  {/* Vertical timeline node column */}
                  <div className="relative flex flex-col items-center pt-1">
                    {/* Timeline node */}
                    <div
                      className={cn(
                        "relative z-10 flex items-center justify-center rounded-full border-2 transition-all duration-300",
                        isFinal
                          ? "w-6 h-6 border-cf-success bg-cf-bg text-cf-success shadow-[0_0_12px_rgba(34,197,94,0.3)] dark:shadow-[0_0_15px_rgba(103,218,122,0.2)]"
                          : "w-3 h-3 border-cf-success/60 bg-cf-bg group-hover:border-cf-success group-hover:scale-110 group-hover:shadow-[0_0_8px_rgba(103,218,122,0.15)]"
                      )}
                    >
                      {isFinal && <Trophy className="w-3 h-3" />}
                    </div>
                    {/* Vertical connecting line */}
                    {(hasNextInGroup || isLastAndStreaming) && (
                      <div
                        aria-hidden="true"
                        className={cn(
                          "absolute w-0.5 left-1/2 -translate-x-1/2",
                          isLastAndStreaming ? "bg-cf-success/20 animate-pulse" : "bg-cf-success/40"
                        )}
                        style={{
                          top: isFinal ? '24px' : '12px',
                          bottom: '-12px',
                        }}
                      />
                    )}
                  </div>

                  {/* Artifact card */}
                  <div className="flex-1 min-w-0">
                    <StructureArtifactCard
                      artifact={artifact}
                      previousArtifact={currentIndex > 0 ? allArtifacts[currentIndex - 1]?.data : null}
                      timestamp={artifactItem.timestamp}
                      stepNumber={currentIndex + 1}
                      showPreview={true}
                      syncGroupId={syncGroupId}
                      syncEnabled={cameraSyncEnabled}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
