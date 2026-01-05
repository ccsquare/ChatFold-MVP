// Mock data generators for protein folding simulation

import { StepEvent, StructureArtifact, StageType, StatusType } from '../types';

// Simple pseudo-random generator for deterministic results
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

// Generate mock PDB data from a sequence
export function generateMockPDB(sequence: string, structureId: string, variant: number = 0): string {
  const random = seededRandom(sequence.length + variant);
  const lines: string[] = [];

  lines.push(`HEADER    PROTEIN STRUCTURE                    ${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`);
  lines.push(`TITLE     MOCK STRUCTURE FOR ${structureId}`);
  lines.push(`REMARK   1 MOCK STRUCTURE GENERATED FOR CHATFOLD MVP`);
  lines.push(`REMARK   2 SEQUENCE LENGTH: ${sequence.length}`);

  let atomNum = 1;
  const atoms = ['N', 'CA', 'C', 'O', 'CB'];

  // Simple helix-like structure
  for (let i = 0; i < sequence.length; i++) {
    const aa = sequence[i];
    const resNum = i + 1;
    const theta = i * 100 * (Math.PI / 180); // 100 degrees per residue
    const rise = 1.5; // Rise per residue (angstroms)
    const radius = 2.3; // Helix radius

    // Add some variation based on variant
    const variation = (random() - 0.5) * 0.5 + variant * 0.1;

    const baseX = radius * Math.cos(theta);
    const baseY = radius * Math.sin(theta);
    const baseZ = i * rise;

    // Backbone atoms
    for (let j = 0; j < (aa === 'G' ? 4 : 5); j++) {
      const atomName = atoms[j];
      const offsetX = (random() - 0.5) * 0.5 + variation;
      const offsetY = (random() - 0.5) * 0.5;
      const offsetZ = (random() - 0.5) * 0.3;

      const x = (baseX + offsetX + j * 0.3).toFixed(3).padStart(8);
      const y = (baseY + offsetY + j * 0.2).toFixed(3).padStart(8);
      const z = (baseZ + offsetZ + j * 0.1).toFixed(3).padStart(8);

      const atomNumStr = atomNum.toString().padStart(5);
      const atomNamePadded = atomName.padEnd(4);
      const resNamePadded = getThreeLetterCode(aa).padEnd(3);
      const resNumStr = resNum.toString().padStart(4);

      lines.push(`ATOM  ${atomNumStr} ${atomNamePadded} ${resNamePadded} A${resNumStr}    ${x}${y}${z}  1.00 ${(random() * 30 + 70).toFixed(2).padStart(6)}           ${atomName[0]}`);
      atomNum++;
    }
  }

  lines.push('END');
  return lines.join('\n');
}

function getThreeLetterCode(aa: string): string {
  const codes: Record<string, string> = {
    'A': 'ALA', 'R': 'ARG', 'N': 'ASN', 'D': 'ASP', 'C': 'CYS',
    'E': 'GLU', 'Q': 'GLN', 'G': 'GLY', 'H': 'HIS', 'I': 'ILE',
    'L': 'LEU', 'K': 'LYS', 'M': 'MET', 'F': 'PHE', 'P': 'PRO',
    'S': 'SER', 'T': 'THR', 'W': 'TRP', 'Y': 'TYR', 'V': 'VAL'
  };
  return codes[aa] || 'UNK';
}

// Valid amino acid characters (standard 20 amino acids)
const VALID_AMINO_ACIDS = /^[ACDEFGHIKLMNPQRSTVWY]+$/i;

// Validate sequence and return invalid characters if any
export function validateSequence(sequence: string): { valid: boolean; invalidChars?: string[] } {
  // Remove whitespace for validation
  const cleanSeq = sequence.replace(/\s/g, '');

  if (VALID_AMINO_ACIDS.test(cleanSeq)) {
    return { valid: true };
  }

  // Find all invalid characters
  const invalidChars = [...new Set(
    cleanSeq.split('').filter(char => !/[ACDEFGHIKLMNPQRSTVWY]/i.test(char))
  )];

  return { valid: false, invalidChars };
}

