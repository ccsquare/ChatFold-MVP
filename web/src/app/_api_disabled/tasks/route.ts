import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateId, parseFasta } from '@/lib/mock/generators';
import { Task } from '@/lib/types';

// Amino acid pattern (uppercase standard amino acids)
const AMINO_ACID_PATTERN = /^[ACDEFGHIKLMNPQRSTVWY]+$/;

// Zod schema for task creation
const createTaskSchema = z.object({
  conversationId: z.string().optional(),
  sequence: z.string()
    .transform(s => s.toUpperCase().replace(/\s+/g, ''))
    .refine(
      s => AMINO_ACID_PATTERN.test(s),
      { message: 'Invalid amino acid sequence. Use only standard amino acids (ACDEFGHIKLMNPQRSTVWY)' }
    )
    .refine(
      s => s.length >= 10,
      { message: 'Sequence must be at least 10 amino acids long' }
    )
    .refine(
      s => s.length <= 5000,
      { message: 'Sequence must be at most 5000 amino acids long' }
    )
    .optional(),
  fastaContent: z.string().optional(),
}).refine(
  data => data.sequence || data.fastaContent,
  { message: 'Either sequence or fastaContent must be provided' }
);

// In-memory store for tasks
const tasks = new Map<string, Task>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input with Zod
    const validationResult = createTaskSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.errors.map(e => e.message)
        },
        { status: 400 }
      );
    }

    const { conversationId, sequence: rawSequence, fastaContent } = validationResult.data;

    let sequence = rawSequence;

    // Parse FASTA if provided
    if (fastaContent) {
      const parsed = parseFasta(fastaContent);
      if (!parsed) {
        return NextResponse.json(
          { error: 'Invalid FASTA format' },
          { status: 400 }
        );
      }
      sequence = parsed.sequence.toUpperCase().replace(/\s+/g, '');

      // Validate the extracted sequence
      if (!AMINO_ACID_PATTERN.test(sequence)) {
        return NextResponse.json(
          { error: 'FASTA contains invalid amino acids' },
          { status: 400 }
        );
      }
    }

    if (!sequence) {
      return NextResponse.json(
        { error: 'Sequence is required' },
        { status: 400 }
      );
    }

    const task: Task = {
      id: generateId('task'),
      conversationId: conversationId || generateId('conv'),
      status: 'queued',
      sequence,
      createdAt: Date.now(),
      steps: [],
      structures: []
    };

    tasks.set(task.id, task);

    return NextResponse.json({
      taskId: task.id,
      task
    });
  } catch (error) {
    console.error('Error creating task:', error);
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');

  if (taskId) {
    const task = tasks.get(taskId);
    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ task });
  }

  const allTasks = Array.from(tasks.values())
    .sort((a, b) => b.createdAt - a.createdAt);

  return NextResponse.json({ tasks: allTasks });
}
