'use client';

import { useRef, KeyboardEvent } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Upload, Send, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (value: string) => void;
  onFileUpload?: (files: FileList | null) => void;
  placeholder?: string;
  large?: boolean;
  disabled?: boolean;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onFileUpload,
  placeholder = 'Type a message...',
  large = false,
  disabled = false,
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) {
        onSend(value);
      }
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFileUpload?.(e.target.files);
    // Reset input
    e.target.value = '';
  };

  const handleClear = () => {
    onChange('');
  };

  return (
    <div className="relative">
      <div
        className={cn(
          'flex items-end gap-2 rounded-cf-lg border border-cf-border bg-cf-bg-input p-2',
          large && 'p-3',
          disabled && 'opacity-50 pointer-events-none'
        )}
      >
        {/* Upload button */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'flex-shrink-0 text-cf-text-secondary hover:text-cf-text',
            large ? 'h-10 w-10' : 'h-8 w-8'
          )}
          onClick={handleUploadClick}
          disabled={disabled}
        >
          <Upload className={large ? 'w-5 h-5' : 'w-4 h-4'} />
        </Button>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".fasta,.fa,.pdb,.cif"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Text input */}
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            'flex-1 min-h-0 resize-none border-0 bg-transparent px-0 py-2',
            'focus-visible:ring-0 focus-visible:ring-offset-0',
            'text-cf-text placeholder:text-cf-text-muted',
            large ? 'text-base' : 'text-sm'
          )}
          rows={large ? 3 : 1}
          disabled={disabled}
        />

        {/* Clear button (only show when there's text) */}
        {value && (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'flex-shrink-0 text-cf-text-secondary hover:text-cf-text',
              large ? 'h-10 w-10' : 'h-8 w-8'
            )}
            onClick={handleClear}
          >
            <X className={large ? 'w-5 h-5' : 'w-4 h-4'} />
          </Button>
        )}

        {/* Send button */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'flex-shrink-0',
            large ? 'h-10 w-10' : 'h-8 w-8',
            value.trim()
              ? 'bg-cf-accent text-white hover:bg-cf-accent/90'
              : 'text-cf-text-muted'
          )}
          onClick={() => value.trim() && onSend(value)}
          disabled={!value.trim() || disabled}
        >
          <Send className={large ? 'w-5 h-5' : 'w-4 h-4'} />
        </Button>
      </div>

      {/* Helper text for large input */}
      {large && (
        <p className="mt-2 text-xs text-cf-text-muted text-center">
          Press Enter to send, Shift+Enter for new line
        </p>
      )}
    </div>
  );
}
