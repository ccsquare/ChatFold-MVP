# CLAUDE.md - ChatFold Project Guidance

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **完整文档体系**: 参考 [docs/README.md](./docs/README.md) 查看完整文档导航
> **快速入门**: 新成员请先阅读 [getting_started.md](./docs/developer/getting_started.md)（10分钟上手）

## 1. 产品概览

ChatFold 是一个 ChatGPT 风格的蛋白质折叠工作台，提供实时流式进度展示和 3D 结构可视化。

### 核心功能

**输入**:

- FASTA 格式蛋白质序列 (10-5000 氨基酸)
- PDB 结构文件（拖拽上传）
- 自然语言对话指令

**输出**:

- 3D 蛋白质结构可视化 (Mol\*)
- 实时折叠进度 (SSE streaming)
- Chain-of-Thought 思考过程展示
- 结构质量指标 (pLDDT, PAE)
- 可下载的 PDB/CIF 结构文件
- 多候选结构对比

## 2. 项目结构

```text
ChatFold-MVP/
├── backend/                  # FastAPI 后端服务
│   └── app/
│       ├── api/v1/endpoints/ # API 路由 (auth, tasks, folders, etc.)
│       ├── components/       # 业务组件
│       │   ├── nanocc/       # NanoCC 折叠服务集成
│       │   └── workspace/    # 工作空间管理
│       ├── db/               # 数据库 (MySQL, Redis)
│       ├── models/           # Pydantic schemas
│       ├── repositories/     # 数据访问层
│       └── services/         # 业务逻辑服务
├── web/                      # Next.js 前端应用
│   └── src/
│       ├── app/              # App Router 页面
│       │   └── auth/         # 认证页面
│       ├── components/       # React 组件
│       │   ├── auth/         # 认证组件
│       │   ├── chat/         # 聊天组件
│       │   ├── molstar/      # 3D 查看器
│       │   ├── timeline/     # 时间线组件
│       │   └── ui/           # shadcn/ui 组件
│       ├── hooks/            # React Hooks
│       └── lib/              # 工具库和状态管理
│           ├── api/          # API 客户端
│           └── stores/       # Zustand stores
├── scripts/                  # 开发和 CI 脚本
│   └── local-dev/            # 本地开发工具
├── tests/                    # E2E 测试
└── docs/                     # 项目文档
```

## 3. 技术栈

### 后端核心

- **框架**: Python 3.10+ / FastAPI
- **数据验证**: Pydantic 2.0+
- **ORM**: SQLAlchemy 2.0+
- **数据库**: MySQL 8.0+（持久化）/ SQLite（本地开发）
- **缓存**: Redis 5.0+（状态/事件队列）/ FakeRedis（本地开发）
- **认证**: JWT (HS256) + bcrypt 密码哈希
- **包管理**: uv

### 前端

- **框架**: Next.js 14 / React 18 / TypeScript
- **样式**: TailwindCSS
- **状态管理**: Zustand (支持持久化)
- **3D 可视化**: Mol\* 4.5.0
- **UI 组件**: shadcn/ui
- **端口**: 3000

### 外部服务

- **NanoCC**: 蛋白质折叠 GPU 推理服务
  - ColabFold (AlphaFold2)
  - Boltz
  - Protenix ESM
  - IgFold

### 开发工具

- **代码检查**: ruff (check + format)
- **测试**: pytest (后端) / Playwright (E2E)

## 4. 快速开发命令

### 基础设施

```bash
# 启动 MySQL 和 Redis 容器
./scripts/local-dev/start.sh

# 停止基础设施
./scripts/local-dev/stop.sh

# 查看容器状态
docker ps | grep chatfold
```

### 后端开发

```bash
cd backend

# 安装依赖
uv sync

# 启动开发服务器（端口 8000）
uv run uvicorn app.main:app --reload --port 8000

# 运行测试
uv run pytest

# 代码检查
uv run ruff check .
uv run ruff format .
```

### 前端开发

```bash
cd web

# 安装依赖
npm install

# 启动开发服务器（端口 3000）
npm run dev

# 构建生产版本
npm run build

# 代码检查
npm run lint
```

## 5. 系统架构

