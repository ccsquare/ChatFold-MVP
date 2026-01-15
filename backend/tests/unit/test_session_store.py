"""Tests for SessionStore module.

Test cases:
- SessionPaths: Path generation utilities
- SessionMeta/TaskMeta: Model serialization
- SessionStore: CRUD operations (with mocked TOS client)
"""

from unittest.mock import MagicMock, patch

import pytest

from app.services.session_store import (
    SCHEMA_VERSION,
    TOS_BUCKET,
    VEPFS_ROOT,
    SessionMeta,
    SessionPaths,
    SessionStatus,
    SessionStore,
    TaskMeta,
    TaskQuery,
    TaskStatus,
)


class TestSessionPaths:
    """Test SessionPaths path generation."""

    def test_base_path(self):
        """Base path format is correct."""
        paths = SessionPaths("sess_001")
        assert paths.base == "sessions/sess_001"

    def test_meta_path(self):
        """Meta.json path format is correct."""
        paths = SessionPaths("sess_001")
        assert paths.meta == "sessions/sess_001/meta.json"

    def test_state_path(self):
        """State directory path format is correct."""
        paths = SessionPaths("sess_001")
        assert paths.state == "sessions/sess_001/state/"

    def test_trajectory_path(self):
        """Trajectory directory path format is correct."""
        paths = SessionPaths("sess_001")
        assert paths.trajectory == "sessions/sess_001/state/trajectory/"

    def test_trajectory_file_path(self):
        """Trajectory file path format is correct."""
        paths = SessionPaths("sess_001")
        # task_id 是纯数字/标识，方法会添加 "task_" 前缀
        assert paths.trajectory_file("001") == "sessions/sess_001/state/trajectory/task_001.json"

    def test_upload_path(self):
        """Upload directory path format is correct."""
        paths = SessionPaths("sess_001")
        assert paths.upload == "sessions/sess_001/upload/"

    def test_upload_file_path(self):
        """Upload file path format is correct."""
        paths = SessionPaths("sess_001")
        assert paths.upload_file("asset_001", "fasta") == "sessions/sess_001/upload/asset_001.fasta"

    def test_output_path(self):
        """Output directory path format is correct."""
        paths = SessionPaths("sess_001")
        assert paths.output == "sessions/sess_001/output/"

    def test_output_file_path(self):
        """Output file path format is correct."""
        paths = SessionPaths("sess_001")
        assert paths.output_file("result_001.pdb") == "sessions/sess_001/output/result_001.pdb"

    def test_tasks_path(self):
        """Tasks directory path format is correct."""
        paths = SessionPaths("sess_001")
        assert paths.tasks == "sessions/sess_001/tasks/"

    def test_task_dir_path(self):
        """Task directory path format is correct."""
        paths = SessionPaths("sess_001")
        assert paths.task_dir("task_001") == "sessions/sess_001/tasks/task_001/"

    def test_task_meta_path(self):
        """Task meta.json path format is correct."""
        paths = SessionPaths("sess_001")
        assert paths.task_meta("task_001") == "sessions/sess_001/tasks/task_001/meta.json"

    def test_task_query_path(self):
        """Task query.json path format is correct."""
        paths = SessionPaths("sess_001")
        assert paths.task_query("task_001") == "sessions/sess_001/tasks/task_001/query.json"

    def test_task_events_path(self):
        """Task events.jsonl path format is correct."""
        paths = SessionPaths("sess_001")
        assert paths.task_events("task_001") == "sessions/sess_001/tasks/task_001/events.jsonl"

    def test_different_session_ids(self):
        """Different session IDs produce unique paths."""
        paths1 = SessionPaths("sess_001")
        paths2 = SessionPaths("sess_002")
        assert paths1.base != paths2.base
        assert paths1.meta != paths2.meta

    # ==================== vePFS Paths ====================

    def test_vepfs_base_path(self):
        """vePFS base path format is correct."""
        paths = SessionPaths("sess_001")
        assert paths.vepfs_base == f"{VEPFS_ROOT}/sessions/sess_001"

    def test_vepfs_state_path(self):
        """vePFS state path format is correct."""
        paths = SessionPaths("sess_001")
        assert paths.vepfs_state == f"{VEPFS_ROOT}/sessions/sess_001/state/"

    def test_vepfs_upload_path(self):
        """vePFS upload path format is correct."""
        paths = SessionPaths("sess_001")
        assert paths.vepfs_upload == f"{VEPFS_ROOT}/sessions/sess_001/upload/"

    def test_vepfs_output_path(self):
        """vePFS output path format is correct."""
        paths = SessionPaths("sess_001")
        assert paths.vepfs_output == f"{VEPFS_ROOT}/sessions/sess_001/output/"

    # ==================== NanoCC Context ====================

    def test_to_nanocc_context(self):
        """to_nanocc_context returns correct structure."""
        paths = SessionPaths("sess_001")
        ctx = paths.to_nanocc_context("task_001")

        # Check top-level fields
        assert ctx["session_id"] == "sess_001"
        assert ctx["task_id"] == "task_001"

        # Check TOS paths
        assert ctx["tos"]["bucket"] == TOS_BUCKET
        assert ctx["tos"]["state"] == "sessions/sess_001/state/"
        assert ctx["tos"]["upload"] == "sessions/sess_001/upload/"
        assert ctx["tos"]["output"] == "sessions/sess_001/output/"
        assert ctx["tos"]["task_dir"] == "sessions/sess_001/tasks/task_001/"

        # Check vePFS path (base path only)
        assert ctx["vepfs"] == f"{VEPFS_ROOT}/sessions/sess_001"

    def test_to_nanocc_context_different_tasks(self):
        """to_nanocc_context varies by task_id."""
        paths = SessionPaths("sess_001")
        ctx1 = paths.to_nanocc_context("task_001")
        ctx2 = paths.to_nanocc_context("task_002")

        assert ctx1["task_id"] != ctx2["task_id"]
        assert ctx1["tos"]["task_dir"] != ctx2["tos"]["task_dir"]
        # vePFS path should be the same (session-level base path)
        assert ctx1["vepfs"] == ctx2["vepfs"]


