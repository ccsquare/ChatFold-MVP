'use client';

import { ScrollArea } from '@/components/ui/scroll-area';

interface SequenceViewerProps {
  content: string;
  label: string;
}

export function SequenceViewer({ content, label }: SequenceViewerProps) {
  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-900">
      <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</h2>
      </div>
      <ScrollArea className="flex-1 p-4">
        <pre className="font-mono text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-all">
          {content}
        </pre>
      </ScrollArea>
    </div>
  );
}
