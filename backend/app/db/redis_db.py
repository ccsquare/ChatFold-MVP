"""
Redis Key Prefix Strategy (Single DB + Key Prefix Pattern)

ChatFold 采用单一 DB + Key 前缀模式进行 Redis 数据隔离，这是工业界的最佳实践。

优势:
- Redis Cluster 兼容: Cluster 只支持 db=0
- 事务支持: 同一 DB 内可执行完整 MULTI/EXEC 事务
- 连接管理: 单一连接池，无需 SELECT 切换
- 监控便利: 统一监控所有 Key
- 无限扩展: Key 前缀无数量限制

使用示例:
    from app.db.redis_db import RedisKeyPrefix

    # 构建 Key
    key = f"{RedisKeyPrefix.JOB_STATE}:{job_id}"
    # 结果: "chatfold:job:state:job_abc123"

    # 或使用辅助方法
    key = RedisKeyPrefix.job_state_key(job_id)

环境隔离:
    - local-dev: db=0 (本地开发)
    - test: db=0 (测试环境)
    - production: db=0 (生产环境)
    环境隔离通过不同的 Redis 实例实现，而非不同的 DB
"""

import warnings
from enum import Enum, IntEnum


class RedisKeyPrefix(str, Enum):
    """Redis Key 前缀枚举，用于业务隔离

    所有 Key 都以 'chatfold:' 开头，避免与其他应用冲突。

    Key 格式规范:
        {prefix}:{entity_type}:{entity_id}
        或
        {prefix}:{entity_type}:{sub_type}:{entity_id}

    示例:
        chatfold:job:state:job_abc123
        chatfold:job:meta:job_abc123
        chatfold:job:events:job_abc123
        chatfold:workspace:folder:folder_xyz789
    """

    # === Job 相关 ===
    JOB_STATE = "chatfold:job:state"  # Job 实时状态 (Hash)
    JOB_META = "chatfold:job:meta"  # Job 元数据 (Hash)
    JOB_EVENTS = "chatfold:job:events"  # Job SSE 事件队列 (List)

    # === Workspace 相关 ===
    WORKSPACE_FOLDER = "chatfold:workspace:folder"  # Folder 数据 (String/JSON)
    WORKSPACE_USER = "chatfold:workspace:user"  # User 数据 (String/JSON)
    WORKSPACE_PROJECT = "chatfold:workspace:project"  # Project 数据 (String/JSON)
    WORKSPACE_INDEX = "chatfold:workspace:index"  # 索引集合 (Set)

    # === 会话相关 (未来) ===
    SESSION_USER = "chatfold:session:user"  # 用户会话 (Hash)

    # === 缓存相关 (未来) ===
    CACHE_FILE = "chatfold:cache:file"  # 文件缓存
    CACHE_STRUCTURE = "chatfold:cache:structure"  # 结构缓存

    # === 限流相关 (未来) ===
    RATE_LIMIT = "chatfold:ratelimit"  # API 限流

    # ==================== 辅助方法 ====================

    @classmethod
    def job_state_key(cls, job_id: str) -> str:
        """生成 Job 状态 Key"""
        return f"{cls.JOB_STATE.value}:{job_id}"

    @classmethod
    def job_meta_key(cls, job_id: str) -> str:
        """生成 Job 元数据 Key"""
        return f"{cls.JOB_META.value}:{job_id}"

    @classmethod
    def job_events_key(cls, job_id: str) -> str:
        """生成 Job 事件队列 Key"""
        return f"{cls.JOB_EVENTS.value}:{job_id}"

    @classmethod
    def folder_key(cls, folder_id: str) -> str:
        """生成 Folder Key"""
        return f"{cls.WORKSPACE_FOLDER.value}:{folder_id}"

    @classmethod
    def user_key(cls, user_id: str) -> str:
        """生成 User Key"""
        return f"{cls.WORKSPACE_USER.value}:{user_id}"

    @classmethod
    def project_key(cls, project_id: str) -> str:
        """生成 Project Key"""
        return f"{cls.WORKSPACE_PROJECT.value}:{project_id}"

    @classmethod
    def folder_index_key(cls) -> str:
        """生成 Folder 索引 Key"""
        return f"{cls.WORKSPACE_INDEX.value}:folders"

    @classmethod
    def user_index_key(cls) -> str:
        """生成 User 索引 Key"""
        return f"{cls.WORKSPACE_INDEX.value}:users"

    @classmethod
    def project_index_key(cls) -> str:
        """生成 Project 索引 Key"""
        return f"{cls.WORKSPACE_INDEX.value}:projects"

    # ==================== 描述信息 ====================

    @classmethod
    def get_description(cls, prefix: "RedisKeyPrefix") -> str:
        """获取 Key 前缀的用途描述"""
        descriptions = {
            cls.JOB_STATE: "Job 实时状态 (status, stage, progress)",
            cls.JOB_META: "Job 元数据 (sequence, conversation_id)",
            cls.JOB_EVENTS: "Job SSE 事件队列 (进度推送)",
            cls.WORKSPACE_FOLDER: "Folder 数据存储",
            cls.WORKSPACE_USER: "User 数据存储",
            cls.WORKSPACE_PROJECT: "Project 数据存储",
            cls.WORKSPACE_INDEX: "Workspace 实体索引",
            cls.SESSION_USER: "用户会话缓存",
            cls.CACHE_FILE: "文件内容缓存",
            cls.CACHE_STRUCTURE: "结构文件缓存",
            cls.RATE_LIMIT: "API 限流计数器",
        }
        return descriptions.get(prefix, "未定义用途")

    @classmethod
    def list_all(cls) -> dict:
        """列出所有已定义的 Key 前缀及其用途"""
        return {member.name: {"prefix": member.value, "description": cls.get_description(member)} for member in cls}


# ==================== 向后兼容 (deprecated) ====================
# 保留 RedisDB 枚举以支持渐进式迁移，但标记为废弃


class RedisDB(IntEnum):
    """
    [DEPRECATED] Redis 数据库分配枚举

    已废弃：请使用 RedisKeyPrefix 替代。
    ChatFold 现在采用单一 DB + Key 前缀模式。

    保留此类仅用于向后兼容，将在未来版本移除。
    """

    # 所有功能都使用 db=0
    DEFAULT = 0

    # 以下仅用于向后兼容，实际都映射到 db=0
    JOB_STATE = 0
    SESSION_STORE = 0
    WORKSPACE = 0
    SSE_EVENTS = 0
    FILE_CACHE = 0
    STRUCTURE_CACHE = 0
    TEMP_DATA = 0
    TEST = 0

    def __new__(cls, value):
        obj = int.__new__(cls, value)
        obj._value_ = value
        return obj

    @classmethod
    def get_description(cls, db: "RedisDB") -> str:
        """获取数据库用途描述 (deprecated)"""
        warnings.warn("RedisDB is deprecated. Use RedisKeyPrefix instead.", DeprecationWarning, stacklevel=2)
        return "所有功能使用 db=0 + Key 前缀隔离"

    @classmethod
    def list_all(cls) -> dict:
        """列出所有已定义的数据库 (deprecated)"""
        warnings.warn("RedisDB is deprecated. Use RedisKeyPrefix.list_all() instead.", DeprecationWarning, stacklevel=2)
        return {"DEFAULT": {"db": 0, "description": "单一 DB + Key 前缀模式"}}