```
  用户浏览器
  ┌────────────────────────────────────────────────────────┐
  │     Sidebar      │      Canvas       │   Chat Panel    │
  │     文件管理      │     Mol* 3D       │    对话交互      │
  └────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │   Next.js 前端       │
                    │    (Port 3000)      │
                    └─────────────────────┘
                              │ REST API / SSE
                              ▼
                    ┌─────────────────────┐
                    │   FastAPI 后端       │
                    │    (Port 8000)      │
                    └─────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
    ┌───────────┐       ┌───────────┐       ┌───────────┐
    │   MySQL   │       │   Redis   │       │  NanoCC   │
    │  持久化    │       │  状态缓存  │       │  折叠服务  │
    └───────────┘       └───────────┘       └───────────┘
```

### 关键组件

**前端:**

- **LayoutShell.tsx**: 三栏布局 (sidebar | canvas | chat)
- **MolstarViewer.tsx**: 3D 结构查看器，动态加载
- **ChatPanel.tsx**: 对话交互面板
- **ThinkingSummary.tsx**: 折叠的思考气泡，显示内容预览
- **AuthProvider.tsx**: 认证状态初始化
- **useFoldingTask.ts**: SSE 流式任务 Hook
- **store.ts**: Zustand 全局状态管理
- **authStore.ts**: 认证状态管理

**后端:**

- **auth.py**: 认证端点 (登录、注册、验证码)
- **tasks.py**: 任务管理和 SSE 流
- **nanocc/client.py**: NanoCC 服务客户端
- **task_state.py**: Redis 任务状态缓存
- **sse_events.py**: Redis SSE 事件队列

## 6. 数据模型

```
User → Project → Folder ◄──► Conversation → Message
                   │
                   └── Asset
      → Task → Structure
```

| 概念             | 说明                                 |
| ---------------- | ------------------------------------ |
| **User**         | 用户账户 (email, username, password) |
| **Project**      | 项目，用户的顶层组织单位             |
| **Folder**       | 工作目录，包含输入文件和输出结构     |
| **Conversation** | 对话会话，与 Folder 1:1 关联         |
| **Message**      | 单条消息 (user/assistant/system)     |
| **Task**         | 折叠任务，关联用户和会话             |
| **Structure**    | 生成的 PDB/CIF 结构文件              |
| **Asset**        | 用户上传的文件                       |

**详细说明**: [docs/developer/data_model.md](./docs/developer/data_model.md)

## 7. API 端点

### 认证端点

| 端点                                  | 方法 | 说明         |
| ------------------------------------- | ---- | ------------ |
| `/api/v1/auth/send-verification-code` | POST | 发送验证码   |
| `/api/v1/auth/register`               | POST | 注册用户     |
| `/api/v1/auth/login`                  | POST | 登录获取 JWT |
| `/api/v1/auth/me`                     | GET  | 获取当前用户 |

### 核心端点

| 端点                        | 方法      | 说明           |
| --------------------------- | --------- | -------------- |
| `/api/v1/health`            | GET       | 健康检查       |
| `/api/v1/users/me`          | GET/PATCH | 用户信息       |
| `/api/v1/folders`           | POST/GET  | 文件夹 CRUD    |
| `/api/v1/conversations`     | POST/GET  | 对话 CRUD      |
| `/api/v1/tasks`             | POST/GET  | 任务管理       |
| `/api/v1/tasks/{id}/stream` | GET       | SSE 折叠进度流 |
| `/api/v1/tasks/{id}/cancel` | POST      | 取消任务       |
| `/api/v1/tasks/{id}/state`  | GET       | 获取任务状态   |
| `/api/v1/tasks/{id}/events` | GET       | 获取事件重放   |
| `/api/v1/structures/{id}`   | GET/POST  | 结构文件管理   |

### SSE 事件结构

```typescript
{
  eventId: string;
  taskId: string;
  stage: 'QUEUED' | 'MSA' | 'MODEL' | 'RELAX' | 'QA' | 'DONE' | 'ERROR';
  status: 'queued' | 'running' | 'partial' | 'complete' | 'failed';
  progress: number; // 0-100
  message: string;
  artifacts?: Structure[];
}
```

## 8. 认证系统

### JWT 认证流程

