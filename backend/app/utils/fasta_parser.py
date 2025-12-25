"""FASTA file parsing utilities."""

from typing import Optional, TypedDict


class ParsedFasta(TypedDict):
    header: str
    sequence: str


def parse_fasta(content: str) -> Optional[ParsedFasta]:
    """Parse FASTA format content and extract header and sequence.

    Valid FASTA format requires:
    - At least one header line starting with '>'
    - Sequence data following the header

    Args:
        content: FASTA format string

    Returns:
        Dictionary with 'header' and 'sequence' keys, or None if invalid
    """
    lines = content.strip().split("\n")
    if not lines:
        return None

    header = ""
    seq_lines: list[str] = []
    has_header = False

    for line in lines:
        trimmed = line.strip()
        if trimmed.startswith(">"):
            header = trimmed[1:]  # Remove '>' prefix
            has_header = True
        elif trimmed and not trimmed.startswith(";"):
            # Remove non-alphabetic characters and convert to uppercase
            cleaned = "".join(c for c in trimmed if c.isalpha()).upper()
            seq_lines.append(cleaned)

    # FASTA format requires a header line starting with '>'
    if not has_header:
        return None

    sequence = "".join(seq_lines)
    if not sequence:
        return None

    return {"header": header, "sequence": sequence}
