"""Repository layer for database access.

This module provides repository classes that abstract database operations.
Repositories handle CRUD operations and business logic for each entity.

Usage:
    from app.repositories import job_repository, user_repository

    # Get job by ID
    job = job_repository.get_by_id(db, job_id)

    # Create new job
    job = job_repository.create(db, job_data)
"""

from app.repositories.job import JobRepository, job_repository
from app.repositories.job_event import JobEventRepository, job_event_repository
from app.repositories.learning_record import (
    LearningRecordRepository,
    learning_record_repository,
)
from app.repositories.structure import StructureRepository, structure_repository
from app.repositories.user import UserRepository, user_repository

__all__ = [
    "UserRepository",
    "user_repository",
    "JobRepository",
    "job_repository",
    "JobEventRepository",
    "job_event_repository",
    "LearningRecordRepository",
    "learning_record_repository",
    "StructureRepository",
    "structure_repository",
]
