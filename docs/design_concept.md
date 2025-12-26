# Fold Agent 前端交互体验设计文档

**Project Code:** "The Theatre of Computation"

**Goal:** 构建"原生多模态大模型"的错觉，掩盖底层 Agent 工具调用的本质，通过可视化 CoT (Chain of Thought) 填补计算等待期。

**核心设计哲学:** 将 **Time** 转化为 **Insight**。用户等待的时间不应该是空白的，而应该是信息密度最高的时刻。

---

## 1. 核心概念：认知阶段 (Cognitive Stages)

我们将整个折叠过程重新定义为 AI 的五个认知阶段。前端不再展示"进度条"，而是展示当前 AI 的"思维状态"。

| 阶段   | 内部状态 (Backend)              | 用户感知 (Frontend Narrative)   | 视觉隐喻                    |
| :----- | :------------------------------ | :------------------------------ | :-------------------------- |
| **S1** | Annotation (search-agent)       | **Contextualizing (理解背景)**  | 文本流 + 知识图谱构建       |
| **S2** | Fast-Folding (并行启动)         | **Intuition (直觉构思)**        | 模糊粒子云 / 高斯表面       |
| **S3** | General-Folding Round 1         | **Hypothesizing (建立假说)**    | 结构从模糊变清晰 (Morphing) |
| **S4** | MQA + Constraint Assessment     | **Introspection (反思与批判)**  | 结构上的高亮扫描 / 思考气泡 |
| **S5** | Ranking + Decision + Resample   | **Crystallization (结晶/收敛)** | 结构的微小蠕动与收敛        |

---

## 2. 后端 Agent 架构与前端阶段映射

### 2.1 完整流程图

