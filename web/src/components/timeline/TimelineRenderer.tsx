'use client';

import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { TimelineItem, TimelineByEventType, ThinkingBlock } from '@/hooks/useConversationTimeline';
import { StructureArtifact, ChatMessage } from '@/lib/types';
import { cn, formatTimestamp } from '@/lib/utils';
import { Link2, Link2Off, RotateCcw, ChevronDown, CheckCircle2, Sparkle, Sparkles, FileText } from 'lucide-react';
import { HelixIcon } from '@/components/icons/ProteinIcon';
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
  /** Additional CSS classes */
  className?: string;
  /** Steps grouped by EventType for area-based rendering */
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

  // Early return after all hooks
  if (timeline.length === 0) {
    return null;
  }

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
                isStreaming={isStreaming}
                thinkingBlocks={thinkingBlocks}
                currentThinkingText={currentThinkingText}
              />
              {/* Show CONCLUSION as message bubble after artifact group when complete */}
              {!isStreaming && conclusionContent && (
                <ConclusionBubble text={conclusionContent} isCompact={isCompact} />
              )}
              {/* Show Best Block after conclusion - use the last artifact from the entire timeline */}
              {!isStreaming && allArtifacts.length > 0 && (
                <BestBlock
                  artifact={allArtifacts[allArtifacts.length - 1].data}
                  timestamp={allArtifacts[allArtifacts.length - 1].timestamp}
                />
              )}
            </React.Fragment>
          );
        }
        return null;
      })}

      {/* Streaming indicator at bottom - only show when no artifacts yet */}
      {isStreaming && groups.every(g => g.type !== 'artifact-group') && (
        <div className="flex items-center gap-2 py-2 text-cf-text-secondary">
          <Sparkle className="w-4 h-4 text-cf-accent" />
          <span className="text-sm">Thinking...</span>
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
  const hasContent = message.content.trim().length > 0;
  const hasFiles = message.attachedFiles && message.attachedFiles.length > 0;

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
        {/* Text content */}
        {hasContent && (
          <p className="text-sm whitespace-pre-wrap break-all [overflow-wrap:anywhere]">
            {message.content}
          </p>
        )}
        {/* Attached files as chips */}
        {hasFiles && (
          <div className={cn("flex flex-wrap gap-1.5", hasContent && "mt-2")}>
            {message.attachedFiles!.map((file, idx) => {
              const isStructure = file.type === 'pdb';
              const Icon = isStructure ? HelixIcon : FileText;

              return (
                <div
                  key={`${file.name}-${idx}`}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md",
                    isUser
                      ? "bg-white/20 border border-white/30"
                      : "bg-cf-bg-tertiary border border-cf-border/60"
                  )}
                  title={file.name}
                >
                  <Icon className={cn(
                    "w-3.5 h-3.5 flex-shrink-0",
                    isUser
                      ? "text-white/70"
                      : isStructure ? "text-cf-success/70" : "text-cf-info/70"
                  )} />
                  <span className={cn(
                    "text-xs font-medium truncate max-w-[120px]",
                    isUser ? "text-white/90" : "text-cf-text"
                  )}>
                    {file.name}
                  </span>
                </div>
              );
            })}
          </div>
        )}
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
 * Best Block component - shows the final/best structure after conclusion
 * Green left border, "Folding Completed." header, quality description, and structure card
 */
