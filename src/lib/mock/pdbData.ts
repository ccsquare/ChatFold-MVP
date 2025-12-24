// Mock PDB data representing a small alpha helix
export const MOCK_ALPHA_HELIX = `HEADER    MOCK PROTEIN ALPHA HELIX
REMARK   4 MOCK GENERATED STRUCTURE FOR DEMONSTRATION
ATOM      1  N   ALA A   1      10.000  10.000  10.000  1.00 50.00           N
ATOM      2  CA  ALA A   1      11.200  10.500  10.300  1.00 50.00           C
ATOM      3  C   ALA A   1      11.800  11.000  11.000  1.00 50.00           C
ATOM      4  O   ALA A   1      11.200  11.800  11.700  1.00 50.00           O
ATOM      5  CB  ALA A   1      11.900   9.400  10.900  1.00 50.00           C
ATOM      6  N   LEU A   2      13.100  10.800  11.100  1.00 55.00           N
ATOM      7  CA  LEU A   2      13.900  11.200  12.200  1.00 55.00           C
ATOM      8  C   LEU A   2      14.500  12.500  11.800  1.00 55.00           C
ATOM      9  O   LEU A   2      14.200  13.000  10.700  1.00 55.00           O
ATOM     10  CB  LEU A   2      15.000  10.200  12.600  1.00 55.00           C
ATOM     11  CG  LEU A   2      14.500   8.800  12.900  1.00 55.00           C
ATOM     12  CD1 LEU A   2      15.600   7.800  13.200  1.00 55.00           C
ATOM     13  CD2 LEU A   2      13.500   8.900  14.000  1.00 55.00           C
ATOM     14  N   VAL A   3      15.400  13.000  12.600  1.00 60.00           N
ATOM     15  CA  VAL A   3      16.100  14.200  12.300  1.00 60.00           C
ATOM     16  C   VAL A   3      17.300  14.400  13.200  1.00 60.00           C
ATOM     17  O   VAL A   3      17.500  13.700  14.200  1.00 60.00           O
ATOM     18  CB  VAL A   3      15.200  15.400  12.400  1.00 60.00           C
ATOM     19  CG1 VAL A   3      15.900  16.600  11.800  1.00 60.00           C
ATOM     20  CG2 VAL A   3      14.000  15.200  11.500  1.00 60.00           C
ATOM     21  N   GLU A   4      18.100  15.400  12.900  1.00 65.00           N
ATOM     22  CA  GLU A   4      19.200  15.800  13.700  1.00 65.00           C
ATOM     23  C   GLU A   4      19.900  17.000  13.100  1.00 65.00           C
ATOM     24  O   GLU A   4      19.600  17.400  11.900  1.00 65.00           O
ATOM     25  CB  GLU A   4      20.200  14.700  13.900  1.00 65.00           C
ATOM     26  CG  GLU A   4      19.600  13.400  14.400  1.00 65.00           C
ATOM     27  CD  GLU A   4      20.600  12.300  14.600  1.00 65.00           C
ATOM     28  OE1 GLU A   4      21.800  12.500  14.400  1.00 65.00           O
ATOM     29  OE2 GLU A   4      20.200  11.200  15.000  1.00 65.00           O
ATOM     30  N   ALA A   5      20.800  17.600  13.900  1.00 70.00           N
ATOM     31  CA  ALA A   5      21.600  18.700  13.400  1.00 70.00           C
ATOM     32  C   ALA A   5      22.800  18.900  14.300  1.00 70.00           C
ATOM     33  O   ALA A   5      23.100  18.100  15.200  1.00 70.00           O
ATOM     34  CB  ALA A   5      20.800  20.000  13.300  1.00 70.00           C
ATOM     35  N   LYS A   6      23.500  19.900  14.000  1.00 75.00           N
ATOM     36  CA  LYS A   6      24.600  20.300  14.800  1.00 75.00           C
ATOM     37  C   LYS A   6      25.400  21.400  14.100  1.00 75.00           C
ATOM     38  O   LYS A   6      25.100  21.800  13.000  1.00 75.00           O
ATOM     39  CB  LYS A   6      25.500  19.100  15.100  1.00 75.00           C
ATOM     40  CG  LYS A   6      24.800  17.900  15.700  1.00 75.00           C
ATOM     41  CD  LYS A   6      25.700  16.700  16.000  1.00 75.00           C
ATOM     42  CE  LYS A   6      25.000  15.500  16.600  1.00 75.00           C
ATOM     43  NZ  LYS A   6      25.900  14.300  16.900  1.00 75.00           N
ATOM     44  N   ARG A   7      26.400  21.900  14.800  1.00 80.00           N
ATOM     45  CA  ARG A   7      27.200  23.000  14.300  1.00 80.00           C
ATOM     46  C   ARG A   7      28.400  23.200  15.200  1.00 80.00           C
ATOM     47  O   ARG A   7      28.700  22.400  16.100  1.00 80.00           O
ATOM     48  CB  ARG A   7      27.700  22.700  12.900  1.00 80.00           C
ATOM     49  CG  ARG A   7      26.600  22.400  11.900  1.00 80.00           C
ATOM     50  CD  ARG A   7      27.100  22.100  10.500  1.00 80.00           C
ATOM     51  NE  ARG A   7      26.000  21.800   9.600  1.00 80.00           N
ATOM     52  CZ  ARG A   7      26.100  21.500   8.300  1.00 80.00           C
ATOM     53  NH1 ARG A   7      27.300  21.400   7.700  1.00 80.00           N
ATOM     54  NH2 ARG A   7      25.000  21.300   7.600  1.00 80.00           N
ATOM     55  N   ALA A   8      29.100  24.300  15.000  1.00 85.00           N
ATOM     56  CA  ALA A   8      30.200  24.700  15.800  1.00 85.00           C
ATOM     57  C   ALA A   8      31.000  25.800  15.100  1.00 85.00           C
ATOM     58  O   ALA A   8      30.700  26.200  14.000  1.00 85.00           O
ATOM     59  CB  ALA A   8      29.700  25.200  17.100  1.00 85.00           C
ATOM     60  N   LEU A   9      32.000  26.300  15.800  1.00 90.00           N
ATOM     61  CA  LEU A   9      32.800  27.400  15.300  1.00 90.00           C
ATOM     62  C   LEU A   9      33.900  27.700  16.300  1.00 90.00           C
ATOM     63  O   LEU A   9      34.200  27.000  17.200  1.00 90.00           O
ATOM     64  CB  LEU A   9      33.400  27.100  13.900  1.00 90.00           C
ATOM     65  CG  LEU A   9      32.400  26.700  12.800  1.00 90.00           C
ATOM     66  CD1 LEU A   9      32.900  26.300  11.400  1.00 90.00           C
ATOM     67  CD2 LEU A   9      31.400  27.800  12.600  1.00 90.00           C
ATOM     68  N   ALA A  10      34.500  28.800  16.100  1.00 95.00           N
ATOM     69  CA  ALA A  10      35.500  29.300  17.000  1.00 95.00           C
ATOM     70  C   ALA A  10      36.300  30.400  16.300  1.00 95.00           C
ATOM     71  O   ALA A  10      36.000  30.800  15.200  1.00 95.00           O
ATOM     72  CB  ALA A  10      34.900  29.800  18.300  1.00 95.00           C
TER      73      ALA A  10
END`;

