# 工作项清单与联调指南

> **目标读者**: 前端工程师、后端工程师
> **版本**: 1.0

---

## 1. 工作项总览

基于 Figma 设计稿 (Flow `364:1863`)，按模块拆分工作项。

### 1.1 前端工作项

| 模块 | 工作项 | 优先级 | 依赖后端 | 状态 |
|------|--------|--------|----------|------|
| **布局** | 三栏布局完善 | P0 | 否 | 进行中 |
| | 响应式适配 | P1 | 否 | 待开始 |
| **侧边栏** | 文件夹树形结构 | P0 | 是 | 进行中 |
| | 新建对话按钮 | P0 | 是 | 进行中 |
| | 项目切换 (Future) | P2 | 是 | 待开始 |
| **聊天面板** | 序列输入框 | P0 | 否 | 完成 |
| | 快捷样本按钮 | P1 | 否 | 完成 |
| | 文件上传 (@附件) | P1 | 是 | 进行中 |
| | 知识库选择 | P2 | 是 | 待开始 |
| **时间线** | CoT 消息展示 | P0 | 是 | 进行中 |
| | PROLOGUE 区域 | P0 | 是 | 进行中 |
| | THINKING 滚动文本 | P0 | 是 | 进行中 |
| | THINKING_PDB 结构卡片 | P0 | 是 | 进行中 |
| | CONCLUSION 区域 | P0 | 是 | 进行中 |
| **3D 查看器** | Mol* 基础渲染 | P0 | 否 | 完成 |
| | 多标签页 | P1 | 否 | 完成 |
| | 结构对比 | P1 | 否 | 完成 |
| **主题** | Light/Dark 切换 | P1 | 否 | 完成 |
| **用户** | 登录/注册 | P1 | 是 | 进行中 |
| | 用户菜单 | P1 | 是 | 进行中 |

### 1.2 后端工作项

| 模块 | 工作项 | 优先级 | 状态 |
|------|--------|--------|------|
| **核心 API** | 任务创建 POST /tasks | P0 | 完成 |
| | SSE 流 GET /tasks/{id}/stream | P0 | 完成 |
| | 结构下载 GET /structures/{id} | P0 | 完成 |
| **对话** | 对话 CRUD | P0 | 完成 |
| | 消息存储 | P0 | 完成 |
| **文件夹** | 文件夹 CRUD | P0 | 完成 |
| | 输入文件管理 | P1 | 完成 |
| **用户** | 认证 API | P1 | 进行中 |
| | 用户信息 API | P1 | 进行中 |
| **NanoCC** | Mock 模式 | P0 | 完成 |
| | 真实服务集成 | P2 | 待开始 |

---

## 2. 模块详细说明

### 2.1 侧边栏 (Sidebar)

**Figma 参考**: `496:2286` (侧边栏)

**组件结构**:
```
Sidebar (280px)
├── Header
│   ├── Logo (87x24)
│   └── 布局切换按钮
├── Navigation
│   ├── "+ 新建对话" 按钮
│   └── 文件夹列表
│       ├── 运行中任务 (带 Loading 图标)
│       └── 已完成文件夹
│           ├── 输入文件列表
│           └── 输出结构列表
└── Footer
    ├── 用户头像 + 名称
    └── 设置按钮
```

**前端工作**:
- [ ] 文件夹树形展开/折叠
- [ ] 运行中任务加载动画
- [ ] 文件夹右键菜单 (重命名/删除)

**后端 API**:
- `GET /api/v1/folders` - 列出文件夹
- `POST /api/v1/folders` - 创建文件夹
- `PUT /api/v1/folders/{id}` - 更新文件夹
- `DELETE /api/v1/folders/{id}` - 删除文件夹

### 2.2 聊天输入 (Chat Input)

**Figma 参考**: `381:3995` (input)

**组件结构**:
```
ChatInput
├── 多行文本框 (568x72)
├── 工具栏
│   ├── 附件按钮 (paperclip)
│   ├── 知识库按钮 (book-closed)
│   └── 发送按钮
└── 快捷样本
    ├── 人类血红蛋白B链
    ├── 胰岛素A链
    ├── 绿色荧光蛋白 GFP
    └── 短测试肽段
```

**前端工作**:
- [x] 序列输入与验证
- [x] 快捷样本点击填充
- [ ] 附件上传 UI
- [ ] 知识库选择器

**后端 API**:
- `POST /api/v1/tasks` - 提交折叠任务
- `POST /api/v1/folders/{id}/inputs` - 上传输入文件

### 2.3 时间线 (Timeline)

**Figma 参考**: 待补充

**区域划分**:

```
┌─────────────────────────────────────────┐
│ 区域 1: 用户消息                          │
├─────────────────────────────────────────┤
│ 区域 2: PROLOGUE (开场白)                 │
│         ANNOTATION (注释)                │
├─────────────────────────────────────────┤
│ 区域 3: THINKING_TEXT (滚动文本)          │
│         - 显示最后 2 行                   │
│         - 自动滚动                        │
├─────────────────────────────────────────┤
│ 区域 4: THINKING_PDB (结构卡片)           │
│         - 缩略图                          │
│         - pLDDT 分数                      │
│         - 点击查看/对比                    │
├─────────────────────────────────────────┤
│ 区域 5: CONCLUSION (结论)                 │
│         - 最终决策                        │
│         - 最佳结构                        │
└─────────────────────────────────────────┘
```

