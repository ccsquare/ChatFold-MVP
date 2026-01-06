# 后端概念与数据流

> **目标读者**: 前端工程师
> **版本**: 1.0
> **最后更新**: 2026-01-06

本文档整合后端核心概念和数据流，供前端开发参考。

---

## 1. 核心概念总览

```
┌─────────────────────────────────────────────────────────────────────┐
│  User (user_default)                                                │
│  └── Project (project_default)                                      │
│      └── Folder ◄──► Conversation                                   │
│          ├── inputs: Asset[]                                        │
│          └── outputs: StructureArtifact[]                           │
│                          ↑                                          │
│                    NanoCCJob                                        │
│                    ├── events: JobEvent[] (SSE 推送)                │
│                    └── structures: StructureArtifact[]              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. 数据模型

### 2.1 实体定义

| 实体 | 说明 | 关键字段 |
|------|------|----------|
| **User** | 用户账户 (MVP 单用户) | `id`, `name`, `email`, `plan` |
| **Project** | 项目容器 (MVP 单项目) | `id`, `userId`, `name` |
| **Folder** | 工作目录，与 Conversation 1:1 | `id`, `projectId`, `inputs`, `outputs`, `conversationId` |
| **Conversation** | 对话会话 | `id`, `folderId`, `title`, `messages`, `assets` |
| **ChatMessage** | 单条消息 | `id`, `role`, `content`, `timestamp`, `artifacts?` |
| **Asset** | 用户上传文件 | `id`, `name`, `type`, `content`, `uploadedAt` |
| **NanoCCJob** | 折叠任务 | `id`, `conversationId`, `sequence`, `status`, `steps`, `structures` |
| **JobEvent** | 任务进度事件 | `eventId`, `jobId`, `eventType`, `stage`, `status`, `progress`, `message`, `blockIndex?`, `artifacts?` |
| **StructureArtifact** | 结构文件 | `structureId`, `label`, `filename`, `pdbData?`, `thumbnail?`, `cot?` |

### 2.2 关系说明

```
User 1:N Project (MVP: 单项目)
Project 1:N Folder
Folder 1:1 Conversation (双向关联)
Conversation 1:N ChatMessage
ChatMessage 0:N StructureArtifact (assistant 消息可携带)
NanoCCJob 1:N JobEvent
NanoCCJob 1:N StructureArtifact
```

---

## 3. EventType 与 UI 区域映射

**这是前端最重要的概念之一**：后端 SSE 事件的 `eventType` 字段决定了前端如何展示消息。

### 3.1 EventType 定义

```typescript
type EventType =
  | 'PROLOGUE'       // 开场白
  | 'ANNOTATION'     // 注释
  | 'THINKING_TEXT'  // 纯文本思考
  | 'THINKING_PDB'   // 带结构的思考
  | 'CONCLUSION';    // 结论
```

### 3.2 UI 区域映射

```
┌─────────────────────────────────────────────────────────────────┐
│ 区域 1: 用户消息                                                  │
├─────────────────────────────────────────────────────────────────┤
│ 区域 2: PROLOGUE / ANNOTATION                                    │
│         - 开场白，列出关键验证点                                  │
│         - 固定显示，不滚动                                        │
├─────────────────────────────────────────────────────────────────┤
│ 区域 3: THINKING_TEXT                                            │
│         - 滚动文本，显示最后 2 行                                 │
│         - 双击展开全部                                            │
├─────────────────────────────────────────────────────────────────┤
│ 区域 4: THINKING_PDB (结构卡片)                                   │
│         - 缩略图 + 标签                                           │
│         - 点击查看 3D 结构                                        │
│         - 对应 blockIndex 分组                                    │
├─────────────────────────────────────────────────────────────────┤
│ 区域 5: CONCLUSION                                               │
│         - 最终结论                                                │
│         - 最佳结构推荐                                            │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Thinking Block 分组

- `THINKING_TEXT` 和 `THINKING_PDB` 通过 `blockIndex` 分组
- 每个 `THINKING_PDB` 事件结束一个 block，`blockIndex` 递增
- 同一 `blockIndex` 的 `THINKING_TEXT` 消息属于同一个 block

```
Block 0:
  THINKING_TEXT (blockIndex=0) "正在分析序列特征..."
  THINKING_TEXT (blockIndex=0) "检测到 alpha 螺旋倾向..."
  THINKING_PDB  (blockIndex=0) + Structure: fast-folding.cif

Block 1:
  THINKING_TEXT (blockIndex=1) "进行精细化预测..."
  THINKING_PDB  (blockIndex=1) + Structure: refined-1.cif
```