// Generate variations by adding small random perturbations
export function generateFoldingStep(stepNumber: number, totalSteps: number): string {
  const lines = MOCK_ALPHA_HELIX.split('\n');
  const atomLines = lines.filter(line => line.startsWith('ATOM'));

  // Calculate perturbation factor (smaller as we get closer to final step)
  const perturbFactor = (totalSteps - stepNumber) / totalSteps * 2.0;

  const perturbedLines = atomLines.map(line => {
    const x = parseFloat(line.slice(30, 38));
    const y = parseFloat(line.slice(38, 46));
    const z = parseFloat(line.slice(46, 54));

    // Add random perturbation
    const newX = x + (Math.random() - 0.5) * perturbFactor;
    const newY = y + (Math.random() - 0.5) * perturbFactor;
    const newZ = z + (Math.random() - 0.5) * perturbFactor;

    // Replace coordinates in the line
    return (
      line.slice(0, 30) +
      newX.toFixed(3).padStart(8) +
      newY.toFixed(3).padStart(8) +
      newZ.toFixed(3).padStart(8) +
      line.slice(54)
    );
  });

  return [
    `HEADER    FOLDING STEP ${stepNumber} OF ${totalSteps}`,
    `REMARK   4 SIMULATION STEP ${stepNumber}`,
    ...perturbedLines,
    'TER',
    'END'
  ].join('\n');
}
