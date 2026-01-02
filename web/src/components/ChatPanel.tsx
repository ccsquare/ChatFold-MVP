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
import { useFoldingJob } from '@/hooks/useFoldingJob';

export function ChatPanel() {
  const {
    activeConversationId,
    createConversation,
    addMessage,
    setActiveJob,
    // Folder management
    folders,
    activeFolderId,
    createFolder,
    addFolderInput,
  } = useAppStore();

  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [thinkingIntensity, setThinkingIntensity] = useState<ThinkingIntensity>('high');

  // Use shared hooks
  const { startStream, cancel: cancelJob } = useFoldingJob();
  const { timeline, isStreaming, latestStatusMessage, timelineByEventType } = useConversationTimeline();
  const availableFiles = useAvailableFiles();

  // Handle send from ChatInputBase
  const handleSend = useCallback(
    async (content: string, mentionedFiles?: MentionableFile[]) => {
      if (!content.trim() || isSending) return;

      // Get fresh values from store to avoid stale closure issues
      const storeState = useAppStore.getState();
      const currentConvId = storeState.activeConversationId;
      const currentFolderId = storeState.activeFolderId;
      const currentConversation = storeState.conversations.find(c => c.id === currentConvId);
      const currentIsStreaming = storeState.isStreaming;

      // Single-round chat mode: if there's already content in the current conversation (previous round completed),
      // create a new Folder and Conversation for this new round
      const hasMessages = currentConversation && currentConversation.messages.length > 0;
      const hasCompletedRound = hasMessages && !currentIsStreaming;

      let convId = currentConvId;
      let folderId = currentFolderId;

      if (hasCompletedRound || !convId) {
        // Create new Folder and Conversation for new round with 1:1 association
        folderId = createFolder();
        convId = createConversation(folderId);
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
      console.log('[ChatPanel] Adding message to conversation:', convId);
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
            // Use the folder created above (or create if not yet)
            if (!folderId) {
              folderId = createFolder();
            }

            // Create a text file for the sequence and add to folder
            const filename = generateSequenceFilename();
            const fastaContent = fastaMatch ? userMessage : `>user_input_sequence\n${sequence}`;

            addFolderInput(folderId, {
              name: filename,
              type: 'fasta',
              content: fastaContent,
            });

            // Create job
            const jobResponse = await fetch('/api/v1/jobs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                conversationId: convId,
                sequence,
              }),
            });

            const responseData = await jobResponse.json();

            // Check if the API returned an error
            if (!jobResponse.ok) {
              const errorMessage =
                responseData.details?.join(', ') || responseData.error || 'Invalid sequence';
              addMessage(convId, {
                role: 'assistant',
                content: `Unable to start prediction: ${errorMessage}. Please check your sequence and try again.`,
              });
              return;
            }

            const { job } = responseData;

            // Add assistant message
            addMessage(convId, {
              role: 'assistant',
              content: `Starting structure prediction for your ${sequence.length} residue sequence. The sequence has been saved as "${filename}" in your project. I'll keep you updated on the progress.`,
            });

            // Set active job and start streaming
            setActiveJob({ ...job, status: 'running' });
            startStream(job.id, sequence);
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
      // Note: activeConversationId, activeFolderId, isStreaming are now read fresh from store
      // to avoid stale closure issues in single-round mode detection
      addMessage,
      addFolderInput,
      createConversation,
      createFolder,
      isSending,
      setActiveJob,
      startStream,
    ]
  );

  // Handle stop button click
  const handleStop = useCallback(async () => {
    // Use shared hook to cancel the job
    await cancelJob();
    setIsSending(false);

    // Add cancellation message to chat
    if (activeConversationId) {
      addMessage(activeConversationId, {
        role: 'assistant',
        content: 'Structure prediction was canceled.',
      });
    }
  }, [cancelJob, activeConversationId, addMessage]);

  // Handler to insert example sequence
  const handleExampleClick = useCallback((sequence: string) => {
    setInput(sequence);
  }, []);

  // Handle file upload - save to active Folder's Inputs and return MentionableFile for auto-mention
  const handleFileUpload = useCallback(async (file: File): Promise<MentionableFile | null> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (!content) {
          resolve(null);
          return;
        }

        // Ensure we have an active folder
        let fId = activeFolderId;
        if (!fId) {
          fId = createFolder();
        }

        // Determine file type from extension
        const fileName = file.name.toLowerCase();
        let fileType: 'fasta' | 'pdb' | 'text' = 'text';
        if (fileName.endsWith('.fasta') || fileName.endsWith('.fa')) {
          fileType = 'fasta';
        } else if (fileName.endsWith('.pdb')) {
          fileType = 'pdb';
        }

        // Add file to folder inputs
        addFolderInput(fId, {
          name: file.name,
          type: fileType,
          content: content,
        });

        // Get the folder to construct the MentionableFile path
        const folder = folders.find(f => f.id === fId);
        const folderName = folder?.name || fId;

        // Return MentionableFile for auto-mention
        const mentionableFile: MentionableFile = {
          id: `${fId}/${file.name}`,
          name: file.name,
          path: `${folderName}/${file.name}`,
          type: fileType,
          source: 'project',
        };

        resolve(mentionableFile);
      };

      reader.onerror = () => {
        resolve(null);
      };

      reader.readAsText(file);
    });
  }, [activeFolderId, createFolder, addFolderInput, folders]);

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
              timelineByEventType={timelineByEventType}
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
            onFileUpload={handleFileUpload}
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
