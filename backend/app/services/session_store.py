"""
Session Store - TOS 目录结构管理模块

管理 session_id 下的目录结构，包括:
- meta.json: Session 元信息（含 schema_version）
- state/: 状态数据
- upload/: 用户上传文件
- output/: 计算输出
- tasks/: Task 级数据

目录结构:
```
sessions/{session_id}/
├── meta.json
├── state/
│   └── trajectory/
├── upload/
├── output/
└── tasks/{task_id}/
    ├── meta.json
    ├── query.json
    └── events.jsonl
```
"""

import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from app.settings import settings
from ditto.storage import TOSClient

logger = logging.getLogger(__name__)


# ==================== Constants ====================

# Current schema version for session directory structure
SCHEMA_VERSION = "1.0"

# TOS bucket name
TOS_BUCKET = "chatfold-test"

# TOS bucket prefix for sessions
SESSIONS_PREFIX = "sessions"

# vePFS root path for sessions
VEPFS_ROOT = "/SPXvePFS/mewtool"


# ==================== Enums ====================


class SessionStatus(str, Enum):
    """Session 状态"""

    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class TaskStatus(str, Enum):
    """Task 状态"""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


# ==================== Models ====================


class SessionMeta(BaseModel):
    """Session 元信息 (meta.json)"""

    schema_version: str = Field(default=SCHEMA_VERSION, description="目录结构版本")
    session_id: str = Field(..., description="Session ID")
    user_id: str = Field(..., description="用户 ID")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    task_count: int = Field(default=0, description="Task 数量")
    status: SessionStatus = Field(default=SessionStatus.ACTIVE)

    def model_dump_json_dict(self) -> dict[str, Any]:
        """转换为 JSON 可序列化的字典"""
        return {
            "schema_version": self.schema_version,
            "session_id": self.session_id,
            "user_id": self.user_id,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "task_count": self.task_count,
            "status": self.status.value,
        }


class TaskMeta(BaseModel):
    """Task 元信息 (tasks/{task_id}/meta.json)"""

    task_id: str = Field(..., description="Task ID")
    session_id: str = Field(..., description="所属 Session ID")
    turn: int = Field(..., description="对话轮次")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: datetime | None = Field(default=None)
    status: TaskStatus = Field(default=TaskStatus.PENDING)
    engine: str | None = Field(default=None, description="使用的计算引擎")
    input_refs: list[str] = Field(default_factory=list, description="输入文件引用")
    output_files: list[str] = Field(default_factory=list, description="输出文件列表")

    def model_dump_json_dict(self) -> dict[str, Any]:
        """转换为 JSON 可序列化的字典"""
        return {
            "task_id": self.task_id,
            "session_id": self.session_id,
            "turn": self.turn,
            "created_at": self.created_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "status": self.status.value,
            "engine": self.engine,
            "input_refs": self.input_refs,
            "output_files": self.output_files,
        }


class TaskQuery(BaseModel):
    """Task 查询 (tasks/{task_id}/query.json)"""

    turn: int = Field(..., description="对话轮次")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    content: str = Field(..., description="用户消息内容")
    attachments: list[str] = Field(default_factory=list, description="附件引用")

    def model_dump_json_dict(self) -> dict[str, Any]:
        """转换为 JSON 可序列化的字典"""
        return {
            "turn": self.turn,
            "timestamp": self.timestamp.isoformat(),
            "content": self.content,
            "attachments": self.attachments,
        }


# ==================== Path Utilities ====================


