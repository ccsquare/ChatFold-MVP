# ChatFold 文档中心

欢迎来到 ChatFold 项目文档中心！本文档体系帮助开发者快速理解项目架构、掌握开发规范，并高效协作。

## 文档导航

### 开发者文档 ([developer/](./developer/))

新成员入门和核心开发指南

- **[getting_started.md](./developer/getting_started.md)** - 10 分钟快速入门（新人首选）
- **[architecture.md](./developer/architecture.md)** - 系统架构设计和技术栈
- **[local_setup.md](./developer/local_setup.md)** - 本地开发环境搭建
- **[data_model.md](./developer/data_model.md)** - 数据模型设计

### 工作流程文档 ([workflow/](./workflow/))

协作流程和规范

- **[contributing.md](./workflow/contributing.md)** - 贡献指南和 Commit 规范
- **[pr.md](./workflow/pr.md)** - Pull Request 提交规范

### 功能实现文档 ([features/](./features/))

具体功能的技术实现细节

- **[sse_streaming.md](./features/sse_streaming.md)** - SSE 流式进度推送
- **[folding_service.md](./features/folding_service.md)** - 蛋白质折叠服务集成
- **[molstar_viewer.md](./features/molstar_viewer.md)** - Mol* 3D 结构查看器

### 运维文档 ([operations/](./operations/))

DevOps 实践和部署

- **[local_dev.md](./operations/local_dev.md)** - 本地开发环境 (Docker)
- **[deployment.md](./operations/deployment.md)** - 生产环境部署

### 通用准则 ([standards/](./standards/))

可复用的通用开发协作准则

- **[coding.md](./standards/coding.md)** - 编码规范
- **[gitflow.md](./standards/gitflow.md)** - Git 分支策略

---

## 快速开始

### 1. 新成员入门 (10 分钟)

```bash
# 克隆项目
git clone <repo-url>
cd ChatFold-MVP

# 阅读入门文档
open docs/developer/getting_started.md
```

推荐阅读顺序：
1. [getting_started.md](./developer/getting_started.md) - 快速上手
2. [architecture.md](./developer/architecture.md) - 了解架构
3. [local_setup.md](./developer/local_setup.md) - 搭建环境

### 2. 开始开发

```bash
# 启动后端
cd backend && uv run uvicorn app.main:app --reload --port 8000

# 启动前端
cd web && npm run dev
```

### 3. 提交代码

遵循 [contributing.md](./workflow/contributing.md) 中的规范。

---

## 项目结构

```
ChatFold-MVP/
├── web/                 # Next.js 前端
│   ├── src/
│   │   ├── app/         # App Router 页面
│   │   ├── components/  # React 组件
│   │   └── lib/         # 工具和状态管理
│   └── package.json
│
├── backend/             # FastAPI 后端
│   ├── app/
│   │   ├── api/         # API 端点
│   │   ├── db/          # 数据库 (Redis)
│   │   ├── models/      # 数据模型
│   │   └── services/    # 业务逻辑
│   └── pyproject.toml
│
├── docs/                # 项目文档
└── scripts/             # 部署脚本
```

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | Next.js 14, React 18, TypeScript, TailwindCSS, Zustand, Mol* |
| **后端** | Python 3.10+, FastAPI, Pydantic, Redis |
| **数据库** | MySQL (持久化), Redis (缓存/状态) |
| **部署** | Docker, Kubernetes |

---

## 相关链接

- **项目配置**: [CLAUDE.md](../CLAUDE.md) - Claude Code 助手配置
- **API 文档**: http://localhost:8000/docs (本地开发时)

---

**文档版本**: 2025-01-01
**维护者**: ChatFold 开发团队
