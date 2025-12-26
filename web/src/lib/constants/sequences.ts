// Example protein sequences for testing and demo purposes

export interface ExampleSequence {
  name: string;
  description: string;
  sequence: string;
}

export const EXAMPLE_SEQUENCES: ExampleSequence[] = [
  {
    name: '人类血红蛋白 β 链',
    description: 'Human Hemoglobin Beta Chain (147 aa)',
    sequence: 'MVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSHGSAQVKGHGKKVADALTNAVAHVDDMPNALSALSDLHAHKLRVDPVNFKLLSHCLLVTLAAHLPAEFTPAVHASLDKFLASVSTVLTSKYR'
  },
  {
    name: '胰岛素 A 链',
    description: 'Human Insulin A Chain (21 aa)',
    sequence: 'GIVEQCCTSICSLYQLENYCN'
  },
  {
    name: '绿色荧光蛋白 GFP',
    description: 'Green Fluorescent Protein (238 aa)',
    sequence: 'MSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTFSYGVQCFSRYPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITHGMDELYK'
  },
  {
    name: '短测试肽段',
    description: 'Short Test Peptide (30 aa)',
    sequence: 'MAEGEITTFTALTEKFNLPPGNYKKPKLLY'
  }
];
