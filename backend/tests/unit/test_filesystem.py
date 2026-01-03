"""Tests for FileSystemService.

Test cases from:
- TC-13.4: FileSystem directory initialization
- TC-13.5: Job artifacts storage
- TC-13.6: Structure file storage
"""


from app.services.filesystem import FileSystemService
from app.settings import DEFAULT_PROJECT_ID, DEFAULT_USER_ID, settings


class TestFileSystemServiceInit:
    """TC-13.4: FileSystem directory initialization."""

    def test_initialize_creates_base_directories(self):
        """Initialization creates outputs and logs directories."""
        service = FileSystemService()
        service.initialize()

        assert service.is_initialized
        assert settings.get_outputs_root().exists()
        assert settings.get_logs_root().exists()

    def test_initialize_creates_default_user_project(self):
        """Initialization creates default user and project directories."""
        service = FileSystemService()
        service.initialize()

        default_user = settings.get_user_path(DEFAULT_USER_ID)
        default_project = settings.get_project_path(DEFAULT_USER_ID, DEFAULT_PROJECT_ID)

        assert default_user.exists()
        assert default_project.exists()

    def test_initialize_creates_subdirectories(self):
        """Initialization creates uploads, structures, jobs subdirectories."""
        service = FileSystemService()
        service.initialize()

        project = settings.get_project_path(DEFAULT_USER_ID, DEFAULT_PROJECT_ID)
        user = settings.get_user_path(DEFAULT_USER_ID)

        assert (project / "uploads").exists()
        assert (project / "structures").exists()
        assert (project / "folders").exists()
        assert (user / "jobs").exists()

    def test_initialize_creates_shared_directories(self):
        """Initialization creates shared templates and cache directories."""
        service = FileSystemService()
        service.initialize()

        shared = settings.get_outputs_root() / "shared"
        assert (shared / "templates").exists()
        assert (shared / "cache").exists()

    def test_initialize_is_idempotent(self):
        """Multiple initialize calls don't cause errors."""
        service = FileSystemService()
        service.initialize()
        service.initialize()  # Should not raise
        assert service.is_initialized


class TestFileSystemServiceDirs:
    """Test directory management methods."""

    def test_ensure_user_dir(self):
        """ensure_user_dir creates and returns user directory."""
        service = FileSystemService()
        path = service.ensure_user_dir("test_user_123")

        assert path.exists()
        assert "test_user_123" in str(path)

    def test_ensure_project_dir(self):
        """ensure_project_dir creates and returns project directory."""
        service = FileSystemService()
        path = service.ensure_project_dir("u001", "p001")

        assert path.exists()
        assert "u001" in str(path)
        assert "p001" in str(path)

    def test_ensure_folder_dir(self):
        """ensure_folder_dir creates and returns folder directory."""
        service = FileSystemService()
        path = service.ensure_folder_dir("u001", "p001", "f001")

        assert path.exists()
        assert "folders" in str(path)
        assert "f001" in str(path)

    def test_ensure_upload_dir_default_user_project(self):
        """ensure_upload_dir uses default user/project for MVP."""
        service = FileSystemService()
        path = service.ensure_upload_dir("folder_001")

        assert path.exists()
        assert DEFAULT_USER_ID in str(path)
        assert DEFAULT_PROJECT_ID in str(path)
        assert "folder_001" in str(path)

    def test_ensure_upload_dir_custom_user_project(self):
        """ensure_upload_dir accepts custom user/project."""
        service = FileSystemService()
        path = service.ensure_upload_dir("folder_001", "custom_user", "custom_project")

        assert path.exists()
        assert "custom_user" in str(path)
        assert "custom_project" in str(path)

    def test_ensure_structures_dir(self):
        """ensure_structures_dir creates and returns structures directory."""
        service = FileSystemService()
        path = service.ensure_structures_dir("job_001")

        assert path.exists()
        assert "structures" in str(path)
        assert "job_001" in str(path)

    def test_ensure_job_dir(self):
        """ensure_job_dir creates and returns job directory."""
        service = FileSystemService()
        path = service.ensure_job_dir("job_001")

        assert path.exists()
        assert "jobs" in str(path)
        assert "job_001" in str(path)


