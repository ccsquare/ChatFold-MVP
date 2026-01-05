'use client';

import { useRef, useState, KeyboardEvent, useEffect, ChangeEvent } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
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
import { Paperclip, ArrowUp, Loader2, Sparkles, Scale, Zap, FileText, X, Square } from 'lucide-react';
import { HelixIcon } from '@/components/icons/ProteinIcon';
import { cn } from '@/lib/utils';
import { MentionableFile } from '@/lib/types';

export type ThinkingIntensity = 'high' | 'medium' | 'low';

export interface ChatInputBaseProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (value: string, mentionedFiles?: MentionableFile[]) => void;
  // File upload callback - returns the uploaded file as MentionableFile to auto-add to mentions
  onFileUpload?: (file: File) => Promise<MentionableFile | null>;

  // File mention system
  availableFiles?: MentionableFile[];

  // Customization
  placeholder?: string;
  disabled?: boolean;
  isSending?: boolean;
  onStop?: () => void; // Callback when stop button is clicked
  showDisclaimer?: boolean;
  disclaimerText?: string;

  // Feature flags
  enableFileMentions?: boolean;
  enableThinkingMode?: boolean;
  enableFileUpload?: boolean;

  // Thinking mode
  thinkingIntensity?: ThinkingIntensity;
  onThinkingIntensityChange?: (intensity: ThinkingIntensity) => void;

  // Styling
  className?: string;
}

