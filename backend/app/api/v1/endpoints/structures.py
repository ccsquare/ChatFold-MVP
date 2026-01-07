"""Structures API endpoint for PDB/CIF file serving and storage.

Supports two storage modes controlled by CHATFOLD_USE_MEMORY_STORE:
- Memory mode: Stores in-memory cache (default for backward compatibility)
- Filesystem mode: Stores on disk with memory cache
"""

import logging

from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)
from fastapi.responses import Response

from app.models.schemas import CachePDBRequest
from app.services.structure_storage import structure_storage
from app.utils.mock_pdb import generate_mock_pdb
from app.utils.sequence_validator import DEFAULT_SEQUENCE

router = APIRouter(tags=["Structures"])


def _get_content_type(filename: str) -> str:
    """Determine content type based on file extension."""
    if filename.endswith(".cif") or filename.endswith(".mmcif"):
        return "chemical/x-cif"
    return "chemical/x-pdb"


def _get_extension(filename: str) -> str:
    """Get file extension, defaulting to .cif."""
    if filename.endswith(".pdb"):
        return ".pdb"
    return ".cif"


@router.get("/{structure_id}")
async def get_structure(
    structure_id: str,
    sequence: str | None = Query(None),
    job_id: str | None = Query(None, alias="jobId"),
    filename: str | None = Query(None),
):
    """Download PDB/CIF file for a structure.

    Retrieval order:
    1. Check memory cache by structure_id
    2. If filesystem mode and job_id provided, check filesystem
    3. Generate mock structure if sequence provided
    4. Generate with default sequence

    Args:
        structure_id: Unique structure identifier
        sequence: Amino acid sequence for mock generation
        job_id: Job ID for filesystem lookup
        filename: Filename for filesystem lookup
    """
    logger.info(
        f"GET /structures/{structure_id}: job_id={job_id}, "
        f"sequence_len={len(sequence) if sequence else 'None'}, filename={filename}"
    )
    # Try to get from storage (checks memory cache, then filesystem if applicable)
    cached = structure_storage.get_structure(
        structure_id,
        job_id=job_id,
        filename=filename,
    )
    if cached:
        ext = _get_extension(filename or structure_id)
        content_type = _get_content_type(filename or structure_id)
        return Response(
            content=cached,
            media_type=content_type,
            headers={"Content-Disposition": f'attachment; filename="{structure_id}{ext}"'},
        )

    # Generate mock if we have a sequence
    if sequence:
        # Extract variant from structure_id (e.g., "str_job_123_5" -> 5)
        parts = structure_id.split("_")
        variant = 0
        if parts:
            try:
                variant = int(parts[-1])
            except ValueError:
                variant = 0

        pdb_data = generate_mock_pdb(sequence, structure_id, variant)

        # Save to storage
        structure_storage.save_structure(
            structure_id,
            pdb_data,
            job_id=job_id,
            filename=filename,
        )

        return Response(
            content=pdb_data,
            media_type="chemical/x-pdb",
            headers={"Content-Disposition": f'attachment; filename="{structure_id}.pdb"'},
        )

    # Generate with default sequence (fallback)
    pdb_data = generate_mock_pdb(DEFAULT_SEQUENCE, structure_id, 0)

    return Response(
        content=pdb_data,
        media_type="chemical/x-pdb",
        headers={"Content-Disposition": f'attachment; filename="{structure_id}.pdb"'},
    )


@router.post("/{structure_id}")
async def cache_structure(
    structure_id: str,
    request: CachePDBRequest,
    job_id: str | None = Query(None, alias="jobId"),
    filename: str | None = Query(None),
):
    """Cache/save PDB/CIF data for a structure.

    In filesystem mode, writes to disk if job_id is provided.
    Always caches in memory for fast access.

    Args:
        structure_id: Unique structure identifier
        request: Request body with pdbData
        job_id: Job ID for filesystem path
        filename: Filename for filesystem storage
    """
    logger.info(
        f"POST /structures/{structure_id}: job_id={job_id}, "
        f"data_len={len(request.pdbData) if request.pdbData else 0}, filename={filename}"
    )
    if not request.pdbData:
        raise HTTPException(status_code=400, detail="pdbData is required")

    file_path = structure_storage.save_structure(
        structure_id,
        request.pdbData,
        job_id=job_id,
        filename=filename,
    )

    return {
        "ok": True,
        "structureId": structure_id,
        "filePath": file_path,
        "storageMode": "memory" if structure_storage.use_memory_mode else "filesystem",
    }


@router.get("/{structure_id}/info")
async def get_structure_info(
    structure_id: str,
    job_id: str | None = Query(None, alias="jobId"),
):
    """Get information about a structure without downloading content.

    Args:
        structure_id: Unique structure identifier
        job_id: Job ID for filesystem lookup
    """
    logger.info(f"GET /structures/{structure_id}/info: job_id={job_id}")
    # Check if structure exists
    exists_in_memory = structure_id in structure_storage._memory_cache

    files = []
    if job_id and not structure_storage.use_memory_mode:
        files = [str(f) for f in structure_storage.list_structures(job_id)]

    return {
        "structureId": structure_id,
        "inMemory": exists_in_memory,
        "storageMode": "memory" if structure_storage.use_memory_mode else "filesystem",
        "files": files,
    }
