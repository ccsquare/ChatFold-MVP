# 前后端协作流程规范

> **目标读者**: 前端工程师、后端工程师
> **版本**: 1.0

---

## 1. 协作模式概述

```
┌─────────────────┐         ┌─────────────────┐
│   前端工程师     │         │   后端工程师     │
│  (兼职)         │         │  (算法背景)      │
└────────┬────────┘         └────────┬────────┘
         │                           │
         │     1. 需求评审            │
         │◄─────────────────────────►│
         │                           │
         │     2. API 契约定义        │
         │◄─────────────────────────►│
         │                           │
         ▼                           ▼
┌─────────────────┐         ┌─────────────────┐
│  独立开发        │         │  独立开发        │
│  - UI 组件       │         │  - API 实现      │
│  - Mock 数据     │         │  - Mock 模式     │
└────────┬────────┘         └────────┬────────┘
         │                           │
         │     3. 联调测试            │
         │◄─────────────────────────►│
         │                           │
         ▼                           ▼
┌─────────────────────────────────────────────┐
│               4. 集成部署                    │
└─────────────────────────────────────────────┘
```

---

## 2. 沟通方式

### 2.1 日常沟通

| 场景     | 渠道                   | 响应时间  |
| -------- | ---------------------- | --------- |
| 紧急问题 | 企业微信/飞书          | 1 小时内  |
| 技术讨论 | GitHub Issue           | 24 小时内 |
| 代码审查 | GitHub PR              | 24 小时内 |
| 进度同步 | 企业微信/飞书/异步文档 | 24 小时内 |

### 2.2 文档协作

- **API 文档**: 后端维护，前端评审
- **类型定义**: 双方确认后修改 `types.ts`
- **设计稿标注**: Figma Dev Mode

---

## 3. API 契约定义

### 3.1 流程

```
1. 前端提出需求
   ↓
2. 后端提出 API 设计 (OpenAPI/Swagger)
   ↓
3. 前端评审，提出调整建议
   ↓
4. 双方确认，更新文档
   ↓
5. 后端实现 Mock 模式
   ↓
6. 前端开始开发
```

### 3.2 API 规范

**基础约定**:

- Base URL: `/api/v1/`
- 响应格式: JSON
- 时间戳: Unix 毫秒 (ms)
- ID 格式: `{entity}_{nanoid}` (如 `task_m1a2b3xyz`)

**响应结构**:

```json
// 成功
{
  "data": { ... }
}

// 列表
{
  "data": [...],
  "total": 100
}

// 错误
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "序列长度超出限制"
  }
}
```

**SSE 事件格式**:

```
event: step
data: {"eventId":"evt_xxx","jobId":"job_xxx","stage":"MODEL",...}

event: done
data: {"jobId":"job_xxx","status":"complete"}

event: error
data: {"jobId":"job_xxx","message":"折叠失败"}
```

### 3.3 类型同步

前端 `types.ts` 与后端 `schemas.py` 必须保持同步。

**修改流程**:

1. 发起方在 Issue 中提出变更
2. 双方确认后同时修改
3. 通过 PR 合并

**关键类型对照**:

| 前端 (TypeScript) | 后端 (Python) |
| ----------------- | ------------- |
| `StepEvent`       | `JobEvent`    |
| `Job`             | `NanoCCJob`   |
| `Structure`       | `Structure`   |
| `StageType`       | `StageType`   |
| `EventType`       | `EventType`   |

---

## 4. 独立开发模式

### 4.1 前端独立开发

**使用 Mock 后端**:

```bash
# 后端启动 Mock 模式
cd backend
USE_MOCK_NANOCC=true uv run uvicorn app.main:app --reload
```

**特点**:

- SSE 流使用 JSONL 文件模拟
- 折叠进度按预设时间间隔推送
- 无需真实 GPU 服务

**Mock 数据位置**:

```
backend/app/components/nanocc/data/Mocking_CoT.nanocc.jsonl
```

### 4.2 后端独立开发

**API 测试**:

- Swagger UI: http://localhost:28000/docs
- Pytest: `uv run pytest`
- cURL 脚本

**无前端验证**:

```bash
# 创建任务
curl -X POST http://localhost:28000/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{"sequence":"MKTA...", "conversationId":"conv_xxx"}'

# 监听 SSE
curl -N http://localhost:28000/api/v1/tasks/{id}/stream
```

---

## 5. 联调流程

### 5.1 联调准备

**前端 checklist**:

- [ ] Mock 模式功能完成
- [ ] 类型定义与后端一致
- [ ] 错误处理覆盖

**后端 checklist**:

- [ ] API 端点实现完成
- [ ] Mock 模式可用
- [ ] API 文档更新

### 5.2 联调步骤

```bash
# 1. 后端启动 (非 Mock 模式，可选)
cd backend
uv run uvicorn app.main:app --reload --port 28000

# 2. 前端启动
cd web
npm run dev

# 3. 浏览器测试
open http://localhost:23000
```

### 5.3 问题排查

**常见问题**:

| 问题          | 排查步骤                        |
| ------------- | ------------------------------- |
| CORS 错误     | 检查后端 `main.py` CORS 配置    |
| 404 Not Found | 确认 API 路径 `/api/v1/...`     |
| SSE 中断      | 检查网络、后端日志              |
| 类型不匹配    | 对比 `types.ts` 与 `schemas.py` |

**调试工具**:

- 浏览器 DevTools → Network → EventStream
- 后端日志: `uv run uvicorn ... --log-level debug`

---

## 6. 代码提交规范

### 6.1 分支策略

```
main                    # 稳定版本
├── feat/xxx           # 新功能
├── fix/xxx            # Bug 修复
└── refactor/xxx       # 重构
```

### 6.2 Commit Message

**格式**:

```
type: subject

Changes:
- 具体修改点1
- 具体修改点2

Benefits:
- 改进带来的好处
```

**类型**:

- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档
- `style`: 格式调整
- `refactor`: 重构

### 6.3 PR 流程

1. 创建 PR，关联 Issue
2. 自动 CI 检查 (lint, test)
3. 至少 1 人 Code Review
4. Squash Merge 到 main

---

## 7. 版本发布

### 7.1 版本号规范

```
v{major}.{minor}.{patch}

例: v0.1.0, v0.2.0, v1.0.0
```

### 7.2 发布流程

1. 更新 CHANGELOG
2. 创建 Release Tag
3. 触发 CI/CD 部署

---

## 8. 相关文档

- [前端上手指南](./frontend_onboarding.md)
- [工作项清单](./work_items.md)
- [API 文档](http://localhost:28000/docs)

---

**更新日期**: 2026-01-06
