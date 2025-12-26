# Molstar 快速参考

## 快速开始

### 1. 最简单的使用（CDN）

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/molstar@latest/build/viewer/molstar.css" />
<script src="https://cdn.jsdelivr.net/npm/molstar@latest/build/viewer/molstar.js"></script>

<div id="app" style="width: 800px; height: 600px;"></div>

<script>
  molstar.Viewer.create('app').then(viewer => {
    viewer.loadPdb('1grm');
  });
</script>
```

### 2. Next.js 组件（推荐）

```typescript
'use client';
import { useEffect, useRef } from 'react';
import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18';
import 'molstar/lib/mol-plugin-ui/skin/light.scss';

export function MolstarViewer({ pdbId }: { pdbId: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let plugin: any;

    async function init() {
      if (!ref.current) return;

      plugin = await createPluginUI({ target: ref.current, render: renderReact18 });

      const data = await plugin.builders.data.download({
        url: `https://files.rcsb.org/download/${pdbId}.pdb`
      }, { state: { isGhost: true } });

      const trajectory = await plugin.builders.structure.parseTrajectory(data, 'pdb');
      await plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default');
    }

    init();
    return () => plugin?.dispose();
  }, [pdbId]);

  return <div ref={ref} style={{ width: '100%', height: '100%' }} />;
}
```

---

## 常用 API 速查

### 加载数据

```typescript
// 从 URL 加载
const data = await plugin.builders.data.download(
  { url: 'https://files.rcsb.org/download/1grm.pdb', isBinary: false },
  { state: { isGhost: true } }
);

// 从文件加载
const data = await plugin.builders.data.readFile(
  { file: File, isBinary: false },
  { state: { isGhost: true } }
);

// 从字符串加载
const data = await plugin.builders.data.rawData(
  { data: pdbString, label: 'structure' },
  { state: { isGhost: true } }
);
```

### 解析和渲染

```typescript
// 解析轨迹
const trajectory = await plugin.builders.structure.parseTrajectory(data, 'pdb');

// 应用预设
await plugin.builders.structure.hierarchy.applyPreset(
  trajectory,
  'default',
  { representationPreset: 'auto' }  // 'cartoon', 'ball-and-stick', 'spacefill'
);
```

### 清除和销毁

```typescript
await plugin.clear();     // 清除当前结构
plugin.dispose();         // 销毁插件实例
```

---

## 常用操作

### 设置背景颜色

```typescript
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { Color } from 'molstar/lib/mol-util/color';

PluginCommands.Canvas3D.SetSettings(plugin, {
  settings: props => {
    props.renderer.backgroundColor = Color(0xffffff);  // 白色
  }
});
```

### 相机控制

```typescript
// 重置相机
PluginCommands.Camera.Reset(plugin, {});

// 自动旋转
PluginCommands.Canvas3D.SetSettings(plugin, {
  settings: {
    trackball: {
      animate: { name: 'spin', params: { speed: 1 } }
    }
  }
});

// 停止旋转
PluginCommands.Canvas3D.SetSettings(plugin, {
  settings: {
    trackball: {
      animate: { name: 'off', params: {} }
    }
  }
});
```

### 截图

```typescript
const imageData = await PluginCommands.Canvas3D.GetImageData(plugin, {
  width: 1920,
  height: 1080
});

// 下载
const link = document.createElement('a');
link.download = 'screenshot.png';
link.href = imageData.data;
link.click();
```

---

## 支持的文件格式

| 格式 | 扩展名 | 用途 |
|------|--------|------|
| PDB | `.pdb`, `.ent` | 蛋白质数据库格式 |
| mmCIF | `.cif`, `.mmcif` | 宏分子晶体学信息文件 |
| GRO | `.gro` | GROMACS 格式 |
| MOL2 | `.mol2` | Tripos 分子格式 |
| SDF | `.sdf` | 结构数据文件 |

---

## 常用预设

### 表示预设 (representationPreset)

- `'auto'` - 自动选择（推荐）
- `'empty'` - 空
- `'cartoon'` - 卡通模式（二级结构）
- `'ball-and-stick'` - 球棍模型
- `'spacefill'` - 空间填充
- `'molecular-surface'` - 分子表面

### 颜色主题

- `'default'` - 默认
- `'element-symbol'` - 按元素着色
- `'chain-id'` - 按链着色
- `'residue-name'` - 按残基着色
- `'sequence-id'` - 按序列 ID 着色

---

## 故障排查

### 问题: 组件不显示

**检查**:
- 容器是否有明确的宽高
- 是否正确导入样式文件
- 查看浏览器控制台错误

### 问题: SCSS 导入失败

**解决**: 安装 sass 或使用 CSS 版本

```bash
npm install sass
```

### 问题: React 严格模式导致双重初始化

**解决**: 使用 cleanup 和 mounted 标志

```typescript
useEffect(() => {
  let isMounted = true;
  let plugin: any = null;

  async function init() {
    if (!isMounted) return;
    plugin = await createPluginUI({ /* ... */ });
    if (!isMounted) {
      plugin?.dispose();
      return;
    }
  }

  init();
  return () => {
    isMounted = false;
    plugin?.dispose();
  };
}, []);
```

---

## 相关链接

- [详细使用指南](./molstar-usage-guide.md)
- [Molstar GitHub](https://github.com/molstar/molstar)
- [PDB 数据库](https://www.rcsb.org/)

---

**快速参考版本**: 1.0
