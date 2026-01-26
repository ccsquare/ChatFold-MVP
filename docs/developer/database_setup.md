# 数据库配置指南

本文档介绍 ChatFold 项目的数据库配置，包括 SQLite 和 MySQL 两种模式。

## 快速开始

### 方案 1: 零依赖模式（推荐用于本地开发）

**优点**: 无需 Docker 容器，1 秒启动，适合快速开发

```bash
# 1. 确保 .env.local 配置（或使用默认值）
# CHATFOLD_DATABASE_TYPE=sqlite (默认)
# CHATFOLD_REDIS_TYPE=fake (默认)
# CHATFOLD_USE_MEMORY_STORE=true (可选，数据不持久化)

# 2. 启动后端
cd backend
uv run uvicorn app.main:app --reload

# 3. 数据存储：
# - SQLite: chatfold-workspace/databases/chatfold_dev.db
# - Redis: 内存模拟（FakeRedis），无需容器
```

**特点**:

- ✅ 无需 Docker 容器
- ✅ 1 秒快速启动
- ✅ SQLite + FakeRedis 完整功能
- ✅ 适合快速开发和测试

### 方案 2: MySQL + Redis（完整生产环境模拟）

**优点**: 环境一致性高，支持多实例

```bash
# 1. 创建 .env.local 文件
cat > .env.local << EOF
CHATFOLD_DATABASE_TYPE=mysql
CHATFOLD_REDIS_TYPE=docker
EOF

# 2. 启动 MySQL 和 Redis 容器
./scripts/local-dev/start.sh

# 3. 启动后端
cd backend
uv run uvicorn app.main:app --reload
```

## 配置说明

### 环境变量

通过 `.env` 文件配置数据库和 Redis 类型：

```bash
# SQLite + FakeRedis 模式（默认，零依赖）
CHATFOLD_DATABASE_TYPE=sqlite
CHATFOLD_REDIS_TYPE=fake

# MySQL + Docker Redis 模式（生产环境模拟）
CHATFOLD_DATABASE_TYPE=mysql
CHATFOLD_REDIS_TYPE=docker
CHATFOLD_MYSQL_HOST=localhost
CHATFOLD_MYSQL_PORT=3306
CHATFOLD_MYSQL_USER=chatfold
CHATFOLD_MYSQL_PASSWORD=chatfold_dev
CHATFOLD_MYSQL_DATABASE=chatfold
```

### 数据库文件位置

SQLite 数据库文件存储在：

```
chatfold-workspace/
└── databases/
    ├── chatfold_dev.db       # 开发环境数据库
    ├── chatfold_test.db      # 测试环境数据库
    └── chatfold.db           # 生产环境数据库
```

## 常用命令

### 重置数据库

清空所有数据并重新创建表结构：

```bash
cd backend
uv run python scripts/db_reset.py
```

输出示例：

```
🗄️  Database type: sqlite
📝 Creating database tables...
✅ Database tables created successfully
📁 SQLite database location: /path/to/chatfold_dev.db
🎉 Database reset completed!
```

### 切换数据库类型

1. **切换到零依赖模式（SQLite + FakeRedis）**:

   ```bash
   # 1. 修改 .env
   CHATFOLD_DATABASE_TYPE=sqlite
   CHATFOLD_REDIS_TYPE=fake

   # 2. 重启后端（会自动重载配置）
   # uvicorn 的 --reload 模式会自动检测变化
   ```

2. **切换到生产模拟模式（MySQL + Docker Redis）**:

   ```bash
   # 1. 启动 MySQL 和 Redis 容器
   ./scripts/local-dev/start.sh

   # 2. 修改 .env
   CHATFOLD_DATABASE_TYPE=mysql
   CHATFOLD_REDIS_TYPE=docker

   # 3. 重启后端
   ```

### 查看数据库内容

**SQLite**:

```bash
# 使用 SQLite CLI
sqlite3 chatfold-workspace/databases/chatfold_dev.db

# 查看所有表
.tables

# 查询用户表
SELECT * FROM users;

# 退出
.exit
```

**MySQL**:

```bash
# 进入 MySQL 容器
docker exec -it chatfold-mysql mysql -u chatfold -pchatfold_dev chatfold

# 查看所有表
SHOW TABLES;

# 查询用户表
SELECT * FROM users;
```

## Git 版本控制

`.gitignore` 配置：

```gitignore
# SQLite 数据库文件不会被追踪
chatfold-workspace/databases/*.db
chatfold-workspace/databases/*.db-shm
chatfold-workspace/databases/*.db-wal

# 但保留目录结构
!chatfold-workspace/databases/.gitkeep
```

## 技术实现

### 自动检测机制

系统会根据 `CHATFOLD_DATABASE_TYPE` 自动生成数据库 URL：

```python
# backend/app/settings.py
def get_database_url_auto(self) -> str:
    if self.database_type == "sqlite":
        return f"sqlite:///{self.get_sqlite_path()}"
    else:
        return f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}"
```

