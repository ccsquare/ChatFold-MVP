# 前端工程师快速上手指南

> **目标读者**: 兼职前端工程师
> **预计阅读时间**: 30 分钟
> **Figma 设计稿**: [ChatFold Design](https://www.figma.com/design/gjdTkVvIVBd5ou18mWpjbR/%F0%9F%9F%A1-SPX-%E8%AE%BE%E8%AE%A1--Copy--ChatFold?node-id=364-1862&p=f)

---

## 1. 项目简介

ChatFold 是一个 **ChatGPT 风格的蛋白质折叠工作台**，核心功能：

- 蛋白质序列输入与折叠任务提交
- **实时 SSE 流式**展示折叠进度和 AI 思考过程 (Chain-of-Thought)
- **Mol* 3D 可视化**蛋白质结构
- 多候选结构对比

**设计理念**: 将计算等待时间转化为用户洞察 (Time → Insight)。

---

## 2. 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js | 14 | React 框架，App Router |
| TypeScript | 5.x | 类型安全 |
| TailwindCSS | 3.x | 样式 |
| Zustand | 4.x | 状态管理 |
| Mol* | 4.5.0 | 3D 蛋白质可视化 |
| shadcn/ui | latest | UI 组件库 |
| Lucide Icons | latest | 图标库 |

---

## 3. 环境搭建

### 3.1 前置要求

```bash
# Node.js >= 18
node -v

# 包管理器 (npm 或 pnpm)
npm -v
```

### 3.2 启动前端开发服务器

```bash
cd web

# 安装依赖
npm install

# 启动开发服务器 (端口 3000)
npm run dev
```

访问 http://localhost:3000

### 3.3 启动后端服务 (可选)

如需完整功能测试，需启动后端：

```bash
# 方式 1: 零依赖模式 (推荐，无需 Docker)
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000

# 方式 2: 完整模式 (需要 Docker)
./scripts/local-dev/start.sh  # 启动 MySQL + Redis
cd backend && uv run uvicorn app.main:app --reload --port 8000
```

后端 API 文档: http://localhost:8000/docs

### 3.4 测试序列数据

项目提供预置测试序列，方便开发调试：

**文件位置**: `web/src/test/fixtures/`

| 文件 | 内容 | 用途 |
|------|------|------|
| `test_sequences.ts` | TypeScript 导出 | 代码中直接 import |
| `insulin_a.fasta` | 胰岛素A链 (21 aa) | 快速测试 |
| `ubiquitin.fasta` | 泛素蛋白 (76 aa) | 中等长度测试 |

**使用方式**:

```typescript
import {
  HEMOGLOBIN_BETA_SEQUENCE,  // 147 aa - 标准测试
  GFP_SEQUENCE,               // 238 aa - 长序列测试
  SAMPLE_SEQUENCES,           // 快捷按钮数组
} from '@/test/fixtures/test_sequences';

// 直接提交序列
submit(HEMOGLOBIN_BETA_SEQUENCE);

// 快捷按钮使用
SAMPLE_SEQUENCES.map(s => (
  <button onClick={() => setInput(s.sequence)}>{s.label}</button>
));
```

**可用序列**:

| 名称 | 长度 | 说明 |
|------|------|------|
| 胰岛素A链 | 21 aa | 最短，快速验证 |
| 泛素蛋白 | 76 aa | 中等长度 |
| 血红蛋白B链 | 147 aa | 标准测试序列 |
| GFP | 238 aa | 长序列/压力测试 |

---

## 4. 项目结构

```
web/src/
├── app/                      # Next.js App Router
│   ├── page.tsx              # 主页面入口
│   ├── layout.tsx            # 根布局
│   └── globals.css           # 全局样式
│
├── components/               # UI 组件
│   ├── layout/               # 布局相关 (暂无)
│   ├── ui/                   # shadcn/ui 基础组件
│   ├── auth/                 # 认证组件
│   ├── chat/                 # 聊天相关组件
│   ├── timeline/             # 时间线组件 (CoT 展示)
│   ├── molstar/              # Mol* 3D 查看器
│   ├── icons/                # 自定义图标
│   │
│   ├── LayoutShell.tsx       # ⭐ 三栏布局容器
│   ├── Sidebar.tsx           # 侧边栏 (文件/项目管理)
│   ├── Canvas.tsx            # 画布区域 (Mol* 容器)
│   ├── ChatPanel.tsx         # ⭐ 聊天面板 (右侧)
│   ├── StepsPanel.tsx        # 步骤面板 (折叠进度)
│   ├── StructureArtifactCard.tsx # 结构卡片
│   └── ThinkingSummary.tsx   # CoT 思考摘要
│
├── hooks/                    # 自定义 Hooks
│   ├── useFoldingTask.ts     # ⭐ SSE 流式任务 Hook
│   └── useConversationTimeline.ts # 时间线聚合
│
└── lib/                      # 工具库
    ├── types.ts              # ⭐ TypeScript 类型定义
    ├── store.ts              # ⭐ Zustand 状态管理
    ├── api.ts                # API 调用封装
    └── utils.ts              # 工具函数
```

---

## 5. 核心概念

### 5.1 数据模型

```
User → Project → Folder ◄──► Conversation → Message → Job → Structure
```

| 概念 | 说明 | 对应前端类型 |
|------|------|-------------|
| **User** | 用户账户 | `User` |
| **Project** | 项目 (MVP 单项目) | `Project` |
| **Folder** | 工作目录 | `Folder` |
| **Conversation** | 对话会话，与 Folder 1:1 | `Conversation` |
| **Message** | 聊天消息 | `ChatMessage` |
| **Job** | 折叠任务 | `Job` |
| **StepEvent** | 任务进度事件 | `StepEvent` |
| **StructureArtifact** | PDB 结构文件 | `StructureArtifact` |

### 5.2 三栏布局

```
┌─────────────────────────────────────────────────────────────────────┐
│                              Header                                  │
├──────────────┬────────────────────────────────┬─────────────────────┤
│   Sidebar    │          Canvas                │    ChatPanel        │
│   (280px)    │       (Mol* 3D)                │    (右侧面板)        │
│              │                                │                     │
│ - 文件管理    │   蛋白质 3D 结构               │ - 聊天输入           │
│ - 项目列表    │                                │ - 时间线/步骤        │
│ - 对话历史    │                                │ - 结构卡片           │
└──────────────┴────────────────────────────────┴─────────────────────┘
```

**关键组件**:
- `LayoutShell.tsx`: 三栏布局容器
- `Sidebar.tsx`: 左侧导航
- `Canvas.tsx` + `molstar/`: 中间 3D 查看器
- `ChatPanel.tsx`: 右侧对话面板

### 5.3 SSE 流式通信

前端通过 SSE (Server-Sent Events) 接收折叠进度：

```typescript
// hooks/useFoldingTask.ts
const eventSource = new EventSource(`/api/v1/tasks/${taskId}/stream`);

eventSource.addEventListener('step', (event) => {
  const stepEvent: StepEvent = JSON.parse(event.data);
  // 更新 UI
});
```

**StepEvent 结构**:

```typescript
interface StepEvent {
  eventId: string;
  jobId: string;
  ts: number;                    // Unix 时间戳 (ms)
  eventType: EventType;          // UI 区域映射
  stage: StageType;              // QUEUED | MSA | MODEL | RELAX | QA | DONE
  status: StatusType;            // queued | running | complete | failed
  progress: number;              // 0-100
  message: string;               // CoT 消息文本
  artifacts?: StructureArtifact[]; // 生成的结构
}
```

**EventType 与 UI 区域映射**:

| EventType | UI 区域 | 展示方式 |
|-----------|---------|----------|
| `PROLOGUE` | 区域 2 | 开场白，固定展示 |
| `ANNOTATION` | 区域 2 | 注释信息 |
| `THINKING_TEXT` | 区域 3 | 滚动文本，显示最后 2 行 |
| `THINKING_PDB` | 区域 4 | 带结构输出的思考块 |
| `CONCLUSION` | 区域 5 | 最终结论 |

### 5.4 状态管理 (Zustand)

```typescript
// lib/store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // 状态
      conversations: [],
      folders: [],
      activeJob: null,
      viewerTabs: [],

      // Actions
      createConversation: () => { ... },
      addStepEvent: (jobId, event) => { ... },
      openStructureTab: (structure, pdbData) => { ... },
    }),
    { name: 'chatfold-storage' }
  )
);
```

---

## 6. 关键文件详解

### 6.1 types.ts - 类型定义

所有前后端共享的类型定义，**修改前需与后端确认**。

核心类型:
- `User`, `Project`, `Folder` - 组织结构
- `Conversation`, `ChatMessage` - 对话
- `Job`, `StepEvent`, `StructureArtifact` - 折叠任务
- `EventType`, `StageType`, `StatusType` - 枚举
- `AppState` - Zustand store 类型

### 6.2 useFoldingTask.ts - SSE 流处理

```typescript
const { submit, isStreaming, error } = useFoldingTask();

// 提交折叠任务
await submit(sequence, conversationId);
```

### 6.3 ChatPanel.tsx - 聊天面板

用户输入序列、发送消息、展示对话历史。

关键功能:
- FASTA 格式解析
- 序列验证 (10-5000 氨基酸)
- @ 文件引用
- 快捷样本按钮

### 6.4 timeline/ - 时间线组件

展示 CoT (Chain-of-Thought) 消息流：

```
timeline/
├── TimelineRenderer.tsx    # 时间线渲染器
├── PrologueBubble.tsx      # 开场白气泡
├── ThinkingBubble.tsx      # 思考过程气泡
├── ConclusionBubble.tsx    # 结论气泡
└── BestBlock.tsx           # 最佳结构卡片
```

---

## 7. Figma 设计稿

**设计稿地址**:
```
https://www.figma.com/design/gjdTkVvIVBd5ou18mWpjbR/%F0%9F%9F%A1-SPX-%E8%AE%BE%E8%AE%A1--Copy--ChatFold?node-id=364-1862&p=f
```

### 主要界面

| 界面 | Node ID | 说明 |
|------|---------|------|
| Components (总览) | `364:1862` | 组件库 |
| Flow (交互流程) | `364:1863` | 完整交互流程 |
| Workstation - 空态 | `381:3938` | 初始空白状态 |
| Workstation - Default | `594:664` | 带序列输入状态 |

### 设计规范

- **侧边栏宽度**: 280px
- **图标**: Lucide Icons (16x16)
- **主题**: 支持 Light/Dark 切换
- **快捷样本**: 人类血红蛋白B链、胰岛素A链、GFP、短测试肽段

---

## 8. 开发工作流

### 8.1 日常开发

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 创建功能分支
git checkout -b feat/your-feature

# 3. 启动开发服务器
cd web && npm run dev

# 4. 开发...

# 5. 代码检查
npm run lint

# 6. 提交
git add .
git commit -m "feat: your feature description"
git push origin feat/your-feature
```

### 8.2 与后端联调

1. **Mock 模式** (独立开发):
   - 后端设置 `USE_MOCK_NANOCC=true`
   - 使用预设的 JSONL 数据模拟 SSE 流

2. **联调模式**:
   - 启动后端服务
   - 确认 API 端点可用: `curl http://localhost:8000/api/v1/health`
   - 前端请求代理到后端

---

## 9. 常见问题

### Q: Mol* 相关组件报错

Mol* 需要动态导入避免 SSR 问题：

```typescript
const MolstarViewer = dynamic(
  () => import('@/components/molstar/MolstarViewer'),
  { ssr: false }
);
```

### Q: SSE 连接失败

检查:
1. 后端是否运行: `curl http://localhost:8000/api/v1/health`
2. CORS 配置是否正确
3. 浏览器控制台错误信息

### Q: 类型定义不一致

前后端类型定义必须保持同步。修改 `types.ts` 前需与后端确认。

---

## 10. 相关文档

- [系统架构](../developer/architecture.md)
- [数据模型](../developer/data_model.md)
- [协作流程](./collaboration_workflow.md)
- [工作项清单](./work_items.md)

---

**更新日期**: 2026-01-06
