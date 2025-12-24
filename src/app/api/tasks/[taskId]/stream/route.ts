import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateStepEvents, generateMockPDB, generateId } from '@/lib/mock/generators';

// Amino acid pattern (uppercase standard amino acids)
const AMINO_ACID_PATTERN = /^[ACDEFGHIKLMNPQRSTVWY]+$/;

// Task ID pattern
const TASK_ID_PATTERN = /^task_[a-z0-9]+$/;

// Zod schema for sequence
const sequenceSchema = z.string()
  .transform(s => s.toUpperCase().replace(/\s+/g, ''))
  .refine(s => AMINO_ACID_PATTERN.test(s), { message: 'Invalid amino acid sequence' })
  .refine(s => s.length >= 10 && s.length <= 5000, { message: 'Sequence must be 10-5000 amino acids' });

// Store for active streams and their sequences
const taskSequences = new Map<string, string>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, sequence } = body;

    if (taskId && sequence && typeof taskId === 'string' && typeof sequence === 'string') {
      const validatedSequence = sequenceSchema.safeParse(sequence);
      if (validatedSequence.success && TASK_ID_PATTERN.test(taskId)) {
        taskSequences.set(taskId, validatedSequence.data);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  // Validate taskId format
  if (!TASK_ID_PATTERN.test(taskId)) {
    return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
  }

  // Get sequence from query params or stored data
  const { searchParams } = new URL(request.url);
  const rawSequence = searchParams.get('sequence') || taskSequences.get(taskId);

  // Validate and sanitize sequence
  let sequence: string;
  if (rawSequence) {
    const validatedSequence = sequenceSchema.safeParse(rawSequence);
    if (!validatedSequence.success) {
      return NextResponse.json({ error: 'Invalid sequence' }, { status: 400 });
    }
    sequence = validatedSequence.data;
  } else {
    // Default test sequence
    sequence = 'MVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSH';
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const eventGenerator = generateStepEvents(taskId, sequence);
      let structureCount = 0;
      let eventCount = 0;

      for (const event of eventGenerator) {
        eventCount++;
        // Add PDB data to artifacts
        if (event.artifacts) {
          for (const artifact of event.artifacts) {
            structureCount++;
            artifact.pdbData = generateMockPDB(sequence, artifact.structureId, structureCount);
          }
        }

        // Format as SSE
        const eventData = `event: step\ndata: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(eventData));

        // Simulate processing time (500-1200ms between events)
        const delay = 500 + Math.random() * 700;
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // Send done event
      const doneEvent = `event: done\ndata: {"taskId": "${taskId}"}\n\n`;
      controller.enqueue(encoder.encode(doneEvent));

      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
