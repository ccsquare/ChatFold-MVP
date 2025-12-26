'use client';

/**
 * ButtonShowcase - 按钮设计系统展示组件
 *
 * 这个组件展示了 ChatFold 设计系统中所有按钮类型的样式规范
 * 仅用于开发参考，不会在生产环境中使用
 *
 * 访问路径：/design/buttons（需要在开发环境中添加路由）
 */

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Crown,
  Plus,
  Trash2,
  Download,
  Wrench,
  X,
  Info,
} from 'lucide-react';
import { useState } from 'react';

export function ButtonShowcase() {
  const [isToolActive, setIsToolActive] = useState(false);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen bg-cf-bg p-8">
        <div className="max-w-6xl mx-auto space-y-12">
          {/* Header */}
          <header className="border-b border-cf-border pb-6">
            <h1 className="text-3xl font-bold text-cf-text mb-2">
              ChatFold 按钮设计系统
            </h1>
            <p className="text-cf-text-secondary">
              系统化的按钮样式规范，确保界面一致性和可用性
            </p>
          </header>

          {/* 1. Primary Action Buttons */}
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-cf-text mb-1">
                1. 主要操作按钮 (Primary Action)
              </h2>
              <p className="text-sm text-cf-text-muted">
                用于关键业务动作，如付费升级、提交任务等
              </p>
            </div>
            <div className="bg-cf-bg-secondary rounded-cf-lg p-6 space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                {/* Default */}
                <div className="space-y-2">
                  <Button className="bg-cf-accent hover:bg-cf-accent/90 active:bg-cf-accent/80 text-white">
                    <Crown className="w-4 h-4 mr-2" />
                    Upgrade to Pro
                  </Button>
                  <p className="text-xs text-cf-text-muted">默认状态</p>
                </div>

                {/* Disabled */}
                <div className="space-y-2">
                  <Button
                    disabled
                    className="bg-cf-accent hover:bg-cf-accent/90 text-white"
                  >
                    <Crown className="w-4 h-4 mr-2" />
                    Upgrade to Pro
                  </Button>
                  <p className="text-xs text-cf-text-muted">禁用状态</p>
                </div>

                {/* Pill Shape */}
                <div className="space-y-2">
                  <Button className="bg-cf-accent hover:bg-cf-accent/90 text-white rounded-full h-7 px-3 text-[11px]">
                    <Crown className="w-3 h-3 mr-0.5" />
                    Upgrade
                  </Button>
                  <p className="text-xs text-cf-text-muted">药丸形状（Sidebar）</p>
                </div>
              </div>

              {/* Code */}
              <details className="mt-4">
                <summary className="text-sm text-cf-accent cursor-pointer hover:text-cf-accent/80">
                  查看代码
                </summary>
                <pre className="mt-2 p-4 bg-cf-bg rounded text-xs text-cf-text overflow-x-auto">
{`<Button className="bg-cf-accent hover:bg-cf-accent/90 active:bg-cf-accent/80 text-white">
  <Crown className="w-4 h-4 mr-2" />
  Upgrade to Pro
</Button>`}
                </pre>
              </details>
            </div>
          </section>

          {/* 2. Toolbar Icon Buttons */}
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-cf-text mb-1">
                2. 工具栏图标按钮 (Toolbar Icon Button)
              </h2>
              <p className="text-sm text-cf-text-muted">
                用于常规工具操作，默认低对比度，hover 时高亮
              </p>
            </div>
            <div className="bg-cf-bg-secondary rounded-cf-lg p-6 space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                {/* Small (h-7) */}
                <div className="space-y-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-cf-text-secondary hover:text-cf-text hover:bg-cf-highlight transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        <span className="sr-only">New</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>New conversation</TooltipContent>
                  </Tooltip>
                  <p className="text-xs text-cf-text-muted">小尺寸 (28px)</p>
                </div>

                {/* Medium (h-8) */}
                <div className="space-y-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-cf-text-secondary hover:text-cf-text hover:bg-cf-highlight transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        <span className="sr-only">Download</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Download PDB</TooltipContent>
                  </Tooltip>
                  <p className="text-xs text-cf-text-muted">中尺寸 (32px)</p>
                </div>

                {/* Disabled */}
                <div className="space-y-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        disabled
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-cf-text-secondary hover:text-cf-text hover:bg-cf-highlight transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        <span className="sr-only">Download</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Download (disabled)</TooltipContent>
                  </Tooltip>
                  <p className="text-xs text-cf-text-muted">禁用状态</p>
                </div>
              </div>

              {/* Code */}
              <details className="mt-4">
                <summary className="text-sm text-cf-accent cursor-pointer hover:text-cf-accent/80">
                  查看代码
                </summary>
                <pre className="mt-2 p-4 bg-cf-bg rounded text-xs text-cf-text overflow-x-auto">
{`<Tooltip>
  <TooltipTrigger asChild>
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-cf-text-secondary hover:text-cf-text hover:bg-cf-highlight transition-colors"
    >
      <Plus className="w-4 h-4" />
      <span className="sr-only">New</span>
    </Button>
  </TooltipTrigger>
  <TooltipContent>New conversation</TooltipContent>
</Tooltip>`}
                </pre>
              </details>
            </div>
          </section>

          {/* 3. Active State Icon Buttons */}
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-cf-text mb-1">
                3. 激活状态图标按钮 (Active State)
              </h2>
              <p className="text-sm text-cf-text-muted">
                可切换的工具按钮，激活时显示紫色
              </p>
            </div>
            <div className="bg-cf-bg-secondary rounded-cf-lg p-6 space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                {/* Inactive */}
                <div className="space-y-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-8 w-8 transition-colors ${
                          false
                            ? 'text-cf-accent hover:text-cf-accent hover:bg-cf-accent/10'
                            : 'text-cf-text-secondary hover:text-cf-text hover:bg-cf-highlight'
                        }`}
                        onClick={() => setIsToolActive(!isToolActive)}
                      >
                        <Wrench className="w-4 h-4" />
                        <span className="sr-only">Tools</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Show Structure Tools</TooltipContent>
                  </Tooltip>
                  <p className="text-xs text-cf-text-muted">未激活</p>
                </div>

                {/* Active */}
                <div className="space-y-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-8 w-8 transition-colors ${
                          true
                            ? 'text-cf-accent hover:text-cf-accent hover:bg-cf-accent/10'
                            : 'text-cf-text-secondary hover:text-cf-text hover:bg-cf-highlight'
                        }`}
                        onClick={() => setIsToolActive(!isToolActive)}
                      >
                        <Wrench className="w-4 h-4" />
                        <span className="sr-only">Tools</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Hide Structure Tools</TooltipContent>
                  </Tooltip>
                  <p className="text-xs text-cf-text-muted">已激活（紫色）</p>
                </div>
              </div>

              {/* Code */}
              <details className="mt-4">
                <summary className="text-sm text-cf-accent cursor-pointer hover:text-cf-accent/80">
                  查看代码
                </summary>
                <pre className="mt-2 p-4 bg-cf-bg rounded text-xs text-cf-text overflow-x-auto">
{`<Button
  variant="ghost"
  size="icon"
  className={\`h-8 w-8 transition-colors \${
    isActive
      ? 'text-cf-accent hover:text-cf-accent hover:bg-cf-accent/10'
      : 'text-cf-text-secondary hover:text-cf-text hover:bg-cf-highlight'
  }\`}
>
  <Wrench className="w-4 h-4" />
</Button>`}
                </pre>
              </details>
            </div>
          </section>

          {/* 4. Destructive Buttons */}
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-cf-text mb-1">
                4. 危险操作按钮 (Destructive Action)
              </h2>
              <p className="text-sm text-cf-text-muted">
                用于删除、清空等不可逆操作
              </p>
            </div>
            <div className="bg-cf-bg-secondary rounded-cf-lg p-6 space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                {/* Ghost version */}
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-2 text-[10px] text-cf-error hover:text-cf-error/80 hover:bg-cf-error/20"
                  >
                    Delete
                  </Button>
                  <p className="text-xs text-cf-text-muted">Ghost 版本（对话框）</p>
                </div>

                {/* Solid version */}
                <div className="space-y-2">
                  <Button className="bg-cf-error hover:bg-cf-error/90 text-white">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Confirm Delete
                  </Button>
                  <p className="text-xs text-cf-text-muted">实心版本（最终确认）</p>
                </div>

                {/* Disabled */}
                <div className="space-y-2">
                  <Button
                    disabled
                    className="bg-cf-error hover:bg-cf-error/90 text-white"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Confirm Delete
                  </Button>
                  <p className="text-xs text-cf-text-muted">禁用状态</p>
                </div>
              </div>

              {/* Code */}
              <details className="mt-4">
                <summary className="text-sm text-cf-accent cursor-pointer hover:text-cf-accent/80">
                  查看代码
                </summary>
                <pre className="mt-2 p-4 bg-cf-bg rounded text-xs text-cf-text overflow-x-auto">
{`// Ghost 版本
<Button
  variant="ghost"
  size="sm"
  className="text-cf-error hover:text-cf-error/80 hover:bg-cf-error/20"
>
  Delete
</Button>

// 实心版本
<Button className="bg-cf-error hover:bg-cf-error/90 text-white">
  <Trash2 className="w-4 h-4 mr-2" />
  Confirm Delete
</Button>`}
                </pre>
              </details>
            </div>
          </section>

          {/* 5. Secondary Buttons */}
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-cf-text mb-1">
                5. 辅助/次要按钮 (Secondary/Ghost)
              </h2>
              <p className="text-sm text-cf-text-muted">
                用于取消、关闭等次要操作
              </p>
            </div>
            <div className="bg-cf-bg-secondary rounded-cf-lg p-6 space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                {/* Small */}
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-2 text-[10px] text-cf-text-secondary hover:text-cf-text hover:bg-cf-highlight"
                  >
                    Cancel
                  </Button>
                  <p className="text-xs text-cf-text-muted">小尺寸</p>
                </div>

                {/* Medium */}
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    className="text-cf-text-secondary hover:text-cf-text hover:bg-cf-highlight"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Close
                  </Button>
                  <p className="text-xs text-cf-text-muted">中尺寸</p>
                </div>

                {/* Disabled */}
                <div className="space-y-2">
                  <Button
                    disabled
                    variant="ghost"
                    className="text-cf-text-secondary hover:text-cf-text hover:bg-cf-highlight"
                  >
                    Cancel
                  </Button>
                  <p className="text-xs text-cf-text-muted">禁用状态</p>
                </div>
              </div>

              {/* Code */}
              <details className="mt-4">
                <summary className="text-sm text-cf-accent cursor-pointer hover:text-cf-accent/80">
                  查看代码
                </summary>
                <pre className="mt-2 p-4 bg-cf-bg rounded text-xs text-cf-text overflow-x-auto">
{`<Button
  variant="ghost"
  className="text-cf-text-secondary hover:text-cf-text hover:bg-cf-highlight"
>
  Cancel
</Button>`}
                </pre>
              </details>
            </div>
          </section>

          {/* 6. Link Buttons */}
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-cf-text mb-1">
                6. 文本链接按钮 (Link Button)
              </h2>
              <p className="text-sm text-cf-text-muted">
                用于内联文本链接、次要导航
              </p>
            </div>
            <div className="bg-cf-bg-secondary rounded-cf-lg p-6 space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="space-y-2">
                  <Button
                    variant="link"
                    className="text-cf-accent hover:text-cf-accent/80 text-[12px] p-0 h-auto"
                  >
                    Learn more
                  </Button>
                  <p className="text-xs text-cf-text-muted">默认状态</p>
                </div>

                <div className="space-y-2">
                  <Button
                    variant="link"
                    className="text-cf-accent hover:text-cf-accent/80 p-0 h-auto"
                  >
                    <Info className="w-4 h-4 mr-1" />
                    View documentation
                  </Button>
                  <p className="text-xs text-cf-text-muted">带图标</p>
                </div>

                <div className="space-y-2">
                  <Button
                    disabled
                    variant="link"
                    className="text-cf-accent hover:text-cf-accent/80 p-0 h-auto"
                  >
                    Learn more
                  </Button>
                  <p className="text-xs text-cf-text-muted">禁用状态</p>
                </div>
              </div>

              {/* Code */}
              <details className="mt-4">
                <summary className="text-sm text-cf-accent cursor-pointer hover:text-cf-accent/80">
                  查看代码
                </summary>
                <pre className="mt-2 p-4 bg-cf-bg rounded text-xs text-cf-text overflow-x-auto">
{`<Button
  variant="link"
  className="text-cf-accent hover:text-cf-accent/80 p-0 h-auto"
>
  Learn more
</Button>`}
                </pre>
              </details>
            </div>
          </section>

          {/* Design Principles */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-cf-text">设计原则</h2>
            <div className="bg-cf-bg-secondary rounded-cf-lg p-6 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-cf-accent mt-1.5" />
                <div>
                  <h3 className="font-medium text-cf-text">视觉层级</h3>
                  <p className="text-sm text-cf-text-secondary">
                    紫色背景应该保留给真正重要的操作（如 Upgrade、Submit），避免过度使用
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-cf-accent mt-1.5" />
                <div>
                  <h3 className="font-medium text-cf-text">认知负荷</h3>
                  <p className="text-sm text-cf-text-secondary">
                    工具栏按钮默认低对比度，只在 hover 时高亮，让用户专注于内容
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-cf-accent mt-1.5" />
                <div>
                  <h3 className="font-medium text-cf-text">一致性</h3>
                  <p className="text-sm text-cf-text-secondary">
                    所有按钮都应该添加 transition-colors 过渡效果，确保交互流畅
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-cf-accent mt-1.5" />
                <div>
                  <h3 className="font-medium text-cf-text">无障碍</h3>
                  <p className="text-sm text-cf-text-secondary">
                    图标按钮必须包含 sr-only 标签，工具栏按钮应该配合 Tooltip 使用
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer className="border-t border-cf-border pt-6 text-center text-sm text-cf-text-muted">
            <p>
              详细规范请参考{' '}
              <code className="text-cf-accent">docs/BUTTON_DESIGN_SYSTEM.md</code>
            </p>
          </footer>
        </div>
      </div>
    </TooltipProvider>
  );
}
