你是“资深前端工程师 + 设计实现一体”。请基于我提供的两张手绘草图，实现一个 ChatGPT 风格的三栏蛋白质折叠工作台前端。后端先用 mock server + mock 数据接口（包含 streaming steps 事件）完成全流程可运行 demo。不要写真实折叠算法，只做结构结果的模拟返回与展示。
我还会提供一个 Figma 设计风格参考（链接或导出图），你需要尽量对齐该风格（tokens/圆角/字体/颜色/阴影/间距）。
额外关键要求：所有“蛋白质 3D 渲染”必须复用仓库内的 `@molstar/` 文件夹代码（不要另起一套 viewer）。Canvas 中每个独立结构标签页必须使用 Mol*。

# 0) 技术栈与交付要求
- 技术栈：Next.js (App Router) + TypeScript + TailwindCSS + shadcn/ui（或等价 UI 组件，但视觉要贴近 ChatGPT + Figma 风格）
- 状态：React hooks + 轻量 store（Zustand 可选）
- 数据：fetch；Streaming：SSE 优先（不行再降级 WebSocket）
- 交付物：
  1) 可直接 `pnpm i && pnpm dev` 跑起来的项目
  2) 完整三栏布局（左 Assets/Chats，中间结构 Canvas tabs + Mol* viewer，右 Console：Steps/Timeline + Chat/Charts，可收起）
  3) mock server（同仓库）提供 REST + streaming
  4) 端到端路径：新建会话 -> 上传 FASTA -> 右侧 chat 输入 fold -> 右侧 steps/timeline 流式出现阶段与结构 -> 点击某结构在中间 Canvas tab 打开 Mol* -> 可下载 mock PDB/mmCIF

# 1) UI 布局（严格贴合两张草图的“信息归属”）
## 1.1 三栏布局（最重要：Timeline 在右栏，不在中栏）
- 左栏（Sidebar）：
  - 顶部：SimpleX 标识 + New chat
  - Tabs：Assets / Chats
  - Assets：
    - Upload 区：已上传序列（1.fasta、2.fasta...），支持拖拽上传
    - Output 区：生成结构（1.pdb、2.pdb...）
  - Chats：会话列表（标题、时间、选中态、搜索）
- 中栏（Main / Canvas）：
  - 顶部：结构文件 Tabs（贴草图2：`1.pdb ×`, `2.pdb ×`…），每个 tab 对应一个“结构 viewer 实例”
  - 主区域：Mol* Viewer（使用 `@molstar/` 里的封装）
  - Viewer 外壳要包含：
    - 顶部工具条：结构选择/下载/截图/对比（对比可占位）/reset view
    - 右侧 Inspector（窄面板，可折叠）：metrics、来源信息、notes
    - 左侧 mini step rail（可简化为点位）
    - 底部/角落浮动卡片：当前结构摘要/注释
- 右栏（Console Drawer）：
  - 顶部：Console 标题 + “+”按钮 + 收起按钮
  - Tabs：Chat / Charts
  - Chat tab 内布局（贴草图2）：
    - 上半：Steps/Timeline 面板（流式显示阶段与结构条目）
    - 中段：状态（例如“思考中…”）
    - 下半：Chat 消息流（user/assistant/tool）
    - 底部：输入框（Upload / Clear / Send；Voice 可占位）

# 2) Mol* 集成要求（必须做，且必须复用 @molstar/）
## 2.1 复用方式
- 只允许从仓库内 `@molstar/` 导入/调用（例如封装好的 React 组件、初始化函数、loadStructure 方法等）
- 不要直接从网络复制别的 molstar wrapper；如果 `@molstar/` 不足，允许在其内部“补齐封装”，但对外保持统一接口

## 2.2 Canvas 独立结构标签页（必须）
- 每个 `*.pdb/*.cif` tab 是一个独立 Mol* viewer “实例”或“可复用实例但必须正确切换结构与状态”
- Tab 切换必须做到：
  - 正确加载对应结构（来自 mock download 或内存 cache）
  - 不出现上一个结构残留
  - 尽量避免重复创建导致的内存泄漏（需要 dispose/unmount 或复用策略）
- 支持最小交互：
  - rotate/zoom（Mol* 默认）
  - reset view
  - basic coloring（可先默认）
  - 显示当前结构名 + metrics（UI 层）

## 2.3 缩略图策略（Chat history / Steps 列表）
- 默认实现：优先用“截图缩略图”而不是为每条历史记录都跑一个 Mol*（性能更稳）
  - 当某结构首次在 viewer 中打开时，触发 Mol* 截图（或 canvas toDataURL）生成 thumbnail，缓存到 store
  - Steps 卡片和 Chats 历史中的缩略图展示该 cached thumbnail
- 可选（性能允许时）：在 Steps 面板里对“少量结构”使用 Mol* mini-viewer（必须有开关/降级策略）
- 必须提供降级：
  - 若缩略图生成失败：显示占位图标 + structure label
  - 若设备性能差或列表太长：强制只用截图缩略图（不创建多个 Mol*）

