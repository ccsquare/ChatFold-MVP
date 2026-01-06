/**
 * Test sequences for frontend development
 *
 * These sequences are commonly used proteins with known structures,
 * suitable for testing the folding workflow.
 */

// ============================================================================
// Raw Amino Acid Sequences
// ============================================================================

/**
 * Human Hemoglobin Beta Chain (HBB)
 * - Length: 147 amino acids
 * - Function: Oxygen transport in blood
 * - PDB Reference: 1HHO
 */
export const HEMOGLOBIN_BETA_SEQUENCE =
  'MVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSHGSAQVKGHGKKVADALTNAVAHVDDMPNALSALSDLHAHKLRVDPVNFKLLSHCLLVTLAAHLPAEFTPAVHASLDKFLASVSTVLTSKYR';

/**
 * Green Fluorescent Protein (GFP)
 * - Length: 238 amino acids
 * - Function: Bioluminescence marker
 * - PDB Reference: 1EMA
 */
export const GFP_SEQUENCE =
  'MSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTLTYGVQCFSRYPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITLGMDELYK';

// ============================================================================
// FASTA Format Sequences
// ============================================================================

/**
 * Insulin A Chain (Human)
 * - Length: 21 amino acids
 * - Function: Blood glucose regulation
 * - Short sequence, good for quick tests
 */
export const INSULIN_A_FASTA = `>sp|P01308|INS_HUMAN Insulin A chain - Homo sapiens
GIVEQCCTSICSLYQLENYCN`;

/**
 * Ubiquitin (Human)
 * - Length: 76 amino acids
 * - Function: Protein degradation signaling
 * - Well-studied, stable fold
 * - PDB Reference: 1UBQ
 */
export const UBIQUITIN_FASTA = `>sp|P0CG48|UBC_HUMAN Ubiquitin - Homo sapiens
MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG`;

// ============================================================================
// Test Data Summary
// ============================================================================

export const TEST_SEQUENCES = {
  // Short sequences (< 50 aa) - fast testing
  short: {
    name: 'Insulin A Chain',
    sequence: 'GIVEQCCTSICSLYQLENYCN',
    length: 21,
    description: 'Human insulin A chain, good for quick tests',
  },

  // Medium sequences (50-150 aa) - typical use case
  medium: {
    name: 'Ubiquitin',
    sequence:
      'MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG',
    length: 76,
    description: 'Human ubiquitin, well-studied protein',
  },

  // Standard sequences (100-200 aa) - common proteins
  standard: {
    name: 'Hemoglobin Beta',
    sequence: HEMOGLOBIN_BETA_SEQUENCE,
    length: 147,
    description: 'Human hemoglobin beta chain',
  },

  // Long sequences (200+ aa) - stress testing
  long: {
    name: 'GFP',
    sequence: GFP_SEQUENCE,
    length: 238,
    description: 'Green fluorescent protein',
  },
} as const;

// ============================================================================
// Quick Access for Chat Panel Sample Buttons
// ============================================================================

export const SAMPLE_SEQUENCES = [
  {
    label: '人类血红蛋白B链',
    sequence: HEMOGLOBIN_BETA_SEQUENCE,
  },
  {
    label: '胰岛素A链',
    sequence: 'GIVEQCCTSICSLYQLENYCN',
  },
  {
    label: '绿色荧光蛋白 GFP',
    sequence: GFP_SEQUENCE,
  },
  {
    label: '泛素蛋白',
    sequence:
      'MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG',
  },
];
