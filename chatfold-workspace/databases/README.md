# SQLite Database Directory

此目录用于存储 SQLite 数据库文件（仅在本地开发模式下使用）。

## 文件说明

```
databases/
├── chatfold_dev.db     # 开发环境数据库
├── chatfold_test.db    # 测试环境数据库（如果需要）
├── chatfold.db         # 生产环境数据库（如果使用 SQLite）
├── *.db-shm            # SQLite 共享内存文件
├── *.db-wal            # SQLite 预写日志文件
└── README.md           # 本文件
```

## 使用方式

### 1. 自动创建

启动应用时会自动创建数据库文件：

```bash
cd backend
uv run uvicorn app.main:app --reload
```

数据库文件会自动创建在：`chatfold-workspace/databases/chatfold_dev.db`

### 2. 重置数据库

如需清空数据库并重新创建表结构：

```bash
cd backend
uv run python scripts/db_reset.py
```

### 3. 切换到 MySQL

编辑 `.env` 文件：

```bash
CHATFOLD_DATABASE_TYPE=mysql
```

然后启动 MySQL 容器：

```bash
./scripts/local-dev/start.sh
```

## Git 版本控制

- ✅ `.gitkeep` 文件会被追踪，保持目录结构
- ❌ `*.db` 文件不会被追踪，避免提交大文件
- ❌ `*.db-shm` 和 `*.db-wal` 文件不会被追踪

## 注意事项

1. **开发环境**: SQLite 足够用于本地开发和测试
2. **生产环境**: 推荐使用 MySQL 以支持高并发和多实例部署
3. **数据备份**: SQLite 文件可直接复制备份
4. **性能**: SQLite 在单机环境下性能优秀，但不支持多实例

## 数据库大小

SQLite 数据库文件会随数据增长：
- 空数据库: ~100KB
- 正常使用: 1-100MB
- 如超过 1GB，建议切换到 MySQL