class TestFileSystemServiceFiles:
    """Test file operations."""

    def test_write_file_text(self):
        """write_file writes text content correctly."""
        service = FileSystemService()
        service.initialize()

        test_dir = settings.get_outputs_root() / "test_write"
        test_file = test_dir / "test.txt"

        size = service.write_file(test_file, "Hello, World!")

        assert test_file.exists()
        assert size == 13
        assert test_file.read_text() == "Hello, World!"

        # Cleanup
        test_file.unlink()
        test_dir.rmdir()

    def test_write_file_bytes(self):
        """write_file writes bytes content correctly."""
        service = FileSystemService()
        service.initialize()

        test_dir = settings.get_outputs_root() / "test_write_bytes"
        test_file = test_dir / "test.bin"

        content = b"\x00\x01\x02\x03"
        size = service.write_file(test_file, content)

        assert test_file.exists()
        assert size == 4
        assert test_file.read_bytes() == content

        # Cleanup
        test_file.unlink()
        test_dir.rmdir()

    def test_write_file_creates_parent_dirs(self):
        """write_file creates parent directories if needed."""
        service = FileSystemService()
        service.initialize()

        nested = settings.get_outputs_root() / "a" / "b" / "c"
        test_file = nested / "test.txt"

        service.write_file(test_file, "nested content")

        assert test_file.exists()
        assert test_file.read_text() == "nested content"

        # Cleanup
        test_file.unlink()
        for parent in [nested, nested.parent, nested.parent.parent]:
            parent.rmdir()

    def test_read_file_existing(self):
        """read_file reads existing file content."""
        service = FileSystemService()
        service.initialize()

        test_dir = settings.get_outputs_root() / "test_read"
        test_file = test_dir / "test.txt"
        test_dir.mkdir(parents=True, exist_ok=True)
        test_file.write_text("Test content")

        content = service.read_file(test_file)

        assert content == "Test content"

        # Cleanup
        test_file.unlink()
        test_dir.rmdir()

    def test_read_file_nonexistent(self):
        """read_file returns None for non-existent file."""
        service = FileSystemService()
        service.initialize()

        nonexistent = settings.get_outputs_root() / "does_not_exist.txt"
        content = service.read_file(nonexistent)

        assert content is None

    def test_read_file_bytes_existing(self):
        """read_file_bytes reads binary content."""
        service = FileSystemService()
        service.initialize()

        test_dir = settings.get_outputs_root() / "test_read_bytes"
        test_file = test_dir / "test.bin"
        test_dir.mkdir(parents=True, exist_ok=True)
        test_file.write_bytes(b"\x00\x01\x02")

        content = service.read_file_bytes(test_file)

        assert content == b"\x00\x01\x02"

        # Cleanup
        test_file.unlink()
        test_dir.rmdir()

    def test_read_file_bytes_nonexistent(self):
        """read_file_bytes returns None for non-existent file."""
        service = FileSystemService()
        service.initialize()

        nonexistent = settings.get_outputs_root() / "does_not_exist.bin"
        content = service.read_file_bytes(nonexistent)

        assert content is None

    def test_delete_file_existing(self):
        """delete_file removes existing file and returns True."""
        service = FileSystemService()
        service.initialize()

        test_dir = settings.get_outputs_root() / "test_delete"
        test_file = test_dir / "test.txt"
        test_dir.mkdir(parents=True, exist_ok=True)
        test_file.write_text("To delete")

        result = service.delete_file(test_file)

        assert result is True
        assert not test_file.exists()

        # Cleanup
        test_dir.rmdir()

    def test_delete_file_nonexistent(self):
        """delete_file returns False for non-existent file."""
        service = FileSystemService()
        service.initialize()

        nonexistent = settings.get_outputs_root() / "does_not_exist.txt"
        result = service.delete_file(nonexistent)

        assert result is False

    def test_file_exists_true(self):
        """file_exists returns True for existing file."""
        service = FileSystemService()
        service.initialize()

        test_dir = settings.get_outputs_root() / "test_exists"
        test_file = test_dir / "test.txt"
        test_dir.mkdir(parents=True, exist_ok=True)
        test_file.write_text("exists")

        result = service.file_exists(test_file)

        assert result is True

        # Cleanup
        test_file.unlink()
        test_dir.rmdir()

    def test_file_exists_false(self):
        """file_exists returns False for non-existent file."""
        service = FileSystemService()
        service.initialize()

        nonexistent = settings.get_outputs_root() / "does_not_exist.txt"
        result = service.file_exists(nonexistent)

        assert result is False

    def test_list_files(self):
        """list_files returns list of files matching pattern."""
        service = FileSystemService()
        service.initialize()

        test_dir = settings.get_outputs_root() / "test_list"
        test_dir.mkdir(parents=True, exist_ok=True)
        (test_dir / "file1.txt").write_text("1")
        (test_dir / "file2.txt").write_text("2")
        (test_dir / "file3.pdb").write_text("3")

        all_files = service.list_files(test_dir)
        txt_files = service.list_files(test_dir, "*.txt")

        assert len(all_files) == 3
        assert len(txt_files) == 2

        # Cleanup
        for f in all_files:
            f.unlink()
        test_dir.rmdir()

    def test_list_files_empty_directory(self):
        """list_files returns empty list for non-existent directory."""
        service = FileSystemService()
        service.initialize()

        nonexistent = settings.get_outputs_root() / "does_not_exist"
        result = service.list_files(nonexistent)

        assert result == []


