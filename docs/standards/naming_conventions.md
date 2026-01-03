# 命名规范 - 数据模型层

本文档定义 ChatFold 项目中 ORM 实体、Pydantic Schema 和 Repository 的命名约定。

## 1. 设计原则

| 原则 | 说明 |
|------|------|
| **一致性优先** | 整个项目使用统一的命名规则 |
| **语义清晰** | 名称应反映用途，而非类型 |
| **避免冗余** | 不重复表达已知信息 |
| **遵循社区惯例** | 参考 FastAPI、SQLAlchemy、Pydantic 官方文档 |

### 参考来源

- [FastAPI SQL Databases Tutorial](https://fastapi.tiangolo.com/tutorial/sql-databases/)
- [FastAPI Best Practices (GitHub)](https://github.com/zhanymkanov/fastapi-best-practices)
- [Flask-SQLAlchemy Models](https://flask-sqlalchemy.palletsprojects.com/en/stable/models/)
- [PEP 8 Style Guide](https://peps.python.org/pep-0008/)

---

## 2. SQLAlchemy ORM 实体

**位置**: `app/db/models.py`

**规则**: 使用实体名，**不加** `Model` 后缀

```python
# 正确
class User(Base):
    __tablename__ = "users"

class Job(Base):
    __tablename__ = "jobs"

class JobEvent(Base):
    __tablename__ = "job_events"

# 避免
class UserModel(Base): ...
class JobModel(Base): ...
```

**理由**:
- 类已继承 `Base`，添加 `Model` 后缀是冗余
- 文件名 `models.py` 已表明这是模型定义
- 与 Django、Flask-SQLAlchemy 社区惯例一致

---

## 3. Pydantic Schema

**位置**: `app/schemas/*.py` 或 `app/components/*/schemas.py`

**规则**: 使用语义后缀表明用途

| 后缀 | 用途 | 示例 |
|------|------|------|
| `Base` | 共享基类字段 | `UserBase`, `JobBase` |
| `Create` | 创建请求 | `UserCreate`, `JobCreate` |
| `Update` | 更新请求 | `UserUpdate`, `JobUpdate` |
| `Public` / `Response` | API 响应 | `UserPublic`, `JobResponse` |
| `InDB` | 数据库完整记录 | `UserInDB` (含敏感字段) |

```python
# app/schemas/user.py

class UserBase(BaseModel):
    """共享字段"""
    name: str
    email: str

class UserCreate(UserBase):
    """创建请求"""
    password: str

class UserUpdate(BaseModel):
    """更新请求 (部分更新)"""
    name: str | None = None
    email: str | None = None

class UserPublic(UserBase):
    """API 响应 (不含敏感信息)"""
    id: str
    created_at: int
```

---

## 4. 领域模型 (Domain Models)

**位置**: `app/components/*/` (如 `nanocc/job.py`)

**规则**: 使用描述性名称，可加领域前缀区分

```python
# app/components/nanocc/job.py

class NanoCCJob(BaseModel):
    """NanoCC 任务 (Pydantic DTO)"""
    id: str
    status: StatusType
    sequence: str

class JobEvent(BaseModel):
    """SSE 事件 (Pydantic DTO)"""
    eventId: str
    jobId: str
    stage: StageType
```

---

## 5. Repository 层

**位置**: `app/repositories/*.py`

**规则**: `{Entity}Repository`

```python
# app/repositories/user.py
class UserRepository(BaseRepository[User]):
    ...

# app/repositories/job.py
class JobRepository(BaseRepository[Job]):
    ...
```

---

## 6. 解决命名冲突

当 ORM 实体和 Pydantic DTO 同名时，使用 import alias:

```python
# 方式 1: 显式 alias
from app.db.models import Job as JobEntity
from app.components.nanocc.job import NanoCCJob

# 方式 2: 模块引用
from app.db import models
from app.components.nanocc import job as nanocc_job

models.Job          # ORM 实体
nanocc_job.NanoCCJob  # Pydantic DTO
```

---

## 7. 当前实体清单

### ORM 实体 (`app/db/models.py`)

| 类名 | 表名 | 说明 |
|------|------|------|
| `User` | `users` | 用户账户 |
| `Project` | `projects` | 项目 |
| `Folder` | `folders` | 工作目录 |
| `Asset` | `assets` | 用户上传文件 |
| `Conversation` | `conversations` | 对话会话 |
| `Message` | `messages` | 消息 |
| `Job` | `jobs` | 折叠任务 |
| `Structure` | `structures` | 生成的结构 |

### Repository (`app/repositories/`)

| 类名 | 文件 | 说明 |
|------|------|------|
| `BaseRepository[T]` | `base.py` | 通用 CRUD 基类 |
| `UserRepository` | `user.py` | 用户操作 |
| `JobRepository` | `job.py` | 任务操作 |
| `StructureRepository` | `structure.py` | 结构操作 |

---

## 8. 文件组织

### 当前结构 (按类型分组)

```
app/
├── db/
│   ├── models.py      # 所有 ORM 实体
│   └── mysql.py       # 数据库连接
├── repositories/
│   ├── base.py
│   ├── user.py
│   ├── job.py
│   └── structure.py
├── schemas/           # Pydantic schemas (按需创建)
│   ├── user.py
│   ├── job.py
│   └── ...
└── components/
    └── nanocc/
        ├── job.py     # NanoCCJob, JobEvent (领域模型)
        └── ...
```

### 可选: 按领域分组 (Netflix Dispatch 风格)

```
app/
├── user/
│   ├── models.py      # User ORM
│   ├── schemas.py     # UserCreate, UserPublic
│   ├── repository.py
│   └── router.py
├── job/
│   ├── models.py      # Job, JobEvent ORM
│   ├── schemas.py     # JobCreate, JobResponse
│   ├── repository.py
│   └── router.py
```

---

**最后更新**: 2026-01-03
