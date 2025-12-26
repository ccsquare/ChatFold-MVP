'use client';

// Re-export ChatInputBase as ChatInput for backward compatibility
// Also re-export types for convenience

export { ChatInputBase as ChatInput } from './ChatInputBase';
export type { ChatInputBaseProps as ChatInputProps, ThinkingIntensity } from './ChatInputBase';

// Re-export MentionableFile from types for backward compatibility
export type { MentionableFile } from '@/lib/types';
