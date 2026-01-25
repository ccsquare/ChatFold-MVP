'use client';

import { ChatMessage } from '@/lib/types';
import { cn } from '@/lib/utils';

interface QueryBubbleProps {
  message: ChatMessage;
}

export function QueryBubble({ message }: QueryBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[70%] rounded-cf-lg px-4 py-3',
          isUser
            ? 'bg-cf-accent text-white'
            : 'bg-cf-bg-secondary text-cf-text'
        )}
      >
        <p className="text-sm whitespace-pre-wrap break-words">
          {message.content}
        </p>
      </div>
    </div>
  );
}
