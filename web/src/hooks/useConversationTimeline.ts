'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { ChatMessage, StructureArtifact } from '@/lib/types';

/**
 * Timeline item types for unified rendering.
 * Messages and artifacts are sorted together by timestamp.
 */
export type TimelineItem =
  | { type: 'message'; data: ChatMessage }
  | { type: 'artifact'; data: StructureArtifact; timestamp: number };

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

    // 2. Priority 1: Add artifacts from activeTask.steps (live streaming)
    // Only include if this task belongs to the current conversation
    if (includeStreaming && activeTask?.steps && activeTask.conversationId === conversationId) {
      activeTask.steps.forEach(step => {
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

    // Sort by timestamp
    items.sort((a, b) => {
      const tsA = a.type === 'message' ? a.data.timestamp : a.timestamp;
      const tsB = b.type === 'message' ? b.data.timestamp : b.timestamp;
      return tsA - tsB;
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

    const result: StructureArtifact[] = [];
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
  };
}
