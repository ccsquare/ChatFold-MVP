# Redis 使用规范

ChatFold 采用 **单一 DB + Key 前缀模式** 进行 Redis 数据隔离，这是工业界的最佳实践。

## 架构概述

```
┌─────────────────────────────────────────────────────────────┐
│                       Redis (db=0)                          │
├─────────────────────────────────────────────────────────────┤
│  chatfold:job:state:{job_id}      → Job 实时状态 (Hash)      │
│  chatfold:job:meta:{job_id}       → Job 元数据 (Hash)        │
│  chatfold:job:events:{job_id}     → SSE 事件队列 (List)      │
├─────────────────────────────────────────────────────────────┤
│  chatfold:workspace:folder:{id}   → Folder 数据 (String/JSON)│
│  chatfold:workspace:user:{id}     → User 数据 (String/JSON)  │
│  chatfold:workspace:project:{id}  → Project 数据 (String/JSON)│
│  chatfold:workspace:index:*       → 索引集合 (Set)           │
├─────────────────────────────────────────────────────────────┤
│  chatfold:session:user:{id}       → 用户会话 (未来)          │
│  chatfold:cache:file:{hash}       → 文件缓存 (未来)          │
│  chatfold:ratelimit:{key}         → API 限流 (未来)          │
└─────────────────────────────────────────────────────────────┘
```

## 设计优势

| 特性 | 说明 |
|------|------|
| **Redis Cluster 兼容** | Cluster 模式只支持 db=0 |
| **事务支持** | 同一 DB 内可执行完整 MULTI/EXEC 事务 |
| **连接管理** | 单一连接池，无需 SELECT 切换 |
| **监控便利** | 统一监控所有 Key，支持按前缀统计 |
| **无限扩展** | Key 前缀无数量限制 |

## Key 格式规范

```
{namespace}:{domain}:{type}:{entity_id}
```

- **namespace**: 应用标识，固定为 `chatfold`
- **domain**: 业务域 (job, workspace, session, cache, ratelimit)
- **type**: 实体类型 (state, meta, events, folder, user 等)
- **entity_id**: 实体唯一标识

## 使用方法

### 1. 获取 Redis 缓存实例

```python
from app.db.redis_cache import get_redis_cache
from app.db.redis_db import RedisKeyPrefix

# 获取单例缓存实例 (始终使用 db=0)
cache = get_redis_cache()
```

### 2. 使用 Key 前缀辅助方法

```python
# Job 相关
job_id = "job_abc123"
state_key = RedisKeyPrefix.job_state_key(job_id)
# 结果: "chatfold:job:state:job_abc123"

meta_key = RedisKeyPrefix.job_meta_key(job_id)
# 结果: "chatfold:job:meta:job_abc123"

events_key = RedisKeyPrefix.job_events_key(job_id)
# 结果: "chatfold:job:events:job_abc123"

# Workspace 相关
folder_key = RedisKeyPrefix.folder_key("folder_xyz789")
# 结果: "chatfold:workspace:folder:folder_xyz789"

user_key = RedisKeyPrefix.user_key("user_default")
# 结果: "chatfold:workspace:user:user_default"

# 索引 Key
folder_index = RedisKeyPrefix.folder_index_key()
# 结果: "chatfold:workspace:index:folders"
```

### 3. 基本操作示例

```python
cache = get_redis_cache()

# Hash 操作 (Job 状态)
state_key = RedisKeyPrefix.job_state_key("job_abc123")
cache.hset(state_key, {"status": "running", "progress": 50})
state = cache.hgetall(state_key)

# List 操作 (SSE 事件)
events_key = RedisKeyPrefix.job_events_key("job_abc123")
cache.rpush(events_key, {"eventId": "evt_1", "stage": "MSA"})
events = cache.lrange(events_key, 0, -1)

# String 操作 (Workspace 数据)
folder_key = RedisKeyPrefix.folder_key("folder_xyz789")
cache.set(folder_key, {"id": "folder_xyz789", "name": "My Folder"})
folder = cache.get(folder_key)
```

## 服务层封装

对于常用操作，请使用服务层封装而非直接操作 Redis：

```python
# Job 状态管理
from app.services.job_state import job_state_service

job_state_service.create_state(job_id)
job_state_service.set_state(job_id, status, stage, progress, message)
state = job_state_service.get_state(job_id)

# SSE 事件管理
from app.services.sse_events import sse_events_service

sse_events_service.push_event(event)
events = sse_events_service.get_events(job_id, start=0, end=-1)
```

## 环境隔离

环境隔离通过 **不同的 Redis 实例** 实现，而非不同的 DB：

| 环境 | Redis 配置 | 说明 |
|------|------------|------|
| local-dev | localhost:6379 | 本地开发 |
| test | test-redis:6379 | 测试环境 |
| production | prod-redis-cluster:6379 | 生产 Cluster |

## 已废弃: RedisDB 枚举

> ⚠️ **重要**: `RedisDB` 枚举已废弃，仅保留用于向后兼容。

旧代码:
```python
# ❌ 已废弃
from app.db.redis_db import RedisDB
cache = RedisCache(db=RedisDB.JOB_STATE)  # 不再隔离到不同 DB
```

新代码:
```python
# ✅ 推荐
from app.db.redis_cache import get_redis_cache
from app.db.redis_db import RedisKeyPrefix

cache = get_redis_cache()
key = RedisKeyPrefix.job_state_key(job_id)
```

## 已定义的 Key 前缀

| 前缀 | 数据类型 | 用途 |
|------|----------|------|
| `chatfold:job:state` | Hash | Job 实时状态 (status, stage, progress) |
| `chatfold:job:meta` | Hash | Job 元数据 (sequence, conversation_id) |
| `chatfold:job:events` | List | Job SSE 事件队列 |
| `chatfold:workspace:folder` | String/JSON | Folder 数据 |
| `chatfold:workspace:user` | String/JSON | User 数据 |
| `chatfold:workspace:project` | String/JSON | Project 数据 |
| `chatfold:workspace:index` | Set | Workspace 实体索引 |
| `chatfold:session:user` | Hash | 用户会话缓存 (未来) |
| `chatfold:cache:file` | String | 文件内容缓存 (未来) |
| `chatfold:cache:structure` | String | 结构文件缓存 (未来) |
| `chatfold:ratelimit` | String | API 限流计数器 (未来) |

## 参考

- [InfoAgent Redis 规范](../../llmcontext/reference/infoagent_redis.md) - 架构参考来源
- [Redis Cluster 官方文档](https://redis.io/docs/management/scaling/)

---

**更新日期**: 2026-01-03
