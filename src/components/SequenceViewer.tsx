'use client';

import { ScrollArea } from '@/components/ui/scroll-area';

interface SequenceViewerProps {
  content: string;
  label: string;
}

export function SequenceViewer({ content, label }: SequenceViewerProps) {
  return (
    <div className="flex flex-col h-full bg-cf-bg">
      <div className="px-4 py-2 border-b border-cf-border bg-cf-bg-secondary">
        <h2 className="text-sm font-medium text-cf-text">{label}</h2>
      </div>
      <ScrollArea className="flex-1 p-4">
        <pre className="font-mono text-sm text-cf-text whitespace-pre-wrap break-all">
          {content}
        </pre>
      </ScrollArea>
    </div>
  );
}
