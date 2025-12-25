'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { cn, formatTimestamp } from '@/lib/utils';
import { parseFasta } from '@/lib/mock/generators';
import { Task, StepEvent, StructureArtifact, ChatMessage, MentionableFile } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  TooltipProvider,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Paperclip,
  Loader2,
  Sparkles,
  Scale,
  Zap,
  ArrowUp,
  FileText,
  X,
  Trophy
} from 'lucide-react';
import { HelixIcon } from '@/components/icons/ProteinIcon';
import { StructureArtifactCard } from './StructureArtifactCard';
import { ChatInputBase, ThinkingIntensity } from './chat/ChatInputBase';
import { EXAMPLE_SEQUENCES } from '@/lib/constants/sequences';

// Type for unified timeline items
type TimelineItem =
  | { type: 'message'; data: ChatMessage }
  | { type: 'artifact'; data: StructureArtifact; timestamp: number };

export function ChatPanel() {
  const {
    conversations,
    activeConversationId,
    createConversation,
    addMessage,
    addAsset,
    setActiveTask,
    addStepEvent,
    activeTask,
    isStreaming,
    // Project management
    projects,
    activeProjectId,
    createProject,
    addProjectInput,
    addProjectOutput
  } = useAppStore();

  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [thinkingIntensity, setThinkingIntensity] = useState<ThinkingIntensity>('high');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const activeConversation = conversations.find(c => c.id === activeConversationId);

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages, activeTask?.steps]);

  // Start SSE streaming for a task
  const startTaskStream = useCallback(async (taskId: string, sequence: string) => {
    // Close any existing connection before starting a new one
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(`/api/tasks/${taskId}/stream?sequence=${encodeURIComponent(sequence)}`);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('step', (event) => {
      const stepEvent: StepEvent = JSON.parse(event.data);
      addStepEvent(taskId, stepEvent);
    });

    eventSource.addEventListener('done', () => {
      eventSource.close();
      eventSourceRef.current = null;
    });

    eventSource.onerror = () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [addStepEvent]);

  // Generate a timestamp-based filename for sequence files
  const generateSequenceFilename = () => {
    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    return `sequence_${timestamp}.fasta`;
  };

  // Handle send from ChatInputBase
  const handleSend = useCallback(async (content: string, mentionedFiles?: MentionableFile[]) => {
    if (!content.trim() || isSending) return;

    let convId = activeConversationId;
    if (!convId) {
      convId = createConversation();
    }

    // Build message content with mentioned files info
    let userMessage = content.trim();
    if (mentionedFiles && mentionedFiles.length > 0) {
      const fileRefs = mentionedFiles.map(f => `@${f.path}`).join(', ');
      userMessage = `${userMessage}\n\n[引用文件: ${fileRefs}]`;
    }

    setInput('');
    setIsSending(true);

    // Add user message
    addMessage(convId, {
      role: 'user',
      content: userMessage
    });

    try {
      // Check if message contains FASTA sequence
      const fastaMatch = userMessage.match(/>[\s\S]*?[A-Z]+/i);
      const sequenceMatch = userMessage.match(/^[ACDEFGHIKLMNPQRSTVWY]+$/i);

      if (fastaMatch || sequenceMatch) {
        const sequence = fastaMatch
          ? (parseFasta(userMessage)?.sequence || '')
          : (sequenceMatch ? sequenceMatch[0] : '');

        if (sequence.length >= 10) {
          // Create or get active project for this sequence
          let projId = activeProjectId;
          if (!projId) {
            projId = createProject();
          }

          // Create a text file for the sequence and add to project
          const filename = generateSequenceFilename();
          const fastaContent = fastaMatch
            ? userMessage
            : `>user_input_sequence\n${sequence}`;

          addProjectInput(projId, {
            name: filename,
            type: 'fasta',
            content: fastaContent
          });

          // Create task
          const taskResponse = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversationId: convId,
              sequence
            })
          });

          const responseData = await taskResponse.json();

          // Check if the API returned an error
          if (!taskResponse.ok) {
            const errorMessage = responseData.details?.join(', ') || responseData.error || 'Invalid sequence';
            addMessage(convId, {
              role: 'assistant',
              content: `Unable to start prediction: ${errorMessage}. Please check your sequence and try again.`
            });
            return;
          }

          const { task } = responseData;

          // Add assistant message
          addMessage(convId, {
            role: 'assistant',
            content: `Starting structure prediction for your ${sequence.length} residue sequence. The sequence has been saved as "${filename}" in your project. I'll keep you updated on the progress.`
          });

          // Set active task and start streaming
          setActiveTask({ ...task, status: 'running' });
          startTaskStream(task.id, sequence);
        } else {
          addMessage(convId, {
            role: 'assistant',
            content: 'The sequence seems too short. Please provide a protein sequence with at least 10 amino acids.'
          });
        }
      } else {
        // Regular chat response
        addMessage(convId, {
          role: 'assistant',
          content: 'I can help you with protein structure prediction. Please provide a FASTA sequence or paste an amino acid sequence directly. For example:\n\n```\n>protein\nMVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSH\n```'
        });
      }
    } catch (error) {
      addMessage(convId, {
        role: 'assistant',
        content: 'An error occurred. Please try again.'
      });
    } finally {
      setIsSending(false);
    }
  }, [activeConversationId, activeProjectId, addMessage, addProjectInput, createConversation, createProject, isSending, setActiveTask, startTaskStream]);

  // Build available files for @ mentions with full path identification (no deduplication by name)
  const availableFiles = useMemo(() => {
    const files: MentionableFile[] = [];

    // Add files from all projects (with project path for disambiguation)
    projects.forEach(project => {
      // Add input files (sequences)
      project.inputs.forEach(input => {
        files.push({
          id: `${project.id}/${input.name}`,
          name: input.name,
          path: `${project.name}/${input.name}`,
          type: input.type,
          source: 'project'
        });
      });

      // Add output files (structures)
      project.outputs.forEach(output => {
        files.push({
          id: `${project.id}/outputs/${output.filename}`,
          name: output.filename,
          path: `${project.name}/outputs/${output.filename}`,
          type: 'structure',
          source: 'project'
        });
      });
    });

    // Add files from activeTask
    if (activeTask?.steps) {
      activeTask.steps.forEach(step => {
        step.artifacts?.forEach(artifact => {
          const id = `task/${activeTask.id}/${artifact.filename}`;
          if (!files.some(f => f.id === id)) {
            files.push({
              id,
              name: artifact.filename,
              path: `task/${activeTask.id}/${artifact.filename}`,
              type: 'structure',
              source: 'task'
            });
          }
        });
      });
    }

    // Add assets from active conversation
    if (activeConversation?.assets) {
      activeConversation.assets.forEach(asset => {
        const id = `conversation/${activeConversation.id}/${asset.name}`;
        if (!files.some(f => f.id === id)) {
          files.push({
            id,
            name: asset.name,
            path: `conversation/${activeConversation.id}/${asset.name}`,
            type: asset.type,
            source: 'conversation'
          });
        }
      });
    }

    return files;
  }, [projects, activeTask, activeConversation]);

  // Handler to insert example sequence
  const handleExampleClick = useCallback((sequence: string) => {
    setInput(sequence);
  }, []);

  // Create unified timeline merging messages and structure artifacts
  const unifiedTimeline = useMemo(() => {
    const items: TimelineItem[] = [];
    const seenStructureIds = new Set<string>();

    // Add messages
    if (activeConversation?.messages) {
      activeConversation.messages.forEach(message => {
        items.push({ type: 'message', data: message });
      });
    }

    // Add artifacts from activeTask steps (only steps with artifacts)
    // These are the live streaming artifacts
    if (activeTask?.steps) {
      activeTask.steps.forEach(step => {
        if (step.artifacts && step.artifacts.length > 0) {
          step.artifacts.forEach(artifact => {
            seenStructureIds.add(artifact.structureId);
            items.push({ type: 'artifact', data: artifact, timestamp: step.ts });
          });
        }
      });
    }

    // Also add artifacts from persisted project outputs (for page refresh)
    // Only add if not already present from activeTask
    const activeProject = projects.find(p => p.id === activeProjectId);
    if (activeProject?.outputs) {
      activeProject.outputs.forEach(artifact => {
        if (!seenStructureIds.has(artifact.structureId)) {
          seenStructureIds.add(artifact.structureId);
          items.push({ type: 'artifact', data: artifact, timestamp: activeProject.updatedAt });
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
  }, [activeConversation?.messages, activeTask?.steps, projects, activeProjectId]);

  // Calculate current progress for the progress bar
  const currentProgress = useMemo(() => {
    if (!activeTask?.steps || activeTask.steps.length === 0) return 0;
    return activeTask.steps[activeTask.steps.length - 1]?.progress || 0;
  }, [activeTask?.steps]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Progress indicator when streaming */}
        {isStreaming && (
          <div className="flex-shrink-0 bg-cf-bg-tertiary border-b border-cf-border">
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-cf-success animate-spin" />
                <span className="text-xs font-medium text-cf-text">Processing...</span>
              </div>
            </div>
          </div>
        )}

        {/* Unified Timeline */}
        <ScrollArea className="flex-1 min-h-0 p-3">
          <div className="flex flex-col pb-2">
            {(() => {
              // Pre-calculate artifact metadata for step numbering and delta
              const allArtifacts = unifiedTimeline.filter(i => i.type === 'artifact') as Array<{ type: 'artifact'; data: StructureArtifact; timestamp: number }>;

              // Group timeline items: messages standalone, artifacts grouped together
              const groups: Array<{ type: 'message'; data: ChatMessage } | { type: 'artifact-group'; artifacts: Array<{ data: StructureArtifact; timestamp: number; index: number }> }> = [];
              let currentArtifactGroup: Array<{ data: StructureArtifact; timestamp: number; index: number }> = [];
              let globalArtifactIndex = 0;

              unifiedTimeline.forEach((item) => {
                if (item.type === 'message') {
                  // Flush any pending artifact group
                  if (currentArtifactGroup.length > 0) {
                    groups.push({ type: 'artifact-group', artifacts: currentArtifactGroup });
                    currentArtifactGroup = [];
                  }
                  groups.push({ type: 'message', data: item.data });
                } else {
                  currentArtifactGroup.push({
                    data: item.data,
                    timestamp: item.timestamp,
                    index: globalArtifactIndex++
                  });
                }
              });
              // Flush remaining artifacts
              if (currentArtifactGroup.length > 0) {
                groups.push({ type: 'artifact-group', artifacts: currentArtifactGroup });
              }

              return groups.map((group, groupIndex) => {
                if (group.type === 'message') {
                  const message = group.data;
                  const isUser = message.role === 'user';

                  return (
                    <div key={message.id} className={cn("flex pb-3", isUser ? "justify-end" : "justify-start")}>
                      {/* Message content - no timeline, no icons */}
                      <div className={cn(
                        "max-w-[85%] rounded-lg px-3 py-2 overflow-hidden shadow-sm",
                        isUser
                          ? "bg-cf-accent text-white"
                          : "bg-cf-bg border border-cf-border text-cf-text"
                      )}>
                        <p className="text-sm whitespace-pre-wrap break-all [overflow-wrap:anywhere]">{message.content}</p>
                        <p className={cn(
                          "text-[10px] mt-1",
                          isUser ? "text-white/60" : "text-cf-text-muted"
                        )}>
                          {formatTimestamp(message.timestamp)}
                        </p>
                      </div>
                    </div>
                  );
                } else {
                  // Artifact group with continuous timeline
                  return (
                    <div key={`artifact-group-${groupIndex}`} className="pb-4">
                      {/* Artifact cards with nodes and connecting lines */}
                      {group.artifacts.map((artifactItem, localIndex) => {
                        const artifact = artifactItem.data;
                        const currentArtifactIndex = artifactItem.index;
                        // Determine if this is the best result: check label (case-insensitive) OR highest pLDDT in the group
                        const isFinalByLabel = artifact.label?.toLowerCase() === 'final';
                        const isLastInGroup = localIndex === group.artifacts.length - 1;
                        const highestPlddt = Math.max(...group.artifacts.map(a => a.data.metrics.plddtAvg));
                        const isBestByPlddt = artifact.metrics.plddtAvg === highestPlddt && isLastInGroup;
                        const isFinal = isFinalByLabel || isBestByPlddt;
                        const hasNextInGroup = localIndex < group.artifacts.length - 1;
                        const hasNextArtifact = currentArtifactIndex < allArtifacts.length - 1;
                        const nodeCenter = isFinal ? 12 : 6; // Half of node diameter (24px or 12px)

                        // Get previous artifact's pLDDT for delta calculation
                        const previousPlddt = currentArtifactIndex > 0
                          ? allArtifacts[currentArtifactIndex - 1].data.metrics.plddtAvg
                          : undefined;

                        return (
                          <div
                            key={artifact.structureId}
                            className={cn("flex gap-3 group relative", hasNextInGroup && "pb-4")}
                          >
                            {/* Timeline node column with connecting line */}
                            <div className="relative flex-shrink-0 w-6 self-stretch">
                              {/* Connecting line - spans full height, behind node */}
                              {hasNextArtifact && (
                                <div
                                  aria-hidden="true"
                                  className="absolute left-1/2 -translate-x-1/2 w-0.5 bg-cf-success/40"
                                  style={{
                                    top: `${nodeCenter}px`,
                                    bottom: 0
                                  }}
                                />
                              )}
                              {/* Timeline node */}
                              <div className={cn(
                                "relative z-10 flex items-center justify-center rounded-full border-2 transition-all duration-300",
                                "mx-auto", // Center horizontally
                                isFinal
                                  ? "w-6 h-6 border-cf-success bg-cf-bg text-cf-success shadow-[0_0_12px_rgba(34,197,94,0.3)] dark:shadow-[0_0_15px_rgba(103,218,122,0.2)]"
                                  : "w-3 h-3 border-cf-success/60 bg-cf-bg group-hover:border-cf-success group-hover:scale-110 group-hover:shadow-[0_0_8px_rgba(103,218,122,0.15)]"
                              )}>
                                {isFinal && <Trophy className="w-3 h-3" />}
                              </div>
                            </div>

                            <div className="flex-1 min-w-0">
                              <StructureArtifactCard
                                artifact={artifact}
                                timestamp={artifactItem.timestamp}
                                stepNumber={currentArtifactIndex + 1}
                                previousPlddt={previousPlddt}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                }
              });
            })()}

            {/* Empty state */}
            {unifiedTimeline.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center min-h-[200px]">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 mx-auto mb-4 opacity-40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/window.svg" alt="" className="w-full h-full" />
                  </div>
                  <p className="text-cf-text-secondary text-sm mb-1">How can I help you?</p>
                  <p className="text-cf-text-muted text-xs">
                    Paste a protein sequence to predict its structure
                  </p>
                </div>

                {/* Example sequences - Modern chip cards */}
                <div className="w-full max-w-lg px-2">
                  {/* Section header */}
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <Sparkles className="w-3.5 h-3.5 text-cf-accent/60" />
                    <span className="text-xs font-medium text-cf-text-muted uppercase tracking-wide">
                      试试示例序列
                    </span>
                  </div>

                  {/* Cards grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {EXAMPLE_SEQUENCES.map((example, index) => (
                      <button
                        key={index}
                        onClick={() => handleExampleClick(example.sequence)}
                        style={{ animationDelay: `${index * 50}ms` }}
                        className={cn(
                          // Animation on mount
                          "animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-backwards",
                          // Base card styling
                          "group relative flex flex-col items-start gap-1.5 p-3 text-left",
                          "rounded-xl border border-cf-border/60",
                          "bg-cf-bg-tertiary/40",
                          // Hover state - theme-aware with stronger contrast
                          "hover:bg-[var(--cf-card-hover-bg)] hover:border-cf-accent/60",
                          "hover:shadow-[var(--cf-card-shadow-hover)]",
                          "hover:-translate-y-0.5",
                          // Active/pressed state
                          "active:scale-[0.98] active:shadow-none active:translate-y-0",
                          // Focus state for keyboard navigation
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cf-accent",
                          "focus-visible:ring-offset-2 focus-visible:ring-offset-cf-bg",
                          // Smooth transitions
                          "transition-all duration-200 ease-out",
                          "cursor-pointer"
                        )}
                      >
                        {/* Decorative icon */}
                        <div className="absolute top-2.5 right-2.5">
                          <HelixIcon className="w-4 h-4 text-cf-text-muted opacity-30 group-hover:text-cf-accent group-hover:opacity-100 group-hover:scale-110 transition-all duration-200" />
                        </div>

                        {/* Content */}
                        <span className="text-sm font-medium text-cf-text group-hover:text-cf-text pr-6 transition-colors duration-200">
                          {example.name}
                        </span>
                        <span className="text-xs text-cf-text-muted line-clamp-1">
                          {example.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input - using shared ChatInputBase component */}
        <div className="flex-shrink-0 p-3 border-t border-cf-border">
          <ChatInputBase
            value={input}
            onChange={setInput}
            onSend={handleSend}
            availableFiles={availableFiles}
            placeholder="输入序列或问题... (输入 @ 引用文件)"
            isSending={isSending}
            thinkingIntensity={thinkingIntensity}
            onThinkingIntensityChange={setThinkingIntensity}
            enableFileMentions={true}
            enableThinkingMode={true}
            enableFileUpload={true}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