class TestSessionMeta:
    """Test SessionMeta model."""

    def test_default_values(self):
        """Default values are set correctly."""
        meta = SessionMeta(session_id="sess_001", user_id="user_001")
        assert meta.schema_version == SCHEMA_VERSION
        assert meta.session_id == "sess_001"
        assert meta.user_id == "user_001"
        assert meta.task_count == 0
        assert meta.status == SessionStatus.ACTIVE
        assert meta.created_at is not None
        assert meta.updated_at is not None

    def test_model_dump_json_dict(self):
        """JSON serialization produces correct format."""
        meta = SessionMeta(session_id="sess_001", user_id="user_001")
        data = meta.model_dump_json_dict()
        assert data["schema_version"] == SCHEMA_VERSION
        assert data["session_id"] == "sess_001"
        assert data["user_id"] == "user_001"
        assert data["task_count"] == 0
        assert data["status"] == "active"
        assert "created_at" in data
        assert "updated_at" in data

    def test_status_enum_serialization(self):
        """Status enum is serialized correctly."""
        meta = SessionMeta(
            session_id="sess_001",
            user_id="user_001",
            status=SessionStatus.COMPLETED,
        )
        data = meta.model_dump_json_dict()
        assert data["status"] == "completed"


class TestTaskMeta:
    """Test TaskMeta model."""

    def test_default_values(self):
        """Default values are set correctly."""
        task = TaskMeta(task_id="task_001", session_id="sess_001", turn=1)
        assert task.task_id == "task_001"
        assert task.session_id == "sess_001"
        assert task.turn == 1
        assert task.status == TaskStatus.PENDING
        assert task.completed_at is None
        assert task.engine is None
        assert task.input_refs == []
        assert task.output_files == []

    def test_model_dump_json_dict(self):
        """JSON serialization produces correct format."""
        task = TaskMeta(
            task_id="task_001",
            session_id="sess_001",
            turn=1,
            engine="colabfold",
            input_refs=["../upload/seq.fasta"],
        )
        data = task.model_dump_json_dict()
        assert data["task_id"] == "task_001"
        assert data["session_id"] == "sess_001"
        assert data["turn"] == 1
        assert data["status"] == "pending"
        assert data["engine"] == "colabfold"
        assert data["input_refs"] == ["../upload/seq.fasta"]
        assert data["completed_at"] is None


class TestTaskQuery:
    """Test TaskQuery model."""

    def test_default_values(self):
        """Default values are set correctly."""
        query = TaskQuery(turn=1, content="折叠序列")
        assert query.turn == 1
        assert query.content == "折叠序列"
        assert query.attachments == []
        assert query.timestamp is not None

    def test_model_dump_json_dict(self):
        """JSON serialization produces correct format."""
        query = TaskQuery(
            turn=1,
            content="折叠序列",
            attachments=["../upload/seq.fasta"],
        )
        data = query.model_dump_json_dict()
        assert data["turn"] == 1
        assert data["content"] == "折叠序列"
        assert data["attachments"] == ["../upload/seq.fasta"]
        assert "timestamp" in data


