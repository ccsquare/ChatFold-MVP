# ChatFold-MVP 代码优化重构计划

## Phase 1: 快速见效 ✅ 已完成

- [x] **1.1 删除 types.ts 中重复的 ViewerTab 定义**
  - 文件: `src/lib/types.ts`
  - 问题: ViewerTab 接口定义了两次 (行 92-100 和 130-140)
  - 方案: 删除第一个不完整的定义

- [x] **1.2 抽取 EXAMPLE_SEQUENCES 到常量文件**
  - 受影响文件: `ChatPanel.tsx`, `chat/ChatView.tsx`
  - 方案: 创建 `src/lib/constants/sequences.ts`
  - 收益: 消除 22 行重复代码

- [x] **1.3 抽取 stageIcons/stageLabels 到常量文件**
  - 受影响文件: `StepsPanel.tsx`, `chat/FoldingTimelineViewer.tsx`
  - 方案: 创建 `src/lib/constants/stages.tsx`
  - 收益: 消除 20 行重复代码

- [x] **1.4 用 downloadFile() 替换所有 PDB 下载代码**
  - 受影响文件: `Sidebar.tsx`, `BlockStructureCard.tsx`, `StepsPanel.tsx`, `FoldingTimelineViewer.tsx`
  - 方案: 使用已有的 `utils.ts:downloadFile()` 并新增 `downloadPDBFile()` 便捷函数
  - 收益: 消除 25 行重复代码

## Phase 2: 中等工作量 ✅ 已完成

- [x] **2.1 创建通用 useResizable Hook**
  - 受影响文件: `ResizableSidebar.tsx`, `ResizableConsole.tsx`
  - 方案: 创建 `src/hooks/useResizable.ts`
  - 收益: 消除 60 行重复代码

- [x] **2.2 合并时间格式化函数**
  - 受影响文件: `utils.ts`, `BlockStructureCard.tsx`
  - 方案: 统一到 `formatTimestamp()` 并支持不同格式
  - 收益: 消除 12 行重复代码

- [x] **2.3 抽取质量评估函数到 utils**
  - 受影响文件: `BlockStructureCard.tsx`
  - 方案: 移动 `getPlddtQuality`, `getPaeQuality`, `getConstraintQuality` 到 `utils.ts`
  - 收益: 提高复用性，便于其他组件使用

## Phase 3: 大重构 (待定)

- [ ] **3.1 拆分 MolstarViewer 组件** (1,522 行)
- [ ] **3.2 拆分 ChatPanel 组件** (607 行)
- [ ] **3.3 迁移并删除 FoldingTimelineViewer** (已废弃, 425 行)

---

## 总收益

| 阶段    | 预计减少行数 | 状态      |
| ------- | ------------ | --------- |
| Phase 1 | ~77 行       | ✅ 已完成 |
| Phase 2 | ~72 行       | ✅ 已完成 |
| Phase 3 | ~500+ 行     | 待规划    |

## 新增文件

- `src/lib/constants/sequences.ts` - 示例序列常量
- `src/lib/constants/stages.tsx` - Stage 图标和标签常量
- `src/hooks/useResizable.ts` - 通用 resize 逻辑 Hook

## 扩展的 utils.ts

新增导出:

- `downloadPDBFile()` - PDB 文件下载便捷函数
- `getPlddtQuality()` - pLDDT 质量评估
- `getPaeQuality()` - PAE 质量评估
- `getConstraintQuality()` - 约束满足度质量评估
- `QualityResult` - 质量评估结果类型

---

_最后更新: 2025-12-25_
