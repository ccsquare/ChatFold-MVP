"""Mock PDB file generation utilities."""

import math
from datetime import datetime

# Amino acid one-letter to three-letter code mapping
AA_CODES = {
    "A": "ALA",
    "R": "ARG",
    "N": "ASN",
    "D": "ASP",
    "C": "CYS",
    "E": "GLU",
    "Q": "GLN",
    "G": "GLY",
    "H": "HIS",
    "I": "ILE",
    "L": "LEU",
    "K": "LYS",
    "M": "MET",
    "F": "PHE",
    "P": "PRO",
    "S": "SER",
    "T": "THR",
    "W": "TRP",
    "Y": "TYR",
    "V": "VAL",
}


def _seeded_random(seed: int):
    """Simple pseudo-random generator for deterministic results."""

    def random():
        nonlocal seed
        seed = (seed * 9301 + 49297) % 233280
        return seed / 233280

    return random


def generate_mock_pdb(sequence: str, structure_id: str, variant: int = 0) -> str:
    """Generate a mock PDB file from an amino acid sequence.

    Creates a simple alpha-helix-like structure for visualization purposes.

    Args:
        sequence: Amino acid sequence (one-letter codes)
        structure_id: Unique identifier for the structure
        variant: Variant number for slightly different structures

    Returns:
        PDB format string
    """
    random = _seeded_random(len(sequence) + variant)
    lines: list[str] = []

    # Header
    date_str = datetime.now().strftime("%d-%b-%y").upper()
    lines.append(f"HEADER    PROTEIN STRUCTURE                    {date_str}")
    lines.append(f"TITLE     MOCK STRUCTURE FOR {structure_id}")
    lines.append("REMARK   1 MOCK STRUCTURE GENERATED FOR CHATFOLD MVP")
    lines.append(f"REMARK   2 SEQUENCE LENGTH: {len(sequence)}")

    atom_num = 1
    atoms = ["N", "CA", "C", "O", "CB"]

    # Generate helix-like structure
    for i, aa in enumerate(sequence):
        res_num = i + 1
        theta = i * 100 * (math.pi / 180)  # 100 degrees per residue
        rise = 1.5  # Rise per residue (angstroms)
        radius = 2.3  # Helix radius

        # Add variation based on variant
        variation = (random() - 0.5) * 0.5 + variant * 0.1

        base_x = radius * math.cos(theta)
        base_y = radius * math.sin(theta)
        base_z = i * rise

        # Number of atoms: Glycine has 4 (no CB), others have 5
        num_atoms = 4 if aa == "G" else 5

        for j in range(num_atoms):
            atom_name = atoms[j]
            offset_x = (random() - 0.5) * 0.5 + variation
            offset_y = (random() - 0.5) * 0.5
            offset_z = (random() - 0.5) * 0.3

            x = base_x + offset_x + j * 0.3
            y = base_y + offset_y + j * 0.2
            z = base_z + offset_z + j * 0.1

            # B-factor (temperature factor)
            b_factor = random() * 30 + 70

            # Get three-letter code
            res_name = AA_CODES.get(aa, "UNK")

            # Format ATOM record (PDB format)
            # ATOM serial name altLoc resName chainID resSeq iCode x y z occupancy tempFactor element
            line = (
                f"ATOM  {atom_num:5d} {atom_name:<4s} {res_name:>3s} A{res_num:4d}    "
                f"{x:8.3f}{y:8.3f}{z:8.3f}  1.00{b_factor:6.2f}           {atom_name[0]}"
            )
            lines.append(line)
            atom_num += 1

    lines.append("END")
    return "\n".join(lines)
