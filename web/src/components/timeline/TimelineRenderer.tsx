'use client';

import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { TimelineItem, TimelineByEventType, ThinkingBlock } from '@/hooks/useConversationTimeline';
import { StructureArtifact, ChatMessage } from '@/lib/types';
import { cn, formatTimestamp } from '@/lib/utils';
import { Loader2, Link2, Link2Off, RotateCcw, ChevronUp, ChevronDown, CheckCircle2, Sparkles } from 'lucide-react';
import { StructureArtifactCard } from '@/components/StructureArtifactCard';
import { resetSyncGroupCamera } from '@/hooks/useCameraSync';
import { useAppStore } from '@/lib/store';
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
  /** NEW: Steps grouped by EventType for area-based rendering */
  timelineByEventType?: TimelineByEventType;
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
  timelineByEventType,
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
      } else if (item.type === 'artifact') {
        currentArtifactGroup.push({
          data: item.data,
          timestamp: item.timestamp,
          index: globalArtifactIndex++,
        });
      }
      // Skip 'step' type items - they are handled by EventTypeRenderer
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

  // Build prologue content from timelineByEventType
  const prologueContent = useMemo(() => {
    if (!timelineByEventType) return null;
    const items = [...timelineByEventType.prologue, ...timelineByEventType.annotations];
    if (items.length === 0) return null;
    return items.map(e => e.message).join('\n\n');
  }, [timelineByEventType]);

  // Build CONCLUSION content for display after artifact group
  const conclusionContent = useMemo(() => {
    if (!timelineByEventType?.conclusion) return null;
    return timelineByEventType.conclusion.message;
  }, [timelineByEventType]);

  // Get thinking blocks for per-artifact thinking display
  const thinkingBlocks = useMemo(() => {
    if (!timelineByEventType?.thinkingBlocks) return [];
    return timelineByEventType.thinkingBlocks;
  }, [timelineByEventType]);

  // Get current streaming thinking text (latest THINKING_TEXT from latest block)
  // This is for the typewriter display in the header during streaming
  const currentThinkingText = useMemo(() => {
    if (!isStreaming || !timelineByEventType?.thinkingText) return null;
    const thinkingTexts = timelineByEventType.thinkingText;
    if (thinkingTexts.length === 0) return null;
    // Get the last thinking text message
    return thinkingTexts[thinkingTexts.length - 1]?.message || null;
  }, [isStreaming, timelineByEventType]);

  // Check if we have user message (to show prologue after it)
  const hasUserMessage = groups.some(g => g.type === 'message' && g.data.role === 'user');

  return (
    <div className={cn("flex flex-col", className)}>
      {groups.map((group, groupIndex) => {
        if (group.type === 'message') {
          const isUserMessage = group.data.role === 'user';
          return (
            <React.Fragment key={group.data.id}>
              <MessageBubble
                message={group.data}
                isCompact={isCompact}
              />
              {/* Show PROLOGUE as message bubble after user message */}
              {isUserMessage && prologueContent && (
                <PrologueBubble text={prologueContent} isCompact={isCompact} />
              )}
            </React.Fragment>
          );
        }
        if (group.type === 'artifact-group') {
          return (
            <React.Fragment key={`artifact-group-${groupIndex}`}>
              <ArtifactGroup
                groupIndex={groupIndex}
                artifacts={group.artifacts}
                allArtifacts={allArtifacts}
                isCompact={isCompact}
                isStreaming={isStreaming}
                thinkingBlocks={thinkingBlocks}
                currentThinkingText={currentThinkingText}
              />
              {/* Show CONCLUSION as message bubble after artifact group when complete */}
              {!isStreaming && conclusionContent && (
                <ConclusionBubble text={conclusionContent} isCompact={isCompact} />
              )}
            </React.Fragment>
          );
        }
        return null;
      })}

      {/* Streaming indicator at bottom - only show when no artifacts yet */}
      {isStreaming && groups.every(g => g.type !== 'artifact-group') && (
        <div className="flex items-center gap-2 py-2 text-cf-text-secondary">
          <Sparkles className="w-4 h-4 text-cf-accent" />
          <span className="text-sm truncate">{currentThinkingText || 'Thinking...'}</span>
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
 * PROLOGUE/ANNOTATION bubble component - message bubble style (left-aligned, gray bg)
 * Shows the verification points and annotations from the backend
 */
function PrologueBubble({
  text,
  isCompact,
}: {
  text: string;
  isCompact: boolean;
}) {
  return (
    <div className="flex pb-3 justify-start">
      <div
        className={cn(
          "rounded-lg px-3 py-2 overflow-hidden shadow-sm",
          isCompact ? "max-w-[85%]" : "max-w-[70%]",
          "bg-cf-bg border border-cf-border text-cf-text"
        )}
      >
        <p className="text-sm whitespace-pre-wrap break-all [overflow-wrap:anywhere]">
          {text}
        </p>
      </div>
    </div>
  );
}

/**
 * CONCLUSION bubble component - message bubble style (left-aligned, gray bg)
 * Shows the final conclusion from the AI after folding is complete
 */
function ConclusionBubble({
  text,
  isCompact,
}: {
  text: string;
  isCompact: boolean;
}) {
  return (
    <div className="flex pb-3 justify-start">
      <div
        className={cn(
          "rounded-lg px-3 py-2 overflow-hidden shadow-sm",
          isCompact ? "max-w-[85%]" : "max-w-[70%]",
          "bg-cf-bg border border-cf-border text-cf-text"
        )}
      >
        <p className="text-sm whitespace-pre-wrap break-all [overflow-wrap:anywhere]">
          {text}
        </p>
        <p className="text-[10px] mt-1 text-cf-text-muted">
          {formatTimestamp(Date.now())}
        </p>
      </div>
    </div>
  );
}

/**
 * Thinking bubble component - shown before each structure artifact
 * Single line with sparkle icon, truncated with "...", expandable via chevron
 * Matches design: [✨ Thinking text here...                    ∨]
 */
function ThinkingBubble({ text }: { text: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-all",
        "border-cf-border/60 bg-white dark:bg-cf-bg-secondary",
        "hover:border-cf-accent/40 hover:shadow-sm"
      )}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      {/* Sparkle icon */}
      <Sparkles className="w-4 h-4 text-cf-accent flex-shrink-0" />

      {/* Text content - single line truncated or expanded */}
      <p
        className={cn(
          "flex-1 text-sm text-cf-text-secondary",
          isExpanded
            ? "whitespace-pre-wrap break-words"
            : "truncate"
        )}
      >
        {text}
      </p>

      {/* Expand/collapse chevron */}
      <ChevronDown
        className={cn(
          "w-4 h-4 text-cf-text-muted flex-shrink-0 transition-transform",
          isExpanded && "rotate-180"
        )}
      />
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
  thinkingBlocks,
  currentThinkingText,
}: {
  groupIndex: number;
  artifacts: Array<{ data: StructureArtifact; timestamp: number; index: number }>;
  allArtifacts: Array<{ type: 'artifact'; data: StructureArtifact; timestamp: number }>;
  isCompact: boolean;
  isStreaming: boolean;
  thinkingBlocks?: ThinkingBlock[];
  /** Current streaming thinking text for typewriter display */
  currentThinkingText?: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isComplete = !isStreaming || artifacts[artifacts.length - 1]?.index < allArtifacts.length - 1;
  const [isExpanded, setIsExpanded] = useState(false);

  // ESC key to cancel compare selection
  const clearCompareSelection = useAppStore(state => state.clearCompareSelection);
  const compareSelection = useAppStore(state => state.compareSelection);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && compareSelection) {
        clearCompareSelection();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [compareSelection, clearCompareSelection]);

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

  // Helper function to get thinking text for a specific block index
  const getThinkingTextForBlock = useCallback((blockIndex: number): string | null => {
    if (!thinkingBlocks) return null;
    const block = thinkingBlocks.find(b => b.blockIndex === blockIndex);
    if (!block || !block.events || block.events.length === 0) return null;
    // Combine all THINKING_TEXT events in this block
    const thinkingTexts = block.events
      .filter(e => e.eventType === 'THINKING_TEXT')
      .map(e => e.message);
    return thinkingTexts.length > 0 ? thinkingTexts.join('\n') : null;
  }, [thinkingBlocks]);

  // Get ALL thinking text combined for the header summary display
  const allThinkingText = useMemo(() => {
    if (!thinkingBlocks || thinkingBlocks.length === 0) return null;
    const allTexts: string[] = [];
    thinkingBlocks.forEach(block => {
      block.events
        .filter(e => e.eventType === 'THINKING_TEXT')
        .forEach(e => allTexts.push(e.message));
    });
    return allTexts.length > 0 ? allTexts.join('\n') : null;
  }, [thinkingBlocks]);

  // Header expand state for thinking summary
  const [headerExpanded, setHeaderExpanded] = useState(false);

  return (
    <div className="pb-4">
      {/* Container wrapper with border */}
      <div className={cn(
        "rounded-lg border-l-4 bg-cf-bg-secondary/50 overflow-hidden transition-all duration-300",
        isComplete
          ? "border-l-cf-success"
          : "border-l-cf-accent"
      )}>
        {/* Header - thinking summary with 2-line display, expandable */}
        <div
          className={cn(
            "flex items-start gap-2 px-4 py-2.5 border-b cursor-pointer",
            isComplete
              ? "border-cf-success/20 bg-cf-success/5"
              : "border-cf-accent/20 bg-cf-accent/5"
          )}
          onClick={() => setHeaderExpanded(!headerExpanded)}
        >
          {/* Left: Status indicator */}
          <div className="flex-shrink-0 pt-0.5">
            {isComplete ? (
              <CheckCircle2 className="w-4 h-4 text-cf-success" />
            ) : (
              <Sparkles className="w-4 h-4 text-cf-accent" />
            )}
          </div>

          {/* Middle: Thinking text - 2 lines by default, expandable */}
          <div className="flex-1 min-w-0">
            {(allThinkingText || currentThinkingText) && (
              <p
                className={cn(
                  "text-sm text-cf-text-secondary",
                  headerExpanded
                    ? "whitespace-pre-wrap break-words"
                    : "line-clamp-2"
                )}
              >
                {allThinkingText || currentThinkingText}
              </p>
            )}
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Camera controls - only for multiple structures */}
            {hasMultipleArtifacts && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); handleResetAllCameras(); }}
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
                      onClick={(e) => { e.stopPropagation(); handleToggleCameraSync(); }}
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

            {/* Header expand/collapse chevron for thinking text */}
            <ChevronDown
              className={cn(
                "w-4 h-4 text-cf-text-muted transition-transform",
                headerExpanded && "rotate-180"
              )}
            />
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
            {artifacts.map((artifactItem) => {
              const artifact = artifactItem.data;
              const currentIndex = artifactItem.index;
              const thinkingText = getThinkingTextForBlock(currentIndex);

              return (
                <div
                  key={artifact.structureId}
                  className="flex flex-col gap-2"
                >
                  {/* Thinking bubble before each structure - max 2 lines by default */}
                  {thinkingText && (
                    <ThinkingBubble text={thinkingText} />
                  )}
                  {/* Structure Card - now directly clickable for compare selection */}
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
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