function BestBlock({
  artifact,
  timestamp,
}: {
  artifact: StructureArtifact;
  timestamp: number;
}) {
  return (
    <div className="pb-4">
      {/* Container with green left border */}
      <div className="rounded-lg border-l-4 border-l-cf-success bg-cf-bg-secondary/50 overflow-hidden">
        {/* Header - "Folding Completed." */}
        <div className="flex items-center justify-between px-4 py-3 bg-cf-success/10">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-cf-success flex-shrink-0" />
            <span className="text-sm font-semibold text-cf-text">Folding Completed.</span>
          </div>
        </div>

        {/* Structure card */}
        <div className="p-3">
          <StructureArtifactCard
            artifact={artifact}
            timestamp={timestamp}
            showPreview={true}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Header thinking text with ChatGPT-style continuous scrolling
 * Fixed height container, content auto-scrolls to bottom as new text arrives
 * When expanded: shows all text
 */
function HeaderThinkingText({
  text,
  isExpanded,
}: {
  text: string;
  isExpanded: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when text changes (ChatGPT style)
  useEffect(() => {
    if (scrollRef.current && !isExpanded) {
      // Use requestAnimationFrame for smoother scrolling
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [text, isExpanded]);

  if (isExpanded) {
    // Expanded: show all text
    return (
      <div className="flex-1 min-w-0">
        <p className="text-sm text-cf-text-secondary font-semibold whitespace-pre-wrap break-words">
          {text}
        </p>
      </div>
    );
  }

  // Collapsed: fixed height scrolling container (2 lines ≈ 3rem)
  return (
    <div className="flex-1 min-w-0">
      <div
        ref={scrollRef}
        className="max-h-[3rem] overflow-y-auto scrollbar-none scroll-smooth"
      >
        <p className="text-sm text-cf-text-secondary font-semibold whitespace-pre-wrap break-words leading-6">
          {text}
        </p>
      </div>
    </div>
  );
}

/**
 * Thinking bubble component - shown before each structure artifact
 * Single line with sparkle icon, truncated with "...", expandable via chevron
 * Icon blinks between Sparkle and Sparkles when thinking, shows Sparkles when done
 */
function ThinkingBubble({ text, isThinking = false }: { text: string; isThinking?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSparkles, setShowSparkles] = useState(false);

  // Blinking effect when thinking
  useEffect(() => {
    if (!isThinking) {
      setShowSparkles(true); // Show Sparkles when done
      return;
    }

    // Toggle between Sparkle and Sparkles every 500ms
    const interval = setInterval(() => {
      setShowSparkles(prev => !prev);
    }, 500);

    return () => clearInterval(interval);
  }, [isThinking]);

  return (
    <div
      className={cn(
        "flex items-start gap-2 px-1 py-1 cursor-pointer transition-all",
        "hover:bg-cf-bg-secondary/50 rounded"
      )}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      {/* Sparkle/Sparkles icon - blinks when thinking, Sparkles when done */}
      {showSparkles ? (
        <Sparkles className="w-4 h-4 text-cf-accent flex-shrink-0 mt-0.5" />
      ) : (
        <Sparkle className="w-4 h-4 text-cf-accent flex-shrink-0 mt-0.5" />
      )}

      {/* Text content - single line truncated or expanded */}
      <p
        className={cn(
          "flex-1 text-sm text-cf-text-secondary",
          isExpanded
            ? "whitespace-pre-wrap break-words"
            : "truncate"
        )}
      >
        {text}{!isExpanded && '...'}
      </p>

      {/* Expand/collapse chevron */}
      <ChevronDown
        className={cn(
          "w-4 h-4 text-cf-text-muted flex-shrink-0 mt-0.5 transition-transform",
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
  isStreaming,
  thinkingBlocks,
  currentThinkingText,
}: {
  groupIndex: number;
  artifacts: Array<{ data: StructureArtifact; timestamp: number; index: number }>;
  allArtifacts: Array<{ type: 'artifact'; data: StructureArtifact; timestamp: number }>;
  isStreaming: boolean;
  thinkingBlocks?: ThinkingBlock[];
  /** Current streaming thinking text for typewriter display */
  currentThinkingText?: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
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

  // Blinking icon state for header (same as ThinkingBubble)
  const [showHeaderSparkles, setShowHeaderSparkles] = useState(false);

  // Blinking effect for header icon when streaming
  useEffect(() => {
    if (!isStreaming) {
      setShowHeaderSparkles(true); // Show Sparkles when done (but we'll show CheckCircle2)
      return;
    }

    // Toggle between Sparkle and Sparkles every 500ms
    const interval = setInterval(() => {
      setShowHeaderSparkles(prev => !prev);
    }, 500);

    return () => clearInterval(interval);
  }, [isStreaming]);

  return (
    <div className="pb-4">
      {/* Container wrapper with border - green when complete, accent when streaming */}
      <div className={cn(
        "rounded-lg border-l-4 bg-cf-bg-secondary/50 overflow-hidden transition-all duration-300",
        isStreaming ? "border-l-cf-accent" : "border-l-cf-success"
      )}>
        {/* Header - thinking summary with 2-line display, expandable */}
        <div
          className={cn(
            "flex items-start gap-2 px-4 py-3 border-b cursor-pointer",
            isStreaming
              ? "border-cf-accent/20 bg-cf-accent/10"
              : "border-cf-success/20 bg-cf-success/10"
          )}
          onClick={() => setHeaderExpanded(!headerExpanded)}
        >
          {/* Left: Status indicator - blinking Sparkle/Sparkles when streaming, CheckCircle2 when done */}
          <div className="flex-shrink-0 pt-0.5">
            {isStreaming ? (
              showHeaderSparkles ? (
                <Sparkles className="w-4 h-4 text-cf-accent" />
              ) : (
                <Sparkle className="w-4 h-4 text-cf-accent" />
              )
            ) : (
              <CheckCircle2 className="w-4 h-4 text-cf-success" />
            )}
          </div>

          {/* Middle: Thinking text - scrolling container showing latest 2 lines */}
          <HeaderThinkingText
            text={allThinkingText || currentThinkingText || 'Thinking...'}
            isExpanded={headerExpanded}
          />

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
            {artifacts.map((artifactItem, idx) => {
              const artifact = artifactItem.data;
              const currentIndex = artifactItem.index;
              const thinkingText = getThinkingTextForBlock(currentIndex);
              // This block is still thinking if streaming and it's the last artifact
              const isBlockThinking = isStreaming && idx === artifacts.length - 1;

              return (
                <div
                  key={artifact.structureId}
                  className="flex flex-col gap-1"
                >
                  {/* Block text before each structure - no border, close to structure */}
                  {thinkingText && (
                    <ThinkingBubble text={thinkingText} isThinking={isBlockThinking} />
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

