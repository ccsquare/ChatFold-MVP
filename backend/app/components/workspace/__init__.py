"""Workspace Management Module.

This module provides the core data models and services for organizing
projects, folders, and assets in the ChatFold workspace.

Components:
- models.py: Data models for Project, Folder, Asset, User
- storage.py: In-memory storage for workspace entities
- service.py: Business logic for folder/asset management

Usage:
    from app.components.workspace import (
        # Models
        Project,
        Folder,
        Asset,
        User,
        UserPlan,
        # Storage
        workspace_storage,
        # Service functions
        create_folder,
        get_folder,
        list_folders,
        delete_folder,
        add_folder_input,
        get_current_user,
        DEFAULT_USER,
    )
"""

from app.components.workspace.models import (
    AddFolderInputRequest,
    Asset,
    CreateFolderRequest,
    Folder,
    Project,
    User,
    UserPlan,
)
from app.components.workspace.service import (
    DEFAULT_PROJECT,
    DEFAULT_USER,
    add_folder_input,
    create_folder,
    delete_folder,
    generate_asset_id,
    generate_folder_id,
    generate_folder_name,
    get_current_user,
    get_folder,
    get_user,
    link_folder_conversation,
    list_folder_inputs,
    list_folders,
    update_current_user,
    update_folder,
)
from app.components.workspace.storage import WorkspaceStorage, workspace_storage

__all__ = [
    # Models
    "Project",
    "Folder",
    "Asset",
    "User",
    "UserPlan",
    "CreateFolderRequest",
    "AddFolderInputRequest",
    # Storage
    "workspace_storage",
    "WorkspaceStorage",
    # Service functions
    "create_folder",
    "get_folder",
    "list_folders",
    "delete_folder",
    "update_folder",
    "add_folder_input",
    "list_folder_inputs",
    "link_folder_conversation",
    "get_current_user",
    "get_user",
    "update_current_user",
    "DEFAULT_USER",
    "DEFAULT_PROJECT",
    "generate_folder_id",
    "generate_asset_id",
    "generate_folder_name",
]
