# ChatFold 数据模型

## 核心概念关系

```
┌─────────┐
│  User   │
└────┬────┘
     │ 1:N
     ▼
┌──────────┐
│ Project  │
└────┬─────┘
     │ 1:N
     ▼
┌─────────┐       1:1        ┌──────────────┐
│ Folder  │◄────────────────►│ Conversation │
└────┬────┘                  └──────┬───────┘
     │ 1:N                         │ 1:N
     ▼                             ▼
┌─────────┐                  ┌──────────────┐
│  Asset  │                  │   Message    │
└─────────┘                  └──────┬───────┘
                                    │ 0:1
                                    ▼
                             ┌──────────────┐
                             │    Task      │
                             └──────┬───────┘
                                    │ 1:N
                                    ▼
                             ┌──────────────┐
                             │  Structure   │
                             └──────────────┘
```

## 实体定义

### User (用户)

| 字段          | 类型         | 说明       |
| ------------- | ------------ | ---------- |
| id            | VARCHAR(36)  | UUID 主键  |
| email         | VARCHAR(255) | 邮箱，唯一 |
| name          | VARCHAR(100) | 用户名     |
| password_hash | VARCHAR(255) | 密码哈希   |
| is_active     | BOOLEAN      | 是否激活   |

### Project (项目)

| 字段        | 类型         | 说明      |
| ----------- | ------------ | --------- |
| id          | VARCHAR(36)  | UUID 主键 |
| user_id     | VARCHAR(36)  | 所属用户  |
| name        | VARCHAR(255) | 项目名称  |
| description | TEXT         | 项目描述  |

### Folder (文件夹)

| 字段       | 类型         | 说明       |
| ---------- | ------------ | ---------- |
| id         | VARCHAR(36)  | UUID 主键  |
| project_id | VARCHAR(36)  | 所属项目   |
| name       | VARCHAR(255) | 文件夹名称 |

### Conversation (对话)

| 字段      | 类型         | 说明             |
| --------- | ------------ | ---------------- |
| id        | VARCHAR(36)  | UUID 主键        |
| folder_id | VARCHAR(36)  | 关联文件夹 (1:1) |
| title     | VARCHAR(255) | 对话标题         |
| status    | ENUM         | active/archived  |

### Message (消息)

| 字段            | 类型        | 说明                  |
| --------------- | ----------- | --------------------- |
| id              | VARCHAR(36) | UUID 主键             |
| conversation_id | VARCHAR(36) | 所属对话              |
| role            | ENUM        | user/assistant/system |
| content         | TEXT        | 消息内容              |
| task_id         | VARCHAR(36) | 关联任务 (可选)       |

### Task (任务)

| 字段            | 类型        | 说明                                 |
| --------------- | ----------- | ------------------------------------ |
| id              | VARCHAR(36) | UUID 主键                            |
| conversation_id | VARCHAR(36) | 所属对话                             |
| sequence        | TEXT        | 蛋白质序列                           |
| status          | ENUM        | queued/running/completed/failed      |
| stage           | ENUM        | QUEUED/MSA/MODEL/RELAX/QA/DONE/ERROR |
| progress        | INT         | 进度 0-100                           |

### Structure (结构)

| 字段        | 类型         | 说明                      |
| ----------- | ------------ | ------------------------- |
| id          | VARCHAR(36)  | UUID 主键                 |
| task_id     | VARCHAR(36)  | 所属任务                  |
| label       | VARCHAR(100) | 标签 (Candidate 1, Final) |
| filename    | VARCHAR(255) | 文件名                    |
| file_path   | VARCHAR(500) | 存储路径                  |
| plddt_score | FLOAT        | 质量分数                  |
| is_final    | BOOLEAN      | 是否最终结构              |

### Asset (资产)

| 字段      | 类型         | 说明          |
| --------- | ------------ | ------------- |
| id        | VARCHAR(36)  | UUID 主键     |
| folder_id | VARCHAR(36)  | 所属文件夹    |
| name      | VARCHAR(255) | 文件名        |
| type      | ENUM         | fasta/pdb/txt |
| file_path | VARCHAR(500) | 存储路径      |
| file_size | BIGINT       | 文件大小      |

## 存储策略

### MySQL (持久化)

存储实体元数据和关系：

- 用户、项目、文件夹
- 对话、消息历史
- 任务记录、结构元数据

### Redis (缓存)

存储运行时状态：

```python
# 任务状态 (Hash)
chatfold:task:{task_id}:state = {
    "status": "running",
    "stage": "MODEL",
    "progress": 45,
    "message": "Running prediction..."
}

# SSE 事件队列 (List)
chatfold:task:{task_id}:events = [
    '{"eventId":"evt_1","stage":"MSA","progress":20}',
    '{"eventId":"evt_2","stage":"MODEL","progress":45}'
]
```

### FileSystem (文件)

存储二进制内容：

```
chatfold-workspace/outputs/
├── uploads/{folder_id}/        # 用户上传
│   └── {asset_id}.fasta
├── structures/{task_id}/       # 生成结构
│   ├── candidate_1.pdb
│   └── final.pdb
└── tasks/{task_id}/            # 任务中间文件
    └── input.fasta
```

## Task 生命周期

```
用户发送序列
      │
      ▼
┌────────────────────────┐
│ status=queued          │
│ stage=QUEUED           │
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│ status=running         │
│ stage=MSA → MODEL →    │
│       RELAX → QA       │
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│ status=completed       │
│ stage=DONE             │
│ 生成 Structure 记录     │
└────────────────────────┘
```

## 相关文档

- [architecture.md](./architecture.md) - 系统架构

---

**更新日期**: 2025-01-01