---

## 4. SSE 事件流

### 4.1 事件结构

```typescript
interface JobEvent {
  eventId: string;           // 唯一事件 ID
  jobId: string;             // 任务 ID
  ts: number;                // Unix 时间戳 (毫秒)
  eventType: EventType;      // UI 区域映射 ⭐
  stage: StageType;          // QUEUED | MSA | MODEL | RELAX | QA | DONE | ERROR
  status: StatusType;        // queued | running | partial | complete | failed | canceled
  progress: number;          // 0-100
  message: string;           // CoT 消息文本
  blockIndex?: number;       // Thinking block 分组 (仅 THINKING_* 类型)
  artifacts?: StructureArtifact[];  // 生成的结构 (仅 THINKING_PDB)
}
```

### 4.2 SSE 事件类型

| SSE Event | 说明 | 触发时机 |
|-----------|------|----------|
| `step` | 进度事件 | 每个 JobEvent |
| `done` | 完成事件 | 任务成功完成 |
| `canceled` | 取消事件 | 用户取消任务 |
| `error` | 错误事件 | 任务失败 |

### 4.3 事件流示例

```
event: step
data: {"eventId":"evt_001","eventType":"PROLOGUE","stage":"MODEL","progress":10,"message":"让我先明确需要验证的关键点..."}

event: step
data: {"eventId":"evt_002","eventType":"THINKING_TEXT","stage":"MODEL","progress":25,"message":"分析序列组成...", "blockIndex":0}

event: step
data: {"eventId":"evt_003","eventType":"THINKING_PDB","stage":"MODEL","progress":40,"message":"快速折叠完成","blockIndex":0,"artifacts":[...]}

event: step
data: {"eventId":"evt_010","eventType":"CONCLUSION","stage":"DONE","progress":100,"message":"综合考虑后，我决定接受当前预测结果"}

event: done
data: {"jobId":"job_xxx"}
```

---

## 5. API 端点

### 5.1 任务相关

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/tasks` | POST | 创建折叠任务 |
| `/api/v1/tasks` | GET | 列出任务 |
| `/api/v1/tasks/{id}` | GET | 获取任务详情 |
| `/api/v1/tasks/{id}/stream` | GET | **SSE 进度流** ⭐ |
| `/api/v1/tasks/{id}/cancel` | POST | 取消任务 |

### 5.2 结构相关

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/structures/{id}` | GET | 下载 PDB 文件 |
| `/api/v1/structures/{id}` | POST | 缓存 PDB 数据 |

### 5.3 对话/文件夹相关

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/conversations` | POST/GET | 对话 CRUD |
| `/api/v1/folders` | POST/GET | 文件夹 CRUD |
| `/api/v1/folders/{id}/inputs` | POST | 添加输入文件 |

---

## 6. 数据流图

### 6.1 折叠任务创建流程

```
用户输入序列
      │
      ▼
┌───────────────────────────────────────────────────────┐
│ POST /api/v1/tasks                                    │
│ {                                                     │
│   "sequence": "MKTAYIAKQRQISFVK...",                  │
│   "conversationId": "conv_xxx"  // 可选              │
│ }                                                     │
└───────────────────────────────────────────────────────┘
      │
      ▼
┌───────────────────────────────────────────────────────┐
│ 后端处理:                                              │
│ 1. 验证序列 (10-5000 氨基酸)                           │
│ 2. 创建 NanoCCJob (status=queued)                     │
│ 3. 如无 Conversation，自动创建 Folder + Conversation   │
│ 4. 返回 { taskId, task }                              │
└───────────────────────────────────────────────────────┘
      │
      ▼
┌───────────────────────────────────────────────────────┐
│ Response:                                             │
│ {                                                     │
│   "taskId": "job_m1a2b3xyz",                          │
│   "task": { id, status, sequence, ... }               │
│ }                                                     │
└───────────────────────────────────────────────────────┘
```

### 6.2 SSE 流式进度

```
前端                                    后端
  │                                      │
  │  GET /tasks/{id}/stream              │
  │─────────────────────────────────────►│
  │                                      │
  │  event: step (PROLOGUE)              │
  │◄─────────────────────────────────────│
  │  更新 Timeline                       │
  │                                      │
  │  event: step (THINKING_TEXT)         │
  │◄─────────────────────────────────────│
  │  滚动显示                            │
  │                                      │
  │  event: step (THINKING_PDB)          │
  │◄─────────────────────────────────────│
  │  显示结构卡片                         │
  │  添加到 Folder.outputs               │
  │                                      │
  │  event: step (CONCLUSION)            │
  │◄─────────────────────────────────────│
  │  显示结论                            │
  │                                      │
  │  event: done                         │
  │◄─────────────────────────────────────│
  │  关闭连接                            │
  │  更新任务状态                         │
