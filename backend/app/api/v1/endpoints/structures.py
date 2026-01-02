"""Structures API endpoint for PDB file serving and caching."""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from app.models.schemas import CachePDBRequest
from app.services.session_store import storage
from app.utils.pdb_generator import generate_mock_pdb
from app.utils.sequence_validator import DEFAULT_SEQUENCE

router = APIRouter(tags=["Structures"])


@router.get("/{structure_id}")
async def get_structure(structure_id: str, sequence: str | None = Query(None)):
    """Download PDB file for a structure.

    If the structure is cached, return from cache.
    Otherwise, generate a mock structure from the sequence.
    """
    # Check cache first
    cached = storage.get_cached_structure(structure_id)
    if cached:
        return Response(
            content=cached,
            media_type="chemical/x-pdb",
            headers={"Content-Disposition": f'attachment; filename="{structure_id}.pdb"'},
        )

    # Generate if we have a sequence
    if sequence:
        # Extract variant from structure_id (e.g., "str_task_123_5" -> 5)
        parts = structure_id.split("_")
        variant = 0
        if parts:
            try:
                variant = int(parts[-1])
            except ValueError:
                # "final" or other non-numeric suffix
                variant = 0

        pdb_data = generate_mock_pdb(sequence, structure_id, variant)
        storage.cache_structure(structure_id, pdb_data)

        return Response(
            content=pdb_data,
            media_type="chemical/x-pdb",
            headers={"Content-Disposition": f'attachment; filename="{structure_id}.pdb"'},
        )

    # Generate with default sequence
    pdb_data = generate_mock_pdb(DEFAULT_SEQUENCE, structure_id, 0)

    return Response(
        content=pdb_data,
        media_type="chemical/x-pdb",
        headers={"Content-Disposition": f'attachment; filename="{structure_id}.pdb"'},
    )


@router.post("/{structure_id}")
async def cache_structure(structure_id: str, request: CachePDBRequest):
    """Cache PDB data for a structure."""
    if not request.pdbData:
        raise HTTPException(status_code=400, detail="pdbData is required")

    storage.cache_structure(structure_id, request.pdbData)

    return {"ok": True, "structureId": structure_id}
