"""Repository layer for database access.

This module provides repository classes that abstract database operations.
Repositories handle CRUD operations and business logic for each entity.

Usage:
    from app.repositories import task_repository, user_repository

    # Get task by ID
    task = task_repository.get_by_id(db, task_id)

    # Create new task
    task = task_repository.create(db, task_data)
"""

from app.repositories.learning_record import (
    LearningRecordRepository,
    learning_record_repository,
)
from app.repositories.structure import StructureRepository, structure_repository
from app.repositories.task import TaskRepository, task_repository
from app.repositories.task_event import TaskEventRepository, task_event_repository
from app.repositories.user import UserRepository, user_repository

__all__ = [
    "UserRepository",
    "user_repository",
    "TaskRepository",
    "task_repository",
    "TaskEventRepository",
    "task_event_repository",
    "LearningRecordRepository",
    "learning_record_repository",
    "StructureRepository",
    "structure_repository",
]
