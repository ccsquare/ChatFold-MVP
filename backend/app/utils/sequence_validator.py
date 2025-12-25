"""Amino acid sequence validation utilities."""

import re
from typing import Optional


AMINO_ACID_PATTERN = re.compile(r"^[ACDEFGHIKLMNPQRSTVWY]+$")

# Default test sequence (Hemoglobin subunit alpha)
DEFAULT_SEQUENCE = "MVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSH"


class SequenceValidationError(ValueError):
    """Raised when sequence validation fails."""
    pass


def normalize_sequence(sequence: str) -> str:
    """Normalize amino acid sequence.

    Converts to uppercase and removes all whitespace.
    """
    return sequence.upper().replace(" ", "").replace("\n", "").replace("\t", "")


def validate_amino_acid_sequence(
    sequence: str,
    min_length: int = 10,
    max_length: int = 5000
) -> str:
    """Validate and normalize amino acid sequence.

    Args:
        sequence: Raw amino acid sequence
        min_length: Minimum sequence length (default: 10)
        max_length: Maximum sequence length (default: 5000)

    Returns:
        Normalized sequence (uppercase, no whitespace)

    Raises:
        SequenceValidationError: If validation fails
    """
    # Normalize
    normalized = normalize_sequence(sequence)

    if not normalized:
        raise SequenceValidationError("Sequence cannot be empty")

    # Validate amino acid pattern
    if not AMINO_ACID_PATTERN.match(normalized):
        raise SequenceValidationError(
            "Invalid amino acid sequence. Use only standard amino acids (ACDEFGHIKLMNPQRSTVWY)"
        )

    # Validate length
    if len(normalized) < min_length:
        raise SequenceValidationError(
            f"Sequence must be at least {min_length} amino acids long"
        )

    if len(normalized) > max_length:
        raise SequenceValidationError(
            f"Sequence must be at most {max_length} amino acids long"
        )

    return normalized


def validate_sequence_or_none(sequence: Optional[str]) -> Optional[str]:
    """Validate sequence if provided, return None otherwise.

    Args:
        sequence: Optional raw sequence

    Returns:
        Validated sequence or None

    Raises:
        SequenceValidationError: If provided sequence is invalid
    """
    if sequence is None:
        return None
    return validate_amino_acid_sequence(sequence)
