"""
Application Settings Management
集中管理所有应用配置，包括API密钥、数据库、文件路径等

IMPORTANT:
- 敏感信息应该通过环境变量设置，不要硬编码在代码中
- 创建 .env 文件（基于 .env.example）来配置本地开发环境
- 生产环境使用系统环境变量或密钥管理服务
"""

from pathlib import Path
from typing import List, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

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
    cors_origins: List[str] = [
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
    redis_password: Optional[str] = None
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

    # ==================== 业务路径便捷方法 ====================

    def get_structures_path(self, *paths: str) -> Path:
        """获取结构文件存储路径

        Examples:
            get_structures_path() -> {outputs_root}/structures
            get_structures_path("job_123.pdb") -> {outputs_root}/structures/job_123.pdb
        """
        if paths:
            return self.get_output_path("structures", *paths)
        return self.get_output_path("structures")

    def get_jobs_path(self, *paths: str) -> Path:
        """获取任务中间文件路径

        Examples:
            get_jobs_path() -> {outputs_root}/jobs
            get_jobs_path("job_123") -> {outputs_root}/jobs/job_123
        """
        if paths:
            return self.get_output_path("jobs", *paths)
        return self.get_output_path("jobs")

    def get_uploads_path(self, *paths: str) -> Path:
        """获取用户上传文件路径

        Examples:
            get_uploads_path() -> {outputs_root}/uploads
            get_uploads_path("user_123", "input.fasta") -> {outputs_root}/uploads/user_123/input.fasta
        """
        if paths:
            return self.get_output_path("uploads", *paths)
        return self.get_output_path("uploads")


# 创建全局配置实例
settings = Settings()