export function ChatInputBase({
  value,
  onChange,
  onSend,
  onFileUpload,
  availableFiles = [],
  placeholder = '输入序列或问题...',
  disabled = false,
  isSending = false,
  onStop,
  showDisclaimer = false,
  disclaimerText = 'ChatFold AI can make mistakes. Verify scientific results independently.',
  enableFileMentions = true,
  enableThinkingMode = true,
  enableFileUpload = true,
  thinkingIntensity: controlledIntensity,
  onThinkingIntensityChange,
  className,
}: ChatInputBaseProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mentionInputRef = useRef<HTMLInputElement>(null);

  // Internal state for uncontrolled thinking intensity
  const [internalIntensity, setInternalIntensity] = useState<ThinkingIntensity>('high');
  const thinkingIntensity = controlledIntensity ?? internalIntensity;
  const setThinkingIntensity = onThinkingIntensityChange ?? setInternalIntensity;

  // File mention state
  const [showFileMentions, setShowFileMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionPosition, setMentionPosition] = useState(0);
  const [mentionedFiles, setMentionedFiles] = useState<MentionableFile[]>([]);

  // Focus mention search input when dropdown opens
  useEffect(() => {
    if (showFileMentions && mentionInputRef.current) {
      mentionInputRef.current.focus();
    }
  }, [showFileMentions]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedExtensions = ['.txt', '.fasta', '.fa', '.pdb'];
      const fileName = file.name.toLowerCase();
      const isValidType = allowedExtensions.some(ext => fileName.endsWith(ext));

      if (!isValidType) {
        alert('只支持上传 .txt, .fasta, .fa, .pdb 文件');
        e.target.value = '';
        return;
      }

      if (onFileUpload) {
        // Call the upload handler and auto-add to mentions if successful
        const mentionableFile = await onFileUpload(file);
        if (mentionableFile) {
          // Auto-add the uploaded file to mentioned files
          if (!mentionedFiles.some(f => f.id === mentionableFile.id)) {
            setMentionedFiles(prev => [...prev, mentionableFile]);
          }
        }
        inputRef.current?.focus();
      } else {
        // Default behavior: read file content into input
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          if (content) {
            onChange(content);
            inputRef.current?.focus();
          }
        };
        reader.readAsText(file);
      }
    }
    // Reset input
    e.target.value = '';
  };

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;

    onChange(newValue);

    // Check for @ symbol to trigger file mentions
    if (enableFileMentions) {
      // Support Chinese characters, alphanumerics, dots, underscores, hyphens, slashes
      const beforeCursor = newValue.slice(0, cursorPos);
      const atMatch = beforeCursor.match(/@([\w\u4e00-\u9fa5._\-/]*)$/);

      if (atMatch) {
        setShowFileMentions(true);
        setMentionSearch(atMatch[1]);
        setMentionPosition(cursorPos - atMatch[0].length);
      } else {
        setShowFileMentions(false);
      }
    }
  };

  const insertFileMention = (file: MentionableFile) => {
    // Add file to mentioned files if not already there (check by id, not name)
    if (!mentionedFiles.some(f => f.id === file.id)) {
      setMentionedFiles(prev => [...prev, file]);
    }

    // Remove the @ trigger from input
    const before = value.slice(0, mentionPosition);
    const after = value.slice(inputRef.current?.selectionStart || value.length);
    onChange(before + after);

    setShowFileMentions(false);
    setMentionSearch('');

    // Focus back to input
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const removeFileMention = (fileId: string) => {
    setMentionedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // Filter files based on search (search both name and path)
  const filteredFiles = availableFiles.filter(file =>
    file.name.toLowerCase().includes(mentionSearch.toLowerCase()) ||
    file.path.toLowerCase().includes(mentionSearch.toLowerCase())
  );

  const handleSubmit = () => {
    if (!disabled && !isSending) {
      // Check for fasta files to expand content as query prefix
      const fastaFiles = mentionedFiles.filter(
        f => f.type === 'fasta' && f.content
      );

      let finalQuery = value.trim();

      if (fastaFiles.length > 0) {
        // Expand fasta file contents as query prefix
        const fastaContents = fastaFiles.map(f => f.content).join('\n\n');
        finalQuery = fastaContents + (finalQuery ? '\n\n' + finalQuery : '');
      }

      if (finalQuery) {
        // Filter out fasta files from mentioned files (already expanded)
        const nonFastaFiles = mentionedFiles.filter(f => f.type !== 'fasta');
        onSend(finalQuery, nonFastaFiles.length > 0 ? nonFastaFiles : undefined);
        setMentionedFiles([]); // Clear mentioned files after send
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleMentionKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setShowFileMentions(false);
      setMentionSearch('');
      inputRef.current?.focus();
    } else if (e.key === 'Enter' && filteredFiles.length > 0) {
      e.preventDefault();
      insertFileMention(filteredFiles[0]);
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("relative", className)}>
        {/* File mentions dropdown */}
        {enableFileMentions && showFileMentions && (
          <div className="absolute bottom-full left-0 mb-2 bg-cf-bg-tertiary border border-cf-border rounded-lg shadow-2xl min-w-[360px] max-h-[320px] overflow-hidden z-50">
            {/* Search input */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-cf-border/50">
              <input
                ref={mentionInputRef}
                type="text"
                value={mentionSearch}
                onChange={(e) => setMentionSearch(e.target.value)}
                onKeyDown={handleMentionKeyDown}
                placeholder="搜索文件..."
                className="flex-1 bg-transparent text-sm text-cf-text placeholder:text-cf-text-muted outline-none"
              />
            </div>

            {/* File list */}
            <div className="py-1 max-h-[260px] overflow-y-auto">
              {filteredFiles.length > 0 ? (
                filteredFiles.map((file) => {
                  // Determine icon based on file type
                  const isStructure = file.type === 'structure' || file.name.endsWith('.pdb');
                  const Icon = isStructure ? HelixIcon : FileText;
                  const iconColor = isStructure ? 'text-cf-success/70' : 'text-cf-info/70';

                  return (
                    <button
                      key={file.id}
                      onClick={() => insertFileMention(file)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 text-left",
                        "hover:bg-cf-highlight transition-colors",
                        "focus:outline-none focus:bg-cf-highlight"
                      )}
                    >
                      <Icon className={cn("w-4 h-4 flex-shrink-0", iconColor)} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-cf-text font-medium truncate block">
                          {file.name}
                        </span>
                        {/* Show path for disambiguation */}
                        <span className="text-xs text-cf-text-muted truncate block">
                          {file.path}
                        </span>
                      </div>
                      <span className="text-xs text-cf-text-muted flex-shrink-0">
                        {file.type}
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
          {/* File chips */}
          {mentionedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-3">
              {mentionedFiles.map((file) => {
                const isStructure = file.type === 'structure' || file.name.endsWith('.pdb');
                const Icon = isStructure ? HelixIcon : FileText;
                const iconColor = isStructure ? 'text-cf-success/70' : 'text-cf-info/70';

                return (
                  <div
                    key={file.id}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md",
                      "bg-cf-bg-tertiary border border-cf-border/60",
                      "text-sm text-cf-text",
                      "group hover:border-cf-accent/50 transition-colors"
                    )}
                    title={file.path} // Show full path on hover
                  >
                    <Icon className={cn("w-3.5 h-3.5 flex-shrink-0", iconColor)} />
                    <span className="font-medium truncate max-w-[150px]">{file.name}</span>
                    <button
                      onClick={() => removeFileMention(file.id)}
                      className="ml-0.5 p-0.5 rounded hover:bg-cf-highlight transition-colors"
                    >
                      <X className="w-3 h-3 text-cf-text-secondary hover:text-cf-text" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Textarea */}
          <Textarea
            ref={inputRef}
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={mentionedFiles.length > 0 ? "输入消息..." : placeholder}
            className={cn(
              'w-full bg-transparent border-0 px-4 text-sm text-cf-text',
              'placeholder:text-cf-text-muted resize-none',
              'focus-visible:ring-0 focus-visible:ring-offset-0',
              mentionedFiles.length > 0 ? 'pt-2 pb-3' : 'py-3'
            )}
            rows={2}
            disabled={disabled || isSending}
          />

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-cf-border/50">
            <div className="flex items-center gap-1">
              {/* Hidden file input */}
              {enableFileUpload && (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".fasta,.fa,.pdb,.txt"
                  onChange={handleFileChange}
                  className="hidden"
                />
              )}

              {/* Attach button */}
              {enableFileUpload && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-cf-text-secondary hover:text-cf-text hover:bg-cf-highlight"
                      onClick={handleUploadClick}
                      disabled={disabled || isSending}
                    >
                      <Paperclip className="w-4 h-4" />
                      <span className="sr-only">Upload sequence file</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Upload sequence file (.fasta, .fa, .pdb)</TooltipContent>
                </Tooltip>
              )}

              {/* Mode selector */}
              {enableThinkingMode && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      className="h-8 px-2 text-xs rounded-full bg-cf-accent text-white hover:bg-cf-accent/90 hover:text-white"
                    >
                      {thinkingIntensity === 'high' && <Sparkles className="w-3.5 h-3.5 mr-1" />}
                      {thinkingIntensity === 'medium' && <Scale className="w-3.5 h-3.5 mr-1" />}
                      {thinkingIntensity === 'low' && <Zap className="w-3.5 h-3.5 mr-1" />}
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
              )}
            </div>

            {/* Send/Stop button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-8 w-8",
                    isSending
                      ? "bg-red-500/10 hover:bg-red-500/20 text-red-500"
                      : (value.trim() || mentionedFiles.some(f => f.type === 'fasta' && f.content))
                        ? "bg-cf-highlight hover:bg-cf-highlight-strong text-cf-text"
                        : "text-cf-text-muted"
                  )}
                  onClick={isSending ? onStop : handleSubmit}
                  disabled={!isSending && (!(value.trim() || mentionedFiles.some(f => f.type === 'fasta' && f.content)) || disabled)}
                >
                  {isSending ? (
                    <Square className="w-4 h-4 fill-current" />
                  ) : (
                    <ArrowUp className="w-4 h-4" />
                  )}
                  <span className="sr-only">{isSending ? 'Stop' : 'Send message'}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isSending ? 'Stop generation' : 'Send message'}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* AI Disclaimer */}
        {showDisclaimer && (
          <p className="mt-2 text-xs text-cf-text-muted text-center">
            {disclaimerText}
          </p>
        )}
      </div>
    </TooltipProvider>
  );
}
