# ChatFold MVP

ChatGPT 风格的蛋白质折叠工作台，支持三栏布局、实时 SSE 流式进度和 3D 结构可视化。

## 功能特性

- **三栏布局**: 侧边栏（文件/对话）| 画布（3D 查看器）| 控制台（步骤/聊天）
- **文件上传**: 拖拽上传 FASTA/PDB 文件
- **结构标签页**: 多个 PDB 文件可同时打开
- **SSE 流式**: 实时折叠进度和步骤事件
- **3D 可视化**: Mol* 蛋白质结构渲染
- **质量指标**: pLDDT 和 PAE 分数展示
- **深色/浅色主题**: Figma 对齐的设计系统

## 快速开始

### 零依赖模式（推荐本地开发）

**无需 Docker！使用 SQLite + FakeRedis 即时启动。**

```bash
# 1. 后端 (端口 8000) - 约 1 秒启动
cd backend
uv sync                           # 安装依赖
uv run uvicorn app.main:app --reload

# 2. 前端 (端口 3000)
cd web
npm install
npm run dev
```

打开 http://localhost:3000

### 生产模拟模式

**使用 MySQL + Redis 容器模拟完整生产环境。**

```bash
# 1. 启动基础设施
./scripts/local-dev/start.sh     # 启动 MySQL + Redis 容器

# 2. 后端 (端口 8000)
cd backend
uv sync
uv run uvicorn app.main:app --reload

# 3. 前端 (端口 3000)
cd web
npm install
npm run dev
```

详细配置请参阅 [database_setup.md](docs/developer/database_setup.md)。

## 系统架构

```
  用户浏览器
  ┌────────────────────────────────────────────────────────┐
  │     侧边栏      │      画布         │   聊天面板       │
  │     文件管理    │     Mol* 3D       │    对话交互      │
  └────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │   Next.js 前端      │
                    │    (端口 3000)      │
                    └─────────────────────┘
                              │ REST API / SSE
                              ▼
                    ┌─────────────────────┐
                    │   FastAPI 后端      │
                    │    (端口 8000)      │
                    └─────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
    ┌───────────┐       ┌───────────┐       ┌───────────┐
    │  MySQL/   │       │  Redis/   │       │ 折叠      │
    │  SQLite   │       │ FakeRedis │       │ GPU       │
    │ (持久化)  │       │  (缓存)   │       │ (可选)    │
    └───────────┘       └───────────┘       └───────────┘
```

**开发模式:**

- **零依赖模式**: SQLite + FakeRedis（无需 Docker）
- **生产模拟模式**: MySQL + Redis（Docker 容器）

## API 端点

| 方法     | 端点                        | 描述              |
| -------- | --------------------------- | ----------------- |
| GET      | `/api/v1/health`            | 健康检查          |
| POST/GET | `/api/v1/conversations`     | 对话 CRUD         |
| POST/GET | `/api/v1/tasks`             | 任务管理          |
| GET      | `/api/v1/tasks/{id}/stream` | SSE 进度流        |
| GET      | `/api/v1/structures/{id}`   | 下载 PDB 文件     |

## SSE 事件格式

```typescript
event: step
data: {
  "eventId": "evt_0001",
  "taskId": "task_123",
  "stage": "MSA" | "MODEL" | "RELAX" | "QA" | "DONE" | "ERROR",
  "status": "queued" | "running" | "partial" | "complete" | "failed",
  "progress": 0-100,
  "message": "人类可读的状态信息",
  "artifacts": [{ "structureId": "str_001", "metrics": { "plddtAvg": 85.5 }}]
}
```

## 项目结构

```
ChatFold-MVP/
├── web/                    # Next.js 14 前端
│   └── src/
│       ├── app/            # App Router 页面
│       ├── components/     # React 组件 (36 个文件)
│       ├── hooks/          # useFoldingTask, useResizable
│       └── lib/            # store.ts, types.ts, utils
│
├── backend/                # FastAPI 后端
│   └── app/
│       ├── api/v1/         # 版本化端点
│       ├── services/       # storage, mock_folding
│       └── models/         # Pydantic schemas
│
└── docs/                   # 文档
```

## 技术栈

**前端**

- Next.js 14 (App Router) / React 18 / TypeScript
- TailwindCSS / shadcn/ui (Radix UI)
- Zustand (状态管理，支持持久化)
- Mol* 4.5.0 (3D 可视化)

**后端**

- Python 3.10+ / FastAPI / uv (包管理器)
- Pydantic 2.0+ (数据验证)
- Uvicorn (ASGI 服务器)

**存储**

- **数据库**: SQLite (本地开发) / MySQL 8.0+ (生产环境)
- **缓存**: FakeRedis (本地开发) / Redis 5.0+ (生产环境)
- **文件**: 本地文件系统 / S3 兼容存储

## 测试数据

示例文件位于 `web/tests/fixtures/`:

- `9CG9_HMGB1.fasta` - 示例 FASTA 序列
- `9CG9_HMGB1.pdb` - 参考 PDB 结构 (Git LFS)

## 使用方法

1. **开始对话**: 点击 "+" 或上传 FASTA 文件
2. **提交序列**: 在聊天中粘贴 FASTA 或拖拽文件
3. **查看进度**: 步骤面板实时显示折叠阶段
4. **查看结构**: 点击生成结构的 "打开"
5. **下载**: 使用工具栏或步骤卡片的下载按钮

## 设计规范

- **主题**: 深色模式，背景色 `#1e1e1e`
- **字体**: Karla, PingFang SC
- **颜色**: 详见 `tailwind.config.ts` 调色板

## 配置

### 环境变量

在项目根目录创建 `.env` 文件:

```bash
# 数据库类型: sqlite | mysql
CHATFOLD_DATABASE_TYPE=sqlite

# Redis 类型: fake | docker
CHATFOLD_REDIS_TYPE=fake

# 存储模式: true (内存) | false (持久化)
CHATFOLD_USE_MEMORY_STORE=true
```

查看 [.env.example](.env.example) 获取所有可用选项。

### 文档

- **快速入门**: [getting_started.md](docs/developer/getting_started.md)
- **数据库配置**: [database_setup.md](docs/developer/database_setup.md)
- **系统架构**: [architecture.md](docs/developer/architecture.md)
- **贡献指南**: [contributing.md](docs/workflow/contributing.md)

完整文档: [docs/README.md](docs/README.md)
