# Molstar 使用指南

## 目录

- [1. 简介](#1-简介)
- [2. 项目结构](#2-项目结构)
- [3. 安装配置](#3-安装配置)
- [4. 基本使用](#4-基本使用)
- [5. 在 Next.js 中集成](#5-在-nextjs-中集成)
- [6. 核心 API](#6-核心-api)
- [7. 常见操作](#7-常见操作)
- [8. 最佳实践](#8-最佳实践)
- [9. 故障排查](#9-故障排查)

---

## 1. 简介

### 1.1 什么是 Molstar

Molstar 是一个现代化的 Web 应用框架，专门用于 **3D 可视化和分析大型生物分子结构**。由 PDBe（欧洲蛋白质数据库）和 RCSB PDB（美国蛋白质数据库）联合开发。

### 1.2 主要特性

- ✅ 支持多种分子结构格式（PDB, mmCIF, GRO, MOL2 等）
- ✅ 高性能 WebGL 渲染
- ✅ 丰富的交互功能（旋转、缩放、选择等）
- ✅ 可自定义主题和样式
- ✅ 支持动画和轨迹可视化
- ✅ React 集成友好

### 1.3 支持的文件格式

**结构文件**：

- PDB/PDBQT: `.pdb`, `.ent`, `.pdbqt`
- mmCIF: `.cif`, `.bcif`, `.mmcif`, `.mcif`
- GRO: `.gro`
- MOL/MOL2: `.mol`, `.mol2`
- SDF: `.sdf`, `.sd`
- XYZ: `.xyz`

**体积数据**：

- CCP4/MRC/MAP: `.ccp4`, `.mrc`, `.map`
- CUBE: `.cub`, `.cube`

---

## 2. 项目结构

Molstar 项目的核心模块（位于 `molstar/src/`）：

```
molstar/
├── mol-data/          # 数据集合（表格、列等）
├── mol-io/            # 文件解析库
├── mol-model/         # 分子数据结构和查询
├── mol-gl/            # WebGL 封装
├── mol-canvas3d/      # 3D 视图组件
├── mol-plugin/        # 插件系统核心
├── mol-plugin-state/  # 状态管理
├── mol-plugin-ui/     # React UI 组件
└── mol-util/          # 工具函数
```

---

## 3. 安装配置

### 3.1 安装依赖

```bash
npm install molstar
# 或
pnpm add molstar
```

### 3.2 额外依赖（对等依赖）

```bash
npm install react react-dom
```

### 3.3 TypeScript 配置

确保 `tsconfig.json` 包含：

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "moduleResolution": "node",
    "esModuleInterop": true
  }
}
```

---

## 4. 基本使用

### 4.1 最简单的方式：CDN 引入

适合快速原型开发和演示：

```html
<!DOCTYPE html>
<html>
  <head>
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/molstar@latest/build/viewer/molstar.css"
    />
    <script src="https://cdn.jsdelivr.net/npm/molstar@latest/build/viewer/molstar.js"></script>
  </head>
  <body>
    <div
      id="molstar-app"
      style="position: absolute; width: 100%; height: 100vh;"
    ></div>

    <script>
      molstar.Viewer.create("molstar-app", {
        layoutIsExpanded: false,
        layoutShowControls: true,
        layoutShowSequence: true,
      }).then((viewer) => {
        // 从 PDB ID 加载
        viewer.loadPdb("1grm");

        // 或从 URL 加载
        // viewer.loadStructureFromUrl('https://files.rcsb.org/download/1grm.pdb', 'pdb');
      });
    </script>
  </body>
</html>
```

### 4.2 核心渲染流程

无论使用哪种集成方式，渲染 PDB 文件的核心步骤都是：

```
1. 初始化插件
   ↓
2. 下载/加载数据
   ↓
3. 解析为 trajectory（轨迹对象）
   ↓
4. 应用渲染预设
   ↓
5. 显示 3D 结构
```

---

## 5. 在 Next.js 中集成

### 5.1 创建 Molstar 组件

创建 `src/components/MolstarViewer.tsx`：

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';
import { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18';
import { DefaultPluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import 'molstar/lib/mol-plugin-ui/skin/light.scss';

interface MolstarViewerProps {
  pdbUrl?: string;
  pdbId?: string;
  format?: 'pdb' | 'mmcif' | 'cif';
  className?: string;
}

export function MolstarViewer({
  pdbUrl,
  pdbId,
  format = 'pdb',
  className = ''
}: MolstarViewerProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const pluginRef = useRef<PluginUIContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function init() {
      if (!parentRef.current || pluginRef.current) return;

      try {
        setIsLoading(true);
        setError(null);

        // 创建插件实例
        const plugin = await createPluginUI({
          target: parentRef.current,
          render: renderReact18,
          spec: {
            ...DefaultPluginUISpec(),
            layout: {
              initial: {
                isExpanded: false,
                showControls: true,
                showSequence: true,
                showLog: false,
                showLeftPanel: true
              }
            },
            components: {
              remoteState: 'none'
            }
          }
        });

        if (!isMounted) {
          plugin.dispose();
          return;
        }

        pluginRef.current = plugin;

        // 加载结构
        await loadStructure(plugin);

        setIsLoading(false);
      } catch (err) {
        console.error('Failed to initialize Molstar:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setIsLoading(false);
      }
    }

    async function loadStructure(plugin: PluginUIContext) {
      // 构建 URL
      let url: string;
      if (pdbUrl) {
        url = pdbUrl;
      } else if (pdbId) {
        url = `https://files.rcsb.org/download/${pdbId}.${format}`;
      } else {
        throw new Error('Either pdbUrl or pdbId must be provided');
      }

      // 下载数据
      const data = await plugin.builders.data.download(
        { url, isBinary: false },
        { state: { isGhost: true } }
      );

      // 解析轨迹
      const trajectory = await plugin.builders.structure.parseTrajectory(data, format);

      // 应用预设渲染
      await plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default', {
        structure: {
          name: 'model',
          params: {}
        },
        showUnitcell: false,
        representationPreset: 'auto'
      });
    }

    init();

    return () => {
      isMounted = false;
      if (pluginRef.current) {
        pluginRef.current.dispose();
        pluginRef.current = null;
      }
    };
  }, [pdbUrl, pdbId, format]);

  return (
    <div className={`relative ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <div className="text-gray-600">Loading structure...</div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50">
          <div className="text-red-600">Error: {error}</div>
        </div>
      )}
      <div ref={parentRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
```

### 5.2 使用组件

```typescript
// app/page.tsx
import { MolstarViewer } from '@/components/MolstarViewer';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-24">
      <h1 className="text-4xl font-bold mb-8">Protein Structure Viewer</h1>

      {/* 从 PDB ID 加载 */}
      <div className="w-full max-w-4xl h-[600px] border rounded-lg overflow-hidden">
        <MolstarViewer pdbId="1grm" format="pdb" />
      </div>

      {/* 或从自定义 URL 加载 */}
      {/* <MolstarViewer
        pdbUrl="https://your-server.com/structure.pdb"
        format="pdb"
      /> */}
    </main>
  );
}
```

### 5.3 Webpack 配置（如需要）

如果遇到构建问题，在 `next.config.js` 中添加：

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // 处理 SCSS 文件
    config.module.rules.push({
      test: /\.scss$/,
      use: ["style-loader", "css-loader", "sass-loader"],
    });

    return config;
  },
};

module.exports = nextConfig;
```

---

## 6. 核心 API

### 6.1 创建插件实例

```typescript
import { createPluginUI } from "molstar/lib/mol-plugin-ui";
import { renderReact18 } from "molstar/lib/mol-plugin-ui/react18";

const plugin = await createPluginUI({
  target: document.getElementById("app")!,
  render: renderReact18,
  spec: {
    /* 配置选项 */
  },
});
```

### 6.2 加载数据

```typescript
// 方法 1: 从 URL 下载
const data = await plugin.builders.data.download(
  { url: "https://files.rcsb.org/download/1grm.pdb", isBinary: false },
  { state: { isGhost: true } },
);

// 方法 2: 从本地文件
const data = await plugin.builders.data.readFile(
  { file: File, isBinary: false },
  { state: { isGhost: true } },
);

// 方法 3: 从字符串
const data = await plugin.builders.data.rawData(
  { data: pdbString, label: "structure" },
  { state: { isGhost: true } },
);
```

### 6.3 解析轨迹

```typescript
const trajectory = await plugin.builders.structure.parseTrajectory(
  data,
  "pdb", // 或 'mmcif', 'gro', 'mol2' 等
);
```

### 6.4 应用渲染预设

```typescript
await plugin.builders.structure.hierarchy.applyPreset(
  trajectory,
  "default", // 预设名称
  {
    structure: {
      name: "model", // 或 'assembly'
      params: { id: "1" }, // assembly ID（可选）
    },
    showUnitcell: false,
    representationPreset: "auto", // 或 'cartoon', 'ball-and-stick' 等
  },
);
```

### 6.5 常用预设类型

**结构预设** (`representationPreset`):

- `'auto'`: 自动选择（推荐）
- `'empty'`: 空
- `'cartoon'`: 卡通模式（蛋白质二级结构）
- `'ball-and-stick'`: 球棍模型
- `'spacefill'`: 空间填充
- `'molecular-surface'`: 分子表面
- `'gaussian-surface'`: 高斯表面

### 6.6 清除视图

```typescript
await plugin.clear();
```

### 6.7 销毁插件

```typescript
plugin.dispose();
```

---

## 7. 常见操作

### 7.1 设置背景颜色

```typescript
import { PluginCommands } from "molstar/lib/mol-plugin/commands";
import { Color } from "molstar/lib/mol-util/color";

PluginCommands.Canvas3D.SetSettings(plugin, {
  settings: (props) => {
    props.renderer.backgroundColor = Color(0xffffff); // 白色
  },
});
```

### 7.2 相机控制

```typescript
// 重置相机
PluginCommands.Camera.Reset(plugin, {});

// 自动旋转
PluginCommands.Canvas3D.SetSettings(plugin, {
  settings: {
    trackball: {
      animate: { name: "spin", params: { speed: 1 } },
    },
  },
});

// 停止旋转
PluginCommands.Canvas3D.SetSettings(plugin, {
  settings: {
    trackball: {
      animate: { name: "off", params: {} },
    },
  },
});
```

### 7.3 选择和高亮

```typescript
import { Script } from "molstar/lib/mol-script/script";
import { StructureSelection } from "molstar/lib/mol-model/structure";
import { EmptyLoci } from "molstar/lib/mol-model/loci";

// 高亮特定残基
const data =
  plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data;
if (data) {
  const selection = Script.getStructureSelection(
    (Q) =>
      Q.struct.generator.atomGroups({
        "residue-test": Q.core.rel.eq([
          Q.struct.atomProperty.macromolecular.label_seq_id(),
          7, // 残基序号
        ]),
        "group-by": Q.struct.atomProperty.macromolecular.residueKey(),
      }),
    data,
  );

  const loci = StructureSelection.toLociWithSourceUnits(selection);
  plugin.managers.interactivity.lociHighlights.highlightOnly({ loci });
}

// 清除高亮
plugin.managers.interactivity.lociHighlights.highlightOnly({
  loci: EmptyLoci,
});
```

### 7.4 改变颜色主题

```typescript
// 应用默认主题
await plugin.dataTransaction(async () => {
  for (const s of plugin.managers.structure.hierarchy.current.structures) {
    await plugin.managers.structure.component.updateRepresentationsTheme(
      s.components,
      { color: "default" },
    );
  }
});

// 其他可用主题: 'atom-id', 'chain-id', 'element-symbol', 'residue-name' 等
```

### 7.5 截图

```typescript
import { PluginCommands } from "molstar/lib/mol-plugin/commands";

// 创建截图
const imageData = await PluginCommands.Canvas3D.GetImageData(plugin, {
  width: 1920,
  height: 1080,
});

// 下载截图
const link = document.createElement("a");
link.download = "screenshot.png";
link.href = imageData.data;
link.click();
```

### 7.6 加载本地 PDB 文件

```typescript
function handleFileUpload(file: File, plugin: PluginUIContext) {
  const reader = new FileReader();

  reader.onload = async (e) => {
    const content = e.target?.result as string;

    // 清除之前的结构
    await plugin.clear();

    // 从字符串加载
    const data = await plugin.builders.data.rawData({
      data: content,
      label: file.name
    }, { state: { isGhost: true } });

    const trajectory = await plugin.builders.structure.parseTrajectory(data, 'pdb');
    await plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default');
  };

  reader.readAsText(file);
}

// 在 React 组件中使用
<input
  type="file"
  accept=".pdb,.cif,.mmcif"
  onChange={(e) => {
    const file = e.target.files?.[0];
    if (file && pluginRef.current) {
      handleFileUpload(file, pluginRef.current);
    }
  }}
/>
```

### 7.7 动画控制

```typescript
import { AnimateModelIndex } from "molstar/lib/mol-plugin-state/animation/built-in/model-index";

// 播放动画
plugin.managers.animation.play(AnimateModelIndex, {
  duration: {
    name: "computed",
    params: { targetFps: 30 },
  },
  mode: {
    name: "loop", // 或 'once', 'palindrome'
    params: { direction: "forward" },
  },
});

// 停止动画
plugin.managers.animation.stop();
```

---

## 8. 最佳实践

### 8.1 性能优化

1. **使用 `isGhost: true`**

   ```typescript
   const data = await plugin.builders.data.download(
     { url },
     { state: { isGhost: true } }, // 避免不必要的状态更新
   );
   ```

2. **延迟加载大型结构**

   ```typescript
   // 使用 Web Worker 或异步加载
   import { Task } from "molstar/lib/mol-task";
   ```

3. **限制渲染质量**
   ```typescript
   spec: {
     ...DefaultPluginUISpec(),
     config: [
       [PluginConfig.VolumeStreaming.Enabled, false]
     ]
   }
   ```

### 8.2 错误处理

```typescript
try {
  const data = await plugin.builders.data.download({ url });
  const trajectory = await plugin.builders.structure.parseTrajectory(
    data,
    format,
  );
  await plugin.builders.structure.hierarchy.applyPreset(trajectory, "default");
} catch (error) {
  console.error("Failed to load structure:", error);
  // 显示友好的错误提示
  if (error.message.includes("404")) {
    showError("Structure not found");
  } else if (error.message.includes("parse")) {
    showError("Invalid file format");
  } else {
    showError("Failed to load structure");
  }
}
```

### 8.3 React 严格模式

在 Next.js 中，React 严格模式会导致 useEffect 执行两次。解决方案：

```typescript
useEffect(() => {
  let isMounted = true;
  let plugin: PluginUIContext | null = null;

  async function init() {
    if (!isMounted) return;

    plugin = await createPluginUI({
      /* ... */
    });

    if (!isMounted && plugin) {
      plugin.dispose();
      return;
    }

    // 继续初始化...
  }

  init();

  return () => {
    isMounted = false;
    plugin?.dispose();
  };
}, []);
```

### 8.4 内存管理

```typescript
// 组件卸载时务必清理
useEffect(() => {
  return () => {
    if (pluginRef.current) {
      pluginRef.current.dispose();
      pluginRef.current = null;
    }
  };
}, []);
```

### 8.5 响应式设计

```typescript
<div
  ref={parentRef}
  style={{
    width: '100%',
    height: '100%',
    minHeight: '400px'  // 设置最小高度
  }}
/>
```

---

## 9. 故障排查

### 9.1 常见问题

#### 问题 1: "Cannot find module 'molstar/lib/...'"

**解决方案**：

```bash
# 确保正确安装
npm install molstar

# 清除缓存
rm -rf node_modules .next
npm install
```

#### 问题 2: SCSS 导入错误

**解决方案**：

```bash
npm install sass
```

或使用 CSS 代替：

```typescript
import "molstar/lib/mol-plugin-ui/skin/light.css"; // 如果提供了 CSS 版本
```

#### 问题 3: WebGL 上下文丢失

**解决方案**：

```typescript
plugin.canvas3d?.webgl?.handleContextLost();
```

#### 问题 4: 组件渲染两次（React 严格模式）

**解决方案**：参考 [8.3 React 严格模式](#83-react-严格模式)

#### 问题 5: 结构加载失败

**检查清单**：

- [ ] URL 是否正确
- [ ] 文件格式是否匹配
- [ ] CORS 设置是否正确
- [ ] 网络连接是否正常

### 9.2 调试技巧

1. **启用调试模式**

   ```typescript
   // 在浏览器控制台
   setMolStarDebugMode(true, true);
   ```

2. **查看状态树**

   ```typescript
   console.log(plugin.state.data);
   ```

3. **监听事件**
   ```typescript
   plugin.state.events.object.updated.subscribe((e) => {
     console.log("State updated:", e);
   });
   ```

---

## 附录

### A. 相关资源

- [Molstar GitHub](https://github.com/molstar/molstar)
- [Molstar 文档](https://molstar.org/docs/)
- [PDB 数据库](https://www.rcsb.org/)
- [mmCIF 格式说明](https://mmcif.wwpdb.org/)

### B. 示例项目

可以参考本项目中的：

- `molstar/src/examples/basic-wrapper/` - 基础封装示例
- `molstar/src/apps/viewer/` - 完整查看器应用

### C. 主题定制

可用的内置主题：

- `light.scss` - 浅色主题
- `dark.scss` - 深色主题
- `blue.scss` - 蓝色主题

引入方式：

```typescript
import "molstar/lib/mol-plugin-ui/skin/dark.scss";
```

---

**文档版本**: 1.0
**最后更新**: 2024-12
**适用 Molstar 版本**: 5.5.0+
