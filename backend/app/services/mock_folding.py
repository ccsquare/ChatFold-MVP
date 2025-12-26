"""Mock protein folding simulation service."""

import random
import time
from collections.abc import Generator

from ..models.schemas import (
    StageType,
    StatusType,
    StepEvent,
    StructureArtifact,
    StructureMetrics,
)
from ..utils.pdb_generator import generate_mock_pdb


def generate_step_events(task_id: str, sequence: str) -> Generator[StepEvent, None, None]:
    """Generate mock folding step events.

    Simulates the protein folding pipeline with realistic stages:
    QUEUED -> MSA -> MODEL -> RELAX -> QA -> DONE

    Yields StepEvent objects with optional structure artifacts.
    """
    stages: list[dict] = [
        {"stage": StageType.QUEUED, "messages": ["Task queued for processing"]},
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
                structure_id = f"str_{task_id}_{candidate_num}"

                # Gradually improving quality as candidates progress
                base_quality = 60 + candidate_num * 5  # 65, 70, 75, 80, 85
                plddt = base_quality + random.random() * 10
                pae = 20 - candidate_num * 2.5 + random.random() * 5  # Decreasing error
                constraint = 50 + candidate_num * 8 + random.random() * 10  # Increasing satisfaction

                # Generate PDB data for this candidate
                pdb_data = generate_mock_pdb(sequence, structure_id, structure_count)

                artifacts.append(
                    StructureArtifact(
                        type="structure",
                        structureId=structure_id,
                        label=f"candidate-{candidate_num}",
                        filename=f"candidate_{candidate_num}.pdb",
                        metrics=StructureMetrics(
                            plddtAvg=round(plddt, 1), paeAvg=round(pae, 1), constraint=round(min(100, constraint), 1)
                        ),
                        pdbData=pdb_data,
                        createdAt=int(time.time() * 1000),
                    )
                )

            # Generate final structure at DONE stage (best quality)
            if stage == StageType.DONE:
                structure_count += 1
                structure_id = f"str_{task_id}_final"
                plddt = 85 + random.random() * 10  # 85-95
                pae = 3 + random.random() * 5  # 3-8
                constraint = 90 + random.random() * 10  # 90-100

                # Generate PDB data for final structure
                pdb_data = generate_mock_pdb(sequence, structure_id, structure_count)

                artifacts.append(
                    StructureArtifact(
                        type="structure",
                        structureId=structure_id,
                        label="final",
                        filename="final_structure.pdb",
                        metrics=StructureMetrics(
                            plddtAvg=round(plddt, 1), paeAvg=round(pae, 1), constraint=round(min(100, constraint), 1)
                        ),
                        pdbData=pdb_data,
                        createdAt=int(time.time() * 1000),
                    )
                )

            # Calculate progress
            if stage != StageType.DONE:
                stage_progress = (i + 1) / messages_count
                overall_progress = min(100, round(((stage_idx + stage_progress) / total_stages) * 100))
            else:
                overall_progress = 100

            yield StepEvent(
                eventId=f"evt_{task_id}_{event_num:04d}",
                taskId=task_id,
                ts=int(time.time() * 1000),
                stage=stage,
                status=status,
                progress=overall_progress,
                message=message,
                artifacts=artifacts if artifacts else None,
            )
