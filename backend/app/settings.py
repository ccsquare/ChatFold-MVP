"""
Application Settings Management
集中管理所有应用配置，包括API密钥、数据库、文件路径等

IMPORTANT:
- 敏感信息应该通过环境变量设置，不要硬编码在代码中
- 创建 .env 文件（基于 .env.example）来配置本地开发环境
- 生产环境使用系统环境变量或密钥管理服务
"""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# ==================== MVP 默认常量 ====================
# MVP 阶段使用默认用户和项目，简化实现
DEFAULT_USER_ID = "user_default"
DEFAULT_PROJECT_ID = "project_default"

# Helper function to get project root directory (where .env file is located)
# backend/app/settings.py -> backend/app/ -> backend/ -> project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# 优先使用 .env.local（本地开发配置），如果不存在则使用 .env
ENV_FILE = (
    PROJECT_ROOT / ".env.local"
    if (PROJECT_ROOT / ".env.local").exists()
    else PROJECT_ROOT / ".env"
)


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # ==================== 环境配置 ====================
    # "local-dev" | "test" | "production"
    environment: str = "local-dev"

    # ==================== 服务器配置 ====================
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True

    # ==================== CORS 配置 ====================
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ]

    # ==================== API 配置 ====================
    api_prefix: str = ""

    # ==================== 数据库配置 ====================
    database_url: str = ""

    # MySQL 特定配置
    mysql_pool_size: int = 10
    mysql_max_overflow: int = 20
    mysql_pool_pre_ping: bool = True

    # ==================== Redis 配置 ====================
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_index: int = 0
    redis_password: str | None = None
    redis_socket_timeout: int = 5
    redis_socket_connect_timeout: int = 5

    # ==================== NanoCC 配置 ====================
    # 蛋白质折叠编排服务 API (Protein Folding Orchestration)
    nanocc_url: str = ""
    nanocc_api_key: str = ""

    # ==================== Folding GPU 配置 ====================
    # 蛋白质折叠 GPU 推理服务 (Direct GPU Inference)
    folding_gpu_url: str = ""
    folding_gpu_api_key: str = ""

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

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        env_prefix="CHATFOLD_",
        case_sensitive=False,
        extra="ignore",
    )

    # ==================== 路径获取方法 ====================

    @classmethod
    def get_project_root(cls) -> Path:
        """获取项目根目录的绝对路径"""
        return PROJECT_ROOT

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

        Note: 请使用 get_structures_path(user_id, project_id, job_id) 替代
        """
        if paths:
            return self.get_output_path("structures", *paths)
        return self.get_output_path("structures")

    def get_jobs_path_legacy(self, *paths: str) -> Path:
        """获取任务中间文件路径 (旧版，将在后续版本移除)

        Examples:
            get_jobs_path_legacy() -> {outputs_root}/jobs
            get_jobs_path_legacy("job_123") -> {outputs_root}/jobs/job_123

        Note: 请使用 get_jobs_path(user_id, job_id) 替代
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

    def get_structures_path(self, user_id: str, project_id: str, job_id: str) -> Path:
        """获取结构文件目录

        目录结构: {outputs}/users/{user_id}/projects/{project_id}/structures/{job_id}

        Examples:
            get_structures_path("u001", "p001", "job001") -> .../structures/job001
        """
        return self.get_project_path(user_id, project_id) / "structures" / job_id

    def get_jobs_path(self, user_id: str, job_id: str) -> Path:
        """获取 Job 目录

        Job 在用户级别（不在项目级别），因为 Job 可能跨项目共享

        目录结构: {outputs}/users/{user_id}/jobs/{job_id}

        Examples:
            get_jobs_path("u001", "job001") -> {outputs}/users/u001/jobs/job001
        """
        return self.get_user_path(user_id) / "jobs" / job_id

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

    def get_default_structures_path(self, job_id: str) -> Path:
        """MVP: 使用默认用户和项目获取结构目录"""
        return self.get_structures_path(DEFAULT_USER_ID, DEFAULT_PROJECT_ID, job_id)

    def get_default_jobs_path(self, job_id: str) -> Path:
        """MVP: 使用默认用户获取 Job 目录"""
        return self.get_jobs_path(DEFAULT_USER_ID, job_id)


# 创建全局配置实例
settings = Settings()
