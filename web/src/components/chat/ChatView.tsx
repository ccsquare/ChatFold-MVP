'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { MentionableFile } from '@/lib/types';
import { ChatInput } from './ChatInput';
import { ChatEmptyState } from './ChatEmptyState';
import { generateSequenceFilename } from '@/lib/utils';
import { PanelRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { useFoldingJob } from '@/hooks/useFoldingJob';
import { useConversationTimeline } from '@/hooks/useConversationTimeline';
import { useAvailableFiles } from '@/hooks/useAvailableFiles';
import { parseFasta } from '@/lib/mock/generators';
import { TimelineRenderer } from '@/components/timeline';

export function ChatView() {
  const {
    activeConversationId,
    conversations,
    addMessage,
    createConversation,
    switchToViewerMode,
    viewerTabs,
    folders,
    activeFolderId,
    createFolder,
    addFolderInput,
  } = useAppStore();

  // Use shared hooks
  const { submit } = useFoldingJob();
  const { timeline, isStreaming, timelineByEventType } = useConversationTimeline();
  const availableFiles = useAvailableFiles();

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

  // Auto scroll to bottom when timeline changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [timeline.length]);

  const handleSendMessage = useCallback(async (content: string, mentionedFiles?: MentionableFile[]) => {
    if (!content.trim() || isSending) return;

    // Get fresh values from store to avoid stale closure issues
    const storeState = useAppStore.getState();
    const currentConvId = storeState.activeConversationId;
    const currentConversation = storeState.conversations.find(c => c.id === currentConvId);
    const currentIsStreaming = storeState.isStreaming;
    const { createFolder } = storeState;

    // Single-round chat mode: if there's already content in the current conversation (previous round completed),
    // create a new Folder and Conversation for this new round
    const hasMessages = currentConversation && currentConversation.messages.length > 0;
    const hasCompletedRound = hasMessages && !currentIsStreaming;

    let convId = currentConvId;

    if (hasCompletedRound || !convId) {
      // Create new Folder and Conversation for new round with 1:1 association
      const folderId = createFolder();
      convId = createConversation(folderId);
    }

    if (!convId) return;

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

          // Submit using the shared hook (which handles API + SSE)
          // Note: No initial assistant message - PROLOGUE events will be shown instead
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
  }, [addMessage, createConversation, isSending, submit]);

  // Handle clicking an example sequence
  const handleExampleClick = useCallback((sequence: string) => {
    setInputValue(sequence);
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
                variant="ghost-icon"
                size="icon"
                className="h-7 w-7"
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

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto">
          {isEmpty ? (
            <ChatEmptyState onExampleClick={handleExampleClick} variant="wide" />
          ) : (
            // Active state: unified timeline
            <div className="max-w-4xl mx-auto px-4 py-6">
              <TimelineRenderer
                timeline={timeline}
                variant="wide"
                isStreaming={isStreaming}
                timelineByEventType={timelineByEventType}
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
              onFileUpload={handleFileUpload}
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