```
用户提交 Query
    │
    ├─────────────────────────────────────────────────────────────┐
    │                                                             │
    ▼ [并行启动]                                                   ▼
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│  search-agent (Annotation)      │     │  Fast-Folding (Protenix-ESM)    │
│  Phase 1: 获取蛋白信息           │     │  Phase 2a: 快速预览 (~1 min)     │
│                                 │     │                                 │
│  前端阶段: S1 Contextualizing   │     │  前端阶段: S2 Intuition         │
└─────────────────────────────────┘     └─────────────────────────────────┘
    │                                                             │
    │  ◄─── Fast-Folding 完成后立即显示 "直觉构思" ────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  General-Folding (Protenix-MSA / ColabFold / Boltz)                     │
│  Phase 2b: 高精度折叠 (~5-10 min)                                        │
│                                                                         │
│  前端阶段: S3 Hypothesizing (在 Fast-Folding 结构上叠加注释)              │
│  填充策略: 动态注释叠加 + 不确定性云图 + 实时指标流                         │
└─────────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Double Quality Check (并行执行)                                         │
│  ┌──────────────────────────┐  ┌──────────────────────────────────────┐ │
│  │ model-quality-assessment │  │ user-constraint-assessment           │ │
│  │ • pLDDT / PAE 评估       │  │ • Tier 0: Sanity Check               │ │
│  │ • 几何质量验证            │  │ • Tier 1: 快速约束检查               │ │
│  │ • 低置信度区域识别        │  │ • Tier 2: 深度分析 (Top-N)           │ │
│  └──────────────────────────┘  └──────────────────────────────────────┘ │
│                                                                         │
│  前端阶段: S4 Introspection (结构高亮 + 思考气泡)                         │
└─────────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  ranking-skill → response-decision-skill                                │
│                                                                         │
│  Decision = ACCEPT?                                                     │
│  ├─ YES → 前端阶段: S5 Crystallization (最终渲染)                        │
│  └─ NO  → RESAMPLE → 回到 General-Folding (Round 2/3)                   │
│           前端阶段: S5 Crystallization (反思 → 重新假设)                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 阶段-Skill 映射详表

| 前端阶段 | 后端 Skill/Agent | 触发条件 | 持续时间 | 数据来源 |
|:---------|:-----------------|:---------|:---------|:---------|
| **S1: Contextualizing** | `search-agent` (内部调用 Annotation MCP) | 用户提交 Query | ~10-30s | `load_protein` 输出的 VPO |
| **S2: Intuition** | `folding-skill` (Fast-Folding) | S1 完成或并行 | ~1 min | Fast-Folding 的 structure_v0 |
| **S3: Hypothesizing** | `folding-skill` (General-Folding Round 1) | S2 完成 | ~3-10 min | General-Folding 的 structure_v1 |
| **S4: Introspection** | `model-quality-assessment-skill` + `user-constraint-assessment-skill` | S3 完成 | ~30s-2min | MQA 和 Constraint 的 JSON 输出 |
| **S5: Crystallization** | `ranking-skill` + `response-decision-skill` | S4 完成 | ~10s | ranking 结果 + decision |
| **S5 (RESAMPLE)** | 回到 `folding-skill` Round 2/3 | Decision = RESAMPLE | 重复 S3-S5 | 累积的所有结构 |

---

## 3. 详细交互剧本 (The Script)

### 阶段 1: Contextualizing (理解背景)

**时间窗口**: 0s ~ 30s (与 Fast-Folding 并行)

**触发条件**: 用户提交 Query

**后端动作**:
- **并行启动**:
  - `search-agent` → 调用 `search_protein` + `load_protein`
  - `folding-skill` (Fast-Folding, Protenix-ESM) → 后台静默运行
- **Narrator 数据来源**: `search-agent` 返回的 VPO (Virtual Protein Object)

**数据映射表**:

| search-agent 输出字段 | Narrator 转化 | 示例输出 |
|:---------------------|:--------------|:---------|
| `protein_name` | 蛋白识别 | "Identified target: **Argininosuccinate synthase**" |
| `basic_info.gene_name` | 基因关联 | "Gene: ASS1" |
| `domains[].name` + `domains[].start-end` | 结构域发现 | "Detected a **Catalytic domain** (residues 50-150)" |
| `folding_recommendation.suggested_backends` | 策略选择 | "Based on sequence complexity, selecting **Protenix-MSA**" |
| `reference_structures[].pdb_id` | 同源结构 | "Found homologous structure: PDB 1ABC (TM-score: 0.85)" |
| `homologs[].identity` | 进化信息 | "Evolutionary analysis reveals conserved core..." |

**前端展示**:
- **主画面**: 空白或微弱的神经网络背景
- **文字流 (Typewriter effect)**:
  - *"Reading sequence data..."*
  - *"Ah, this looks like a member of the **[domains[0].name]** family."*
  - *"Noticing a potential binding site at residue [active_sites[0].position]. Keeping this in mind."*
  - *"The evolutionary history suggests a conserved core here..."*

**心理学目标**: 让用户觉得 AI 正在"读懂"这个蛋白，而不是在查数据库。

---

### 阶段 2: Intuition (直觉构思)

**时间窗口**: T+30s ~ T+60s (Fast-Folding 完成)

**触发条件**: Fast-Folding 产出第一个 PDB (`structure_v0`)

**后端动作**:
- Fast-Folding (`folding-skill` with Protenix-ESM) 结束
- **Narrator 逻辑**: 缓存该结构，标记为 `structure_v0`
- 同时: General-Folding 在后台继续运行

**数据映射表**:

| folding-skill 输出字段 | Narrator 转化 | 示例输出 |
|:----------------------|:--------------|:---------|
| `structures[0].path` | 结构产出 | 触发 Ghost Mode 渲染 |
| `msa_quality.neff` (如有) | MSA 质量提示 | "MSA diversity: Neff = 128" |
| `backend` | 方法说明 | "Using ESM embeddings for rapid topology estimation" |

**前端展示**:
- **视觉**: 屏幕中央汇聚出一团**模糊的、半透明的 Surface** (Ghost Mode)
  - 不要展示具体的 Backbone
  - 颜色使用单色（深蓝/灰）
  - 高置信度区域稍亮，低置信度区域保持虚化
- **文字流**:
  - *"I have a vague shape in mind..."*
  - *"Based on the sequence physics, the topology might look something like this."*
  - *"The core structure is taking form, but the loops are still uncertain..."*

**心理学目标**: 降低预期。告诉用户"这是草稿"，为后面更准的结构做铺垫。

---

### 阶段 3: Hypothesizing (建立假说)

**时间窗口**: T+1min ~ T+10min (General Folding 运行期间)

**触发条件**:
- 立即进入 (Fast-Folding 完成后)
- 在 General-Folding 完成时产出 `structure_v1`

**后端动作**:
- `folding-skill` (General-Folding: Protenix-MSA / ColabFold) 运行中
- **Narrator 逻辑**:
  - General-Folding 完成时: 计算 `RMSD(structure_v0, structure_v1)`
  - 等待期间: 生成填充性叙事 (见 3.1 等待期填充策略)

**分支判断** (General-Folding 完成时):
- **Case A (RMSD < 2.5Å, 相似)**: Narrative 为"细化"
- **Case B (RMSD > 2.5Å, 差异大)**: Narrative 为"推翻重来"

**数据映射表**:

| 计算指标 | Narrator 转化 | 示例输出 |
|:---------|:--------------|:---------|
| `RMSD(v0, v1) < 2.5Å` | 直觉验证 | "The initial intuition was close. Let me sharpen the details." |
| `RMSD(v0, v1) > 2.5Å` | 拓扑调整 | "Wait, the evolutionary constraints contradict my initial thought. Let me re-adjust the topology." |
| `structure_v1.plddt_mean` | 置信度更新 | "Confidence improved to [pLDDT]" |

**前端展示**:
- **视觉**:
  - **Case A**: 模糊 Surface 平滑收缩，变得锐利，露出内部的 Cartoon 骨架
  - **Case B**: 模糊 Surface 像烟雾一样消散，新的结构从中心重新生长出来
  - **RMSD > 10Å**: 禁止使用插值动画，改用 **Cross-Fade (淡入淡出)**
- **文字流**: 根据 Case A/B 显示不同文本

#### 3.1 等待期填充策略 (General-Folding 的 5-10 分钟)

在 General-Folding 运行期间，前端只有 Fast-Folding 的"草稿"。需要生成填充性内容：

**策略 A: 动态注释叠加 (The Annotated Canvas)**

将 Phase 1 挖掘到的 Annotation 实时投射到 Fast-Folding 的 3D 结构上：

| 时间点 | Narrator 输出 | 视觉动效 |
|:-------|:--------------|:---------|
| t=0s | "Overlaying functional annotations..." | 开始在结构上标注 |
| t=10s | "Marking active site at residue [X]..." | Active Site 位置高亮 |
| t=30s | "Highlighting binding regions..." | Binding Site 区域着色 |
| t=60s | "Mapping domain boundaries..." | Domain 边界用不同颜色区分 |

**策略 B: 不确定性云图 (The Uncertainty Cloud)**

针对 pLDDT 较低的区域，渲染半透明的"电子云"：

| 条件 | Narrator 输出 | 视觉动效 |
|:-----|:--------------|:---------|
| Low pLDDT region detected | "Residues [start]-[end] show high flexibility..." | 该区域显示多重幻影/电子云 |
| IDR detected | "Intrinsically disordered region detected, exploring conformational space..." | 区域持续"呼吸"动画 |

**策略 C: 实时指标流 (The Vital Signs)**

展示模型计算的"生命体征"：

| 指标 | 展示方式 | 更新频率 |
|:-----|:---------|:---------|
| Energy Score | 下降曲线 | 每 10s 插值更新 |
| MSA 覆盖度 | 进度条 | 一次性展示 |
| Confidence | 逐步上升 | 每 30s 更新 |

**策略 D: 基于知识的填充叙事**

当没有真实数据时，根据当前 Skill 生成合理的中间状态：

```python
# Narrator 填充逻辑示例
FILLER_NARRATIVES = {
    "folding": {
        (0, 10): "Initializing neural network weights...",
        (10, 30): "Recycling iterations: refining backbone geometry...",
        (30, 60): "Optimizing side-chain packing using rotamer libraries...",
        (60, 120): "Performing energy minimization (Amber forcefield)...",
        (120, 300): "Exploring conformational space for flexible regions...",
        (300, 600): "Converging on stable low-energy conformations..."
    }
}
```

---

### 阶段 4: Introspection (反思与批判)

**时间窗口**: General-Folding 完成后 ~ 进入 Decision 阶段

**触发条件**: MQA 和 Constraint Check 完成

**后端动作**:
- `model-quality-assessment-skill` 输出 quality_scores
- `user-constraint-assessment-skill` 输出 constraint_results
- **Narrator 逻辑**: 解析 Check 结果，转化为"自我反思"

**数据映射表 (model-quality-assessment-skill)**:

| MQA 输出字段 | Narrator 转化 | 示例输出 |
|:-------------|:--------------|:---------|
| `plddt.mean < 70` | 整体置信度警告 | "Overall confidence is concerning..." |
| `plddt.mean >= 70` | 置信度确认 | "Structural confidence is acceptable (pLDDT: [mean])" |
| `low_confidence_regions[].start-end` | 低置信区域 | "This loop region (residues [start]-[end]) feels unstable." |
| `geometry_metrics.clashes.severe_clashes > 0` | 碰撞检测 | "There is some internal friction in the core." |
| `geometry_metrics.ramachandran.outlier_percentage > 5%` | 骨架异常 | "Some backbone angles appear strained." |
| `pae.inter_domain_mean > 15` | 域间不确定 | "The relative orientation between domains is uncertain." |

**数据映射表 (user-constraint-assessment-skill)**:

| Constraint 输出字段 | Narrator 转化 | 示例输出 |
|:--------------------|:--------------|:---------|
| `status: "FAIL"` + `type: "distance"` | 距离违规 | "The disulfide bond at C[X]-C[Y] is under too much tension (measured: [value]Å, required: <[threshold]Å)." |
| `status: "FAIL"` + `type: "sasa"` | 暴露度违规 | "Residue [X] is unexpectedly buried when it should be solvent-accessible." |
| `status: "PASS"` | 约束满足 | "The distance constraint between residues [X] and [Y] is satisfied." |
| `status: "MARGINAL"` | 边缘情况 | "The constraint is marginally satisfied, but worth monitoring." |

**前端展示**:
- **视觉**:
  - 结构保持不动
  - **3D 高亮**: 问题区域闪烁红光或黄光
  - **Scanning Effect**: 一道光扫过整个蛋白
  - **Distance Lines**: 在违规的原子对之间画红色虚线，显示距离数值
- **文字流 (Reflection)**:
  - *"Analyzing thermodynamic stability..."*
  - *"Something feels off about the C-terminus flexibility."*
  - *"Checking against user constraints... The distance between A and B is not ideal yet."*

**心理学目标**: 展示 **CoT (Chain of Thought)**。让用户看到 AI 在"自我纠错"。

---

### 阶段 5: Crystallization (结晶/收敛)

**时间窗口**: Quality Check 完成后

**触发条件**: `response-decision-skill` 输出 decision

**后端动作**:
- `ranking-skill` 输出 ranked_results
- `response-decision-skill` 输出 decision (ACCEPT / RESAMPLE)

**分支 A: Decision = ACCEPT**

| 输出字段 | Narrator 转化 | 示例输出 |
|:---------|:--------------|:---------|
| `decision: "ACCEPT"` | 确认完成 | "Structure Locked." |
| `ranked_results[0].composite_score` | 综合评分 | "Final confidence: [score]%" |
| `ranked_results[0].warnings` | 注意事项 | "Note: [warning]" |

**前端展示 (ACCEPT)**:
- **视觉**:
  - 结构瞬间"凝固"
  - 材质变为高光泽的写实风格
  - 展示最终的高清渲染图
- **文字流**:
  - *"Converging on a stable conformation."*
  - *"Structure Locked. Confidence: [score]%"*

**分支 B: Decision = RESAMPLE**

| 输出字段 | Narrator 转化 | 示例输出 |
|:---------|:--------------|:---------|
| `decision: "RESAMPLE"` | 重新思考 | "This is not satisfactory. Let me reconsider..." |
| `action_plan.next_round` | 轮次信息 | "Initiating Round [N] with adjusted strategy." |
| `action_plan.samples` | 采样策略 | "Exploring [N] new conformational candidates." |

**RESAMPLE 叙事设计 (反思而非失败)**:

将 RESAMPLE 包装为 **"Refining"（精炼）** 和 **"Self-Correction"（自我修正）**：

| 步骤 | Narrator 输出 | 视觉动效 |
|:-----|:--------------|:---------|
| **Step 1: 发现冲突** | "Initial folding complete. But I found a problem: Constraint '[id]' measures [value]Å, exceeding the [threshold]Å limit." | 冲突区域高亮，红色虚线标注 |
| **Step 2: 提出新策略** | "This is not acceptable. I decide to **resample** the backbone dihedral angles and increase sampling weight for this region." | 冲突区域闪烁，模型退回线框模式 |
| **Step 3: 迭代对比** (Round 2+) | "Through adjustment, the conflict has been reduced from [old]Å to [new]Å. Structural stability improved by [X]%." | Before/After 小窗口对比 |

**前端展示 (RESAMPLE)**:
- **视觉**:
  - 结构退回到半透明状态
  - 问题区域持续高亮
  - 显示 "Reconsidering..." 动画
- **文字流**:
  - *"The [constraint_type] constraint is not yet satisfied."*
  - *"Let me adjust my approach and try again..."*
  - *"Initiating Round [N]..."*

---

## 4. 数据协议设计 (Protocol Design)

### 4.1 CognitiveEvent 标准格式

后端通过 WebSocket/SSE 推送的标准事件包：

```json
{
  "event_id": "evt_1719230001",
  "event_type": "COGNITIVE_UPDATE",
  "timestamp": 1700000000,
  "source_skill": "model-quality-assessment-skill",
  "stage": "INTROSPECTION",
  "phase": "EVALUATION",

  "narrative": {
    "summary": "Structural confidence is acceptable.",
    "detail": "The structure reached a mean pLDDT of 82.5. However, the region 120-135 shows high flexibility (pLDDT < 60).",
    "tone": "CAUTIOUS_OPTIMISM"
  },

  "visual_instruction": {
    "mode": "HIGHLIGHT_REGION",
    "target_structure_url": "https://.../model_v2.cif",
    "highlight_regions": [
      {"chain_id": "A", "start_residue": 120, "end_residue": 135, "color": "orange", "label": "Low Confidence"}
    ],
    "draw_distance_lines": [],
    "interpolation_duration": 1000,
    "camera_view": "focus_region"
  },

  "metrics": {
    "key_values": {
      "mean_plddt": 82.5,
      "pae_mean": 5.3,
      "constraint_satisfaction": 0.67
    },
    "charts": {
      "plddt_per_residue": {"type": "line", "data_ref": "s3://..."}
    }
  },

  "raw_data_ref": {
    "skill_output": "s3://jobs/123/mqa_result.json"
  }
}
```

### 4.2 Narrative Tone 类型

| Tone | 使用场景 | 文字风格 |
|:-----|:---------|:---------|
| `INFO` | 中性信息传递 | 平静、客观 |
| `PROCESSING` | 正在计算 | 进行时态 |
| `CONFIDENT` | 高置信度结果 | 肯定、简洁 |
| `CAUTIOUS_OPTIMISM` | 有改进空间 | 积极但谨慎 |
| `WARNING` | 发现问题 | 关注、分析 |
| `CRITICAL` | 严重问题 | 紧急、需要处理 |
| `SUCCESS` | 任务完成 | 确认、总结 |

### 4.3 Visual Mode 类型

| Mode | 触发条件 | 渲染效果 |
|:-----|:---------|:---------|
| `GHOST` | Fast-Folding 完成 | 半透明表面，单色 |
| `MORPH` | 结构更新 (RMSD < 10Å) | 平滑插值动画 |
| `CROSSFADE` | 结构更新 (RMSD > 10Å) | 淡入淡出 |
| `HIGHLIGHT_REGION` | 质量检查完成 | 问题区域高亮 |
| `STATIC` | 展示静态结构 | 无动画 |
| `CRYSTALLIZE` | 最终 ACCEPT | 高光泽写实材质 |

---

## 5. Skill 输出 → CognitiveEvent 映射规范

### 5.1 search-agent (Annotation)

**输入 (VPO 格式)**:
```json
{
  "uniprot_id": "P00966",
  "protein_name": "Argininosuccinate synthase",
  "basic_info": {"gene_name": "ASS1", "length": 412},
  "domains": [{"name": "Catalytic", "start": 50, "end": 150}],
  "active_sites": [{"position": 87, "type": "catalytic"}],
  "folding_recommendation": {"suggested_backends": ["protenix_msa"]}
}
```

**转化规则**:

| 字段 | 目标位置 | 转化逻辑 |
|:-----|:---------|:---------|
| `protein_name` | `narrative.summary` | "Identified target: **{protein_name}**" |
| `domains[]` | `narrative.detail` | "Detected **{name}** domain (residues {start}-{end})" |
| `active_sites[]` | `visual_instruction.highlight_regions` | 预设高亮（用于 S3 阶段叠加） |
| `folding_recommendation` | `narrative.detail` | "Selecting **{suggested_backends[0]}** based on sequence complexity" |

### 5.2 folding-skill

**输入**:
```json
{
  "status": "success",
  "backend": "protenix_esm",
  "structures": [{"path": "/output/structure_0.cif", "index": 0}],
  "num_structures": 8,
  "msa_quality": {"neff": 128, "coverage": 0.95}
}
```

**转化规则**:

| 字段 | 目标位置 | 转化逻辑 |
|:-----|:---------|:---------|
| `structures[0].path` | `visual_instruction.target_structure_url` | 直接使用 |
| `backend` | `narrative.detail` | "Using **{backend}** for structure generation" |
| `num_structures` | `metrics.key_values.candidates` | 直接使用 |
| `msa_quality.neff` | `narrative.detail` (如 MSA) | "MSA diversity: Neff = {neff}" |

### 5.3 model-quality-assessment-skill

**输入**:
```json
{
  "model_quality": {
    "plddt": {"mean": 82.5, "per_residue": [...]},
    "pae": {"mean": 5.3, "intra_domain_mean": 3.2, "inter_domain_mean": 12.5},
    "geometry_metrics": {
      "clashes": {"severe_clashes": 0},
      "ramachandran": {"outlier_percentage": 1.2}
    }
  },
  "low_confidence_regions": [{"start": 120, "end": 135, "mean_plddt": 52.3}]
}
```

**转化规则**:

| 字段 | 目标位置 | 转化逻辑 |
|:-----|:---------|:---------|
| `plddt.mean` | `metrics.key_values.mean_plddt` | 直接使用 |
| `plddt.mean >= 70` | `narrative.summary` | "Structural confidence is acceptable (pLDDT: {mean})" |
| `plddt.mean < 70` | `narrative.tone` | 设为 `WARNING` |
| `low_confidence_regions[]` | `visual_instruction.highlight_regions` | 转化为高亮区域 (color: orange) |
| `low_confidence_regions[]` | `narrative.detail` | "Region {start}-{end} shows high flexibility (pLDDT < 60)" |
| `geometry_metrics.clashes.severe_clashes > 0` | `narrative.detail` | "Detected {N} severe atomic clashes" |
| `pae.inter_domain_mean > 15` | `narrative.detail` | "Domain orientation is uncertain (PAE > 15Å)" |

### 5.4 user-constraint-assessment-skill

**输入**:
```json
{
  "results": [
    {
      "constraint_id": "c1",
      "type": "distance",
      "description": "C45-C120 disulfide bond",
      "status": "FAIL",
      "measured_value": 8.7,
      "threshold": "< 2.5",
      "details": "Sγ-Sγ distance is 8.7Å"
    }
  ],
  "satisfaction_rate": 0.67
}
```

**转化规则**:

| 字段 | 目标位置 | 转化逻辑 |
|:-----|:---------|:---------|
| `results[].status == "FAIL"` | `narrative.tone` | 设为 `CRITICAL` |
| `results[].type == "distance"` + `status == "FAIL"` | `narrative.detail` | "The disulfide bond at {description} is under tension (measured: {measured_value}Å, required: {threshold})" |
| `results[]` (FAIL) | `visual_instruction.draw_distance_lines` | 添加红色虚线 |
| `results[]` (FAIL) | `visual_instruction.highlight_regions` | 高亮相关残基 |
| `satisfaction_rate` | `metrics.key_values.constraint_satisfaction` | 直接使用 |

### 5.5 ranking-skill

**输入**:
```json
{
  "ranked_results": [{
    "rank": 1,
    "file": "/path/to/best.cif",
    "composite_score": 85.3,
    "breakdown": {
      "model_quality_score": 82.5,
      "constraint_satisfaction": 1.0,
      "pairwise_consensus": {"combined": 0.78}
    },
    "warnings": ["C-terminus low confidence"]
  }]
}
```

**转化规则**:

| 字段 | 目标位置 | 转化逻辑 |
|:-----|:---------|:---------|
| `ranked_results[0].file` | `visual_instruction.target_structure_url` | 直接使用 |
| `ranked_results[0].composite_score` | `metrics.key_values.composite_score` | 直接使用 |
| `ranked_results[0].warnings[]` | `narrative.detail` | "Note: {warning}" |

### 5.6 response-decision-skill

**输入**:
```json
{
  "decision": "RESAMPLE",
  "reason": "constraint not satisfied",
  "action_plan": {"next_round": 2, "samples": 16}
}
```

**转化规则**:

| 字段 | 目标位置 | 转化逻辑 |
|:-----|:---------|:---------|
| `decision == "ACCEPT"` | `stage` | 设为 `CRYSTALLIZATION_FINAL` |
| `decision == "ACCEPT"` | `visual_instruction.mode` | 设为 `CRYSTALLIZE` |
| `decision == "RESAMPLE"` | `stage` | 设为 `CRYSTALLIZATION_RESAMPLE` |
| `decision == "RESAMPLE"` | `narrative.summary` | "This is not satisfactory. Let me reconsider..." |
| `action_plan.next_round` | `narrative.detail` | "Initiating Round {next_round}" |
| `action_plan.samples` | `narrative.detail` | "Exploring {samples} new candidates" |

---

## 6. Narrator 模块实现规范

### 6.1 架构设计

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Narrator Service                                │
│                                                                             │
│  ┌───────────────┐     ┌────────────────────┐     ┌─────────────────────┐   │
│  │ Skill Output  │ ──► │ Transformer Layer  │ ──► │ CognitiveEvent      │   │
│  │ (Raw JSON)    │     │ (Mapping Rules)    │     │ (Standardized)      │   │
│  └───────────────┘     └────────────────────┘     └─────────────────────┘   │
│                                │                                            │
│                                ▼                                            │
│                        ┌────────────────────┐                               │
│                        │ Filler Generator   │                               │
│                        │ (Interpolation)    │                               │
│                        └────────────────────┘                               │
│                                │                                            │
│                                ▼                                            │
│                        ┌────────────────────┐                               │
│                        │ Event Queue        │                               │
│                        │ (Throttled Output) │                               │
│                        └────────────────────┘                               │
│                                │                                            │
│                                ▼                                            │
│                         WebSocket / SSE ──────────────────────► Frontend    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Transformer 伪代码

```python
class NarratorTransformer:
    """将 Skill 输出转化为 CognitiveEvent"""

    def transform(self, skill_name: str, skill_output: dict) -> CognitiveEvent:
        if skill_name == "search-agent":
            return self._transform_annotation(skill_output)
        elif skill_name == "folding-skill":
            return self._transform_folding(skill_output)
        elif skill_name == "model-quality-assessment-skill":
            return self._transform_mqa(skill_output)
        elif skill_name == "user-constraint-assessment-skill":
            return self._transform_constraints(skill_output)
        elif skill_name == "ranking-skill":
            return self._transform_ranking(skill_output)
        elif skill_name == "response-decision-skill":
            return self._transform_decision(skill_output)

    def _transform_mqa(self, output: dict) -> CognitiveEvent:
        plddt_mean = output["model_quality"]["plddt"]["mean"]
        low_regions = output.get("low_confidence_regions", [])

        # 确定 tone
        tone = "CONFIDENT" if plddt_mean >= 80 else (
            "CAUTIOUS_OPTIMISM" if plddt_mean >= 70 else "WARNING"
        )

        # 构建 narrative
        summary = f"Structural confidence is {'good' if plddt_mean >= 70 else 'concerning'} (pLDDT: {plddt_mean:.1f})"

        details = []
        for region in low_regions:
            details.append(
                f"Region {region['start']}-{region['end']} shows high flexibility "
                f"(pLDDT: {region['mean_plddt']:.1f})"
            )

        # 构建 visual hints
        highlights = [
            {
                "chain_id": "A",  # 需要从结构中推断
                "start_residue": r["start"],
                "end_residue": r["end"],
                "color": "orange",
                "label": "Low Confidence"
            }
            for r in low_regions
        ]

        return CognitiveEvent(
            stage="INTROSPECTION",
            source_skill="model-quality-assessment-skill",
            narrative=Narrative(
                summary=summary,
                detail="; ".join(details),
                tone=tone
            ),
            visual_instruction=VisualInstruction(
                mode="HIGHLIGHT_REGION",
                highlight_regions=highlights
            ),
            metrics={
                "key_values": {
                    "mean_plddt": plddt_mean,
                    "pae_mean": output["model_quality"]["pae"]["mean"]
                }
            }
        )
