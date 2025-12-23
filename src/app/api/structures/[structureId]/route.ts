import { NextRequest, NextResponse } from 'next/server';
import { generateMockPDB } from '@/lib/mock/generators';

// In-memory cache for generated structures
const structureCache = new Map<string, string>();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ structureId: string }> }
) {
  const { structureId } = await params;
  const { searchParams } = new URL(request.url);
  const sequence = searchParams.get('sequence');

  // Check cache first
  if (structureCache.has(structureId)) {
    return new Response(structureCache.get(structureId), {
      headers: {
        'Content-Type': 'chemical/x-pdb',
        'Content-Disposition': `attachment; filename="${structureId}.pdb"`,
      },
    });
  }

  // Generate if we have sequence
  if (sequence) {
    const variant = parseInt(structureId.split('_').pop() || '0', 10);
    const pdbData = generateMockPDB(sequence, structureId, variant);
    structureCache.set(structureId, pdbData);

    return new Response(pdbData, {
      headers: {
        'Content-Type': 'chemical/x-pdb',
        'Content-Disposition': `attachment; filename="${structureId}.pdb"`,
      },
    });
  }

  // Return default mock structure
  const defaultSequence = 'MVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSH';
  const pdbData = generateMockPDB(defaultSequence, structureId, 0);

  return new Response(pdbData, {
    headers: {
      'Content-Type': 'chemical/x-pdb',
      'Content-Disposition': `attachment; filename="${structureId}.pdb"`,
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ structureId: string }> }
) {
  const { structureId } = await params;
  const body = await request.json();
  const { pdbData } = body;

  if (pdbData) {
    structureCache.set(structureId, pdbData);
    return NextResponse.json({ ok: true, structureId });
  }

  return NextResponse.json(
    { error: 'pdbData is required' },
    { status: 400 }
  );
}
