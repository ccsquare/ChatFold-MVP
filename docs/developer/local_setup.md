# 本地开发环境搭建

详细的本地开发环境配置指南。

## 前置要求

### 必需工具

```bash
# 检查 Node.js (>= 18)
node --version

# 检查 Python (>= 3.10)
python3 --version

# 检查 Docker
docker --version

# 检查 uv
uv --version
```

### 安装 uv (如未安装)

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# 或使用 pip
pip install uv
```

## 项目设置

### 1. 克隆项目

```bash
git clone <repo-url>
cd ChatFold-MVP
```

### 2. 环境变量配置

```bash
# 复制环境变量模板
cp .env.example .env.local

# 编辑配置（可选）
vim .env.local
```

关键配置项：

```bash
# 环境
CHATFOLD_ENVIRONMENT=local-dev

# Redis
CHATFOLD_REDIS_HOST=127.0.0.1
CHATFOLD_REDIS_PORT=6379

# MySQL
CHATFOLD_DATABASE_URL=mysql+pymysql://chatfold:chatfold123@127.0.0.1:3306/chatfold

# 外部服务
CHATFOLD_FOLDING_GPU_URL=https://...
CHATFOLD_FOLDING_GPU_API_KEY=xxx
```

### 3. 启动基础设施

```bash
# 启动 MySQL 和 Redis 容器
./scripts/local-dev/start.sh

# 验证容器运行
docker ps | grep chatfold
```

预期输出：

```
chatfold-mysql   ... Up ...
chatfold-redis   ... Up ...
```

## 后端设置

### 1. 创建虚拟环境和安装依赖

```bash
cd backend

# 使用 uv 创建 venv 并安装依赖
uv sync --all-extras
```

### 2. 验证安装

```bash
# 测试 Redis 连接
uv run python -c "
from app.db import get_task_state_cache
cache = get_task_state_cache()
print('Redis connected:', cache.ping())
"
```

### 3. 启动后端服务

```bash
uv run uvicorn app.main:app --reload --port 8000
```

验证：http://localhost:8000/docs

## 前端设置

### 1. 安装依赖

```bash
cd web
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

验证：http://localhost:3000

## 目录结构

```
ChatFold-MVP/
├── .env.local           # 本地环境变量 (gitignored)
├── backend/
│   ├── .venv/           # Python 虚拟环境
│   ├── pyproject.toml   # 依赖配置
│   ├── uv.lock          # 依赖锁定
│   └── app/             # 应用代码
├── web/
│   ├── node_modules/    # Node 依赖
│   ├── package.json     # 前端配置
│   └── src/             # 前端代码
├── chatfold-workspace/  # 本地工作空间
│   ├── outputs/         # 输出文件
│   │   ├── uploads/     # 用户上传
│   │   ├── structures/  # 生成结构
│   │   └── tasks/       # 任务中间文件
│   └── logs/            # 日志
└── scripts/
    └── local-dev/       # 本地开发脚本
```

## 常用命令

### 后端

```bash
cd backend

# 安装依赖
uv sync

# 添加新依赖
uv add package-name

# 添加开发依赖
uv add --dev package-name

# 运行服务
uv run uvicorn app.main:app --reload --port 8000

# 运行 linter
uv run ruff check .

# 运行测试
uv run pytest
```

### 前端

```bash
cd web

# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# Lint
npm run lint
```

### Docker

```bash
# 启动基础设施
./scripts/local-dev/start.sh

# 停止基础设施
./scripts/local-dev/stop.sh

# 查看日志
docker logs chatfold-mysql
docker logs chatfold-redis
```

## 常见问题

### Q: uv sync 失败

确保 uv 已正确安装：

```bash
uv --version
```

### Q: Redis 连接失败

1. 检查容器状态：

```bash
docker ps | grep chatfold-redis
```

2. 检查端口：

```bash
lsof -i :6379
```

### Q: MySQL 连接失败

1. 检查容器状态：

```bash
docker ps | grep chatfold-mysql
```

2. 测试连接：

```bash
docker exec -it chatfold-mysql mysql -u chatfold -pchatfold123 chatfold
```

---

**更新日期**: 2025-01-01
