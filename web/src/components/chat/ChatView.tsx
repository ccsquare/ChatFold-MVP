'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { MentionableFile } from '@/lib/types';
import { ChatInput } from './ChatInput';
import { cn } from '@/lib/utils';
import { Sparkles, PanelRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HelixIcon } from '@/components/icons/ProteinIcon';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { useFoldingTask } from '@/hooks/useFoldingTask';
import { useConversationTimeline } from '@/hooks/useConversationTimeline';
import { parseFasta } from '@/lib/mock/generators';
import { TimelineRenderer } from '@/components/timeline';
import { EXAMPLE_SEQUENCES } from '@/lib/constants/sequences';

// Generate a timestamp-based filename for sequence files
const generateSequenceFilename = () => {
  const now = new Date();
  const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  return `sequence_${timestamp}.fasta`;
};

export function ChatView() {
  const {
    activeConversationId,
    conversations,
    addMessage,
    createConversation,
    projects,
    activeTask,
    switchToViewerMode,
    viewerTabs
  } = useAppStore();

  const { submit, artifacts: streamingArtifacts } = useFoldingTask();
  const { timeline, isStreaming, conversation, latestStatusMessage } = useConversationTimeline();

  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-create conversation if none exists
  useEffect(() => {
    if (!activeConversationId && conversations.length === 0) {
      createConversation();
    }
  }, [activeConversationId, conversations.length, createConversation]);

  const isEmpty = timeline.length === 0;

  // Build available files for @ mentions with full path identification
  const availableFiles = useMemo(() => {
    const files: MentionableFile[] = [];

    // Add files from all projects (with project path for disambiguation)
    projects.forEach(project => {
      project.inputs.forEach(input => {
        files.push({
          id: `${project.id}/${input.name}`,
          name: input.name,
          path: `${project.name}/${input.name}`,
          type: input.type
        });
      });

      project.outputs.forEach(output => {
        files.push({
          id: `${project.id}/outputs/${output.filename}`,
          name: output.filename,
          path: `${project.name}/outputs/${output.filename}`,
          type: 'structure'
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
              type: 'structure'
            });
          }
        });
      });
    }

    // Add assets from active conversation
    if (conversation?.assets) {
      conversation.assets.forEach(asset => {
        const id = `conversation/${conversation.id}/${asset.name}`;
        if (!files.some(f => f.id === id)) {
          files.push({
            id,
            name: asset.name,
            path: `conversation/${conversation.id}/${asset.name}`,
            type: asset.type
          });
        }
      });
    }

    return files;
  }, [projects, activeTask, conversation]);

  // Auto scroll to bottom when timeline changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [timeline.length]);

  const handleSendMessage = useCallback(async (content: string, mentionedFiles?: MentionableFile[]) => {
    let convId = activeConversationId;
    if (!convId) {
      convId = createConversation();
    }
    if (!content.trim() || isSending) return;

    // Build message content with mentioned files info
    let messageContent = content.trim();
    if (mentionedFiles && mentionedFiles.length > 0) {
      const fileRefs = mentionedFiles.map(f => `@${f.path}`).join(', ');
      messageContent = `${messageContent}\n\n[引用文件: ${fileRefs}]`;
    }

    // Add user message
    addMessage(convId, {
      role: 'user',
      content: messageContent,
    });

    // Clear input
    setInputValue('');
    setIsSending(true);

    try {
      // Check if message contains a protein sequence
      const fastaMatch = messageContent.match(/>[\s\S]*?[A-Z]+/i);
      const sequenceMatch = messageContent.match(/^[ACDEFGHIKLMNPQRSTVWY]+$/i);

      if (fastaMatch || sequenceMatch) {
        const sequence = fastaMatch
          ? (parseFasta(messageContent)?.sequence || '')
          : (sequenceMatch ? sequenceMatch[0] : '');

        if (sequence.length >= 10) {
          const filename = generateSequenceFilename();
          const fastaContent = fastaMatch
            ? messageContent
            : `>user_input_sequence\n${sequence}`;

          // Add assistant message about starting
          addMessage(convId, {
            role: 'assistant',
            content: `Starting structure prediction for your ${sequence.length} residue sequence. The sequence has been saved as "${filename}" in your project. I'll keep you updated on the progress.`
          });

          // Submit using the shared hook (which handles API + SSE)
          const result = await submit(convId, sequence, {
            filename,
            fastaContent
          });

          if (!result) {
            addMessage(convId, {
              role: 'assistant',
              content: 'Failed to start structure prediction. Please check your sequence and try again.'
            });
          }
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
    } finally {
      setIsSending(false);
    }
  }, [activeConversationId, addMessage, createConversation, isSending, submit]);

  // Handle clicking an example sequence
  const handleExampleClick = useCallback((sequence: string) => {
    setInputValue(sequence);
  }, []);

  // Check if we have structures to view
  const hasStructures = viewerTabs.length > 0;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-full flex flex-col bg-cf-bg">
        {/* Header with view toggle button */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 h-10 border-b border-cf-border bg-cf-bg-secondary">
          <span className="text-sm font-medium text-cf-text">Chat</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-cf-text-secondary hover:text-cf-text disabled:text-cf-text-muted disabled:opacity-50"
                onClick={switchToViewerMode}
                disabled={!hasStructures}
              >
                <PanelRight className="w-4 h-4" />
                <span className="sr-only">Show structure viewer</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {hasStructures ? "Show structure viewer" : "No structures to view"}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Progress indicator when streaming */}
        {isStreaming && (
          <div className="flex-shrink-0 bg-cf-bg-tertiary border-b border-cf-border">
            <div className="flex items-center justify-between px-4 py-2">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-cf-success animate-spin" />
                <span className="text-xs font-medium text-cf-text">Thinking...</span>
              </div>
              <span className="text-xs text-cf-text-muted">
                {streamingArtifacts.length} structures generated
              </span>
            </div>
          </div>
        )}

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto">
          {isEmpty ? (
            // Empty state: centered content with examples
            <div className="h-full flex flex-col items-center justify-center px-4 py-8">
              <div className="w-full max-w-xl">
                {/* Header */}
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

                {/* Example sequences section */}
                <div className="w-full">
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
                          "animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-backwards",
                          "group relative flex flex-col items-start gap-1.5 p-3 text-left",
                          "rounded-xl border border-cf-border/60",
                          "bg-cf-bg-tertiary/40",
                          "hover:bg-cf-bg-tertiary hover:border-cf-accent/60",
                          "hover:-translate-y-0.5",
                          "active:scale-[0.98] active:translate-y-0",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cf-accent",
                          "focus-visible:ring-offset-2 focus-visible:ring-offset-cf-bg",
                          "transition-all duration-200 ease-out",
                          "cursor-pointer"
                        )}
                      >
                        <div className="absolute top-2.5 right-2.5">
                          <HelixIcon className="w-4 h-4 text-cf-text-muted opacity-30 group-hover:text-cf-accent group-hover:opacity-100 group-hover:scale-110 transition-all duration-200" />
                        </div>
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
            </div>
          ) : (
            // Active state: unified timeline
            <div className="max-w-4xl mx-auto px-4 py-6">
              <TimelineRenderer
                timeline={timeline}
                variant="wide"
                isStreaming={isStreaming}
                statusMessage={latestStatusMessage}
              />
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Fixed input at bottom - always visible */}
        <div className="flex-shrink-0 border-t border-cf-border bg-cf-bg-secondary">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <ChatInput
              value={inputValue}
              onChange={setInputValue}
              onSend={handleSendMessage}
              availableFiles={availableFiles}
              placeholder={isEmpty ? "输入序列或问题..." : "输入序列或问题... (输入 @ 引用文件)"}
              showDisclaimer
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
