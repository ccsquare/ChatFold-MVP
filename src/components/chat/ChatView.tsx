'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { ChatMessage, FoldStep } from '@/lib/types';
import { MessageBubble } from './MessageBubble';
import { FoldingTimelineViewer } from './FoldingTimelineViewer';
import { ChatInput } from './ChatInput';
import { cn } from '@/lib/utils';
import { Upload } from 'lucide-react';
import { generateMockFoldSteps } from '@/lib/mock/foldSteps';

// Note: ChatView is an alternative chat view that uses FoldingTimelineViewer
// The main app uses ChatPanel instead

export function ChatView() {
  const {
    activeConversationId,
    conversations,
    addMessage,
    createConversation
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

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSendMessage = useCallback((content: string) => {
    if (!activeConversationId || !content.trim()) return;

    // Add user message
    addMessage(activeConversationId, {
      role: 'user',
      content: content.trim(),
    });

    // Clear input
    setInputValue('');

    // Simulate folding task with mock data
    setTimeout(() => {
      const mockSteps = generateMockFoldSteps(6);
      addMessage(activeConversationId, {
        role: 'assistant',
        content: 'Protein folding simulation complete',
        foldSteps: mockSteps,
      });
    }, 500);
  }, [activeConversationId, addMessage]);

  const handleFileUpload = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    // TODO: Handle file upload
    console.log('Upload files:', files);
  }, []);

  return (
    <div className="h-full flex flex-col bg-cf-bg">
      {isEmpty ? (
        // Empty state: centered input box
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="w-full max-w-3xl space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-4xl font-semibold text-cf-text">
                ChatFold
              </h1>
              <p className="text-cf-text-secondary">
                Upload a protein sequence or start a conversation
              </p>
            </div>

            <div className="w-full">
              <ChatInput
                value={inputValue}
                onChange={setInputValue}
                onSend={handleSendMessage}
                onFileUpload={handleFileUpload}
                placeholder="Describe the protein you want to fold..."
                large
              />
            </div>

            <div className="flex items-center justify-center gap-6 text-sm text-cf-text-muted">
              <button className="flex items-center gap-2 hover:text-cf-text-secondary transition-colors">
                <Upload className="w-4 h-4" />
                Upload FASTA
              </button>
            </div>
          </div>
        </div>
      ) : (
        // Active state: message list + fixed input
        <>
          {/* Messages area */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto"
          >
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
                    <div className="text-cf-text-secondary">
                      {message.content}
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Fixed input at bottom */}
          <div className="flex-shrink-0 border-t border-cf-border bg-cf-bg-secondary">
            <div className="max-w-4xl mx-auto px-4 py-4">
              <ChatInput
                value={inputValue}
                onChange={setInputValue}
                onSend={handleSendMessage}
                onFileUpload={handleFileUpload}
                placeholder="Send a message..."
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
