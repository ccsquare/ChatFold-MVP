# ChatFold 系统架构

## 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                           用户浏览器                                 │
└─────────────────────────────────────────┬───────────────────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
                    ▼                     ▼                     ▼
            ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
            │   Sidebar   │       │   Canvas    │       │ Chat Panel  │
            │  文件管理    │       │  Mol* 3D   │       │   对话交互   │
            └─────────────┘       └─────────────┘       └─────────────┘
                    │                     │                     │
                    └─────────────────────┼─────────────────────┘
                                          │
                              ┌───────────┴───────────┐
                              │     Next.js 前端       │
                              │     (Port 3000)       │
                              └───────────┬───────────┘
                                          │ REST API / SSE
                              ┌───────────┴───────────┐
                              │    FastAPI 后端        │
                              │     (Port 8000)       │
                              └───────────┬───────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
                    ▼                     ▼                     ▼
            ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
            │    MySQL    │       │    Redis    │       │ Folding GPU │
            │   持久化     │       │  状态缓存   │       │   外部服务   │
            └─────────────┘       └─────────────┘       └─────────────┘
```

## 技术栈

### 前端

| 技术 | 用途 |
|------|------|
| Next.js 14 | React 框架，App Router |
| TypeScript | 类型安全 |
| TailwindCSS | 样式 |
| Zustand | 状态管理 |
| Mol* 4.5.0 | 3D 蛋白质结构可视化 |
| shadcn/ui | UI 组件库 |

### 后端

| 技术 | 用途 |
|------|------|
| Python 3.10+ | 运行环境 |
| FastAPI | Web 框架 |
| Pydantic | 数据验证 |
| Redis | 任务状态缓存 |
| uv | 包管理器 |

### 数据存储

| 存储 | 用途 |
|------|------|
| MySQL | 持久化数据（用户、任务、结构元数据） |
| Redis | 运行时状态、SSE 事件队列 |
| FileSystem | PDB 文件、用户上传文件 |

## 核心模块

### 前端模块

```
web/src/
├── app/                 # Next.js App Router
│   └── page.tsx         # 主页面
├── components/
│   ├── layout/          # 布局组件
│   │   └── LayoutShell.tsx
│   ├── sidebar/         # 侧边栏
│   ├── canvas/          # 3D 查看器
│   │   └── MolstarViewer.tsx
│   └── chat/            # 对话面板
│       └── ChatPanel.tsx
├── hooks/
│   └── useFoldingTask.ts  # SSE 流式任务
└── lib/
    ├── store.ts         # Zustand 状态
    └── types.ts         # 类型定义
```

### 后端模块

```
backend/app/
├── api/v1/
│   ├── conversations.py  # 对话 API
│   ├── tasks.py          # 任务 API
│   └── structures.py     # 结构文件 API
├── db/
│   ├── redis_db.py       # Redis 数据库分配
│   └── redis_cache.py    # Redis 缓存工具
├── models/
│   └── schemas.py        # Pydantic 模型
├── services/
│   └── nanocc_service.py # 折叠服务集成
└── settings.py           # 配置管理
```

## 数据流

### 折叠任务流程

```
用户输入序列
      │
      ▼
┌─────────────┐    POST /tasks     ┌─────────────┐
│   前端       │ ─────────────────► │   后端       │
│             │                    │             │
│             │    SSE Stream      │             │
│             │ ◄───────────────── │             │
└─────────────┘                    └──────┬──────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
                    ▼                     ▼                     ▼
            ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
            │    MySQL    │       │    Redis    │       │ Folding GPU │
            │  保存任务    │       │  状态更新   │       │  执行折叠   │
            └─────────────┘       └─────────────┘       └─────────────┘
```

### SSE 事件流

```
Folding GPU          Backend                Redis              Frontend
    │                   │                     │                    │
    │ 进度回调           │                     │                    │
    │─────────────────►│                     │                    │
    │                   │ HSET state          │                    │
    │                   │────────────────────►│                    │
    │                   │ LPUSH events        │                    │
    │                   │────────────────────►│                    │
    │                   │                     │                    │
    │                   │ SSE: step_event     │                    │
    │                   │────────────────────────────────────────►│
    │                   │                     │                    │
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/health` | GET | 健康检查 |
| `/api/v1/conversations` | POST/GET | 对话 CRUD |
| `/api/v1/tasks` | POST/GET | 任务管理 |
| `/api/v1/tasks/{id}/stream` | GET | SSE 进度流 |
| `/api/v1/structures/{id}` | GET | 下载 PDB |

## 外部服务

### Folding GPU 服务

蛋白质折叠 GPU 推理服务，提供多个模型：

| 端点 | 模型 | 特点 |
|------|------|------|
| `/colabfold-gpu/fold` | ColabFold (AlphaFold2) | 高精度 |
| `/boltz-gpu/fold` | Boltz | 快速 |
| `/protenix-gpu/fold-esm` | Protenix ESM | 无需 MSA |
| `/igfold-gpu/fold` | IgFold | 抗体专用 |

---

**更新日期**: 2025-01-01
