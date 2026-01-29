"""
Application Settings Management
集中管理所有应用配置，包括API密钥、数据库、文件路径等

IMPORTANT:
- 敏感信息应该通过环境变量设置，不要硬编码在代码中
- 创建 .env.local 文件（基于 .env.example）来配置本地开发环境: cp .env.example .env.local
- 生产环境使用系统环境变量或密钥管理服务
"""

import os
from pathlib import Path

from pydantic import computed_field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# ==================== MVP 默认常量 ====================
# MVP 阶段使用默认用户和项目，简化实现
DEFAULT_USER_ID = "user_default"
DEFAULT_PROJECT_ID = "project_default"

# Helper function to get project root directory (where .env file is located)
# backend/app/settings.py -> backend/app/ -> backend/ -> project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# 使用 .env.local 作为本地开发配置文件
# 基于 .env.example 模板创建: cp .env.example .env.local
ENV_FILE = PROJECT_ROOT / ".env.local"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # ==================== 环境配置 ====================
    # "local-dev" | "test" | "production"
    environment: str = "local-dev"

    # ==================== 服务器配置 ====================
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True

    # ==================== JWT 认证配置 ====================
    # 生产环境必须通过 JWT_SECRET_KEY 环境变量设置强密钥
    jwt_secret_key: str = "chatfold-dev-jwt-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 15

    # ==================== 前端配置 (用于CORS自动生成) ====================
    frontend_host: str = "localhost"
    frontend_port: int = 3000

    # ==================== CORS 配置 ====================
    # DEPRECATED: Use computed_field cors_origins for auto-generation
    # This field is kept for backward compatibility
    cors_origins_manual: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ]

    # ==================== API 配置 ====================
    api_prefix: str = ""

    # ==================== 数据库配置 ====================
    # 数据库类型: "sqlite" | "mysql"
    # - sqlite: 本地开发，快速启动，无需容器
    # - mysql: 生产环境，需要 Docker 容器或远程数据库
    database_type: str = "sqlite"

    # 显式数据库 URL（如果提供，将覆盖自动生成的 URL）
    database_url: str = ""

    # MySQL 特定配置
    mysql_pool_size: int = 10
    mysql_max_overflow: int = 20
    mysql_pool_pre_ping: bool = True

    # ==================== Redis 配置 ====================
    # Redis 类型: "in_memory" | "redis"
    # - in_memory: 内存模拟 (FakeRedis)，无需外部服务
    # - redis: 真实 Redis 实例（Docker 容器、云托管等）
    redis_type: str = "in_memory"

    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_index: int = 0
    redis_password: str | None = None
    redis_socket_timeout: int = 5
    redis_socket_connect_timeout: int = 5

    # ==================== 文件路径配置 ====================
    # 工作空间名称（local-dev 模式下使用）
    # local-dev: {project_root}/chatfold-workspace/
    # production: /app/
    workspace_name: str = "chatfold-workspace"

    # 输出根目录（业务输出：用户文件、中间产物等）
    # 可以是相对路径（相对于 workspace）或绝对路径
    # 默认: "outputs" -> {workspace}/outputs
    outputs_subdir: str = "outputs"

    # 日志根目录
    # 默认: "logs" -> {workspace}/logs
    logs_subdir: str = "logs"

    # ==================== 日志配置 ====================
    log_max_bytes: int = 20 * 1024 * 1024  # 20MB
    log_backup_count: int = 5

    # ==================== 超时配置 ====================
    http_timeout: float = 300
    nanocc_api_timeout: int = 600  # 蛋白质折叠可能需要较长时间

    # ==================== TOS (火山云对象存储) 配置 ====================
    # TOS 桶名称
    tos_bucket_name: str = "chatfold-test"
    # TOS 访问密钥 ID
    tos_access_key: str = ""
    # TOS 访问密钥 Secret
    tos_secret_key: str = ""
    # TOS S3 兼容端点 (默认上海区域)
    tos_endpoint: str = "https://tos-s3-cn-shanghai.ivolces.com"
    # TOS 区域
    tos_region: str = "cn-shanghai"

    # ==================== 存储模式配置 ====================
    # 统一存储模式控制
    # false (默认): 持久化模式 - MySQL + Redis + 文件系统
    #   - Jobs/Events 写入 MySQL
    #   - 结构文件存储在文件系统
    #   - Redis 用于缓存和 SSE 事件队列
    # true: 内存模式 - 仅内存 + Redis（开发/测试用）
    #   - 所有数据存储在内存中，重启丢失
    #   - Redis 仍用于 SSE 事件队列
    # WARNING: use_memory_store=true is NOT safe for multi-instance deployment!
    #   - Each instance has its own memory, data will be lost across instances
    #   - Use use_memory_store=false for production (multi-instance) environments
    use_memory_store: bool = False

    # Instance identifier (for debugging multi-instance issues)
    # Priority: INSTANCE_ID env var > HOSTNAME env var (K8s pod name) > "default"
    # In K8s, HOSTNAME is automatically set to the pod name (e.g., "chatfold-backend-7d8b9c6f5-abc12")
    instance_id: str | None = None

    @model_validator(mode="after")
    def resolve_instance_id(self) -> "Settings":
        """Resolve instance_id from environment variables if not explicitly set.

        Priority:
        1. INSTANCE_ID env var (explicit configuration)
        2. HOSTNAME env var (K8s automatically sets this to pod name)
        3. "default" (fallback for local development)

        In K8s, HOSTNAME is automatically set to the pod name, so no additional
        configuration is needed for multi-instance deployment.
        """
        if self.instance_id is None:
            # Try HOSTNAME first (K8s pod name)
            hostname = os.environ.get("HOSTNAME")
            if hostname:
                # Shorten long pod names for readability (keep last 12 chars)
                # e.g., "chatfold-backend-7d8b9c6f5-abc12" -> "6f5-abc12"
                self.instance_id = hostname[-12:] if len(hostname) > 12 else hostname
            else:
                self.instance_id = "default"
        return self

    # ==================== 计算属性 ====================

    @computed_field  # type: ignore[misc]
    @property
    def cors_origins(self) -> list[str]:
        """
        Auto-generate CORS origins based on frontend configuration

        This replaces the hardcoded cors_origins list and automatically
        generates the appropriate CORS origins based on frontend_host and frontend_port.

        Returns:
            List of CORS origin URLs
        """
        frontend_url = f"http://{self.frontend_host}:{self.frontend_port}"
        return [
            frontend_url,
            f"http://127.0.0.1:{self.frontend_port}",
            f"http://localhost:{self.frontend_port}",
            # Legacy support for common development ports
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ]

    # ==================== 验证方法 ====================

    def validate_configuration(self) -> None:
        """
        Validate configuration settings

        Checks for common configuration issues like port conflicts.

        Raises:
            ValueError: If configuration is invalid
        """
        if self.port == self.frontend_port:
            raise ValueError(
                f"Port conflict: Backend port {self.port} conflicts with "
                f"frontend port {self.frontend_port}"
            )

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ==================== 路径获取方法 ====================

    @classmethod
    def get_project_root(cls) -> Path:
        """获取项目根目录的绝对路径"""
        return PROJECT_ROOT

    def get_database_dir(self) -> Path:
        """获取数据库文件目录

        目录结构: {workspace}/databases/

        Returns:
            数据库文件存储目录的绝对路径
        """
        return self.get_workspace_root() / "databases"

    def get_sqlite_path(self) -> Path:
        """获取 SQLite 数据库文件路径

        根据环境返回不同的数据库文件：
        - test: :memory: (内存数据库)
        - local-dev: {workspace}/databases/chatfold_dev.db
        - production: {workspace}/databases/chatfold.db

        Returns:
            SQLite 数据库文件的绝对路径
        """
        if self.environment == "test":
            return Path(":memory:")
        elif self.environment == "local-dev":
            db_dir = self.get_database_dir()
            db_dir.mkdir(parents=True, exist_ok=True)
            return db_dir / "chatfold_dev.db"
        else:
            db_dir = self.get_database_dir()
            db_dir.mkdir(parents=True, exist_ok=True)
            return db_dir / "chatfold.db"

    def get_database_url_auto(self) -> str:
        """自动生成数据库连接 URL

        根据 database_type 配置自动生成：
        - sqlite: sqlite:///{database_dir}/chatfold.db
        - mysql: mysql+pymysql://user:pass@host:port/db

        Returns:
            数据库连接 URL
        """
        if self.database_url:
            # 如果提供了显式 URL，直接使用
            return self.database_url

        if self.database_type == "sqlite":
            sqlite_path = self.get_sqlite_path()
            if str(sqlite_path) == ":memory:":
                return "sqlite:///:memory:"
            return f"sqlite:///{sqlite_path}"

        # MySQL 配置（默认）
        host = getattr(self, "mysql_host", "localhost")
        port = getattr(self, "mysql_port", 3306)
        user = getattr(self, "mysql_user", "chatfold")
        password = getattr(self, "mysql_password", "chatfold_dev")
        database = getattr(self, "mysql_database", "chatfold")

        return f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}?charset=utf8mb4"

    def is_local_dev(self) -> bool:
        """Check if running in local development mode."""
        return self.environment == "local-dev"

    def get_workspace_root(self) -> Path:
        """
        获取工作空间根目录的绝对路径

        - local-dev: {project_root}/chatfold-workspace/
        - test/production: /app/
        """
        if self.is_local_dev():
            return self.get_project_root() / self.workspace_name
        return Path("/app")

    def get_outputs_root(self) -> Path:
        """
        获取输出根目录的绝对路径

        - local-dev: {project_root}/chatfold-workspace/outputs/
        - production: /app/outputs/
        """
        return self.get_workspace_root() / self.outputs_subdir

    def get_output_path(self, *paths: str) -> Path:
        """获取 outputs 下的绝对路径

        Examples:
            get_output_path() -> {outputs_root}
            get_output_path("structures") -> {outputs_root}/structures
            get_output_path("structures", "job_123.pdb") -> {outputs_root}/structures/job_123.pdb
        """
        outputs_root = self.get_outputs_root()
        return outputs_root / Path(*paths) if paths else outputs_root

    def get_logs_root(self) -> Path:
        """
        获取日志根目录的绝对路径

        - local-dev: {project_root}/chatfold-workspace/logs/
        - production: /app/logs/
        """
        return self.get_workspace_root() / self.logs_subdir

    def get_logs_path(self, *paths: str) -> Path:
        """获取日志路径

        Examples:
            get_logs_path() -> {logs_root}
            get_logs_path("chatfold.log") -> {logs_root}/chatfold.log
        """
        logs_root = self.get_logs_root()
        return logs_root / Path(*paths) if paths else logs_root

    # ==================== 旧版业务路径方法 (将在后续版本移除) ====================
    # 这些方法不支持用户/项目层级，仅用于向后兼容
    # 请使用新版 get_*_path(user_id, project_id, ...) 方法

    def get_structures_path_legacy(self, *paths: str) -> Path:
        """获取结构文件存储路径 (旧版，将在后续版本移除)

        Examples:
            get_structures_path_legacy() -> {outputs_root}/structures
            get_structures_path_legacy("job_123.pdb") -> {outputs_root}/structures/job_123.pdb

        Note: 请使用 get_structures_path(user_id, project_id, task_id) 替代
        """
        if paths:
            return self.get_output_path("structures", *paths)
        return self.get_output_path("structures")

    def get_jobs_path_legacy(self, *paths: str) -> Path:
        """获取任务中间文件路径 (旧版，将在后续版本移除)

        Examples:
            get_jobs_path_legacy() -> {outputs_root}/jobs
            get_jobs_path_legacy("job_123") -> {outputs_root}/jobs/job_123

        Note: 请使用 get_jobs_path(user_id, task_id) 替代
        """
        if paths:
            return self.get_output_path("jobs", *paths)
        return self.get_output_path("jobs")

    def get_uploads_path_legacy(self, *paths: str) -> Path:
        """获取用户上传文件路径 (旧版，将在后续版本移除)

        Examples:
            get_uploads_path_legacy() -> {outputs_root}/uploads
            get_uploads_path_legacy("user_123", "input.fasta") -> {outputs_root}/uploads/user_123/input.fasta

        Note: 请使用 get_uploads_path(user_id, project_id, folder_id) 替代
        """
        if paths:
            return self.get_output_path("uploads", *paths)
        return self.get_output_path("uploads")

    # ==================== 用户/项目级别路径 ====================

    def get_user_path(self, user_id: str) -> Path:
        """获取用户根目录

        目录结构: {outputs}/users/{user_id}

        Examples:
            get_user_path("u001") -> {outputs}/users/u001
        """
        return self.get_outputs_root() / "users" / user_id

    def get_project_path(self, user_id: str, project_id: str) -> Path:
        """获取项目目录

        目录结构: {outputs}/users/{user_id}/projects/{project_id}

        Examples:
            get_project_path("u001", "p001") -> {outputs}/users/u001/projects/p001
        """
        return self.get_user_path(user_id) / "projects" / project_id

    def get_folder_path(self, user_id: str, project_id: str, folder_id: str) -> Path:
        """获取文件夹目录

        目录结构: {outputs}/users/{user_id}/projects/{project_id}/folders/{folder_id}

        Examples:
            get_folder_path("u001", "p001", "f001") -> .../folders/f001
        """
        return self.get_project_path(user_id, project_id) / "folders" / folder_id

    def get_uploads_path(self, user_id: str, project_id: str, folder_id: str) -> Path:
        """获取上传目录

        目录结构: {outputs}/users/{user_id}/projects/{project_id}/uploads/{folder_id}

        Examples:
            get_uploads_path("u001", "p001", "f001") -> .../uploads/f001
        """
        return self.get_project_path(user_id, project_id) / "uploads" / folder_id

    def get_structures_path(self, user_id: str, project_id: str, task_id: str) -> Path:
        """获取结构文件目录

        目录结构: {outputs}/users/{user_id}/projects/{project_id}/structures/{task_id}

        Examples:
            get_structures_path("u001", "p001", "task001") -> .../structures/task001
        """
        return self.get_project_path(user_id, project_id) / "structures" / task_id

    def get_jobs_path(self, user_id: str, task_id: str) -> Path:
        """获取任务工作目录

        任务在用户级别（不在项目级别），因为任务可能跨项目共享

        目录结构: {outputs}/users/{user_id}/jobs/{task_id}

        Examples:
            get_jobs_path("u001", "task001") -> {outputs}/users/u001/jobs/task001
        """
        return self.get_user_path(user_id) / "jobs" / task_id

    # ==================== MVP 便捷方法 ====================
    # 使用默认用户和项目，简化 MVP 阶段的 API 调用

    def get_default_user_path(self) -> Path:
        """MVP: 获取默认用户目录"""
        return self.get_user_path(DEFAULT_USER_ID)

    def get_default_project_path(self) -> Path:
        """MVP: 获取默认项目目录"""
        return self.get_project_path(DEFAULT_USER_ID, DEFAULT_PROJECT_ID)

    def get_default_uploads_path(self, folder_id: str) -> Path:
        """MVP: 使用默认用户和项目获取上传目录"""
        return self.get_uploads_path(DEFAULT_USER_ID, DEFAULT_PROJECT_ID, folder_id)

    def get_default_structures_path(self, task_id: str) -> Path:
        """MVP: 使用默认用户和项目获取结构目录"""
        return self.get_structures_path(DEFAULT_USER_ID, DEFAULT_PROJECT_ID, task_id)

    def get_default_jobs_path(self, task_id: str) -> Path:
        """MVP: 使用默认用户获取任务工作目录"""
        return self.get_jobs_path(DEFAULT_USER_ID, task_id)

    # ==================== TOS 配置检查 ====================

    def is_tos_configured(self) -> bool:
        """检查 TOS 是否已配置

        Returns:
            如果 TOS 配置完整返回 True，否则返回 False
        """
        return bool(self.tos_bucket_name and self.tos_access_key and self.tos_secret_key)


# 创建全局配置实例
settings = Settings()
