"""Tests for Settings path methods.

Test cases from:
- TC-15.1: Workspace root paths
- TC-15.2: User/project path generation
- TC-15.3: MVP convenience methods
"""


from app.settings import DEFAULT_PROJECT_ID, DEFAULT_USER_ID, settings


class TestSettingsWorkspacePaths:
    """TC-15.1: Workspace root paths."""

    def test_workspace_root_local_dev(self):
        """local-dev environment returns correct path."""
        root = settings.get_workspace_root()
        assert root.name == "chatfold-workspace"

    def test_outputs_root(self):
        """outputs directory path is correct."""
        outputs = settings.get_outputs_root()
        assert outputs.name == "outputs"
        assert outputs.parent == settings.get_workspace_root()

    def test_logs_root(self):
        """logs directory path is correct."""
        logs = settings.get_logs_root()
        assert logs.name == "logs"
        assert logs.parent == settings.get_workspace_root()

    def test_output_path_with_subpaths(self):
        """get_output_path handles subpaths correctly."""
        path = settings.get_output_path("subdir", "file.txt")
        assert "subdir" in str(path)
        assert str(path).endswith("file.txt")


class TestSettingsUserProjectPaths:
    """TC-15.2: User/project path generation."""

    def test_get_user_path(self):
        """User path format is correct."""
        path = settings.get_user_path("u001")
        assert path == settings.get_outputs_root() / "users" / "u001"

    def test_get_user_path_different_ids(self):
        """User paths are unique per user_id."""
        path1 = settings.get_user_path("user_a")
        path2 = settings.get_user_path("user_b")
        assert path1 != path2
        assert "user_a" in str(path1)
        assert "user_b" in str(path2)

    def test_get_project_path(self):
        """Project path format is correct."""
        path = settings.get_project_path("u001", "p001")
        assert path == settings.get_outputs_root() / "users" / "u001" / "projects" / "p001"

    def test_get_project_path_hierarchy(self):
        """Project path is under user path."""
        user_path = settings.get_user_path("u001")
        project_path = settings.get_project_path("u001", "p001")
        assert str(project_path).startswith(str(user_path))

    def test_get_folder_path(self):
        """Folder path format is correct."""
        path = settings.get_folder_path("u001", "p001", "f001")
        assert "folders" in str(path)
        assert "f001" in str(path)
        # Folder is under project
        project_path = settings.get_project_path("u001", "p001")
        assert str(path).startswith(str(project_path))

    def test_get_uploads_path(self):
        """Upload path format is correct."""
        path = settings.get_uploads_path("u001", "p001", "f001")
        assert "uploads" in str(path)
        assert "f001" in str(path)
        # Uploads is under project
        project_path = settings.get_project_path("u001", "p001")
        assert str(path).startswith(str(project_path))

    def test_get_structures_path(self):
        """Structure path format is correct."""
        path = settings.get_structures_path("u001", "p001", "job001")
        assert "structures" in str(path)
        assert "job001" in str(path)
        # Structures is under project
        project_path = settings.get_project_path("u001", "p001")
        assert str(path).startswith(str(project_path))

    def test_get_jobs_path(self):
        """Job path format is correct."""
        path = settings.get_jobs_path("u001", "job001")
        assert "jobs" in str(path)
        assert "job001" in str(path)
        # Jobs is under user (not project)
        user_path = settings.get_user_path("u001")
        assert str(path).startswith(str(user_path))
        # Path structure: users/u001/jobs/job001 (no /projects/ in between)
        # Get the path relative to outputs root to check structure
        outputs_root = settings.get_outputs_root()
        relative_path = str(path.relative_to(outputs_root))
        assert relative_path == "users/u001/jobs/job001"


class TestSettingsMVPPaths:
    """TC-15.3: MVP convenience methods."""

    def test_default_user_path(self):
        """Default user path uses DEFAULT_USER_ID."""
        path = settings.get_default_user_path()
        assert DEFAULT_USER_ID in str(path)
        assert path == settings.get_user_path(DEFAULT_USER_ID)

    def test_default_project_path(self):
        """Default project path uses DEFAULT_USER_ID and DEFAULT_PROJECT_ID."""
        path = settings.get_default_project_path()
        assert DEFAULT_USER_ID in str(path)
        assert DEFAULT_PROJECT_ID in str(path)
        assert path == settings.get_project_path(DEFAULT_USER_ID, DEFAULT_PROJECT_ID)

    def test_get_default_uploads_path(self):
        """Default upload path uses user_default and project_default."""
        path = settings.get_default_uploads_path("f001")
        assert DEFAULT_USER_ID in str(path)
        assert DEFAULT_PROJECT_ID in str(path)
        assert "f001" in str(path)
        # Should be equivalent to full path method
        expected = settings.get_uploads_path(DEFAULT_USER_ID, DEFAULT_PROJECT_ID, "f001")
        assert path == expected

    def test_get_default_structures_path(self):
        """Default structure path uses user_default and project_default."""
        path = settings.get_default_structures_path("job001")
        assert DEFAULT_USER_ID in str(path)
        assert DEFAULT_PROJECT_ID in str(path)
        assert "job001" in str(path)
        # Should be equivalent to full path method
        expected = settings.get_structures_path(DEFAULT_USER_ID, DEFAULT_PROJECT_ID, "job001")
        assert path == expected

    def test_get_default_jobs_path(self):
        """Default job path uses user_default."""
        path = settings.get_default_jobs_path("job001")
        assert DEFAULT_USER_ID in str(path)
        assert "job001" in str(path)
        # Should be equivalent to full path method
        expected = settings.get_jobs_path(DEFAULT_USER_ID, "job001")
        assert path == expected


class TestSettingsLegacyPaths:
    """Test legacy path methods for backward compatibility."""

    def test_structures_path_legacy(self):
        """Legacy structure path works without user/project."""
        path = settings.get_structures_path_legacy()
        assert "structures" in str(path)
        assert path == settings.get_output_path("structures")

    def test_structures_path_legacy_with_subpath(self):
        """Legacy structure path accepts subpaths."""
        path = settings.get_structures_path_legacy("job_123.pdb")
        assert str(path).endswith("job_123.pdb")

    def test_jobs_path_legacy(self):
        """Legacy jobs path works without user."""
        path = settings.get_jobs_path_legacy()
        assert "jobs" in str(path)
        assert path == settings.get_output_path("jobs")

    def test_jobs_path_legacy_with_subpath(self):
        """Legacy jobs path accepts subpaths."""
        path = settings.get_jobs_path_legacy("job_123")
        assert "job_123" in str(path)

    def test_uploads_path_legacy(self):
        """Legacy uploads path works without user/project/folder."""
        path = settings.get_uploads_path_legacy()
        assert "uploads" in str(path)
        assert path == settings.get_output_path("uploads")