class SessionPaths:
    """Session 路径工具类

    生成 session 相关的 TOS object key 和 vePFS 路径。
    """

    def __init__(self, session_id: str):
        """初始化路径工具

        Args:
            session_id: Session ID
        """
        self.session_id = session_id
        # TOS 路径 (object key, 不含 bucket)
        self._tos_base = f"{SESSIONS_PREFIX}/{session_id}"
        # vePFS 路径
        self._vepfs_base = f"{VEPFS_ROOT}/sessions/{session_id}"
        # 兼容旧代码
        self._base = self._tos_base

    @property
    def base(self) -> str:
        """Session 根路径

        Returns:
            e.g., "sessions/sess_abc123"
        """
        return self._base

    @property
    def meta(self) -> str:
        """Session meta.json 路径

        Returns:
            e.g., "sessions/sess_abc123/meta.json"
        """
        return f"{self._base}/meta.json"

    @property
    def state(self) -> str:
        """state/ 目录路径

        Returns:
            e.g., "sessions/sess_abc123/state/"
        """
        return f"{self._base}/state/"

    @property
    def trajectory(self) -> str:
        """state/trajectory/ 目录路径

        Returns:
            e.g., "sessions/sess_abc123/state/trajectory/"
        """
        return f"{self._base}/state/trajectory/"

    def trajectory_file(self, task_id: str) -> str:
        """指定 task 的 trajectory 文件路径

        Args:
            task_id: Task ID

        Returns:
            e.g., "sessions/sess_abc123/state/trajectory/task_001.json"
        """
        return f"{self._base}/state/trajectory/task_{task_id}.json"

    @property
    def upload(self) -> str:
        """upload/ 目录路径

        Returns:
            e.g., "sessions/sess_abc123/upload/"
        """
        return f"{self._base}/upload/"

    def upload_file(self, asset_id: str, ext: str) -> str:
        """上传文件路径

        Args:
            asset_id: 资产 ID
            ext: 文件扩展名 (不含点号)

        Returns:
            e.g., "sessions/sess_abc123/upload/asset_001.fasta"
        """
        return f"{self._base}/upload/{asset_id}.{ext}"

    @property
    def output(self) -> str:
        """output/ 目录路径

        Returns:
            e.g., "sessions/sess_abc123/output/"
        """
        return f"{self._base}/output/"

    def output_file(self, filename: str) -> str:
        """输出文件路径

        Args:
            filename: 文件名 (含扩展名)

        Returns:
            e.g., "sessions/sess_abc123/output/result_001.pdb"
        """
        return f"{self._base}/output/{filename}"

    @property
    def tasks(self) -> str:
        """tasks/ 目录路径

        Returns:
            e.g., "sessions/sess_abc123/tasks/"
        """
        return f"{self._base}/tasks/"

    def task_dir(self, task_id: str) -> str:
        """指定 task 的目录路径

        Args:
            task_id: Task ID

        Returns:
            e.g., "sessions/sess_abc123/tasks/task_001/"
        """
        return f"{self._base}/tasks/{task_id}/"

    def task_meta(self, task_id: str) -> str:
        """Task meta.json 路径

        Args:
            task_id: Task ID

        Returns:
            e.g., "sessions/sess_abc123/tasks/task_001/meta.json"
        """
        return f"{self._base}/tasks/{task_id}/meta.json"

    def task_query(self, task_id: str) -> str:
        """Task query.json 路径

        Args:
            task_id: Task ID

        Returns:
            e.g., "sessions/sess_abc123/tasks/task_001/query.json"
        """
        return f"{self._base}/tasks/{task_id}/query.json"

    def task_events(self, task_id: str) -> str:
        """Task events.jsonl 路径

        Args:
            task_id: Task ID

        Returns:
            e.g., "sessions/sess_abc123/tasks/task_001/events.jsonl"
        """
        return f"{self._base}/tasks/{task_id}/events.jsonl"

    # ==================== vePFS Paths ====================

    @property
    def vepfs_base(self) -> str:
        """vePFS Session 根路径

        Returns:
            e.g., "/SPXvePFS/mewtool/sessions/sess_abc123"
        """
        return self._vepfs_base

    @property
    def vepfs_state(self) -> str:
        """vePFS state/ 目录路径

        Returns:
            e.g., "/SPXvePFS/mewtool/sessions/sess_abc123/state/"
        """
        return f"{self._vepfs_base}/state/"

    @property
    def vepfs_upload(self) -> str:
        """vePFS upload/ 目录路径

        Returns:
            e.g., "/SPXvePFS/mewtool/sessions/sess_abc123/upload/"
        """
        return f"{self._vepfs_base}/upload/"

    @property
    def vepfs_output(self) -> str:
        """vePFS output/ 目录路径

        Returns:
            e.g., "/SPXvePFS/mewtool/sessions/sess_abc123/output/"
        """
        return f"{self._vepfs_base}/output/"

    # ==================== NanoCC Context ====================

    def to_nanocc_context(self, task_id: str) -> dict[str, Any]:
        """生成发送给 NanoCC 的路径上下文

        包含 TOS 和 vePFS 的路径映射，供 NanoCC 进行文件同步。

        Args:
            task_id: 当前 Task ID

        Returns:
            路径上下文字典，包含:
            - session_id: Session ID
            - task_id: Task ID
            - tos: TOS 路径 (bucket, state, upload, output, task_dir)
            - vepfs: vePFS 基础路径
        """
        return {
            "session_id": self.session_id,
            "task_id": task_id,
            "tos": {
                "bucket": TOS_BUCKET,
                "state": self.state,
                "upload": self.upload,
                "output": self.output,
                "task_dir": self.task_dir(task_id),
            },
            "vepfs": self.vepfs_base,
        }


