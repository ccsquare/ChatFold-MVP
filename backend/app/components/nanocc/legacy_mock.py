"""Legacy mock protein folding simulation service.

This is the original mock folding service with hardcoded stage messages.
Kept for backward compatibility when USE_NANOCC=false.

For CoT-based mock, use the main mock.py which reads from JSONL files.
"""

import random
from collections.abc import Generator

from app.components.workspace.models import StructureArtifact
from app.utils import generate_mock_pdb, get_timestamp_ms
from .job import JobEvent, StageType, StatusType

# Chain-of-thought templates for each candidate structure
COT_TEMPLATES = {
    1: [
        "Analyzing sequence hydrophobicity profile and predicting initial secondary structure elements.",
        "Initial fold based on sequence homology; detected potential α-helix at positions 15-28.",
        "Starting structure prediction using MSA-derived coevolutionary signals.",
    ],
    2: [
        "Refining backbone angles based on Ramachandran plot analysis; correcting outliers in loop regions.",
        "Detected disulfide bond potential between Cys residues; applying distance constraints.",
        "Optimizing hydrogen bond network in β-sheet region to improve structural stability.",
    ],
    3: [
        "Adjusting side-chain conformations using rotamer library; resolving steric clashes.",
        "Identified buried polar residue; reorienting to form internal hydrogen bond.",
        "Refining loop conformation at positions 45-52 using fragment replacement.",
    ],
    4: [
        "Energy minimization reveals improved packing in hydrophobic core region.",
        "Applying salt-bridge constraints between Lys and Glu pairs to stabilize fold.",
        "Fine-tuning tertiary contacts based on predicted contact map from attention weights.",
    ],
    5: [
        "Final backbone optimization; all φ/ψ angles within favored Ramachandran regions.",
        "Validating hydrogen bond geometry and side-chain rotamer quality.",
        "Converged structure with optimal pLDDT confidence scores across all domains.",
    ],
    "final": [
        "Structure refinement complete. Final model shows stable fold with high confidence.",
        "All quality metrics passed. Structure ready for downstream analysis.",
        "Optimization converged with pLDDT > 85 across 92% of residues.",
    ],
}


def generate_step_events(job_id: str, sequence: str) -> Generator[JobEvent, None, None]:
    """Generate mock folding job events.

    Simulates the protein folding pipeline with realistic stages:
    QUEUED -> MSA -> MODEL -> RELAX -> QA -> DONE

    Yields JobEvent objects with optional structure artifacts.
    """
    stages: list[dict] = [
        {"stage": StageType.QUEUED, "messages": ["Job queued for processing"]},
        {
            "stage": StageType.MSA,
            "messages": [
                "Starting multiple sequence alignment...",
                "Searching sequence databases...",
                "Building MSA profile",
            ],
        },
        {
            "stage": StageType.MODEL,
            "messages": [
                "Initializing structure prediction model...",
                "Running neural network inference...",
                "Generating candidate structure 1...",
                "Generating candidate structure 2...",
                "Generating candidate structure 3...",
                "Generating candidate structure 4...",
                "Generating candidate structure 5...",
            ],
        },
        {"stage": StageType.RELAX, "messages": ["Applying Amber force field relaxation...", "Minimizing energy..."]},
        {"stage": StageType.QA, "messages": ["Running quality assessment...", "Computing pLDDT and PAE metrics"]},
        {"stage": StageType.DONE, "messages": ["Structure prediction complete!"]},
    ]

    event_num = 0
    overall_progress = 0
    total_stages = len(stages) - 1  # DONE doesn't count for progress
    structure_count = 0

    for stage_idx, stage_data in enumerate(stages):
        stage = stage_data["stage"]
        messages = stage_data["messages"]
        messages_count = len(messages)

        for i, message in enumerate(messages):
            event_num += 1

            # Determine status
            if stage == StageType.DONE:
                status = StatusType.complete
            elif i == messages_count - 1 and stage_idx < len(stages) - 1:
                status = StatusType.complete
            else:
                status = StatusType.running

            artifacts: list[StructureArtifact] = []

            # Generate structure artifacts at MODEL stage (5 candidates)
            # Messages: 0=init, 1=inference, 2-6=generating candidates
            if stage == StageType.MODEL and i >= 2:
                structure_count += 1
                candidate_num = i - 1  # 1, 2, 3, 4, 5
                structure_id = f"str_{job_id}_{candidate_num}"

                # Generate PDB data for this candidate
                pdb_data = generate_mock_pdb(sequence, structure_id, structure_count)

                # Select a random CoT from templates for this candidate
                cot_options = COT_TEMPLATES.get(candidate_num, COT_TEMPLATES[1])
                cot = random.choice(cot_options)

                artifacts.append(
                    StructureArtifact(
                        type="structure",
                        structureId=structure_id,
                        label=f"candidate-{candidate_num}",
                        filename=f"candidate_{candidate_num}.pdb",
                        pdbData=pdb_data,
                        createdAt=get_timestamp_ms(),
                        cot=cot,
                    )
                )

            # Generate final structure at DONE stage
            if stage == StageType.DONE:
                structure_count += 1
                structure_id = f"str_{job_id}_final"

                # Generate PDB data for final structure
                pdb_data = generate_mock_pdb(sequence, structure_id, structure_count)

                # Select a random CoT from final templates
                cot = random.choice(COT_TEMPLATES["final"])

                artifacts.append(
                    StructureArtifact(
                        type="structure",
                        structureId=structure_id,
                        label="final",
                        filename="final_structure.pdb",
                        pdbData=pdb_data,
                        createdAt=get_timestamp_ms(),
                        cot=cot,
                    )
                )

            # Calculate progress
            if stage != StageType.DONE:
                stage_progress = (i + 1) / messages_count
                overall_progress = min(100, round(((stage_idx + stage_progress) / total_stages) * 100))
            else:
                overall_progress = 100

            yield JobEvent(
                eventId=f"evt_{job_id}_{event_num:04d}",
                jobId=job_id,
                ts=get_timestamp_ms(),
                stage=stage,
                status=status,
                progress=overall_progress,
                message=message,
                artifacts=artifacts if artifacts else None,
            )
