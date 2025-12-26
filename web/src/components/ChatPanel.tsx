'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { parseFasta } from '@/lib/mock/generators';
import { StepEvent, MentionableFile } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HelixIcon } from '@/components/icons/ProteinIcon';
import { ChatInputBase, ThinkingIntensity } from './chat/ChatInputBase';
import { EXAMPLE_SEQUENCES } from '@/lib/constants/sequences';
import { useConversationTimeline } from '@/hooks/useConversationTimeline';
import { TimelineRenderer } from '@/components/timeline';

export function ChatPanel() {
  const {
    activeConversationId,
    createConversation,
    addMessage,
    setActiveTask,
    addStepEvent,
    activeTask,
    // Project management
    projects,
    activeProjectId,
    createProject,
    addProjectInput,
  } = useAppStore();

  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [thinkingIntensity, setThinkingIntensity] = useState<ThinkingIntensity>('high');
  const eventSourceRef = useRef<EventSource | null>(null);

  // Use shared timeline hook
  const { timeline, isStreaming, conversation } = useConversationTimeline();

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  // Start SSE streaming for a task
  // Note: SSE connects directly to Python backend to avoid Next.js proxy buffering
  const startTaskStream = useCallback(
    async (taskId: string, sequence: string) => {
      // Close any existing connection before starting a new one
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      // Connect directly to Python backend for SSE (bypasses Next.js proxy buffering)
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      const eventSource = new EventSource(
        `${backendUrl}/api/v1/tasks/${taskId}/stream?sequence=${encodeURIComponent(sequence)}`
      );
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
    },
    [addStepEvent]
  );

  // Generate a timestamp-based filename for sequence files
  const generateSequenceFilename = () => {
    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    return `sequence_${timestamp}.fasta`;
  };

  // Handle send from ChatInputBase
  const handleSend = useCallback(
    async (content: string, mentionedFiles?: MentionableFile[]) => {
      if (!content.trim() || isSending) return;

      let convId = activeConversationId;
      if (!convId) {
        convId = createConversation();
      }

      // Build message content with mentioned files info
      let userMessage = content.trim();
      if (mentionedFiles && mentionedFiles.length > 0) {
        const fileRefs = mentionedFiles.map((f) => `@${f.path}`).join(', ');
        userMessage = `${userMessage}\n\n[引用文件: ${fileRefs}]`;
      }

      setInput('');
      setIsSending(true);

      // Add user message
      addMessage(convId, {
        role: 'user',
        content: userMessage,
      });

      try {
        // Check if message contains FASTA sequence
        const fastaMatch = userMessage.match(/>[\s\S]*?[A-Z]+/i);
        const sequenceMatch = userMessage.match(/^[ACDEFGHIKLMNPQRSTVWY]+$/i);

        if (fastaMatch || sequenceMatch) {
          const sequence = fastaMatch
            ? parseFasta(userMessage)?.sequence || ''
            : sequenceMatch
              ? sequenceMatch[0]
              : '';

          if (sequence.length >= 10) {
            // Create or get active project for this sequence
            let projId = activeProjectId;
            if (!projId) {
              projId = createProject();
            }

            // Create a text file for the sequence and add to project
            const filename = generateSequenceFilename();
            const fastaContent = fastaMatch ? userMessage : `>user_input_sequence\n${sequence}`;

            addProjectInput(projId, {
              name: filename,
              type: 'fasta',
              content: fastaContent,
            });

            // Create task
            const taskResponse = await fetch('/api/v1/tasks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                conversationId: convId,
                sequence,
              }),
            });

            const responseData = await taskResponse.json();

            // Check if the API returned an error
            if (!taskResponse.ok) {
              const errorMessage =
                responseData.details?.join(', ') || responseData.error || 'Invalid sequence';
              addMessage(convId, {
                role: 'assistant',
                content: `Unable to start prediction: ${errorMessage}. Please check your sequence and try again.`,
              });
              return;
            }

            const { task } = responseData;

            // Add assistant message
            addMessage(convId, {
              role: 'assistant',
              content: `Starting structure prediction for your ${sequence.length} residue sequence. The sequence has been saved as "${filename}" in your project. I'll keep you updated on the progress.`,
            });

            // Set active task and start streaming
            setActiveTask({ ...task, status: 'running' });
            startTaskStream(task.id, sequence);
          } else {
            addMessage(convId, {
              role: 'assistant',
              content:
                'The sequence seems too short. Please provide a protein sequence with at least 10 amino acids.',
            });
          }
        } else {
          // Regular chat response
          addMessage(convId, {
            role: 'assistant',
            content:
              'I can help you with protein structure prediction. Please provide a FASTA sequence or paste an amino acid sequence directly. For example:\n\n```\n>protein\nMVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSH\n```',
          });
        }
      } catch (error) {
        addMessage(convId, {
          role: 'assistant',
          content: 'An error occurred. Please try again.',
        });
      } finally {
        setIsSending(false);
      }
    },
    [
      activeConversationId,
      activeProjectId,
      addMessage,
      addProjectInput,
      createConversation,
      createProject,
      isSending,
      setActiveTask,
      startTaskStream,
    ]
  );

  // Build available files for @ mentions with full path identification
  const availableFiles = useMemo(() => {
    const files: MentionableFile[] = [];

    // Add files from all projects (with project path for disambiguation)
    projects.forEach((project) => {
      // Add input files (sequences)
      project.inputs.forEach((input) => {
        files.push({
          id: `${project.id}/${input.name}`,
          name: input.name,
          path: `${project.name}/${input.name}`,
          type: input.type,
          source: 'project',
        });
      });

      // Add output files (structures)
      project.outputs.forEach((output) => {
        files.push({
          id: `${project.id}/outputs/${output.filename}`,
          name: output.filename,
          path: `${project.name}/outputs/${output.filename}`,
          type: 'structure',
          source: 'project',
        });
      });
    });

    // Add files from activeTask
    if (activeTask?.steps) {
      activeTask.steps.forEach((step) => {
        step.artifacts?.forEach((artifact) => {
          const id = `task/${activeTask.id}/${artifact.filename}`;
          if (!files.some((f) => f.id === id)) {
            files.push({
              id,
              name: artifact.filename,
              path: `task/${activeTask.id}/${artifact.filename}`,
              type: 'structure',
              source: 'task',
            });
          }
        });
      });
    }

    // Add assets from active conversation
    if (conversation?.assets) {
      conversation.assets.forEach((asset) => {
        const id = `conversation/${conversation.id}/${asset.name}`;
        if (!files.some((f) => f.id === id)) {
          files.push({
            id,
            name: asset.name,
            path: `conversation/${conversation.id}/${asset.name}`,
            type: asset.type,
            source: 'conversation',
          });
        }
      });
    }

    return files;
  }, [projects, activeTask, conversation]);

  // Handler to insert example sequence
  const handleExampleClick = useCallback((sequence: string) => {
    setInput(sequence);
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Progress indicator when streaming */}
        {isStreaming && (
          <div className="flex-shrink-0 bg-cf-bg-tertiary border-b border-cf-border">
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-cf-success animate-spin" />
                <span className="text-xs font-medium text-cf-text">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        {/* Unified Timeline using shared component */}
        <ScrollArea className="flex-1 min-h-0 p-3">
          {timeline.length > 0 ? (
            <TimelineRenderer
              timeline={timeline}
              variant="compact"
              isStreaming={isStreaming}
              className="pb-2"
            />
          ) : (
            /* Empty state */
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
                        'animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-backwards',
                        // Base card styling
                        'group relative flex flex-col items-start gap-1.5 p-3 text-left',
                        'rounded-xl border border-cf-border/60',
                        'bg-cf-bg-tertiary/40',
                        // Hover state - theme-aware with stronger contrast
                        'hover:bg-[var(--cf-card-hover-bg)] hover:border-cf-accent/60',
                        'hover:shadow-[var(--cf-card-shadow-hover)]',
                        'hover:-translate-y-0.5',
                        // Active/pressed state
                        'active:scale-[0.98] active:shadow-none active:translate-y-0',
                        // Focus state for keyboard navigation
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cf-accent',
                        'focus-visible:ring-offset-2 focus-visible:ring-offset-cf-bg',
                        // Smooth transitions
                        'transition-all duration-200 ease-out',
                        'cursor-pointer'
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