```

### 6.3 Filler Generator 伪代码

```python
class FillerGenerator:
    """当没有真实数据时，生成填充性叙事"""

    FILLER_TEMPLATES = {
        "folding": [
            (0, 10, "Initializing neural network weights..."),
            (10, 30, "Recycling iterations: refining backbone geometry..."),
            (30, 60, "Optimizing side-chain packing using rotamer libraries..."),
            (60, 120, "Performing energy minimization (Amber forcefield)..."),
            (120, 300, "Exploring conformational space for flexible regions..."),
            (300, 600, "Converging on stable low-energy conformations...")
        ],
        "msa_search": [
            (0, 10, "Searching UniRef30 database for homologs..."),
            (10, 30, "Found {N} homologous sequences. Clustering..."),
            (30, 60, "Building multiple sequence alignment..."),
            (60, 90, "Analyzing conservation patterns...")
        ]
    }

    def generate(self, current_skill: str, elapsed_time: float) -> str:
        templates = self.FILLER_TEMPLATES.get(current_skill, [])
        for start, end, text in templates:
            if start <= elapsed_time < end:
                return text
        return "Processing..."
```

### 6.4 Throttler (节流阀)

```python
class EventThrottler:
    """控制事件推送频率，避免前端过载"""

    def __init__(self, min_interval: float = 2.0):
        self.min_interval = min_interval
        self.last_push_time = 0
        self.queue = []

    def push(self, event: CognitiveEvent):
        self.queue.append(event)
        self._try_flush()

    def _try_flush(self):
        now = time.time()
        if now - self.last_push_time >= self.min_interval and self.queue:
            event = self.queue.pop(0)
            self._send_to_frontend(event)
            self.last_push_time = now

    def force_flush(self):
        """强制推送所有待处理事件（用于阶段切换）"""
        while self.queue:
            self._send_to_frontend(self.queue.pop(0))