1. **注册**: 邮箱 → 验证码 → 用户名/密码 → JWT 令牌
2. **登录**: 邮箱 + 密码 → JWT 令牌
3. **令牌**: 15 分钟有效期，自动注入请求头

### 开发模式

- 验证码会打印到后端日志
- 前端支持自动填充验证码

### 受保护端点

需要 `Authorization: Bearer <token>` 头：

- `POST /tasks` - 创建任务
- `GET /auth/me` - 获取当前用户
- `PATCH /users/me` - 更新用户信息

## 9. 开发规范

### Git Commit Message 规范

**格式**: 多行格式（首行 + 详细说明）

```text
type: subject

Changes:
- 具体修改点1
- 具体修改点2

Benefits:
- 改进带来的好处1
- 改进带来的好处2
```

**类型 (type)**:

- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 测试相关
- `build`: 构建相关
- `chore`: 其他杂项

**要求**:

- 全部使用英文
- 第一行不超过 50 个字符，无标点符号
- 第二行空行
- 第三行开始：Changes 和 Benefits 部分
- 不使用 "Generated by" 和 "Co-authored-by" 字段

**完整规范**: [docs/workflow/contributing.md](./docs/workflow/contributing.md)

### 代码质量要求

- **类型注解**: Python 代码必须包含类型提示 (type hints)
- **异步编程**: 网络请求和 I/O 操作使用 `async/await`
- **错误处理**: 使用 try-except 捕获和记录异常
- **日志记录**: 使用 `logging` 模块，避免使用 `print()`

### Python 导入规范

**必须使用绝对导入** (PEP 8 推荐)

```python
# ✅ 正确：绝对导入
from app.utils.id_generator import generate_id
from app.components.nanocc import NanoCCJob
from app.models.schemas import Conversation

# ❌ 错误：相对导入
from .id_generator import generate_id
from ..models.schemas import Conversation
```

**原因**:

- 可读性：一眼看出模块来源
- 可重构性：移动文件时 IDE 自动更新
- 一致性：避免混合风格

### 文档命名规范

**项目文档**: `lowercase_with_underscores.md`

示例: `getting_started.md`, `local_setup.md`, `data_model.md`

例外: `README.md` 允许大写

## 10. 环境配置

### 环境变量文件

- `.env.development` - 开发环境（SQLite + FakeRedis）
- `.env.production` - 生产环境（MySQL + Redis）
- `.env.test` - 测试环境

### 主要配置项

```bash
# 数据库
DATABASE_TYPE=sqlite|mysql
CHATFOLD_DATABASE_URL=mysql+pymysql://...

# Redis
REDIS_TYPE=in_memory|redis
CHATFOLD_REDIS_HOST=localhost
CHATFOLD_REDIS_PORT=6379

# NanoCC
USE_MOCK_NANOCC=true|false
NANOCC_FS_ROOT=/path/to/sessions
NANOCC_SCHEDULER_URL=http://...

# 认证
JWT_SECRET_KEY=your-secret-key
JWT_EXPIRE_MINUTES=15
```

## 11. 文档导航

### 新成员入门

1. **快速开始** (10 分钟)
   - [getting_started.md](./docs/developer/getting_started.md) - 快速上手指南

2. **了解项目**
   - [architecture.md](./docs/developer/architecture.md) - 系统架构设计
   - [data_model.md](./docs/developer/data_model.md) - 数据模型设计
   - [authentication.md](./docs/developer/authentication.md) - 认证系统

3. **环境搭建**
   - [local_setup.md](./docs/developer/local_setup.md) - 本地开发环境
   - [database_setup.md](./docs/developer/database_setup.md) - 数据库配置

4. **开始开发**
   - [contributing.md](./docs/workflow/contributing.md) - 贡献指南和 Commit 规范
   - [pr.md](./docs/workflow/pr.md) - Pull Request 提交规范

## 12. 常用链接

- **API 文档**: <http://localhost:8000/docs> (本地开发)
- **前端界面**: <http://localhost:3000> (本地开发)
- **完整文档**: [docs/README.md](./docs/README.md)

---

**版本**: 2.0
**最后更新**: 2025-01-29
**维护者**: ChatFold 开发团队