// Parse FASTA and extract sequence (preserves original characters for validation)
export function parseFasta(content: string): { header: string; sequence: string; rawSequence: string } | null {
  const lines = content.trim().split('\n');
  if (lines.length === 0) return null;

  let header = '';
  const seqLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('>')) {
      header = trimmed.slice(1);
    } else if (trimmed && !trimmed.startsWith(';')) {
      // Keep the raw sequence line (just remove whitespace)
      seqLines.push(trimmed.replace(/\s/g, ''));
    }
  }

  const rawSequence = seqLines.join('');
  if (!rawSequence) return null;

  // Clean sequence (only valid amino acids, uppercase)
  const sequence = rawSequence.replace(/[^A-Za-z]/g, '').toUpperCase();

  return { header, sequence, rawSequence };
}

// Generate step events for a folding job
export function* generateStepEvents(jobId: string, sequence: string): Generator<StepEvent> {
  const stages: { stage: StageType; messages: string[] }[] = [
    {
      stage: 'QUEUED',
      messages: ['Job queued for processing']
    },
    {
      stage: 'MSA',
      messages: [
        'Starting multiple sequence alignment...',
        'Searching sequence databases...',
        'Building MSA profile'
      ]
    },
    {
      stage: 'MODEL',
      messages: [
        'Initializing structure prediction model...',
        'Running neural network inference...',
        'Generating candidate structure 1...',
        'Generating candidate structure 2...',
        'Generating candidate structure 3...',
        'Generating candidate structure 4...',
        'Generating candidate structure 5...'
      ]
    },
    {
      stage: 'RELAX',
      messages: [
        'Applying Amber force field relaxation...',
        'Minimizing energy...'
      ]
    },
    {
      stage: 'QA',
      messages: [
        'Running quality assessment...',
        'Computing pLDDT and PAE metrics'
      ]
    },
    {
      stage: 'DONE',
      messages: ['Structure prediction complete!']
    }
  ];

  let eventNum = 0;
  let overallProgress = 0;
  const totalStages = stages.length - 1; // DONE doesn't count for progress

  for (let stageIdx = 0; stageIdx < stages.length; stageIdx++) {
    const { stage, messages } = stages[stageIdx];
    const messagesCount = messages.length;

    for (let i = 0; i < messagesCount; i++) {
      eventNum++;

      const status: StatusType = stage === 'DONE' ? 'complete' :
        (i === messagesCount - 1 && stageIdx < stages.length - 1 ? 'complete' : 'running');

      const artifacts: StructureArtifact[] = [];

      // Generate structure artifacts at MODEL stage (5 candidates)
      // Messages: 0=init, 1=inference, 2-6=generating candidates
      if (stage === 'MODEL' && i >= 2) {
        const candidateNum = i - 1; // 1, 2, 3, 4, 5
        const structureId = `str_${jobId}_${candidateNum}`;

        artifacts.push({
          type: 'structure',
          structureId,
          label: `candidate-${candidateNum}`,
          filename: `candidate_${candidateNum}.pdb`,
          createdAt: Date.now()
        });
      }

      // Generate final structure at DONE stage
      if (stage === 'DONE') {
        const structureId = `str_${jobId}_final`;

        artifacts.push({
          type: 'structure',
          structureId,
          label: 'final',
          filename: 'final_structure.pdb',
          createdAt: Date.now()
        });
      }

      // Calculate progress
      if (stage !== 'DONE') {
        const stageProgress = (i + 1) / messagesCount;
        overallProgress = Math.min(100, Math.round(
          ((stageIdx + stageProgress) / totalStages) * 100
        ));
      } else {
        overallProgress = 100;
      }

      yield {
        eventId: `evt_${jobId}_${eventNum.toString().padStart(4, '0')}`,
        jobId,
        ts: Date.now(),
        eventType: 'THINKING_TEXT' as const,  // Default to THINKING_TEXT for legacy mock
        stage,
        status,
        progress: overallProgress,
        message: messages[i],
        blockIndex: null,
        artifacts: artifacts.length > 0 ? artifacts : undefined
      };
    }
  }
}

// Re-export generateId from utils for backward compatibility
export { generateId } from '../utils';