**前端工作**:
- [ ] TimelineRenderer 组件优化
- [ ] THINKING_TEXT 滚动效果
- [ ] THINKING_PDB 结构卡片
- [ ] 结构对比触发

**后端 API**:
- `GET /api/v1/tasks/{id}/stream` - SSE 事件流

**SSE 事件字段**:
```typescript
interface StepEvent {
  eventId: string;
  jobId: string;
  ts: number;
  eventType: 'PROLOGUE' | 'ANNOTATION' | 'THINKING_TEXT' | 'THINKING_PDB' | 'CONCLUSION';
  stage: StageType;
  status: StatusType;
  progress: number;
  message: string;
  blockIndex?: number;  // THINKING 分组
  artifacts?: Structure[];
}
```

### 2.4 用户认证 (Auth)

**前端工作**:
- [ ] 登录表单
- [ ] 注册表单
- [ ] Token 存储
- [ ] 路由守卫

**后端 API**:
- `POST /api/v1/auth/login` - 登录
- `POST /api/v1/auth/register` - 注册
- `POST /api/v1/auth/logout` - 登出
- `GET /api/v1/users/me` - 当前用户

---

## 3. 独立开发指南

### 3.1 前端独立开发

**环境准备**:
```bash
cd web
npm install
npm run dev
```

**Mock 数据使用**:

前端可通过以下方式独立开发：

1. **直接使用后端 Mock 模式**:
   ```bash
   # 终端 1: 启动后端 Mock
   cd backend
   USE_MOCK_NANOCC=true uv run uvicorn app.main:app --reload

   # 终端 2: 启动前端
   cd web
   npm run dev
   ```

2. **纯前端 Mock** (可选):
   在 `lib/api.ts` 中添加本地 Mock 逻辑。

**开发建议**:
- 先完成 UI 布局和样式
- 使用 Mock 数据验证交互逻辑
- 最后联调真实 API

### 3.2 后端独立开发

**环境准备**:
```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

**API 测试**:
```bash
# 健康检查
curl http://localhost:28000/api/v1/health

# 创建任务
curl -X POST http://localhost:28000/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{"sequence":"MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKVKALPDAQFEVVHSLAKWKRQQIA","conversationId":"conv_test"}'

# 监听 SSE
curl -N http://localhost:28000/api/v1/tasks/{taskId}/stream
```

**开发建议**:
- 使用 Swagger UI 测试 API
- 编写单元测试验证逻辑
- Mock 模式优先，真实服务后续集成

---

## 4. 联调检查清单

### 4.1 联调前准备

**前端**:
- [ ] 类型定义 (`types.ts`) 与后端一致
- [ ] API 调用路径正确 (`/api/v1/...`)
- [ ] 错误处理覆盖所有场景
- [ ] SSE 重连机制

**后端**:
- [ ] CORS 配置允许前端域名
- [ ] API 响应格式符合约定
- [ ] Mock 模式可正常工作
- [ ] 日志记录完善

### 4.2 联调步骤

```bash
# 步骤 1: 启动后端
cd backend
uv run uvicorn app.main:app --reload --port 28000

# 步骤 2: 验证后端
curl http://localhost:28000/api/v1/health
# 期望: {"status":"ok","environment":"local-dev"}

# 步骤 3: 启动前端
cd web
npm run dev

# 步骤 4: 浏览器测试
open http://localhost:23000
```

### 4.3 常见问题排查

| 问题 | 症状 | 解决方案 |
|------|------|----------|
| CORS | 浏览器控制台报 CORS 错误 | 检查后端 `main.py` CORS 配置 |
| 404 | 接口返回 404 | 确认 API 路径是否正确 |
| SSE 断开 | 进度停止更新 | 检查网络、后端日志 |
| 类型错误 | TypeScript 报错 | 对比前后端类型定义 |
| 序列验证失败 | 提交被拒绝 | 检查序列长度和字符 |

---

## 5. 里程碑规划

### Phase 1: 核心功能 (当前)

**目标**: 完整的折叠工作流

- [x] 序列输入与验证
- [x] SSE 流式进度
- [x] Mol* 3D 渲染
- [ ] CoT 时间线展示 (进行中)
- [ ] 文件夹管理 (进行中)

### Phase 2: 用户体验

**目标**: 完善交互细节

- [ ] 用户认证
- [ ] 文件上传
- [ ] 结构对比优化
- [ ] 响应式布局

### Phase 3: 进阶功能

**目标**: 专业功能

- [ ] 多项目支持
- [ ] 知识库集成
- [ ] 真实 NanoCC 服务
- [ ] 批量任务

---

## 6. 相关文档

- [前端上手指南](./frontend_onboarding.md)
- [协作流程规范](./collaboration_workflow.md)
- [系统架构](../developer/architecture.md)
- [数据模型](../developer/data_model.md)

---

**更新日期**: 2026-01-06