class TestSessionStore:
    """Test SessionStore with mocked TOS client."""

    @pytest.fixture
    def mock_tos_client(self):
        """Create a mock TOS client."""
        client = MagicMock()
        client.upload_json = MagicMock()
        client.download_json = MagicMock()
        client.exists = MagicMock(return_value=True)
        client.list_keys = MagicMock(return_value=[])
        client.upload_file = MagicMock()
        client.upload_bytes = MagicMock()
        client.download_file = MagicMock()
        client.download_bytes = MagicMock(return_value=b"test content")
        return client

    @pytest.fixture
    def session_store(self, mock_tos_client):
        """Create a SessionStore with mocked TOS client."""
        store = SessionStore()
        store._tos_client = mock_tos_client
        return store

    def test_get_paths(self, session_store):
        """get_paths returns SessionPaths instance."""
        paths = session_store.get_paths("sess_001")
        assert isinstance(paths, SessionPaths)
        assert paths.session_id == "sess_001"

    def test_create_session(self, session_store, mock_tos_client):
        """create_session creates meta.json."""
        meta = session_store.create_session("sess_001", "user_001")

        assert meta.session_id == "sess_001"
        assert meta.user_id == "user_001"
        assert meta.schema_version == SCHEMA_VERSION

        # Verify TOS upload was called
        mock_tos_client.upload_json.assert_called_once()
        call_args = mock_tos_client.upload_json.call_args
        assert call_args[0][1] == "sessions/sess_001/meta.json"

    def test_get_session(self, session_store, mock_tos_client):
        """get_session retrieves meta.json."""
        mock_tos_client.download_json.return_value = {
            "schema_version": "1.0",
            "session_id": "sess_001",
            "user_id": "user_001",
            "created_at": "2026-01-15T10:00:00+00:00",
            "updated_at": "2026-01-15T10:30:00+00:00",
            "task_count": 2,
            "status": "active",
        }

        meta = session_store.get_session("sess_001")

        assert meta is not None
        assert meta.session_id == "sess_001"
        assert meta.user_id == "user_001"
        assert meta.task_count == 2

    def test_get_session_not_found(self, session_store, mock_tos_client):
        """get_session returns None if not found."""
        mock_tos_client.download_json.side_effect = Exception("Not found")

        meta = session_store.get_session("nonexistent")
        assert meta is None

    def test_session_exists(self, session_store, mock_tos_client):
        """session_exists checks meta.json."""
        mock_tos_client.exists.return_value = True
        assert session_store.session_exists("sess_001") is True

        mock_tos_client.exists.return_value = False
        assert session_store.session_exists("sess_002") is False

    def test_update_session(self, session_store, mock_tos_client):
        """update_session updates meta.json."""
        meta = SessionMeta(session_id="sess_001", user_id="user_001")
        original_updated_at = meta.updated_at

        updated = session_store.update_session(meta)

        assert updated.updated_at >= original_updated_at
        mock_tos_client.upload_json.assert_called_once()

    def test_upload_file(self, session_store, mock_tos_client):
        """upload_file uploads to TOS."""
        key = session_store.upload_file("sess_001", "/path/to/file.fasta", "asset_001", "fasta")

        assert key == "sessions/sess_001/upload/asset_001.fasta"
        mock_tos_client.upload_file.assert_called_once_with(
            "/path/to/file.fasta",
            "sessions/sess_001/upload/asset_001.fasta",
        )

    def test_upload_bytes(self, session_store, mock_tos_client):
        """upload_bytes uploads bytes to TOS."""
        key = session_store.upload_bytes("sess_001", b"MKTL...", "asset_001", "fasta")

        assert key == "sessions/sess_001/upload/asset_001.fasta"
        mock_tos_client.upload_bytes.assert_called_once()

    def test_list_uploads(self, session_store, mock_tos_client):
        """list_uploads lists upload files."""
        mock_tos_client.list_keys.return_value = [
            "sessions/sess_001/upload/asset_001.fasta",
            "sessions/sess_001/upload/asset_002.pdb",
        ]

        keys = session_store.list_uploads("sess_001")
        assert len(keys) == 2

    def test_download_output(self, session_store, mock_tos_client):
        """download_output downloads from TOS."""
        session_store.download_output("sess_001", "result.pdb", "/local/result.pdb")

        mock_tos_client.download_file.assert_called_once_with(
            "sessions/sess_001/output/result.pdb",
            "/local/result.pdb",
        )

    def test_download_output_bytes(self, session_store, mock_tos_client):
        """download_output_bytes returns bytes."""
        data = session_store.download_output_bytes("sess_001", "result.pdb")
        assert data == b"test content"

    def test_output_exists(self, session_store, mock_tos_client):
        """output_exists checks file existence."""
        mock_tos_client.exists.return_value = True
        assert session_store.output_exists("sess_001", "result.pdb") is True

    def test_create_task(self, session_store, mock_tos_client):
        """create_task creates task meta and query."""
        mock_tos_client.download_json.return_value = {
            "schema_version": "1.0",
            "session_id": "sess_001",
            "user_id": "user_001",
            "created_at": "2026-01-15T10:00:00+00:00",
            "updated_at": "2026-01-15T10:30:00+00:00",
            "task_count": 0,
            "status": "active",
        }

        task = session_store.create_task(
            "sess_001",
            "task_001",
            turn=1,
            content="折叠序列",
            attachments=["../upload/seq.fasta"],
            engine="colabfold",
        )

        assert task.task_id == "task_001"
        assert task.session_id == "sess_001"
        assert task.turn == 1
        assert task.engine == "colabfold"

        # Verify meta and query were uploaded
        assert mock_tos_client.upload_json.call_count >= 2

    def test_get_task(self, session_store, mock_tos_client):
        """get_task retrieves task meta."""
        mock_tos_client.download_json.return_value = {
            "task_id": "task_001",
            "session_id": "sess_001",
            "turn": 1,
            "created_at": "2026-01-15T10:00:00+00:00",
            "completed_at": None,
            "status": "pending",
            "engine": "colabfold",
            "input_refs": [],
            "output_files": [],
        }

        task = session_store.get_task("sess_001", "task_001")

        assert task is not None
        assert task.task_id == "task_001"
        assert task.status == TaskStatus.PENDING

    def test_get_task_not_found(self, session_store, mock_tos_client):
        """get_task returns None if not found."""
        mock_tos_client.download_json.side_effect = Exception("Not found")

        task = session_store.get_task("sess_001", "nonexistent")
        assert task is None

    def test_complete_task(self, session_store, mock_tos_client):
        """complete_task updates task status."""
        mock_tos_client.download_json.return_value = {
            "task_id": "task_001",
            "session_id": "sess_001",
            "turn": 1,
            "created_at": "2026-01-15T10:00:00+00:00",
            "completed_at": None,
            "status": "running",
            "engine": "colabfold",
            "input_refs": [],
            "output_files": [],
        }

        task = session_store.complete_task(
            "sess_001",
            "task_001",
            output_files=["../output/result.pdb"],
        )

        assert task.status == TaskStatus.COMPLETED
        assert task.completed_at is not None
        assert task.output_files == ["../output/result.pdb"]

    def test_complete_task_not_found(self, session_store, mock_tos_client):
        """complete_task raises if task not found."""
        mock_tos_client.download_json.side_effect = Exception("Not found")

        with pytest.raises(ValueError, match="Task not found"):
            session_store.complete_task("sess_001", "nonexistent")

    def test_fail_task(self, session_store, mock_tos_client):
        """fail_task updates task status to failed."""
        mock_tos_client.download_json.return_value = {
            "task_id": "task_001",
            "session_id": "sess_001",
            "turn": 1,
            "created_at": "2026-01-15T10:00:00+00:00",
            "completed_at": None,
            "status": "running",
            "engine": "colabfold",
            "input_refs": [],
            "output_files": [],
        }

        task = session_store.fail_task("sess_001", "task_001")

        assert task.status == TaskStatus.FAILED
        assert task.completed_at is not None

    def test_get_task_query(self, session_store, mock_tos_client):
        """get_task_query retrieves task query."""
        mock_tos_client.download_json.return_value = {
            "turn": 1,
            "timestamp": "2026-01-15T10:00:00+00:00",
            "content": "折叠序列",
            "attachments": ["../upload/seq.fasta"],
        }

        query = session_store.get_task_query("sess_001", "task_001")

        assert query is not None
        assert query.turn == 1
        assert query.content == "折叠序列"

    def test_list_tasks(self, session_store, mock_tos_client):
        """list_tasks returns task IDs."""
        mock_tos_client.list_keys.return_value = [
            "sessions/sess_001/tasks/task_001/meta.json",
            "sessions/sess_001/tasks/task_001/query.json",
            "sessions/sess_001/tasks/task_002/meta.json",
            "sessions/sess_001/tasks/task_002/query.json",
        ]

        task_ids = session_store.list_tasks("sess_001")

        assert len(task_ids) == 2
        assert "task_001" in task_ids
        assert "task_002" in task_ids


class TestSessionStoreNoTOS:
    """Test SessionStore when TOS is not configured."""

    def test_get_tos_client_raises_without_config(self):
        """_get_tos_client raises if TOS not configured."""
        store = SessionStore()

        with patch("app.settings.settings") as mock_settings:
            mock_settings.is_tos_configured.return_value = False

            with pytest.raises(RuntimeError, match="TOS is not configured"):
                store._get_tos_client()
