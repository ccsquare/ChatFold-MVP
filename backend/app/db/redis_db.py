"""
Redis Database Allocation Strategy

ChatFold Redis 各数据库的用途定义，避免不同功能之间的键冲突。

使用示例:
    from app.db.redis_db import RedisDB

    redis_client = redis.Redis(
        host=settings.redis_host,
        port=settings.redis_port,
        db=RedisDB.TASK_STATE.value
    )
"""

from enum import IntEnum


class RedisDB(IntEnum):
    """
    Redis 数据库分配枚举

    Redis 默认支持 16 个数据库 (db 0-15)，通过此枚举统一管理各业务场景的数据库分配。

    数据库分配原则:
    - 核心功能使用低位数据库 (0-3)
    - 缓存功能使用中位数据库 (4-7)
    - 临时/测试使用高位数据库 (8-15)
    """

    # === 核心业务数据库 (0-3) ===
    TASK_STATE = 0          # 任务实时状态存储（多实例部署必需）
    SESSION_STORE = 1       # 用户会话存储（未来）
    RATE_LIMITER = 2        # API 限流计数器（未来）
    SSE_EVENTS = 3          # SSE 事件队列（任务进度推送）

    # === 缓存数据库 (4-7) ===
    FILE_CACHE = 4          # 小文件内容缓存
    STRUCTURE_CACHE = 5     # 结构文件缓存
    # RESERVED_6 = 6        # 预留
    # RESERVED_7 = 7        # 预留

    # === 临时/测试数据库 (8-15) ===
    TEMP_DATA = 14          # 临时数据存储
    TEST = 15               # 测试环境专用

    @classmethod
    def get_description(cls, db: "RedisDB") -> str:
        """获取数据库用途描述"""
        descriptions = {
            cls.TASK_STATE: "任务实时状态存储（K8s 多实例共享）",
            cls.SESSION_STORE: "用户会话存储",
            cls.RATE_LIMITER: "API 限流计数器",
            cls.SSE_EVENTS: "SSE 事件队列（任务进度推送）",
            cls.FILE_CACHE: "小文件内容缓存",
            cls.STRUCTURE_CACHE: "结构文件缓存",
            cls.TEMP_DATA: "临时数据存储",
            cls.TEST: "测试环境专用",
        }
        return descriptions.get(db, "未定义用途")

    @classmethod
    def list_all(cls) -> dict:
        """列出所有已定义的数据库及其用途"""
        return {
            member.name: {
                "db": member.value,
                "description": cls.get_description(member)
            }
            for member in cls
        }
