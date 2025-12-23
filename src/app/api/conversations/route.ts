import { NextRequest, NextResponse } from 'next/server';
import { generateId } from '@/lib/mock/generators';
import { Conversation } from '@/lib/types';

// In-memory store for conversations (mock database)
const conversations = new Map<string, Conversation>();

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const title = body.title || 'New Conversation';

  const conversation: Conversation = {
    id: generateId('conv'),
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
    tasks: [],
    assets: []
  };

  conversations.set(conversation.id, conversation);

  return NextResponse.json({
    conversationId: conversation.id,
    conversation
  });
}

export async function GET() {
  const allConversations = Array.from(conversations.values())
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return NextResponse.json({ conversations: allConversations });
}