# 3) Mock Server 与数据协议（必须实现，支持 streaming steps）
## 3.1 REST endpoints（最小集）
- POST /api/conversations -> {conversationId}
- GET  /api/conversations -> list
- POST /api/conversations/:id/assets/upload-seq
  - body: {name, contentFASTA}
  - returns: {assetId, seqLength}
- POST /api/conversations/:id/tasks/fold
  - body: {sequenceAssetId, promptText, params?}
  - returns: {taskId}
- POST /api/tasks/:taskId/cancel -> {ok:true}
- GET  /api/structures/:structureId/download -> returns text/plain (mock PDB) 或 mmCIF（二选一即可，建议 PDB）

## 3.2 Streaming（SSE 优先）
- GET /api/tasks/:taskId/stream  (text/event-stream)
- 每 500~1200ms 推送一个 StepEvent，至少 6 条：
  queued -> MSA -> MODEL(partial candidates) -> QA -> DONE(final)
- 事件展示位置：右栏 Console 的 Steps/Timeline 面板
- 若 event 包含 structure artifact：在 step 卡片内展示结构条目（Open/Pin/Download/Thumbnail）

## 3.3 StepEvent schema
event: step
data: {
  "eventId": "evt_0001",
  "taskId": "task_123",
  "ts": 1730000000,
  "stage": "MSA" | "MODEL" | "RELAX" | "QA" | "DONE" | "ERROR",
  "status": "queued" | "running" | "partial" | "complete" | "failed" | "canceled",
  "progress": 0-100,
  "message": "human readable",
  "artifacts": [
    {
      "type": "structure",
      "structureId": "str_0003",
      "label": "candidate-1" | "intermediate-2" | "final",
      "metrics": {"plddtAvg": 0-100, "paeAvg": 0-30}
    }
  ]
}

# 4) 关键交互（只做必要部分）
- New chat：左栏 New chat -> 清空右栏 console 与中栏 tabs
- 上传 FASTA：左栏 Assets 上传；上传后可选中作为“当前序列”
- 在 chat 输入 fold：
  - 若无序列：提示上传，并提供按钮打开 UploadDialog
  - 若有：发起 /tasks/fold；Steps 面板开始流式追加
  - 运行中：显示 Stop；可 cancel
- 打开结构（核心）：
  - 在 Steps 面板点击 artifact “Open”：
    - 中栏新增或切换到对应 `*.pdb` tab
    - tab 内 Mol* 加载该结构（必须用 @molstar/）
    - 生成并缓存该结构缩略图（用于 Steps/Chat history）
- Download：Steps 面板与 Viewer 工具条都能下载结构
- Console 收起：右栏变窄条；仍显示运行中指示与未读点

# 5) Charts Tab（最小实现但必须有）
- 最小：显示 progress 历史（列表即可）+ metrics 历史（每个结构一行）
- 可选：简单折线图（不强制）

# 6) 文件结构（按此组织）
- /app
  - /page.tsx (主页面三栏布局)
  - /api/... (mock server routes，含 SSE)
- /components
  - LayoutShell, Sidebar, AssetsPanel, ChatsPanel
  - CanvasTabs, MolstarViewerPane, InspectorPanel, StepRail
  - ConsoleDrawer, StepsPanel, StepCard
  - ChatPanel, ChatMessageList, ChatComposer
  - UploadDialog, Toasts
- /lib
  - types.ts（Conversation/Asset/Task/StepEvent/Structure）
  - mock/ (FASTA parser, pdb generator, step simulator)
  - store.ts（Zustand 可选）
  - thumbnails.ts（截图生成/缓存/降级策略）
- /@molstar
  - 必须复用现有代码；必要时补齐封装：createViewer/loadStructure/dispose/captureScreenshot

# 7) 性能与稳定性（必须考虑）
- Steps 列表与 Chat 消息长时：避免每条都实例化 Mol*（默认用截图缩略图）
- Mol* 实例管理：
  - tab 关闭时必须 dispose/unmount，避免内存泄漏
  - 结构加载要有 loading/错误 UI
- streaming 断线：允许简单重连（可从头重放但要去重 eventId）

# 8) 输出要求
- 以可运行代码为主；README 写清启动方式 + mock 协议 + Mol* 封装入口
- 不要写长篇解释

开始实现：骨架 -> mock API(streaming) -> UI -> Mol* tab viewer -> 缩略图策略 -> 端到端联通 -> 样式对齐 Figma。

注意， 手绘草图在 @docs/handcraft_design, 测试的蛋白质序列和结构数据在 @data/test_data （不要直接读取这些蛋白质文件到context中）， molstar代码在 @molstar, figma链接在：https://www.figma.com/design/BBZOb9cMxk14m2YwqVFWAe/%F0%9F%9F%A1-SPX-%E8%AE%BE%E8%AE%A1--Copy-?node-id=394-1979&m=dev