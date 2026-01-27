'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { ChatMessage, Structure, StepEvent, EventType } from '@/lib/types';

/**
 * Timeline item types for unified rendering.
 * Messages and artifacts are sorted together by timestamp.
 */
export type TimelineItem =
  | { type: 'message'; data: ChatMessage }
  | { type: 'artifact'; data: Structure; timestamp: number }
  | { type: 'step'; data: StepEvent };  // NEW: Step events with eventType for UI area mapping

/**
 * Thinking block groups THINKING_TEXT and THINKING_PDB events by blockIndex.
 * Each block ends with a THINKING_PDB event containing a structure artifact.
 */
export interface ThinkingBlock {
  blockIndex: number;
  events: StepEvent[];
  artifact?: Structure;  // The structure from THINKING_PDB
}

/**
 * Grouped timeline data by EventType for area-based rendering.
 */
export interface TimelineByEventType {
  prologue: StepEvent[];           // Area 2: PROLOGUE events
  annotationText: StepEvent[];     // Annotation text events
  annotationPdb: StepEvent[];      // Annotation structure events
  thinkingText: StepEvent[];       // Text stream events (thinking + annotation text)
  thinkingPdb: StepEvent[];        // Thinking structure events
  thinkingBlocks: ThinkingBlock[]; // Area 4: Grouped thinking blocks
  conclusion: StepEvent | null;    // Area 5: CONCLUSION event
}

interface TimelineOptions {
  /** Override conversation ID (defaults to activeConversationId) */
  conversationId?: string | null;
  /** Include artifacts from activeTask during streaming (default: true) */
  includeStreaming?: boolean;
}

/**
 * Shared hook for building unified timeline from all artifact sources.
 * Ensures consistent data display across ChatView and ChatPanel.
 *
 * Data sources (in priority order for deduplication):
 * 1. activeTask.steps - Live streaming artifacts
 * 2. message.artifacts - Historical conversation artifacts
 * 3. project.outputs - Persisted project outputs (fallback)
 */