```

---

## 7. 工程实现注意事项

### 7.1 Backend (The Narrator Module)

1. **翻译器 (The Translator)**:
   - 使用 Template Pattern 为每个 Skill 编写具体的 Formatter
   - 支持 LLM-based 翻译作为 fallback（将结构化数据转化为自然语言）

2. **节流阀 (The Throttler)**:
   - Fast-Folding 可能 1 分钟出结果，但 General Folding 可能要 10 分钟
   - 如果在 General Folding 期间没有任何输出，Narrator 需要**自动生成"填充性闲聊"**，防止冷场
   - 推荐间隔: 每 5-10 秒推送一个 Filler Event

3. **Chain ID 处理**:
   - 所有残基引用必须带上 Chain ID（如 "Chain A, Residue 50"）
   - PDB 文件中经常出现多链，不带链 ID 的描述是不严谨的

4. **残基编号对齐**:
   - SwissProt 的序列编号（1-based）与 PDB 结构中的残基编号往往不一致
   - 必须实现 **Residue Mapping** 逻辑
   - 建议: 将 pLDDT 写在 PDB 的 B-factor 列中

### 7.2 Frontend (The Renderer)

1. **动画队列 (Animation Queue)**:
   - 后端推流可能很快，前端必须**串行播放**
   - 如果收到 v2, v3, v4，必须等 v2 动画播完再播 v3

2. **RMSD Check**:
   - 前端收到新结构前，检查 RMSD
   - 如果 RMSD > 10Å（结构完全变了），**禁止使用插值动画**（会穿模），改用 **Cross-Fade**

3. **3D Viewer 集成**:
   - 推荐使用 `molstar` 或 `ngl.js`
   - 支持 `highlight_regions` 的动态渲染
   - 支持 `draw_distance_lines` 在结构中画虚线

4. **状态机维护**:
   - 前端维护状态机: `Draft` -> `Critique` -> `Refining` -> `Final`
   - 在 `Refining` 状态下，必须明确指出"为了什么而 Refining"

---

## 8. 附录

### 8.1 Narrative 模板库示例

```python
NARRATIVE_TEMPLATES = {
    # Contextualizing
    "protein_identified": "Identified target protein **{protein_name}** ({uniprot_id}).",
    "domain_found": "Annotation reveals a **{domain_name}** domain spanning residues {start}-{end}.",
    "backend_selected": "Based on sequence complexity, selecting **{backend}** as the folding engine.",

    # Intuition
    "fast_fold_complete": "I have a vague shape in mind...",
    "topology_forming": "Based on the sequence physics, the topology might look something like this.",

    # Hypothesizing
    "intuition_close": "The initial intuition was close. Let me sharpen the details.",
    "intuition_different": "Wait, the evolutionary constraints contradict my initial thought. Let me re-adjust the topology.",

    # Introspection
    "confidence_good": "Structural confidence is acceptable (pLDDT: {plddt:.1f}).",
    "confidence_warning": "Overall confidence is concerning (pLDDT: {plddt:.1f}).",
    "low_region": "Region {start}-{end} shows high flexibility (pLDDT: {plddt:.1f}).",
    "constraint_fail": "The {constraint_type} constraint at {location} is violated (measured: {value}, required: {threshold}).",
    "constraint_pass": "The {constraint_type} constraint is satisfied.",

    # Crystallization
    "accept": "Structure Locked. Confidence: {score:.1f}%.",
    "resample": "This is not satisfactory. Let me reconsider...",
    "resample_round": "Initiating Round {round} with {samples} new candidates."
}
```

### 8.2 完整 CognitiveEvent 类型定义

```typescript
interface CognitiveEvent {
  event_id: string;
  event_type: "COGNITIVE_UPDATE";
  timestamp: number;
  source_skill: string;
  stage: "CONTEXTUALIZING" | "INTUITION" | "HYPOTHESIZING" | "INTROSPECTION" | "CRYSTALLIZATION";
  phase: "SEARCH" | "FOLDING" | "EVALUATION" | "DECISION";

  narrative: {
    summary: string;
    detail: string;
    tone: "INFO" | "PROCESSING" | "CONFIDENT" | "CAUTIOUS_OPTIMISM" | "WARNING" | "CRITICAL" | "SUCCESS";
  };

  visual_instruction: {
    mode: "GHOST" | "MORPH" | "CROSSFADE" | "HIGHLIGHT_REGION" | "STATIC" | "CRYSTALLIZE";
    target_structure_url?: string;
    highlight_regions?: Array<{
      chain_id: string;
      start_residue: number;
      end_residue: number;
      color: string;
      label?: string;
    }>;
    draw_distance_lines?: Array<{
      residue_1: {chain: string, resid: number};
      residue_2: {chain: string, resid: number};
      label: string;
      color: string;
    }>;
    interpolation_duration?: number;
    camera_view?: "default" | "focus_region" | "front" | "top";
  };

  metrics?: {
    key_values?: Record<string, number>;
    charts?: Record<string, {type: string, data_ref: string}>;
  };

  raw_data_ref?: {
    skill_output?: string;
  };
}
```

---

**Document Version**: 2.0
**Last Updated**: 2025-12-25
**Contributors**: dyxue, Gemini 3 Pro, Claude
