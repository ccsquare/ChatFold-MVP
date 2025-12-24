'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { cn, formatTimestamp } from '@/lib/utils';
import { parseFasta } from '@/lib/mock/generators';
import { Task, StepEvent } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Send,
  Paperclip,
  BotMessageSquare,
  User,
  Loader2,
  Sparkles,
  Scale,
  Zap,
  ArrowUp,
  FlaskConical,
  FileText,
  AtSign,
  X
} from 'lucide-react';
import { HelixIcon } from '@/components/icons/ProteinIcon';

// Example sequences for testing
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
  const [thinkingIntensity, setThinkingIntensity] = useState<'high' | 'medium' | 'low'>('high');
  const [showIntensityMenu, setShowIntensityMenu] = useState(false);
  const [showFileMentions, setShowFileMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionPosition, setMentionPosition] = useState(0);
  const [mentionedFiles, setMentionedFiles] = useState<Array<{ name: string; type: string }>>([]);
  const mentionInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleSubmit = async () => {
    if (!input.trim() || isSending) return;

    let convId = activeConversationId;
    if (!convId) {
      convId = createConversation();
    }

    const userMessage = input.trim();
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
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        // Add file content to input
        setInput(content);
        // Focus input
        inputRef.current?.focus();
      }
    };
    reader.readAsText(file);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;

    setInput(value);

    // Check for @ symbol to trigger file mentions
    // Support Chinese characters, alphanumerics, dots, underscores, hyphens
    const beforeCursor = value.slice(0, cursorPos);
    const atMatch = beforeCursor.match(/@([\w\u4e00-\u9fa5._-]*)$/);

    if (atMatch) {
      setShowFileMentions(true);
      setMentionSearch(atMatch[1]);
      setMentionPosition(cursorPos - atMatch[0].length);
    } else {
      setShowFileMentions(false);
    }
  };

  const insertFileMention = (file: { name: string; type: string }) => {
    // Add file to mentioned files if not already there
    if (!mentionedFiles.some(f => f.name === file.name)) {
      setMentionedFiles(prev => [...prev, file]);
    }

    // Remove the @ trigger from input
    const before = input.slice(0, mentionPosition);
    const after = input.slice(inputRef.current?.selectionStart || input.length);
    setInput(before + after);

    setShowFileMentions(false);
    setMentionSearch('');

    // Focus back to input
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const removeFileMention = (filename: string) => {
    setMentionedFiles(prev => prev.filter(f => f.name !== filename));
  };

  // Get available files for mentions
  const availableFiles = React.useMemo(() => {
    const files: Array<{ name: string; type: string }> = [];
    const seenNames = new Set<string>();

    // Add files from active project (inputs and outputs)
    const activeProject = projects.find(p => p.id === activeProjectId);
    if (activeProject) {
      // Add input files (sequences)
      activeProject.inputs.forEach(input => {
        if (!seenNames.has(input.name)) {
          files.push({ name: input.name, type: input.type });
          seenNames.add(input.name);
        }
      });

      // Add output files (structures)
      activeProject.outputs.forEach(output => {
        if (!seenNames.has(output.filename)) {
          files.push({ name: output.filename, type: 'structure' });
          seenNames.add(output.filename);
        }
      });
    }

    // Add files from activeTask
    if (activeTask?.steps) {
      activeTask.steps.forEach(step => {
        step.artifacts?.forEach(artifact => {
          if (!seenNames.has(artifact.filename)) {
            files.push({ name: artifact.filename, type: 'structure' });
            seenNames.add(artifact.filename);
          }
        });
      });
    }

    // Add assets from active conversation
    if (activeConversation?.assets) {
      activeConversation.assets.forEach(asset => {
        if (!seenNames.has(asset.name)) {
          files.push({ name: asset.name, type: asset.type });
          seenNames.add(asset.name);
        }
      });
    }

    return files;
  }, [projects, activeProjectId, activeTask, activeConversation]);

  const filteredFiles = availableFiles.filter(file =>
    file.name.toLowerCase().includes(mentionSearch.toLowerCase())
  );

  // Handler to insert example sequence
  const handleExampleClick = useCallback((sequence: string) => {
    setInput(sequence);
    inputRef.current?.focus();
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Messages */}
        <ScrollArea className="flex-1 min-h-0 p-3">
          <div className="space-y-3">
            {/* Status indicator */}
            {isStreaming && (
              <div className="flex items-center gap-2 px-3 py-2 bg-cf-success/10 rounded-lg">
                <Loader2 className="w-4 h-4 text-cf-success animate-spin" />
                <span className="text-sm text-cf-success">Processing your sequence...</span>
              </div>
            )}

            {activeConversation?.messages.map(message => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-2",
                  message.role === 'user' ? "justify-end" : "justify-start"
                )}
              >
                {message.role !== 'user' && (
                  <div className="w-6 h-6 rounded-full bg-cf-accent/20 flex items-center justify-center flex-shrink-0">
                    <BotMessageSquare className="w-3.5 h-3.5 text-cf-accent" />
                  </div>
                )}

                <div className={cn(
                  "max-w-[80%] rounded-lg px-3 py-2 overflow-hidden",
                  message.role === 'user'
                    ? "bg-cf-accent text-white"
                    : "bg-cf-bg border border-cf-border text-cf-text"
                )}>
                  <p className="text-sm whitespace-pre-wrap break-all [overflow-wrap:anywhere]">{message.content}</p>
                  <p className={cn(
                    "text-[10px] mt-1",
                    message.role === 'user' ? "text-white/60" : "text-cf-text-muted"
                  )}>
                    {formatTimestamp(message.timestamp)}
                  </p>
                </div>

                {message.role === 'user' && (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                    <User className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
              </div>
            ))}

            {/* Empty state */}
            {(!activeConversation || activeConversation.messages.length === 0) && (
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

        {/* Input */}
        <div className="flex-shrink-0 p-3 border-t border-cf-border">
          <div className="relative">
            {/* File mentions dropdown - Cursor style */}
            {showFileMentions && (
              <div className="absolute bottom-full left-0 mb-2 bg-cf-bg-tertiary border border-cf-border rounded-lg shadow-2xl min-w-[360px] max-h-[320px] overflow-hidden z-50">
                {/* Search input */}
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-cf-border/50">
                  <input
                    ref={mentionInputRef}
                    type="text"
                    value={mentionSearch}
                    onChange={(e) => setMentionSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setShowFileMentions(false);
                        setMentionSearch('');
                        inputRef.current?.focus();
                      } else if (e.key === 'Enter' && filteredFiles.length > 0) {
                        e.preventDefault();
                        insertFileMention(filteredFiles[0]);
                      }
                    }}
                    placeholder="搜索文件..."
                    className="flex-1 bg-transparent text-sm text-cf-text placeholder:text-cf-text-muted outline-none"
                    autoFocus
                  />
                </div>

                {/* File list */}
                <div className="py-1 max-h-[260px] overflow-y-auto">
                  {filteredFiles.length > 0 ? (
                    filteredFiles.map((file, index) => {
                      // Determine icon based on file type
                      const isStructure = file.type === 'structure' || file.name.endsWith('.pdb');
                      const Icon = isStructure ? HelixIcon : FileText;
                      const iconColor = isStructure ? 'text-cf-success' : 'text-blue-400';

                      // Extract path info (project name or type)
                      const pathInfo = file.type === 'fasta' ? 'sequence' : file.type;

                      return (
                        <button
                          key={index}
                          onClick={() => insertFileMention(file)}
                          className={cn(
                            "w-full flex items-center gap-2.5 px-3 py-2 text-left",
                            "hover:bg-cf-highlight transition-colors",
                            "focus:outline-none focus:bg-cf-highlight"
                          )}
                        >
                          <Icon className={cn("w-4 h-4 flex-shrink-0", iconColor)} />
                          <span className="text-sm text-cf-text font-medium truncate">
                            {file.name}
                          </span>
                          <span className="text-xs text-cf-text-muted truncate ml-auto">
                            {pathInfo}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="px-3 py-4 text-center">
                      <p className="text-sm text-cf-text-muted">没有找到匹配的文件</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-cf-bg-input rounded-xl border border-cf-border focus-within:border-cf-accent/50 transition-colors">
              {/* File chips - Cursor style */}
              {mentionedFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-3 pt-3">
                  {mentionedFiles.map((file, index) => {
                    const isStructure = file.type === 'structure' || file.name.endsWith('.pdb');
                    const Icon = isStructure ? HelixIcon : FileText;
                    const iconColor = isStructure ? 'text-cf-success' : 'text-blue-400';

                    return (
                      <div
                        key={index}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md",
                          "bg-cf-bg-tertiary border border-cf-border/60",
                          "text-sm text-cf-text",
                          "group hover:border-cf-accent/50 transition-colors"
                        )}
                      >
                        <Icon className={cn("w-3.5 h-3.5 flex-shrink-0", iconColor)} />
                        <span className="font-medium truncate max-w-[150px]">{file.name}</span>
                        <button
                          onClick={() => removeFileMention(file.name)}
                          className="ml-0.5 p-0.5 rounded hover:bg-cf-highlight transition-colors"
                        >
                          <X className="w-3 h-3 text-cf-text-muted hover:text-cf-text" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <Textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={mentionedFiles.length > 0 ? "输入消息..." : "输入序列或问题... (输入 @ 引用文件)"}
                className={cn(
                  "w-full bg-transparent border-0 px-4 text-sm text-cf-text placeholder:text-cf-text-muted resize-none focus-visible:ring-0 focus-visible:ring-offset-0",
                  mentionedFiles.length > 0 ? "pt-2 pb-3" : "py-3"
                )}
                rows={2}
                disabled={isSending}
              />
              <div className="flex items-center justify-between px-3 py-2 border-t border-cf-border/50">
                <div className="flex items-center gap-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".fasta,.fa,.pdb,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-cf-text-secondary hover:text-cf-text hover:bg-cf-highlight"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Paperclip className="w-4 h-4" />
                        <span className="sr-only">Upload sequence file</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Upload sequence file (.fasta, .fa, .pdb)</TooltipContent>
                  </Tooltip>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs rounded-full bg-cf-accent text-white hover:bg-cf-accent/90"
                      >
                        {thinkingIntensity === 'high' && <Sparkles className="w-3.5 h-3.5 mr-0.5" />}
                        {thinkingIntensity === 'medium' && <Scale className="w-3.5 h-3.5 mr-0.5" />}
                        {thinkingIntensity === 'low' && <Zap className="w-3.5 h-3.5 mr-0.5" />}
                        {thinkingIntensity === 'high' ? 'Pro' : thinkingIntensity === 'medium' ? 'Balanced' : 'Fast'}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-[140px]">
                      <DropdownMenuItem
                        onSelect={() => setThinkingIntensity('high')}
                        className={cn("flex items-center gap-2", thinkingIntensity === 'high' && "text-cf-accent")}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Pro
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setThinkingIntensity('medium')}
                        className={cn("flex items-center gap-2", thinkingIntensity === 'medium' && "text-cf-accent")}
                      >
                        <Scale className="w-3.5 h-3.5" />
                        Balanced
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setThinkingIntensity('low')}
                        className={cn("flex items-center gap-2", thinkingIntensity === 'low' && "text-cf-accent")}
                      >
                        <Zap className="w-3.5 h-3.5" />
                        Fast
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-8 w-8",
                        input.trim() && !isSending
                          ? "bg-cf-highlight hover:bg-cf-highlight-strong text-cf-text"
                          : "text-cf-text-muted"
                      )}
                      onClick={handleSubmit}
                      disabled={!input.trim() || isSending}
                    >
                      {isSending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ArrowUp className="w-4 h-4" />
                      )}
                      <span className="sr-only">Send message</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Send message</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