```

### 6.3 结构存储路径

```
outputs_root/
├── structures/
│   └── {job_id}/
│       ├── fast-folding.cif
│       ├── refined-1.cif
│       └── final.cif
└── uploads/
    └── {folder_id}/
        └── {asset_id}.fasta
```

**环境配置**:
- `local-dev`: `{project}/chatfold-workspace/outputs/`
- `production`: `/app/outputs/` (K8s PVC)

---

## 7. Stage 阶段说明

| Stage | 进度 | 说明 |
|-------|------|------|
| `QUEUED` | 0% | 任务排队中 |
| `MSA` | 20% | 多序列比对 |
| `MODEL` | 50% | 模型预测 |
| `RELAX` | 80% | 结构优化 |
| `QA` | 90% | 质量评估 |
| `DONE` | 100% | 任务完成 |
| `ERROR` | - | 任务出错 |

**注意**: 当前实现主要使用 `MODEL` 阶段进行 CoT 消息推送，其他阶段在未来完整集成 NanoCC 时使用。

---

## 8. Mock 模式

后端提供 Mock 模式用于前端独立开发：

```bash
# 环境变量
USE_MOCK_NANOCC=true
MOCK_NANOCC_DELAY_MIN=1.0
MOCK_NANOCC_DELAY_MAX=5.0
```

**Mock 数据来源**:
- JSONL 文件: `backend/app/components/nanocc/data/Mocking_CoT.nanocc.jsonl`

**JSONL 格式**:
```json
{"TYPE": "PROLOGUE", "STATE": "MODEL", "MESSAGE": "让我先明确需要验证的关键点..."}
{"TYPE": "THINKING", "STATE": "MODEL", "MESSAGE": "分析序列组成..."}
{"TYPE": "THINKING", "STATE": "MODEL", "MESSAGE": "检测到...", "pdb_file": "/path/to.cif", "label": "fast-folding"}
{"TYPE": "CONCLUSION", "STATE": "DONE", "MESSAGE": "综合考虑后..."}
```

**TYPE → EventType 映射**:
| JSONL TYPE | EventType | 条件 |
|------------|-----------|------|
| PROLOGUE | PROLOGUE | - |
| ANNOTATION | ANNOTATION | - |
| THINKING | THINKING_TEXT | 无 pdb_file |
| THINKING | THINKING_PDB | 有 pdb_file |
| CONCLUSION | CONCLUSION | - |

---

## 9. 前端对接要点

### 9.1 SSE 连接

```typescript
const eventSource = new EventSource(`/api/v1/tasks/${taskId}/stream`);

eventSource.addEventListener('step', (e) => {
  const event: JobEvent = JSON.parse(e.data);

  switch (event.eventType) {
    case 'PROLOGUE':
    case 'ANNOTATION':
      // 显示在区域 2
      break;
    case 'THINKING_TEXT':
      // 显示在区域 3 (滚动)
      // 使用 blockIndex 分组
      break;
    case 'THINKING_PDB':
      // 显示在区域 4 (结构卡片)
      // 使用 blockIndex 分组
      // 处理 artifacts
      break;
    case 'CONCLUSION':
      // 显示在区域 5
      break;
  }
});

eventSource.addEventListener('done', () => {
  eventSource.close();
});
```

### 9.2 结构加载

```typescript
// 从 SSE 事件获取 pdbData
const artifact = event.artifacts?.[0];
if (artifact?.pdbData) {
  // 直接使用内联数据
  openStructureTab(artifact, artifact.pdbData);
}

// 或从 API 获取
const response = await fetch(`/api/v1/structures/${structureId}`);
const pdbData = await response.text();
```

### 9.3 状态管理建议

```typescript
// Zustand store
interface JobState {
  activeJob: NanoCCJob | null;
  isStreaming: boolean;

  // 按 eventType 分组的事件
  prologueEvents: JobEvent[];
  thinkingBlocks: Map<number, JobEvent[]>;  // blockIndex -> events
  conclusionEvent: JobEvent | null;
}
```

---

## 10. 相关文档

- [前端上手指南](./frontend_onboarding.md)
- [协作流程](./collaboration_workflow.md)
- [工作项清单](./work_items.md)
- [API 文档](http://localhost:28000/docs)

---

**更新日期**: 2026-01-06
