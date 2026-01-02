import { describe, it, expect } from 'vitest';
import { parseFasta, generateMockPDB, generateStepEvents, generateId } from './generators';

describe('parseFasta', () => {
  it('should parse valid FASTA format', () => {
    const fasta = `>test_protein
MVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSH`;

    const result = parseFasta(fasta);

    expect(result).not.toBeNull();
    expect(result?.header).toBe('test_protein');
    expect(result?.sequence).toBe('MVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSH');
  });

  it('should handle multi-line sequences', () => {
    const fasta = `>protein
MVLSPADKT
NVKAAWGKV
GAHAGEYGA`;

    const result = parseFasta(fasta);

    expect(result).not.toBeNull();
    expect(result?.sequence).toBe('MVLSPADKTNVKAAWGKVGAHAGEYGA');
  });

  it('should ignore comment lines', () => {
    const fasta = `>protein
;this is a comment
MVLSPADKT`;

    const result = parseFasta(fasta);

    expect(result).not.toBeNull();
    expect(result?.sequence).toBe('MVLSPADKT');
  });

  it('should return null for empty content', () => {
    const result = parseFasta('');
    expect(result).toBeNull();
  });

  it('should return null for content without sequence', () => {
    const result = parseFasta('>header only');
    expect(result).toBeNull();
  });

  it('should strip non-letter characters from sequence', () => {
    const fasta = `>protein
MVL123SPADKT`;

    const result = parseFasta(fasta);

    expect(result?.sequence).toBe('MVLSPADKT');
  });

  it('should convert sequence to uppercase', () => {
    const fasta = `>protein
mvlspadkt`;

    const result = parseFasta(fasta);

    expect(result?.sequence).toBe('MVLSPADKT');
  });
});

describe('generateMockPDB', () => {
  it('should generate valid PDB content', () => {
    const sequence = 'MVLSPADKT';
    const pdb = generateMockPDB(sequence, 'test_structure');

    expect(pdb).toContain('HEADER');
    expect(pdb).toContain('TITLE');
    expect(pdb).toContain('ATOM');
    expect(pdb).toContain('END');
  });

  it('should include correct sequence length in remarks', () => {
    const sequence = 'MVLSPADKTNVKAAWGKV';
    const pdb = generateMockPDB(sequence, 'test');

    expect(pdb).toContain(`SEQUENCE LENGTH: ${sequence.length}`);
  });

  it('should generate different structures for different variants', () => {
    const sequence = 'MVLSPADKT';
    const pdb1 = generateMockPDB(sequence, 'test', 0);
    const pdb2 = generateMockPDB(sequence, 'test', 1);

    // The ATOM coordinates should be different due to variant
    expect(pdb1).not.toBe(pdb2);
  });

  it('should generate atoms for each residue', () => {
    const sequence = 'MVL';
    const pdb = generateMockPDB(sequence, 'test');

    // Each residue should have multiple atoms (5 atoms each for M, V, L)
    const atomLines = pdb.split('\n').filter(line => line.startsWith('ATOM'));
    expect(atomLines.length).toBeGreaterThan(0);
    expect(atomLines.length).toBe(15); // 5 atoms each (glycine G would have 4)
  });
});

describe('generateStepEvents', () => {
  it('should generate events for all stages', () => {
    const events = Array.from(generateStepEvents('job_1', 'MVLSPADKT'));

    const stages = new Set(events.map(e => e.stage));
    expect(stages).toContain('QUEUED');
    expect(stages).toContain('MSA');
    expect(stages).toContain('MODEL');
    expect(stages).toContain('RELAX');
    expect(stages).toContain('QA');
    expect(stages).toContain('DONE');
  });

  it('should generate unique event IDs', () => {
    const events = Array.from(generateStepEvents('job_1', 'MVLSPADKT'));

    const ids = events.map(e => e.eventId);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should include job ID in all events', () => {
    const jobId = 'job_test123';
    const events = Array.from(generateStepEvents(jobId, 'MVLSPADKT'));

    events.forEach(event => {
      expect(event.jobId).toBe(jobId);
    });
  });

  it('should generate structure artifacts at MODEL and DONE stages', () => {
    const events = Array.from(generateStepEvents('job_1', 'MVLSPADKT'));

    const artifactEvents = events.filter(e => e.artifacts && e.artifacts.length > 0);
    expect(artifactEvents.length).toBeGreaterThan(0);

    // Should have at least one final structure
    const finalStructure = artifactEvents.find(e =>
      e.artifacts?.some(a => a.label === 'final')
    );
    expect(finalStructure).toBeDefined();
  });

  it('should reach 100% progress at DONE stage', () => {
    const events = Array.from(generateStepEvents('job_1', 'MVLSPADKT'));

    const doneEvent = events.find(e => e.stage === 'DONE');
    expect(doneEvent?.progress).toBe(100);
  });

  it('should progress monotonically', () => {
    const events = Array.from(generateStepEvents('job_1', 'MVLSPADKT'));

    let lastProgress = 0;
    events.forEach(event => {
      expect(event.progress).toBeGreaterThanOrEqual(lastProgress);
      lastProgress = event.progress;
    });
  });
});

describe('generateId', () => {
  it('should generate unique IDs', () => {
    const ids = new Set<string>();

    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }

    expect(ids.size).toBe(100);
  });

  it('should include prefix when provided', () => {
    const id = generateId('job');
    expect(id).toMatch(/^job_/);
  });

  it('should work without prefix', () => {
    const id = generateId();
    expect(id).not.toContain('_');
    expect(id.length).toBeGreaterThan(0);
  });
});
