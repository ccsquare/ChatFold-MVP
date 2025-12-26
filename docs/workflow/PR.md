# PR 提交指南

本文档说明如何提交高质量的 Pull Request，以及 PR Label 的使用方法。

## PR Label 体系

ChatFold 使用标签系统来管理 PR 的部署范围、审查流程和优先级。

### 部署标签 (Deploy Labels)

控制 PR 合并后的部署范围：

| 标签 | 说明 | 使用场景 |
|------|------|----------|
| `deploy:full` | 前端 + 后端全量部署 | 涉及前后端的功能变更 |
| `deploy:web-only` | 仅部署前端 | 仅修改 web/ 目录 |
| `deploy:backend-only` | 仅部署后端 | 仅修改 backend/ 目录 |
| `deploy:skip` | 跳过部署 | 文档更新、配置调整等 |

**使用示例**：

```bash
# 添加部署标签
gh pr edit <PR-number> --add-label "deploy:web-only"

# 移除标签
gh pr edit <PR-number> --remove-label "deploy:full"
```

### PR 流程标签 (PR Labels)

控制 PR 的审查和合并状态：

| 标签 | 说明 | 使用场景 |
|------|------|----------|
| `pr:skip-claude-review` | 跳过 Claude 自动审查 | 大型 PR、紧急修复 |
| `pr:wip` | 工作进行中，请勿合并 | 未完成的 PR |
| `pr:ready-for-review` | 已准备好进行审查 | PR 开发完成 |
| `pr:needs-revision` | 需要修改 | 审查后需要调整 |

### 类型标签 (Type Labels)

标识 PR 的变更类型：

| 标签 | 说明 |
|------|------|
| `type:feature` | 新功能或增强 |
| `type:bug` | Bug 修复 |
| `type:docs` | 文档更新 |
| `type:refactor` | 代码重构 |
| `type:test` | 测试相关 |
| `type:chore` | 维护和杂项 |

### 优先级标签 (Priority Labels)

标识 PR 的紧急程度：

| 标签 | 说明 |
|------|------|
| `priority:critical` | 紧急 - 需要立即处理 |
| `priority:high` | 高优先级 |
| `priority:medium` | 中优先级 |
| `priority:low` | 低优先级 |

### 组件标签 (Component Labels)

标识 PR 影响的代码区域：

| 标签 | 说明 |
|------|------|
| `component:frontend` | 前端 (Next.js/React) |
| `component:backend` | 后端 (FastAPI/Python) |
| `component:molstar` | Mol* 3D 可视化 |
| `component:api` | API 接口 |

## 标签同步

标签配置存储在 `.github/labels.yml`，通过 GitHub Action 自动同步。

**手动同步标签**：

```bash
# 使用 GitHub CLI 同步
gh label sync --repo owner/ChatFold-MVP --labels .github/labels.yml
```

**触发 Action 同步**：

修改 `.github/labels.yml` 文件并推送到 main 分支，或手动触发 `Sync Labels` workflow。

## PR 提交清单

提交 PR 前，请确认：

- [ ] 代码已通过 lint 检查 (`ruff check` / `npm run lint`)
- [ ] 新功能有对应测试
- [ ] Commit message 符合规范
- [ ] 已添加适当的标签
- [ ] PR 描述清晰说明变更内容

## 常见问题

### Q: 如何跳过 Claude 自动审查？

```bash
gh pr edit <PR-number> --add-label "pr:skip-claude-review"
```

### Q: 大型 PR 如何处理？

建议拆分为多个小 PR，每个 PR 不超过 50 个文件变更。

### Q: 如何标记 PR 为工作进行中？

```bash
gh pr edit <PR-number> --add-label "pr:wip"
```

---

**最后更新**: 2025-12-26
