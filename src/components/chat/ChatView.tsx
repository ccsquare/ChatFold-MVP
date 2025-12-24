'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { ChatMessage, FoldStep, MentionableFile, StructureArtifact } from '@/lib/types';
import { MessageBubble } from './MessageBubble';
import { FoldingTimelineViewer } from './FoldingTimelineViewer';
import { ChatInput } from './ChatInput';
import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';
import { HelixIcon } from '@/components/icons/ProteinIcon';
import { generateMockFoldSteps } from '@/lib/mock/foldSteps';
import { parseFasta } from '@/lib/mock/generators';

// Example sequences for testing (matching ChatPanel)
const EXAMPLE_SEQUENCES = [
  {
    name: '人类血红蛋白 β 链',
    description: 'Human Hemoglobin Beta Chain (147 aa)',
    sequence: 'MVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSHGSAQVKGHGKKVADALTNAVAHVDDMPNALSALSDLHAHKLRVDPVNFKLLSHCLLVTLAAHLPAEFTPAVHASLDKFLASVSTVLTSKYR'
  },
  {
    name: '胰岛素 A 链',
    description: 'Human Insulin A Chain (21 aa)',
    sequence: 'GIVEQCCTSICSLYQLENYCN'
  },
  {
    name: '绿色荧光蛋白 GFP',
    description: 'Green Fluorescent Protein (238 aa)',
    sequence: 'MSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTFSYGVQCFSRYPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITHGMDELYK'
  },
  {
    name: '短测试肽段',
    description: 'Short Test Peptide (30 aa)',
    sequence: 'MAEGEITTFTALTEKFNLPPGNYKKPKLLY'
  }
];

// Generate a timestamp-based filename for sequence files
const generateSequenceFilename = () => {
  const now = new Date();
  const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  return `sequence_${timestamp}.fasta`;
};

// Note: ChatView is an alternative chat view that uses FoldingTimelineViewer
// The main app uses ChatPanel instead

export function ChatView() {
  const {
    activeConversationId,
    conversations,
    addMessage,
    createConversation,
    // For file mentions
    projects,
    activeProjectId,
    createProject,
    addProjectInput,
    addProjectOutput,
    activeTask
  } = useAppStore();
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-create conversation if none exists
  useEffect(() => {
    if (!activeConversationId && conversations.length === 0) {
      createConversation();
    }
  }, [activeConversationId, conversations.length, createConversation]);

  const activeConversation = conversations.find(c => c.id === activeConversationId);
  const messages = activeConversation?.messages || [];
  const isEmpty = messages.length === 0;

  // Build available files for @ mentions with full path identification
  const availableFiles = useMemo(() => {
    const files: MentionableFile[] = [];

    // Add files from all projects (with project path for disambiguation)
    projects.forEach(project => {
      // Add input files (sequences)
      project.inputs.forEach(input => {
        files.push({
          id: `${project.id}/${input.name}`, // Unique ID includes project
          name: input.name,
          path: `${project.name}/${input.name}`, // Display path includes project name
          type: input.type
        });
      });

      // Add output files (structures)
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
          // Only add if not already present
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
    if (activeConversation?.assets) {
      activeConversation.assets.forEach(asset => {
        const id = `conversation/${activeConversation.id}/${asset.name}`;
        if (!files.some(f => f.id === id)) {
          files.push({
            id,
            name: asset.name,
            path: `conversation/${activeConversation.id}/${asset.name}`,
            type: asset.type
          });
        }
      });
    }

    return files;
  }, [projects, activeTask, activeConversation]);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSendMessage = useCallback((content: string, mentionedFiles?: MentionableFile[]) => {
    let convId = activeConversationId;
    if (!convId) {
      convId = createConversation();
    }
    if (!content.trim()) return;

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

    // Check if message contains a protein sequence
    const fastaMatch = messageContent.match(/>[\s\S]*?[A-Z]+/i);
    const sequenceMatch = messageContent.match(/^[ACDEFGHIKLMNPQRSTVWY]+$/i);

    if (fastaMatch || sequenceMatch) {
      const sequence = fastaMatch
        ? (parseFasta(messageContent)?.sequence || '')
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
          ? messageContent
          : `>user_input_sequence\n${sequence}`;

        addProjectInput(projId, {
          name: filename,
          type: 'fasta',
          content: fastaContent
        });

        // Simulate folding task with mock data
        setTimeout(() => {
          const mockSteps = generateMockFoldSteps(6);

          // Add output structures to project
          mockSteps.forEach((step, index) => {
            if (step.pdbData) {
              const artifact: StructureArtifact = {
                type: 'structure',
                structureId: step.structureId,
                label: step.label,
                filename: `step-${step.stepNumber}.pdb`,
                metrics: {
                  plddtAvg: step.metrics.rmsd * 20,
                  paeAvg: Math.abs(step.metrics.energy)
                },
                pdbData: step.pdbData
              };
              addProjectOutput(projId!, artifact);
            }
          });

          addMessage(convId!, {
            role: 'assistant',
            content: `Protein folding simulation complete. The sequence has been saved as "${filename}" and ${mockSteps.length} structure files have been generated.`,
            foldSteps: mockSteps,
          });
        }, 500);
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
  }, [activeConversationId, activeProjectId, addMessage, addProjectInput, addProjectOutput, createConversation, createProject]);

  // Handle clicking an example sequence
  const handleExampleClick = useCallback((sequence: string) => {
    setInputValue(sequence);
  }, []);

  return (
    <div className="h-full flex flex-col bg-cf-bg">
      {/* Scrollable content area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
      >
        {isEmpty ? (
          // Empty state: centered content with examples (matching ChatPanel design)
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
                        // Animation on mount
                        "animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-backwards",
                        // Base card styling
                        "group relative flex flex-col items-start gap-1.5 p-3 text-left",
                        "rounded-xl border border-cf-border/60",
                        "bg-cf-bg-tertiary/40",
                        // Hover state
                        "hover:bg-cf-bg-tertiary hover:border-cf-accent/60",
                        "hover:-translate-y-0.5",
                        // Active state
                        "active:scale-[0.98] active:translate-y-0",
                        // Focus state
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cf-accent",
                        "focus-visible:ring-offset-2 focus-visible:ring-offset-cf-bg",
                        // Transitions
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
          </div>
        ) : (
          // Active state: message list
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
            {messages.map((message) => (
              <div key={message.id}>
                {message.role === 'user' ? (
                  <MessageBubble message={message} />
                ) : message.role === 'assistant' && message.foldSteps ? (
                  <FoldingTimelineViewer
                    steps={message.foldSteps}
                    conversationId={activeConversationId || ''}
                  />
                ) : (
                  // Plain text assistant message (full-width, no bubble)
                  <div className="text-cf-text">
                    {message.content}
                  </div>
                )}
              </div>
            ))}
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
  );
}
