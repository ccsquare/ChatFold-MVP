'use client';

import React, { useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { parseFasta } from '@/lib/mock/generators';
import { MentionableFile } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TooltipProvider } from '@/components/ui/tooltip';
import { generateSequenceFilename } from '@/lib/utils';
import { ChatInputBase, ThinkingIntensity } from './chat/ChatInputBase';
import { ChatEmptyState } from './chat/ChatEmptyState';
import { useConversationTimeline } from '@/hooks/useConversationTimeline';
import { useAvailableFiles } from '@/hooks/useAvailableFiles';
import { TimelineRenderer } from '@/components/timeline';
import { useFoldingTask } from '@/hooks/useFoldingTask';

export function ChatPanel() {
  const {
    activeConversationId,
    createConversation,
    addMessage,
    setActiveTask,
    // Project management
    activeProjectId,
    createProject,
    addProjectInput,
  } = useAppStore();

  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [thinkingIntensity, setThinkingIntensity] = useState<ThinkingIntensity>('high');

  // Use shared hooks
  const { startStream, cancel: cancelTask } = useFoldingTask();
  const { timeline, isStreaming, latestStatusMessage } = useConversationTimeline();
  const availableFiles = useAvailableFiles();

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
            startStream(task.id, sequence);
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
      startStream,
    ]
  );

  // Handle stop button click
  const handleStop = useCallback(async () => {
    // Use shared hook to cancel the task
    await cancelTask();
    setIsSending(false);

    // Add cancellation message to chat
    if (activeConversationId) {
      addMessage(activeConversationId, {
        role: 'assistant',
        content: 'Structure prediction was canceled.',
      });
    }
  }, [cancelTask, activeConversationId, addMessage]);

  // Handler to insert example sequence
  const handleExampleClick = useCallback((sequence: string) => {
    setInput(sequence);
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Unified Timeline using shared component */}
        <ScrollArea className="flex-1 min-h-0 p-3">
          {timeline.length > 0 ? (
            <TimelineRenderer
              timeline={timeline}
              variant="compact"
              isStreaming={isStreaming}
              statusMessage={latestStatusMessage}
              className="pb-2"
            />
          ) : (
            <ChatEmptyState onExampleClick={handleExampleClick} variant="compact" />
          )}
        </ScrollArea>

        {/* Input - using shared ChatInputBase component */}
        <div className="flex-shrink-0 p-3 border-t border-cf-border">
          <ChatInputBase
            value={input}
            onChange={setInput}
            onSend={handleSend}
            onStop={handleStop}
            availableFiles={availableFiles}
            placeholder="输入序列或问题... (输入 @ 引用文件)"
            isSending={isSending || isStreaming}
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