export function useConversationTimeline(options: TimelineOptions = {}) {
  const {
    conversations,
    activeConversationId,
    activeTask,
    isStreaming,
    folders,
    activeFolderId,
  } = useAppStore();

  const {
    conversationId = activeConversationId,
    includeStreaming = true,
  } = options;

  const conversation = useMemo(() =>
    conversations.find(c => c.id === conversationId),
    [conversations, conversationId]
  );

  const timeline = useMemo(() => {
    const items: TimelineItem[] = [];
    const seenStructureIds = new Set<string>();

    // 1. Add all messages
    if (conversation?.messages) {
      conversation.messages.forEach(message => {
        items.push({ type: 'message', data: message });
      });
    }

    // 2. Priority 1: Add step events and artifacts from activeTask.steps (live streaming)
    // Only include if this task belongs to the current conversation
    if (includeStreaming && activeTask?.steps && activeTask.conversationId === conversationId) {
      activeTask.steps.forEach(step => {
        // Add the step event itself
        items.push({ type: 'step', data: step });

        // Add artifacts from this step
        step.artifacts?.forEach(artifact => {
          if (!seenStructureIds.has(artifact.structureId)) {
            seenStructureIds.add(artifact.structureId);
            items.push({ type: 'artifact', data: artifact, timestamp: step.ts });
          }
        });
      });
    }

    // 3. Priority 2: Add artifacts from message.artifacts (historical conversations)
    // These are persisted when task completes
    // Use artifact.createdAt if available, otherwise place artifacts just before parent message
    // (subtracting 1ms ensures artifacts appear before completion message in timeline)
    if (conversation?.messages) {
      conversation.messages.forEach(message => {
        message.artifacts?.forEach((artifact, index) => {
          if (!seenStructureIds.has(artifact.structureId)) {
            seenStructureIds.add(artifact.structureId);
            items.push({
              type: 'artifact',
              data: artifact,
              // Use createdAt if available; otherwise place before message with small offset
              timestamp: artifact.createdAt ?? (message.timestamp - 1000 + index)
            });
          }
        });
      });
    }

    // 4. Priority 3: Add artifacts from folder outputs (fallback for page refresh)
    const folder = folders.find(f => f.id === activeFolderId);
    if (folder?.outputs) {
      folder.outputs.forEach(artifact => {
        if (!seenStructureIds.has(artifact.structureId)) {
          seenStructureIds.add(artifact.structureId);
          items.push({ type: 'artifact', data: artifact, timestamp: folder.updatedAt });
        }
      });
    }

    // Handle browser/backend clock skew:
    // Message timestamps use browser Date.now(), step/artifact timestamps use backend clock.
    // If clocks differ, artifacts could sort before the message that triggered them.
    // Fix: ensure steps and artifacts always sort after the latest message.
    const lastMsgTs = items.reduce((max, item) =>
      item.type === 'message' ? Math.max(max, item.data.timestamp) : max, 0);

    // Sort by timestamp with clock-skew-safe adjustment
    items.sort((a, b) => {
      const getTimestamp = (item: TimelineItem): number => {
        if (item.type === 'message') return item.data.timestamp;
        if (item.type === 'artifact') return Math.max(item.timestamp, lastMsgTs + 1);
        if (item.type === 'step') return Math.max(item.data.ts, lastMsgTs + 1);
        return 0;
      };
      return getTimestamp(a) - getTimestamp(b);
    });

    return items;
  }, [conversation, activeTask, conversationId, folders, activeFolderId, includeStreaming]);

  // Extract just messages for convenience
  const messages = useMemo(() =>
    timeline
      .filter((item): item is TimelineItem & { type: 'message' } => item.type === 'message')
      .map(item => item.data),
    [timeline]
  );

  // Extract just artifacts for convenience
  const artifacts = useMemo(() =>
    timeline
      .filter((item): item is TimelineItem & { type: 'artifact' } => item.type === 'artifact')
      .map(item => item.data),
    [timeline]
  );

  // Streaming artifacts from current task only
  const streamingArtifacts = useMemo(() => {
    if (!includeStreaming || !activeTask?.steps || activeTask.conversationId !== conversationId) {
      return [];
    }

    const result: Structure[] = [];
    activeTask.steps.forEach(step => {
      step.artifacts?.forEach(artifact => result.push(artifact));
    });
    return result;
  }, [activeTask, conversationId, includeStreaming]);

  // Latest status message from streaming task
  const latestStatusMessage = useMemo(() => {
    if (!includeStreaming || !activeTask?.steps || activeTask.conversationId !== conversationId) {
      return null;
    }
    const lastStep = activeTask.steps[activeTask.steps.length - 1];
    return lastStep?.message || null;
  }, [activeTask, conversationId, includeStreaming]);

  // NEW: Group steps by EventType for area-based rendering
  const timelineByEventType = useMemo((): TimelineByEventType => {
    const result: TimelineByEventType = {
      prologue: [],
      annotationText: [],
      annotationPdb: [],
      thinkingText: [],
      thinkingPdb: [],
      thinkingBlocks: [],
      conclusion: null,
    };

    if (!includeStreaming || !activeTask?.steps || activeTask.conversationId !== conversationId) {
      return result;
    }

    // Map to collect events by blockIndex
    const blockMap = new Map<number, StepEvent[]>();

    activeTask.steps.forEach(step => {
      const eventType = step.eventType;

      switch (eventType) {
        case 'PROLOGUE':
          result.prologue.push(step);
          break;
        case 'ANNOTATION_TEXT':
          result.annotationText.push(step);
          result.thinkingText.push(step);
          break;
        case 'ANNOTATION_PDB':
          result.annotationPdb.push(step);
          break;
        case 'ANNOTATION':
          result.annotationText.push(step);
          result.thinkingText.push(step);
          break;
        case 'THINKING_TEXT':
          result.thinkingText.push(step);
          break;
        case 'THINKING_PDB':
          result.thinkingPdb.push(step);
          break;
        case 'CONCLUSION':
          result.conclusion = step;
          break;
      }

      if (
        step.blockIndex !== undefined &&
        step.blockIndex !== null &&
        (
          eventType === 'THINKING_TEXT' ||
          eventType === 'THINKING_PDB' ||
          eventType === 'ANNOTATION_TEXT' ||
          eventType === 'ANNOTATION_PDB' ||
          eventType === 'ANNOTATION'
        )
      ) {
        const existing = blockMap.get(step.blockIndex) || [];
        existing.push(step);
        blockMap.set(step.blockIndex, existing);
      }
    });

    // Convert blockMap to ThinkingBlock array
    blockMap.forEach((events, blockIndex) => {
      const pdbEvent = events.find(e =>
        e.eventType === 'THINKING_PDB' || e.eventType === 'ANNOTATION_PDB'
      );
      result.thinkingBlocks.push({
        blockIndex,
        events,
        artifact: pdbEvent?.artifacts?.[0],
      });
    });

    // Sort blocks by blockIndex
    result.thinkingBlocks.sort((a, b) => a.blockIndex - b.blockIndex);

    return result;
  }, [activeTask, conversationId, includeStreaming]);

  return {
    /** Full timeline with messages and artifacts sorted by timestamp */
    timeline,
    /** Just the messages */
    messages,
    /** Just the artifacts */
    artifacts,
    /** Artifacts from current streaming task */
    streamingArtifacts,
    /** Whether currently streaming */
    isStreaming: isStreaming && activeTask?.conversationId === conversationId,
    /** The active conversation */
    conversation,
    /** Latest status message from backend during streaming */
    latestStatusMessage,
    /** NEW: Steps grouped by EventType for area-based rendering */
    timelineByEventType,
  };
}