### 连接池配置

- **SQLite**: 使用 `check_same_thread=False` 支持多线程
- **MySQL**: 配置连接池 (pool_size=10, max_overflow=20)

### 启动日志

系统启动时会显示当前使用的数据库：

```
[INFO][mysql.py:57]: Using SQLite database: sqlite:///...
```

或

```
[INFO][mysql.py:66]: Using MySQL database: localhost:3306/chatfold
```

## Redis 配置

### FakeRedis vs Docker Redis

| 特性        | FakeRedis         | Docker Redis      |
| ----------- | ----------------- | ----------------- |
| 启动速度    | ⚡ 即时           | 🐢 3-5秒          |
| Docker 依赖 | ❌ 无需           | ✅ 需要           |
| 功能完整性  | ✅ 完整 Redis API | ✅ 完整 Redis     |
| 多实例共享  | ❌ 进程隔离       | ✅ 支持           |
| 数据持久化  | ❌ 仅内存         | ✅ 支持 RDB/AOF   |
| 适用场景    | 本地开发/测试     | 生产环境/集成测试 |

### FakeRedis 使用说明

**什么是 FakeRedis**:

- Python 库，在内存中模拟 Redis API
- 无需启动 Redis 容器
- 支持绝大部分 Redis 命令
- 进程重启后数据清空

**启用方式**:

```bash
# .env 配置
CHATFOLD_REDIS_TYPE=fake
```

**启动日志**:

```
[INFO][redis_factory.py:36]: Using FakeRedis (in-memory): db=0
[INFO][redis_cache.py:109]: RedisCache initialized: db=0
```

**应用场景**:

- ✅ 本地快速开发
- ✅ 单元测试和集成测试
- ✅ CI/CD 环境
- ❌ 多实例部署（需要 Docker Redis）

## 性能对比

### 数据库性能

| 场景       | SQLite      | MySQL                |
| ---------- | ----------- | -------------------- |
| 启动速度   | ⚡ 1秒      | 🐢 5-10秒 (等待容器) |
| 单机性能   | 🚀 优秀     | ✅ 优秀              |
| 多实例支持 | ❌ 不支持   | ✅ 支持              |
| 并发写入   | ⚠️ 有限     | ✅ 高并发            |
| 数据迁移   | ✅ 文件复制 | 🔧 需要导出/导入     |
| 备份       | ✅ 复制文件 | 🔧 mysqldump         |

### 开发模式性能

| 模式                 | 启动时间 | Docker 依赖 | 数据持久化 | 适用场景 |
| -------------------- | -------- | ----------- | ---------- | -------- |
| SQLite + FakeRedis   | ⚡ 1秒   | ❌ 无       | ✅ SQLite  | 快速开发 |
| MySQL + Docker Redis | 🐢 10秒  | ✅ 需要     | ✅ 完整    | 生产模拟 |

## 推荐实践

### 本地开发

```bash
# 快速开发：SQLite + 内存模式
CHATFOLD_DATABASE_TYPE=sqlite
CHATFOLD_USE_MEMORY_STORE=true  # 数据不持久化，重启丢失
```

### 集成测试

```bash
# 完整环境：MySQL + Redis + 文件系统
CHATFOLD_DATABASE_TYPE=mysql
CHATFOLD_USE_MEMORY_STORE=false
```

### 生产环境

```bash
# 必须使用 MySQL
CHATFOLD_DATABASE_TYPE=mysql
CHATFOLD_USE_MEMORY_STORE=false
# 使用远程数据库 URL
CHATFOLD_DATABASE_URL=mysql+pymysql://user:pass@db.example.com:3306/chatfold
```

## 故障排查

### SQLite 数据库被锁定

**症状**: `database is locked` 错误

**解决**:

```bash
# 1. 确保没有其他进程在使用数据库
lsof chatfold-workspace/databases/chatfold_dev.db

# 2. 重启后端
# 3. 如果仍有问题，删除锁文件
rm chatfold-workspace/databases/*.db-wal
rm chatfold-workspace/databases/*.db-shm
```

### MySQL 连接超时

**症状**: `Can't connect to MySQL server`

**解决**:

```bash
# 1. 检查容器是否运行
docker ps | grep chatfold-mysql

# 2. 如果没有运行，启动容器
./scripts/local-dev/start.sh

# 3. 查看容器日志
docker logs chatfold-mysql
```

### 数据库表不存在

**症状**: `no such table: users` 或 `Table 'chatfold.users' doesn't exist`

**解决**:

```bash
# 运行数据库重置脚本
cd backend
uv run python scripts/db_reset.py
```

## 参考资料

- [SQLite 官方文档](https://www.sqlite.org/docs.html)
- [SQLAlchemy 文档](https://docs.sqlalchemy.org/)
- [MySQL 官方文档](https://dev.mysql.com/doc/)