# ==================== SessionStore ====================


class SessionStore:
    """Session 存储管理器

    提供 Session 和 Task 的 CRUD 操作，使用 TOS 作为后端存储。

    Usage:
        from app.services.session_store import SessionStore

        store = SessionStore()

        # 创建 Session
        session_meta = await store.create_session("sess_001", "user_001")

        # 获取路径工具
        paths = store.get_paths("sess_001")
        upload_key = paths.upload_file("asset_001", "fasta")

        # 上传文件
        await store.upload_file("sess_001", local_path, "asset_001", "fasta")

        # 创建 Task
        task_meta = await store.create_task("sess_001", "task_001", turn=1, content="折叠序列")
    """

    def __init__(self):
        """初始化 SessionStore

        TOS 客户端在首次需要时延迟初始化。
        """
        self._tos_client = None

    def _get_tos_client(self) -> TOSClient:
        """获取 TOS 客户端 (延迟初始化)

        Returns:
            TOSClient instance

        Raises:
            RuntimeError: 如果 TOS 未配置
        """
        if self._tos_client is None:
            if not settings.is_tos_configured():
                raise RuntimeError(
                    "TOS is not configured. Please set TOS_BUCKET_NAME, "
                    "TOS_ACCESS_KEY, and TOS_SECRET_KEY environment variables."
                )

            self._tos_client = TOSClient(
                bucket_name=settings.tos_bucket_name,
                access_key=settings.tos_access_key,
                secret_key=settings.tos_secret_key,
                endpoint=settings.tos_endpoint,
                region=settings.tos_region,
            )
            logger.info("TOS client initialized for SessionStore")

        return self._tos_client

    def get_paths(self, session_id: str) -> SessionPaths:
        """获取 Session 路径工具

        Args:
            session_id: Session ID

        Returns:
            SessionPaths 实例
        """
        return SessionPaths(session_id)

    # ==================== Session Operations ====================

    def create_session(self, session_id: str, user_id: str) -> SessionMeta:
        """创建 Session

        创建 session 目录并初始化 meta.json。

        Args:
            session_id: Session ID
            user_id: 用户 ID

        Returns:
            创建的 SessionMeta
        """
        tos = self._get_tos_client()
        paths = self.get_paths(session_id)

        # 创建 meta.json
        meta = SessionMeta(session_id=session_id, user_id=user_id)
        tos.upload_json(meta.model_dump_json_dict(), paths.meta)

        logger.info(f"Session created: {session_id}")
        return meta

    def get_session(self, session_id: str) -> SessionMeta | None:
        """获取 Session 元信息

        Args:
            session_id: Session ID

        Returns:
            SessionMeta 或 None (如果不存在)
        """
        tos = self._get_tos_client()
        paths = self.get_paths(session_id)

        try:
            data = tos.download_json(paths.meta)
            return SessionMeta(
                schema_version=data.get("schema_version", SCHEMA_VERSION),
                session_id=data["session_id"],
                user_id=data["user_id"],
                created_at=datetime.fromisoformat(data["created_at"]),
                updated_at=datetime.fromisoformat(data["updated_at"]),
                task_count=data.get("task_count", 0),
                status=SessionStatus(data.get("status", "active")),
            )
        except Exception as e:
            logger.debug(f"Session not found or error: {session_id}, {e}")
            return None

    def update_session(self, meta: SessionMeta) -> SessionMeta:
        """更新 Session 元信息

        Args:
            meta: 更新后的 SessionMeta

        Returns:
            更新后的 SessionMeta
        """
        tos = self._get_tos_client()
        paths = self.get_paths(meta.session_id)

        # 更新 updated_at
        meta.updated_at = datetime.now(timezone.utc)
        tos.upload_json(meta.model_dump_json_dict(), paths.meta)

        logger.debug(f"Session updated: {meta.session_id}")
        return meta

    def session_exists(self, session_id: str) -> bool:
        """检查 Session 是否存在

        Args:
            session_id: Session ID

        Returns:
            True 如果存在，否则 False
        """
        tos = self._get_tos_client()
        paths = self.get_paths(session_id)
        return tos.exists(paths.meta)

    # ==================== Upload Operations ====================

    def upload_file(
        self,
        session_id: str,
        local_path: str,
        asset_id: str,
        ext: str,
    ) -> str:
        """上传文件到 upload/ 目录

        Args:
            session_id: Session ID
            local_path: 本地文件路径
            asset_id: 资产 ID
            ext: 文件扩展名 (不含点号)

        Returns:
            TOS object key
        """
        tos = self._get_tos_client()
        paths = self.get_paths(session_id)
        remote_key = paths.upload_file(asset_id, ext)

        tos.upload_file(local_path, remote_key)
        logger.info(f"Uploaded file: {local_path} -> {remote_key}")
        return remote_key

    def upload_bytes(
        self,
        session_id: str,
        data: bytes,
        asset_id: str,
        ext: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        """上传字节数据到 upload/ 目录

        Args:
            session_id: Session ID
            data: 字节数据
            asset_id: 资产 ID
            ext: 文件扩展名 (不含点号)
            content_type: MIME 类型

        Returns:
            TOS object key
        """
        tos = self._get_tos_client()
        paths = self.get_paths(session_id)
        remote_key = paths.upload_file(asset_id, ext)

        tos.upload_bytes(data, remote_key, content_type)
        logger.info(f"Uploaded bytes to: {remote_key}")
        return remote_key

    def list_uploads(self, session_id: str) -> list[str]:
        """列出 upload/ 目录下的文件

        Args:
            session_id: Session ID

        Returns:
            文件 key 列表
        """
        tos = self._get_tos_client()
        paths = self.get_paths(session_id)
        return tos.list_keys(paths.upload)

    # ==================== Output Operations ====================

    def download_output(self, session_id: str, filename: str, local_path: str) -> str:
        """下载 output/ 目录下的文件

        Args:
            session_id: Session ID
            filename: 文件名
            local_path: 本地保存路径

        Returns:
            本地文件路径
        """
        tos = self._get_tos_client()
        paths = self.get_paths(session_id)
        remote_key = paths.output_file(filename)

        tos.download_file(remote_key, local_path)
        logger.info(f"Downloaded output: {remote_key} -> {local_path}")
        return local_path

    def download_output_bytes(self, session_id: str, filename: str) -> bytes:
        """下载 output/ 目录下的文件内容

        Args:
            session_id: Session ID
            filename: 文件名

        Returns:
            文件内容 (bytes)
        """
        tos = self._get_tos_client()
        paths = self.get_paths(session_id)
        remote_key = paths.output_file(filename)
        return tos.download_bytes(remote_key)

    def list_outputs(self, session_id: str) -> list[str]:
        """列出 output/ 目录下的文件

        Args:
            session_id: Session ID

        Returns:
            文件 key 列表
        """
        tos = self._get_tos_client()
        paths = self.get_paths(session_id)
        return tos.list_keys(paths.output)

    def output_exists(self, session_id: str, filename: str) -> bool:
        """检查 output 文件是否存在

        Args:
            session_id: Session ID
            filename: 文件名

        Returns:
            True 如果存在
        """
        tos = self._get_tos_client()
        paths = self.get_paths(session_id)
        return tos.exists(paths.output_file(filename))

    # ==================== Task Operations ====================

    def create_task(
        self,
        session_id: str,
        task_id: str,
        turn: int,
        content: str,
        attachments: list[str] | None = None,
        engine: str | None = None,
    ) -> TaskMeta:
        """创建 Task

        创建 task 目录，初始化 meta.json 和 query.json。

        Args:
            session_id: Session ID
            task_id: Task ID
            turn: 对话轮次
            content: 用户消息内容
            attachments: 附件引用列表
            engine: 计算引擎

        Returns:
            创建的 TaskMeta
        """
        tos = self._get_tos_client()
        paths = self.get_paths(session_id)

        # 创建 task meta
        task_meta = TaskMeta(
            task_id=task_id,
            session_id=session_id,
            turn=turn,
            engine=engine,
            input_refs=attachments or [],
        )
        tos.upload_json(task_meta.model_dump_json_dict(), paths.task_meta(task_id))

        # 创建 query.json
        query = TaskQuery(
            turn=turn,
            content=content,
            attachments=attachments or [],
        )
        tos.upload_json(query.model_dump_json_dict(), paths.task_query(task_id))

        # 更新 session task_count
        session_meta = self.get_session(session_id)
        if session_meta:
            session_meta.task_count += 1
            self.update_session(session_meta)

        logger.info(f"Task created: {session_id}/{task_id}")
        return task_meta

    def get_task(self, session_id: str, task_id: str) -> TaskMeta | None:
        """获取 Task 元信息

        Args:
            session_id: Session ID
            task_id: Task ID

        Returns:
            TaskMeta 或 None
        """
        tos = self._get_tos_client()
        paths = self.get_paths(session_id)

        try:
            data = tos.download_json(paths.task_meta(task_id))
            return TaskMeta(
                task_id=data["task_id"],
                session_id=data["session_id"],
                turn=data["turn"],
                created_at=datetime.fromisoformat(data["created_at"]),
                completed_at=(
                    datetime.fromisoformat(data["completed_at"])
                    if data.get("completed_at")
                    else None
                ),
                status=TaskStatus(data.get("status", "pending")),
                engine=data.get("engine"),
                input_refs=data.get("input_refs", []),
                output_files=data.get("output_files", []),
            )
        except Exception as e:
            logger.debug(f"Task not found or error: {session_id}/{task_id}, {e}")
            return None

    def update_task(self, task: TaskMeta) -> TaskMeta:
        """更新 Task 元信息

        Args:
            task: 更新后的 TaskMeta

        Returns:
            更新后的 TaskMeta
        """
        tos = self._get_tos_client()
        paths = self.get_paths(task.session_id)
        tos.upload_json(task.model_dump_json_dict(), paths.task_meta(task.task_id))

        logger.debug(f"Task updated: {task.session_id}/{task.task_id}")
        return task

    def complete_task(
        self,
        session_id: str,
        task_id: str,
        output_files: list[str] | None = None,
    ) -> TaskMeta:
        """完成 Task

        更新 task 状态为 completed，记录完成时间和输出文件。

        Args:
            session_id: Session ID
            task_id: Task ID
            output_files: 输出文件列表

        Returns:
            更新后的 TaskMeta
        """
        task = self.get_task(session_id, task_id)
        if not task:
            raise ValueError(f"Task not found: {session_id}/{task_id}")

        task.status = TaskStatus.COMPLETED
        task.completed_at = datetime.now(timezone.utc)
        if output_files:
            task.output_files = output_files

        return self.update_task(task)

    def fail_task(self, session_id: str, task_id: str) -> TaskMeta:
        """标记 Task 失败

        Args:
            session_id: Session ID
            task_id: Task ID

        Returns:
            更新后的 TaskMeta
        """
        task = self.get_task(session_id, task_id)
        if not task:
            raise ValueError(f"Task not found: {session_id}/{task_id}")

        task.status = TaskStatus.FAILED
        task.completed_at = datetime.now(timezone.utc)

        return self.update_task(task)

    def get_task_query(self, session_id: str, task_id: str) -> TaskQuery | None:
        """获取 Task 查询

        Args:
            session_id: Session ID
            task_id: Task ID

        Returns:
            TaskQuery 或 None
        """
        tos = self._get_tos_client()
        paths = self.get_paths(session_id)

        try:
            data = tos.download_json(paths.task_query(task_id))
            return TaskQuery(
                turn=data["turn"],
                timestamp=datetime.fromisoformat(data["timestamp"]),
                content=data["content"],
                attachments=data.get("attachments", []),
            )
        except Exception as e:
            logger.debug(f"Task query not found: {session_id}/{task_id}, {e}")
            return None

    def list_tasks(self, session_id: str) -> list[str]:
        """列出 Session 下的所有 Task ID

        Args:
            session_id: Session ID

        Returns:
            Task ID 列表
        """
        tos = self._get_tos_client()
        paths = self.get_paths(session_id)

        # 列出 tasks/ 下的子目录
        keys = tos.list_keys(paths.tasks)
        task_ids = set()
        for key in keys:
            # 从 "sessions/{sess}/tasks/{task_id}/..." 提取 task_id
            parts = key.split("/")
            if len(parts) >= 5:
                task_ids.add(parts[3])

        return sorted(task_ids)


# ==================== Global Instance ====================

# 延迟初始化的全局实例
_session_store: SessionStore | None = None


def get_session_store() -> SessionStore:
    """获取 SessionStore 单例

    Returns:
        SessionStore 实例
    """
    global _session_store
    if _session_store is None:
        _session_store = SessionStore()
    return _session_store
