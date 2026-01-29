'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { MentionableFile } from '@/lib/types';
import { ChatInput } from './ChatInput';
import { ChatEmptyState } from './ChatEmptyState';
import { ExampleSequence } from '@/lib/constants/sequences';
import { generateSequenceFilename } from '@/lib/utils';
import { PanelRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { useFoldingTask } from '@/hooks/useFoldingTask';
import { useConversationTimeline } from '@/hooks/useConversationTimeline';
import { useAvailableFiles } from '@/hooks/useAvailableFiles';
import { parseFasta, validateSequence } from '@/lib/mock/generators';
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
    isStreaming: storeIsStreaming,
    setIsStreaming,
  } = useAppStore();

  // Use shared hooks
  const { submit, cancel: cancelTask } = useFoldingTask();
  const { timeline, isStreaming, timelineByEventType } = useConversationTimeline();
  const availableFiles = useAvailableFiles();

  // Handle stop button click
  const handleStop = useCallback(async () => {
    await cancelTask();
    setIsSending(false);
    setIsStreaming(false);

    // Add cancellation message to chat
    if (activeConversationId) {
      addMessage(activeConversationId, {
        role: 'assistant',
        content: '任务已被取消',
      });
    }
  }, [cancelTask, activeConversationId, addMessage, setIsStreaming]);

  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [mentionedFiles, setMentionedFiles] = useState<MentionableFile[]>([]);
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
    // Allow sending if there's content OR fasta files attached
    const hasFastaFiles = mentionedFiles?.some(f => f.type === 'fasta' && f.content);
    if (!content.trim() && !hasFastaFiles) return;

    // Get fresh values from store to avoid stale closure issues
    // IMPORTANT: Use getState() to get the latest value, not the stale closure value
    const storeState = useAppStore.getState();

    // Prevent duplicate submissions - check the LATEST store value
    if (storeState.isStreaming) return;

    // Set streaming state immediately to show stop button
    setIsStreaming(true);
    const currentConvId = storeState.activeConversationId;
    const currentConversation = storeState.conversations.find(c => c.id === currentConvId);
    const currentIsStreaming = storeState.isStreaming;
    const { createFolder } = storeState;

    // Single-round chat mode: if there's already content in the current conversation (previous round completed),
    // create a new Folder and Conversation for this new round
    const hasMessages = currentConversation && currentConversation.messages.length > 0;
    const hasCompletedRound = hasMessages && !currentIsStreaming;

    let convId = currentConvId;
    let folderId = storeState.activeFolderId;

    if (hasCompletedRound || !convId) {
      // Create new Folder and Conversation for new round with 1:1 association
      folderId = createFolder();
      convId = createConversation(folderId);
    }

    // Ensure folder exists (may be null if conversation was auto-created without folder)
    if (!folderId) {
      folderId = createFolder();
    }

    if (!convId) return;

    // Add pending files to folder (files from example click that haven't been uploaded yet)
    // Files from handleFileUpload are already in the folder, identified by non-pending ID
    if (mentionedFiles && mentionedFiles.length > 0) {
      for (const file of mentionedFiles) {
        // Only add files that are pending (from example click, not yet in folder)
        if (file.content && file.id.startsWith('pending/')) {
          addFolderInput(folderId, {
            name: file.name,
            type: file.type as 'fasta' | 'pdb' | 'text',
            content: file.content,
          });
        }
      }
    }

    // Build message content - store files as attachedFiles for chip display
    const messageContent = content.trim();
    const attachedFiles = mentionedFiles && mentionedFiles.length > 0
      ? mentionedFiles.map(f => ({ name: f.name, type: f.type as 'fasta' | 'pdb' | 'text' }))
      : undefined;

    // Add user message with attached files
    addMessage(convId, {
      role: 'user',
      content: messageContent,
      attachedFiles,
    });

    // Clear input and mentioned files
    setInputValue('');
    setMentionedFiles([]);
    setIsSending(true);

    try {
      // Check if there are FASTA files attached - extract sequence from files
      const fastaFile = mentionedFiles?.find(f => f.type === 'fasta' && f.content);
      if (fastaFile && fastaFile.content) {
        const parsed = parseFasta(fastaFile.content);
        const sequence = parsed?.sequence || '';
        const rawSequence = parsed?.rawSequence || sequence;

        // Validate sequence for invalid characters
        const validation = validateSequence(rawSequence);
        if (!validation.valid && validation.invalidChars) {
          addMessage(convId, {
            role: 'assistant',
            content: `Invalid sequence: contains non-standard amino acid characters: ${validation.invalidChars.map(c => `"${c}"`).join(', ')}. Please use only standard amino acid letters (A, C, D, E, F, G, H, I, K, L, M, N, P, Q, R, S, T, V, W, Y).`
          });
        } else if (sequence.length >= 10) {
          // File already added to folder by handleExampleClick or handleFileUpload
          // Don't pass filename/fastaContent to avoid duplicate addition
          const result = await submit(convId, sequence, { query: messageContent || undefined });

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
      } else if (content.trim()) {
        // No FASTA file - check if message itself contains a sequence
        const fastaMatch = content.match(/>[\s\S]*?[A-Z]+/i);
        const sequenceMatch = content.match(/^[ACDEFGHIKLMNPQRSTVWY]+$/i);

        if (fastaMatch || sequenceMatch) {
          const parsed = fastaMatch ? parseFasta(content) : null;
          const sequence = parsed?.sequence || (sequenceMatch ? sequenceMatch[0] : '');
          const rawSequence = parsed?.rawSequence || sequence;

          const validation = validateSequence(rawSequence);
          if (!validation.valid && validation.invalidChars) {
            addMessage(convId, {
              role: 'assistant',
              content: `Invalid sequence: contains non-standard amino acid characters: ${validation.invalidChars.map(c => `"${c}"`).join(', ')}. Please use only standard amino acid letters (A, C, D, E, F, G, H, I, K, L, M, N, P, Q, R, S, T, V, W, Y).`
            });
          } else if (sequence.length >= 10) {
            const filename = generateSequenceFilename();
            const fastaContent = fastaMatch ? content : `>user_input_sequence\n${sequence}`;

            const result = await submit(convId, sequence, { filename, fastaContent, query: messageContent || undefined });
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
          // Regular chat response - no sequence detected
          addMessage(convId, {
            role: 'assistant',
            content: 'I can help you with protein structure prediction. Please provide a FASTA sequence or paste an amino acid sequence directly. For example:\n\n```\n>protein\nMVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSH\n```'
          });
        }
      }
    } finally {
      setIsSending(false);
      // Note: Don't reset setIsStreaming(false) here because the task
      // is still running. The store will update isStreaming when the task completes.
    }
  }, [addMessage, createConversation, storeIsStreaming, setIsStreaming, submit, setMentionedFiles]);

  // Handle clicking an example sequence - prepare file for display, don't upload yet
  const handleExampleClick = useCallback((example: ExampleSequence) => {
    // Create FASTA content with example name as header
    const fastaContent = `>${example.name}\n${example.sequence}`;
    const filename = `${example.name}.fasta`;

    // Create MentionableFile for display as chip (with content for later upload)
    // Use a temporary ID since we don't have a folder yet
    const mentionableFile: MentionableFile = {
      id: `pending/${filename}`,
      name: filename,
      path: filename,
      type: 'fasta',
      source: 'project',
      content: fastaContent,
    };

    // Set mentioned file to show as chip
    setMentionedFiles([mentionableFile]);

    // Set input to the description
    setInputValue('完成该序列的折叠');
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

        // Get fresh state to check if current conversation has messages
        const storeState = useAppStore.getState();
        const currentConvId = storeState.activeConversationId;
        const currentConversation = storeState.conversations.find(c => c.id === currentConvId);
        const hasMessages = currentConversation && currentConversation.messages.length > 0;

        // Determine folder: create new if conversation has messages, otherwise reuse
        let fId = storeState.activeFolderId;
        if (hasMessages || !fId) {
          // Create new folder for new round or if no active folder
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
        const folder = useAppStore.getState().folders.find(f => f.id === fId);
        const folderName = folder?.name || fId;

        // Return MentionableFile for auto-mention (include content for fasta files)
        const mentionableFile: MentionableFile = {
          id: `${fId}/${file.name}`,
          name: file.name,
          path: `${folderName}/${file.name}`,
          type: fileType,
          source: 'project',
          content: fileType === 'fasta' ? content : undefined,
        };

        resolve(mentionableFile);
      };

      reader.onerror = () => {
        resolve(null);
      };

      reader.readAsText(file);
    });
  }, [createFolder, addFolderInput]);

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
              onStop={handleStop}
              onFileUpload={handleFileUpload}
              availableFiles={availableFiles}
              mentionedFiles={mentionedFiles}
              onMentionedFilesChange={setMentionedFiles}
              placeholder="上传 FASTA 文件并输入约束需求"
              isSending={storeIsStreaming}
              enableFileMentions={false}
              showDisclaimer
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
