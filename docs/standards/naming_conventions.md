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

## 9. 三层架构职责说明

### 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        API 请求/响应                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Pydantic Schema                               │
│                    (数据验证 & 序列化)                            │
│  UserCreate, UserUpdate, UserPublic                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Repository                                    │
│                    (数据访问抽象)                                 │
│  UserRepository.create(), .get_by_id(), .update()               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ORM Entity                                    │
│                    (数据库映射)                                   │
│  User, Job, Structure                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Database (MySQL)                              │
└─────────────────────────────────────────────────────────────────┘
```

### 9.1 ORM Entity (SQLAlchemy)

**职责**: 数据库表结构映射

```python
# app/db/models.py
class User(Base):
    __tablename__ = "users"

    id = Column(String(64), primary_key=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True)
    password_hash = Column(String(255))  # 敏感字段
    created_at = Column(BigInteger)

    # 关系定义
    jobs = relationship("Job", back_populates="user")
```

**特点**:
- 1:1 对应数据库表
- 定义字段类型、约束、索引
- 定义表间关系 (relationship)
- **包含所有字段**，包括敏感数据

### 9.2 Pydantic Schema

**职责**: API 边界的数据验证和序列化

```python
# app/schemas/user.py

class UserBase(BaseModel):
    """共享字段"""
    name: str
    email: EmailStr

class UserCreate(UserBase):
    """创建请求 - 需要密码"""
    password: str  # 明文密码，后端会哈希

class UserUpdate(BaseModel):
    """更新请求 - 所有字段可选"""
    name: str | None = None
    email: EmailStr | None = None

class UserPublic(UserBase):
    """API 响应 - 不含敏感信息"""
    id: str
    created_at: int
    # 注意：没有 password_hash
```

**特点**:
- 输入验证（类型、格式、范围）
- 控制暴露哪些字段（安全）
- 不同场景用不同 Schema
- **不包含敏感数据**（如 password_hash）

### 9.3 Repository

**职责**: 封装数据访问逻辑，隔离业务层和数据库

```python
# app/repositories/user.py
class UserRepository(BaseRepository[User]):

    def get_by_email(self, db: Session, email: str) -> User | None:
        """按邮箱查询"""
        return db.query(User).filter(User.email == email).first()

    def create_user(self, db: Session, name: str, email: str, password: str) -> User:
        """创建用户（含密码哈希）"""
        user = User(
            id=generate_id("user"),
            name=name,
            email=email,
            password_hash=hash_password(password),  # 业务逻辑
            created_at=get_timestamp_ms(),
        )
        db.add(user)
        db.commit()
        return user
```

**特点**:
- 封装 SQL 查询逻辑
- 提供语义化方法（`get_by_email` vs 原始 SQL）
- 可包含简单业务逻辑（如密码哈希）
- 便于测试（可 mock）
- 便于切换数据库实现

### 9.4 职责对比

| 层 | 职责 | 面向 | 示例 |
|----|------|------|------|
| **ORM Entity** | 数据库映射 | 数据库 | `User` 类定义表结构 |
| **Pydantic Schema** | 验证 & 序列化 | API 客户端 | `UserCreate` 验证输入 |
| **Repository** | 数据访问抽象 | 业务层 | `user_repo.get_by_email()` |

### 9.5 数据流示例

```python
# POST /api/v1/users - 创建用户

@router.post("/users", response_model=UserPublic)
def create_user(request: UserCreate, db: Session = Depends(get_db)):
    # 1. Pydantic Schema: 验证输入
    #    request.name, request.email, request.password 已验证

    # 2. Repository: 执行数据库操作
    user = user_repository.create_user(
        db,
        name=request.name,
        email=request.email,
        password=request.password,
    )
    # user 是 ORM Entity (User)

    # 3. Pydantic Schema: 序列化响应
    #    UserPublic 自动过滤掉 password_hash
    return user
```

### 9.6 为什么需要三层？

| 问题 | 解决方案 |
|------|---------|
| 直接暴露 ORM 会泄露敏感字段 | Schema 控制输出 |
| 输入数据需要验证 | Schema 自动验证 |
| SQL 逻辑散落各处难维护 | Repository 集中管理 |
| 难以测试数据库操作 | Repository 可 mock |
| 切换数据库改动大 | Repository 隔离变化 |

---

**最后更新**: 2026-01-03
