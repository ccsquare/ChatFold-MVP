'use client';

import React, { useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { parseFasta, validateSequence } from '@/lib/mock/generators';
import { MentionableFile } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TooltipProvider } from '@/components/ui/tooltip';
import { generateSequenceFilename } from '@/lib/utils';
import { ChatInputBase, ThinkingIntensity } from './chat/ChatInputBase';
import { ChatEmptyState } from './chat/ChatEmptyState';
import { ExampleSequence } from '@/lib/constants/sequences';
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
  const [mentionedFiles, setMentionedFiles] = useState<MentionableFile[]>([]);

  // Use shared hooks
  const { startStream, cancel: cancelJob } = useFoldingJob();
  const { timeline, isStreaming, timelineByEventType } = useConversationTimeline();
  const availableFiles = useAvailableFiles();

  // Handle send from ChatInputBase
  const handleSend = useCallback(
    async (content: string, files?: MentionableFile[]) => {
      // Allow sending if there's content OR fasta files attached
      const hasFastaFiles = files?.some(f => f.type === 'fasta' && f.content);
      if (!content.trim() && !hasFastaFiles) return;
      if (isSending) return;

      // Get fresh values from store to avoid stale closure issues
      const storeState = useAppStore.getState();
      const currentConvId = storeState.activeConversationId;
      const currentFolderId = storeState.activeFolderId;
      const currentConversation = storeState.conversations.find(c => c.id === currentConvId);

      // Single-round chat mode: if there's already a protein sequence submitted in current conversation,
      // create a new Folder and Conversation for this new round (regardless of completion status)
      const hasMessages = currentConversation && currentConversation.messages.length > 0;
      const hasSubmittedSequence = hasMessages && currentConversation.messages.some(msg =>
        msg.role === 'user' && /[ACDEFGHIKLMNPQRSTVWY]{10,}/i.test(msg.content)
      );
      const shouldCreateNewRound = hasSubmittedSequence;

      let convId = currentConvId;
      let folderId = currentFolderId;

      if (shouldCreateNewRound || !convId) {
        // Create new Folder and Conversation for new round with 1:1 association
        folderId = createFolder();
        convId = createConversation(folderId);
      }

      if (!folderId) {
        folderId = createFolder();
      }

      // Add pending files to folder (files from example click that haven't been uploaded yet)
      // Files from handleFileUpload are already in the folder, identified by non-pending ID
      if (files && files.length > 0) {
        for (const file of files) {
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
      const userMessage = content.trim();
      const attachedFiles = files && files.length > 0
        ? files.map(f => ({ name: f.name, type: f.type as 'fasta' | 'pdb' | 'text' }))
        : undefined;

      setInput('');
      setMentionedFiles([]);
      setIsSending(true);

      // Add user message with attached files
      console.log('[ChatPanel] Adding message to conversation:', convId);
      addMessage(convId, {
        role: 'user',
        content: userMessage,
        attachedFiles,
      });

      try {
        // Check if there are FASTA files attached - extract sequence from files
        const fastaFile = files?.find(f => f.type === 'fasta' && f.content);
        if (fastaFile && fastaFile.content) {
          const parsed = parseFasta(fastaFile.content);
          const sequence = parsed?.sequence || '';
          const rawSequence = parsed?.rawSequence || sequence;

          // Validate sequence for invalid characters
          const validation = validateSequence(rawSequence);
          if (!validation.valid && validation.invalidChars) {
            addMessage(convId, {
              role: 'assistant',
              content: `Invalid sequence: contains non-standard amino acid characters: ${validation.invalidChars.map(c => `"${c}"`).join(', ')}. Please use only standard amino acid letters (A, C, D, E, F, G, H, I, K, L, M, N, P, Q, R, S, T, V, W, Y).`,
            });
            return;
          }

          if (sequence.length >= 10) {
            // Use the folder created above (or create if not yet)
            if (!folderId) {
              folderId = createFolder();
            }

            // File already added to folder by handleExampleClick or handleFileUpload
            // No need to add again

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
              content: `Starting structure prediction for your ${sequence.length} residue sequence. I'll keep you updated on the progress.`,
            });

            // Set active job and start streaming
            setActiveJob({ ...job, status: 'running' });
            startStream(job.id, sequence);
          } else {
            addMessage(convId, {
              role: 'assistant',
              content: 'The sequence seems too short. Please provide a protein sequence with at least 10 amino acids.',
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
                content: `Invalid sequence: contains non-standard amino acid characters: ${validation.invalidChars.map(c => `"${c}"`).join(', ')}. Please use only standard amino acid letters (A, C, D, E, F, G, H, I, K, L, M, N, P, Q, R, S, T, V, W, Y).`,
              });
              return;
            }

            if (sequence.length >= 10) {
              if (!folderId) {
                folderId = createFolder();
              }

              const filename = generateSequenceFilename();
              const fastaContent = fastaMatch ? content : `>user_input_sequence\n${sequence}`;

              addFolderInput(folderId, {
                name: filename,
                type: 'fasta',
                content: fastaContent,
              });

              const jobResponse = await fetch('/api/v1/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversationId: convId, sequence }),
              });

              const responseData = await jobResponse.json();

              if (!jobResponse.ok) {
                const errorMessage = responseData.details?.join(', ') || responseData.error || 'Invalid sequence';
                addMessage(convId, {
                  role: 'assistant',
                  content: `Unable to start prediction: ${errorMessage}. Please check your sequence and try again.`,
                });
                return;
              }

              const { job } = responseData;
              addMessage(convId, {
                role: 'assistant',
                content: `Starting structure prediction for your ${sequence.length} residue sequence. I'll keep you updated on the progress.`,
              });
              setActiveJob({ ...job, status: 'running' });
              startStream(job.id, sequence);
            } else {
              addMessage(convId, {
                role: 'assistant',
                content: 'The sequence seems too short. Please provide a protein sequence with at least 10 amino acids.',
              });
            }
          } else {
            // Regular chat response - no sequence detected
            addMessage(convId, {
              role: 'assistant',
              content: 'I can help you with protein structure prediction. Please provide a FASTA sequence or paste an amino acid sequence directly. For example:\n\n```\n>protein\nMVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSH\n```',
            });
          }
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

  // Handler to prepare example sequence - prepare file for display, don't upload yet
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
    setInput('完成该序列的折叠');
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

        // Get fresh state to check if current conversation has sequence submission
        const storeState = useAppStore.getState();
        const currentConvId = storeState.activeConversationId;
        const currentConversation = storeState.conversations.find(c => c.id === currentConvId);
        const hasMessages = currentConversation && currentConversation.messages.length > 0;
        const hasSubmittedSequence = hasMessages && currentConversation.messages.some(msg =>
          msg.role === 'user' && /[ACDEFGHIKLMNPQRSTVWY]{10,}/i.test(msg.content)
        );

        // Determine folder: create new if sequence already submitted, otherwise reuse
        let fId = storeState.activeFolderId;
        if (hasSubmittedSequence || !fId) {
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
            mentionedFiles={mentionedFiles}
            onMentionedFilesChange={setMentionedFiles}
            placeholder="上传 FASTA 文件并输入约束需求"
            isSending={isSending || isStreaming}
            thinkingIntensity={thinkingIntensity}
            onThinkingIntensityChange={setThinkingIntensity}
            enableFileMentions={false}
            enableThinkingMode={false}
            enableFileUpload={true}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
