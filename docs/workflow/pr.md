# Pull Request 规范

本文档定义 ChatFold 项目的 PR 提交和审查规范。

## PR 标题格式

```
type: brief description
```

示例：
- `feat: add SSE streaming for folding tasks`
- `fix: resolve Redis connection timeout`
- `docs: update API documentation`

## PR 描述模板

```markdown
## Summary

简要描述这个 PR 做了什么。

## Changes

- [ ] 改动点 1
- [ ] 改动点 2
- [ ] 改动点 3

## Related Issues

- Closes #123
- Related to #456

## Testing

描述如何测试这些改动：

1. 步骤 1
2. 步骤 2
3. 预期结果

## Screenshots (if applicable)

如果涉及 UI 改动，请附上截图。

## Checklist

- [ ] 代码已通过 lint 检查
- [ ] 已添加必要的测试
- [ ] 文档已更新（如需要）
- [ ] Commit 消息符合规范
```

## PR 类型

| 类型 | 说明 | 审查要求 |
|------|------|----------|
| `feat` | 新功能 | 需要完整审查 |
| `fix` | Bug 修复 | 需要审查修复方案 |
| `docs` | 文档更新 | 快速审查 |
| `refactor` | 重构 | 需要完整审查 |
| `test` | 测试 | 快速审查 |
| `chore` | 杂项 | 快速审查 |

## 审查流程

### 提交者职责

1. **自审**: 提交前自己审查一遍代码
2. **描述清晰**: 写清楚改动内容和原因
3. **小而专注**: 每个 PR 只做一件事
4. **测试通过**: 确保所有测试通过

### 审查者职责

1. **及时响应**: 24 小时内开始审查
2. **建设性反馈**: 提供具体、可操作的建议
3. **关注重点**:
   - 代码正确性
   - 设计合理性
   - 性能影响
   - 安全考虑

## PR 大小指南

| 大小 | 改动行数 | 建议 |
|------|----------|------|
| XS | < 50 | 快速合并 |
| S | 50-200 | 标准审查 |
| M | 200-500 | 需要仔细审查 |
| L | 500-1000 | 考虑拆分 |
| XL | > 1000 | 必须拆分 |

## 合并策略

- **Squash and Merge**: 默认策略，保持主分支历史清晰
- **Merge Commit**: 仅用于需要保留完整历史的情况

## 示例 PR

### 好的 PR

```markdown
## Summary

Add SSE streaming endpoint for real-time folding progress updates.

## Changes

- [x] Add `/api/v1/tasks/{id}/stream` endpoint
- [x] Implement Redis event queue for SSE
- [x] Create `useFoldingTask` hook in frontend
- [x] Add progress bar UI component

## Testing

1. Start a folding task with sequence "MKFLILLFNILCLFPVLAADNH..."
2. Open browser DevTools Network tab
3. Verify SSE events are received with progress updates
4. Confirm progress bar updates in real-time

## Checklist

- [x] Code passes lint
- [x] Tests added for SSE endpoint
- [x] API docs updated
- [x] Commits follow convention
```

### 需要改进的 PR

```markdown
## Summary

Fixed some stuff

## Changes

- Changed code

## Testing

It works
```

问题：
- 描述模糊
- 没有具体改动点
- 测试说明不充分

---

**更新日期**: 2025-01-01