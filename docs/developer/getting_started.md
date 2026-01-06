# ChatFold 快速入门

10 分钟带你了解 ChatFold 项目并开始开发。

## 项目简介

ChatFold 是一个 ChatGPT 风格的蛋白质折叠工作台，提供：

- 实时流式折叠进度展示
- 3D 蛋白质结构可视化 (Mol\*)
- 多候选结构对比

## 环境要求

| 工具    | 版本    | 说明             |
| ------- | ------- | ---------------- |
| Node.js | >= 18   | 前端运行环境     |
| Python  | >= 3.10 | 后端运行环境     |
| Docker  | >= 24   | MySQL/Redis 容器 |
| uv      | latest  | Python 包管理器  |

## 快速启动

### 1. 克隆项目

```bash
git clone <repo-url>
cd ChatFold-MVP
```

### 2. 启动基础设施

```bash
# 启动 MySQL 和 Redis
./scripts/local-dev/start.sh
```

### 3. 启动后端

```bash
cd backend

# 安装依赖
uv sync

# 启动服务
uv run uvicorn app.main:app --reload --port 8000
```

访问 http://localhost:8000/docs 查看 API 文档。

### 4. 启动前端

```bash
cd web

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

访问 http://localhost:3000 查看应用。

## 项目结构速览

```
ChatFold-MVP/
├── web/                 # Next.js 前端
│   └── src/
│       ├── components/  # UI 组件
│       └── lib/         # 状态管理
│
├── backend/             # FastAPI 后端
│   └── app/
│       ├── api/         # API 端点
│       ├── db/          # Redis 缓存
│       └── services/    # 业务逻辑
│
└── docs/                # 项目文档
```

## 核心概念

| 概念             | 说明                             |
| ---------------- | -------------------------------- |
| **Folder**       | 工作目录，包含输入文件和输出结构 |
| **Conversation** | 对话会话，与 Folder 1:1 关联     |
| **Message**      | 单条消息 (user/assistant)        |
| **Task**         | 折叠任务，产出 Structure         |
| **Structure**    | 生成的 PDB 结构文件              |

## 下一步

- [architecture.md](./architecture.md) - 深入了解系统架构
- [local_setup.md](./local_setup.md) - 详细的环境配置
- [data_model.md](./data_model.md) - 数据模型设计

## 常见问题

### Q: 后端启动失败，提示连接 Redis 失败

确保 Docker 容器已启动：

```bash
docker ps | grep chatfold
```

### Q: 前端页面空白

检查后端是否正常运行：

```bash
curl http://localhost:8000/api/v1/health
```

---

**更新日期**: 2025-01-01