class TestFileSystemServiceStructures:
    """TC-13.6: Structure file storage."""

    def test_write_pdb_structure(self):
        """Can write PDB structure file to structures directory."""
        service = FileSystemService()
        service.initialize()

        # Use a custom user/project to avoid conflicts with default directories
        job_id = "job_test_pdb"
        structures_dir = service.ensure_structures_dir(job_id, "test_user", "test_project")
        pdb_file = structures_dir / "candidate_1.pdb"

        pdb_content = """HEADER    TEST STRUCTURE
ATOM      1  N   ALA A   1       0.000   0.000   0.000  1.00  0.00           N
ATOM      2  CA  ALA A   1       1.458   0.000   0.000  1.00  0.00           C
END
"""
        service.write_file(pdb_file, pdb_content)

        assert pdb_file.exists()
        assert service.read_file(pdb_file) == pdb_content

        # Cleanup - remove job dir and its parents (custom user/project only)
        pdb_file.unlink()
        structures_dir.rmdir()  # job_test_pdb/
        structures_dir.parent.rmdir()  # structures/
        structures_dir.parent.parent.rmdir()  # test_project/
        structures_dir.parent.parent.parent.rmdir()  # projects/
        structures_dir.parent.parent.parent.parent.rmdir()  # test_user/

    def test_list_pdb_structures(self):
        """Can list PDB files in structures directory."""
        service = FileSystemService()
        service.initialize()

        # Use a custom user/project to avoid conflicts with default directories
        job_id = "job_test_list_pdb"
        structures_dir = service.ensure_structures_dir(job_id, "test_user2", "test_project2")

        # Create test PDB files
        (structures_dir / "candidate_1.pdb").write_text("PDB1")
        (structures_dir / "candidate_2.pdb").write_text("PDB2")
        (structures_dir / "final.pdb").write_text("FINAL")
        (structures_dir / "log.txt").write_text("LOG")

        pdb_files = service.list_files(structures_dir, "*.pdb")

        assert len(pdb_files) == 3
        assert all(f.suffix == ".pdb" for f in pdb_files)

        # Cleanup
        for f in service.list_files(structures_dir):
            f.unlink()
        structures_dir.rmdir()
        structures_dir.parent.rmdir()
        structures_dir.parent.parent.rmdir()
        structures_dir.parent.parent.parent.rmdir()
        structures_dir.parent.parent.parent.parent.rmdir()


class TestFileSystemServiceJobs:
    """TC-13.5: Job artifacts storage."""

    def test_write_job_artifact(self):
        """Can write job artifact to job directory."""
        service = FileSystemService()
        service.initialize()

        # Use a custom user to avoid conflicts with default directories
        job_id = "job_test_artifact"
        job_dir = service.ensure_job_dir(job_id, "test_user3")
        artifact_file = job_dir / "msa_result.a3m"

        artifact_content = ">query\nMKFLVLVA\n>hit1\nMKFLVLVA"
        service.write_file(artifact_file, artifact_content)

        assert artifact_file.exists()
        assert service.read_file(artifact_file) == artifact_content

        # Cleanup
        artifact_file.unlink()
        job_dir.rmdir()  # job_test_artifact/
        job_dir.parent.rmdir()  # jobs/
        job_dir.parent.parent.rmdir()  # test_user3/
