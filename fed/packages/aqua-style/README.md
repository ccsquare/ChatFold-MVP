# @simplex/aqua-style

A framework-agnostic, type-safe styling library for building component variants with multi-slot support. Inspired by `tailwind-variants`.

## Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                               aqua-style                              │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   ┌──────────┐     ┌────────────┐    ┌────────────┐     ┌─────────┐   │
│   │ createId │     │createTokens│    │createStyles│     │ cx / sx │   │
│   └──────────┘     └────────────┘    └────────────┘     └─────────┘   │
│        │                 │                 │                 │        │
│        ▼                 ▼                 ▼                 ▼        │
│    Unique ID       CSS Variables      Variant-based        Merge      │
│  (no conflict)       & Theming        Style System       Utilities    │
│                                                                       │
├───────────────────────────────────────────────────────────────────────┤
│                            create() Factory                           │
│               (Optional: customize all implementations)               │
└───────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Setup

```typescript
// lib/aqua.config.ts
import { twMerge } from "tailwind-merge";

import { create } from "@simplex/aqua-style";

export const { createId, createTokens, createStyles } = create({
  mergeClasses: twMerge,
});
```

### Theme Tokens

```typescript
// components/simplex/theme/tokens.ts
import type { InferTokensConfig } from "@simplex/aqua-style";

import { createTokens } from "@/lib/aqua.config";

export const ThemeTokens = createTokens<{
  background?: string;
  foreground?: string;
  primary?: string;
  "primary-foreground"?: string;
  secondary?: string;
  "secondary-foreground"?: string;
  muted?: string;
  "muted-foreground"?: string;
  accent?: string;
  "accent-foreground"?: string;
  destructive?: string;
  "destructive-foreground"?: string;
  border?: string;
  input?: string;
  ring?: string;
  radius?: string;
}>({});

export type ThemeTokensConfig = InferTokensConfig<typeof ThemeTokens>;
```

### Component Styles

```typescript
// components/simplex/button/button.styles.ts
import type { InferComponentStylesConfig } from "@simplex/aqua-style";
import { cx } from "@simplex/aqua-style";

import { createStyles } from "@/lib/aqua.config";

// use cx() for IDE Tailwind CSS IntelliSense
export const ButtonStyles = createStyles({
  classes: {
    root: cx(
      // display
      "inline-flex items-center justify-center gap-2",
      // size
      "whitespace-nowrap rounded-md",
      // font
      "text-sm font-medium",
      // transition
      "transition-colors",
      // focus
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      // [&_svg]
      "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    ),
  },
  variants: {
    disabled: {
      true: { root: cx("pointer-events-none opacity-50") },
    },
    variant: {
      default: {
        root: cx("shadow", "bg-primary text-primary-foreground", "hover:bg-primary/90"),
      },
      destructive: {
        root: cx(
          "shadow-sm",
          "bg-destructive text-destructive-foreground",
          "hover:bg-destructive/90",
        ),
      },
      outline: {
        root: cx(
          "border border-input shadow-sm",
          "bg-background",
          "hover:bg-accent hover:text-accent-foreground",
        ),
      },
      secondary: {
        root: cx("shadow-sm", "bg-secondary text-secondary-foreground", "hover:bg-secondary/80"),
      },
      ghost: {
        root: cx("hover:bg-accent hover:text-accent-foreground"),
      },
      link: {
        root: cx("text-primary underline-offset-4", "hover:underline"),
      },
    },
    size: {
      default: { root: cx("h-9 px-4 py-2") },
      xs: { root: cx("h-7 rounded-md px-2 text-xs") },
      sm: { root: cx("h-8 rounded-md px-3 text-xs") },
      lg: { root: cx("h-10 rounded-md px-8") },
      icon: { root: cx("h-9 w-9") },
      "icon-xs": { root: cx("h-7 w-7") },
      "icon-sm": { root: cx("h-8 w-8") },
      "icon-lg": { root: cx("h-10 w-10") },
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

export type ButtonStylesConfig = InferComponentStylesConfig<typeof ButtonStyles>;
```

### Component

```tsx
// components/simplex/button/button.tsx
import type { ButtonStylesConfig } from "./button.styles";
import { ButtonStyles } from "./button.styles";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, ButtonStylesConfig {}

export function Button(props: ButtonProps) {
  const { style, className, children, disabled, classes, variant, size, ...otherProps } = props;

  const $classes = ButtonStyles({ classes, variants: { disabled, variant, size } }, className);

  return (
    <button {...otherProps} style={style} className={$classes.root} disabled={disabled}>
      {children}
    </button>
  );
}
```

```typescript
// components/simplex/button/index.ts
export * from "./button";
export * from "./button.styles";
```

### Multi-Slot Component

```typescript
// components/simplex/input/input.styles.ts
import type { InferComponentStylesConfig } from "@simplex/aqua-style";
import { cx } from "@simplex/aqua-style";

import { createStyles } from "@/lib/aqua.config";

export const InputStyles = createStyles({
  classes: {
    root: cx("flex flex-col gap-1.5"),
    label: cx("text-sm font-medium leading-none"),
    input: cx(
      "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1",
      "text-sm shadow-sm transition-colors",
      "placeholder:text-muted-foreground",
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      "disabled:cursor-not-allowed disabled:opacity-50",
    ),
    description: cx("text-sm text-muted-foreground"),
  },
  variants: {
    error: {
      true: {
        label: cx("text-destructive"),
        input: cx("border-destructive focus-visible:ring-destructive"),
        description: cx("text-destructive"),
      },
    },
    size: {
      sm: {
        label: cx("text-xs"),
        input: cx("h-8 text-xs"),
        description: cx("text-xs"),
      },
      lg: {
        label: cx("text-base"),
        input: cx("h-11 text-base"),
        description: cx("text-base"),
      },
    },
  },
  compoundVariants: [
    {
      variants: { error: true, size: "lg" },
      classes: { input: cx("border-2") },
    },
  ],
  defaultVariants: {
    error: false,
  },
});

export type InputStylesConfig = InferComponentStylesConfig<typeof InputStyles>;
```

```tsx
// components/simplex/input/input.tsx
import type { InputStylesConfig } from "./input.styles";
import { InputStyles } from "./input.styles";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    InputStylesConfig {
  label?: React.ReactNode;
  description?: React.ReactNode;
}

export function Input(props: InputProps) {
  const { style, className, disabled, label, description, classes, error, size, ...otherProps } = props;

  const $classes = InputStyles({ classes, variants: { error, size } }, className);

  return (
    <div style={style} className={$classes.root}>
      {label && <label className={$classes.label}>{label}</label>}
      <input {...otherProps} className={$classes.input} disabled={disabled} />
      {description && <p className={$classes.description}>{description}</p>}
    </div>
  );
}

// Usage
<Input label="Email" placeholder="Enter email" />
<Input label="Email" error description="Invalid email" />
<Input label="Email" size="lg" error description="Large error input" />
```

### Custom Theme

```tsx
import { sx } from "@simplex/aqua-style";

import type { ThemeTokensConfig } from "@/components/simplex/theme/tokens";
import { ThemeTokens } from "@/components/simplex/theme/tokens";
import { Button } from "@/components/simplex/button";

export interface ThemedExampleProps extends React.HTMLAttributes<HTMLDivElement> {
  theme?: ThemeTokensConfig;
}

export function ThemedExample(props: ThemedExampleProps) {
  const { style, theme, ...otherProps } = props;

  return (
    <div {...otherProps} style={sx(theme && ThemeTokens(theme), style)}>
      <Button>Custom Primary Button</Button>
      <Button variant="destructive">Destructive Button</Button>
    </div>
  );
}

// Usage
<ThemedExample
  theme={{
    primary: "hsl(220 90% 56%)",
    "primary-foreground": "hsl(0 0% 100%)",
  }}
/>;
```

## API

### `create(options?: CreateOptions)`

Factory function to create customized instances of all utilities.

| Option               | Description                                         |
| -------------------- | --------------------------------------------------- |
| `createIdValue`      | Custom function to generate ID string               |
| `createVariableName` | Custom function to generate CSS variable name       |
| `mergeClasses`       | Custom function to merge class names (e.g. twMerge) |

```typescript
const { createId, createTokens, createStyles } = create({
  mergeClasses: twMerge,
});
```

### `createId(options?: CreateIdOptions)`

Generate unique IDs to avoid global conflicts.

| Option          | Description                                 |
| --------------- | ------------------------------------------- |
| `prefix`        | Prefix for the generated ID (default: "id") |
| `createIdValue` | Custom function to generate ID string       |

```typescript
const id = createId(); // "id-0-a1b2"
const id = createId({ prefix: "btn" }); // "btn-1-c3d4"
```

### `createTokens(tokens, options?)`

Create type-safe CSS variable tokens.

| Tokens  | Description                                            |
| ------- | ------------------------------------------------------ |
| `key`   | Token name, becomes CSS variable name (e.g. "primary") |
| `value` | Token value, the CSS variable value (e.g. "hsl(...)")  |

| Option               | Description                                                          |
| -------------------- | -------------------------------------------------------------------- |
| `prefix`             | Prefix for CSS variable names (e.g. "simplex" → "--simplex-primary") |
| `createVariableName` | Custom function to generate CSS variable name                        |

| Property/Method         | Description                                     |
| ----------------------- | ----------------------------------------------- |
| `Tokens(config)`        | Create style object with custom values          |
| `Tokens.definition`     | Original tokens definition object               |
| `Tokens.style`          | Generated CSS variable style object             |
| `Tokens.value(key)`     | Get token value by key                          |
| `Tokens.property(key)`  | Get CSS property name (e.g. "--primary")        |
| `Tokens.variable(key)`  | Get CSS var() reference (e.g. "var(--primary)") |
| `Tokens.extend(config)` | Create new tokens with extended values          |

```typescript
const Tokens = createTokens<{
  primary?: string;
  "primary-foreground"?: string;
}>({});

const style = Tokens({ primary: "hsl(220 90% 56%)" });
// => { "--primary": "hsl(220 90% 56%)" }

Tokens.definition; // {}
Tokens.style; // {}

Tokens.property("primary"); // "--primary"
Tokens.variable("primary"); // "var(--primary)"
Tokens.variable("primary", "#000"); // "var(--primary, #000)"

const ExtendedTokens = Tokens.extend({ primary: "hsl(220 90% 56%)" });
ExtendedTokens.style; // { "--primary": "hsl(220 90% 56%)" }
```

### `createStyles(styles, options?)`

Create variant-based styles with multi-slot support.

| Styles             | Description                                   |
| ------------------ | --------------------------------------------- |
| `classes`          | Base classes for each slot (e.g. root, label) |
| `variants`         | Variant definitions with classes per slot     |
| `compoundVariants` | Classes applied when multiple variants match  |
| `defaultVariants`  | Default variant values                        |

| Option         | Description                                         |
| -------------- | --------------------------------------------------- |
| `mergeClasses` | Custom function to merge class names (e.g. twMerge) |

| Property/Method               | Description                             |
| ----------------------------- | --------------------------------------- |
| `Styles(config?, overrides?)` | Get classes with variants and overrides |
| `Styles.definition`           | Original styles definition object       |
| `Styles.classes`              | Computed classes with default variants  |

| Config     | Description                                  |
| ---------- | -------------------------------------------- |
| `classes`  | Custom classes to merge (object or function) |
| `variants` | Variant values to apply                      |

```typescript
const Styles = createStyles({
  classes: { root: "base-class", label: "label-class" },
  variants: {
    size: {
      sm: { root: "text-sm", label: "text-xs" },
      lg: { root: "text-lg", label: "text-base" },
    },
  },
  defaultVariants: { size: "sm" },
});

Styles.definition; // { classes: {...}, variants: {...}, defaultVariants: {...} }
Styles.classes; // { root: "base-class text-sm", label: "label-class text-xs" }

// With variants
Styles({ variants: { size: "lg" } });
// => { root: "base-class text-lg", label: "label-class text-base" }

// With class overrides
Styles({ classes: { root: "custom-class" } });
// => { root: "base-class text-sm custom-class", label: "label-class text-xs" }

// With classes as function (access variants)
Styles({
  variants: { size: "lg" },
  classes: (variants) => ({
    root: cx(variants.size === "lg" ? "px-8" : "px-4"),
  }),
});
// => { root: "base-class text-lg px-8", label: "label-class text-base" }

// With className override (applies to root)
Styles({}, "extra-class");
// => { root: "base-class text-sm extra-class", label: "label-class text-xs" }
```

### `cx(...classes)`

Merge class names. Supports IDE Tailwind CSS IntelliSense.

```typescript
cx("flex", "items-center"); // "flex items-center"
cx("flex", undefined, "gap-2"); // "flex gap-2"
```

### `sx(...styles)`

Merge style objects.

```typescript
sx({ color: "red" }, { background: "blue" });
// => { color: "red", background: "blue" }
```

### Type Utilities

```typescript
// Infer style config for component props
type ButtonStylesConfig = InferComponentStylesConfig<typeof ButtonStyles>;
// => { classes?: Partial<{ root: string }>, variant?: "default" | "destructive" | ..., size?: "default" | "sm" | ... }

// Use in component props to expose style customization
interface ButtonProps extends ButtonStylesConfig {
  children?: React.ReactNode;
}

// Infer tokens config for theme override props
type ThemeTokensConfig = InferTokensConfig<typeof ThemeTokens>;
// => { background?: string, primary?: string, "primary-foreground"?: string, ... }

// Use in component props to allow theme customization
interface ThemeProviderProps {
  theme?: ThemeTokensConfig;
  children?: React.ReactNode;
}
```

## Conventions

### File Structure

Follow a 3-file pattern per component:

```
components/simplex/
  button/
    button.styles.ts      # styles and variants
    button.tsx            # component
    index.ts              # barrel export
```

Optional files: `*.tokens.ts` for design tokens, sub-component helpers.

### Exports

Export only what consumers need:

```typescript
// ✅
export * from "./button";
export * from "./button.styles";

// ❌ internal sub-component leaked
export * from "./button-icon";
```

---

### Styles

#### Root Class

Define a `root` class in every style. Route components are exempt:

```typescript
createStyles({ classes: { root: cx("inline-flex") } }); // ✅
createStyles({ classes: { root: "" } }); // ✅ empty
createStyles({ classes: { container: cx("flex") } }); // ❌ no root
```

#### Slots

Give every visible part a slot in `classes`:

```typescript
export const CardStyles = createStyles({
  classes: {
    root: cx("rounded-lg border shadow-sm"),
    header: cx("p-4 border-b"),
    body: cx("p-4"),
    footer: cx("p-4 border-t flex justify-end gap-2"),
  },
});
```

Apply `$classes` in JSX — never hardcode class names:

```tsx
// ✅
<div className={$classes.root}>
  <div className={$classes.header}>...</div>
</div>

// ❌
<div className="rounded-lg border">
  <div className="p-4 border-b">...</div>
</div>
```

#### Variants

Provide `defaultVariants` for every variant key:

```typescript
createStyles({
  classes: { root: cx("inline-flex") },
  variants: {
    size: {
      sm: { root: cx("h-8 text-sm") },
      lg: { root: cx("h-10 text-lg") },
    },
  },
  defaultVariants: { size: "sm" }, // ← required
});
```

Use string `"true"` / `"false"` keys for boolean variants:

```typescript
variants: {
  disabled: {
    true: { root: cx("pointer-events-none opacity-50") },
    false: { root: cx("cursor-pointer") },
  },
}
```

#### Class Overrides

Override styles via the `classes` prop:

```tsx
// static
<Button classes={{ root: "w-full" }} />

// variant-dependent
<Button
  size="lg"
  classes={(variants) => ({
    root: cx(variants.size === "lg" ? "px-8" : "px-4"),
  })}
/>
```

#### Class Grouping

Group Tailwind classes by category:

```typescript
root: cx(
  // layout
  "flex items-center gap-2",
  // box
  "h-9 px-4 py-2",
  // typography
  "text-sm font-medium",
  // surface
  "bg-primary rounded-md shadow-sm",
  // motion
  "transition-colors",
  // state
  "hover:bg-primary/90 disabled:pointer-events-none",
  // responsive
  "sm:h-10 lg:px-6",
),
```

Split a category when it has 3+ classes:

```typescript
// state: hover
"hover:bg-primary/90",
// state: focus
"focus-visible:outline-none focus-visible:ring-1",
// state: disabled
"disabled:pointer-events-none disabled:opacity-50",
```

---

### Component

#### Import

Use namespace import for React:

```typescript
import * as React from "react"; // ✅

import React from "react"; // ❌
import { useState } from "react"; // ❌
```

#### Definition

Add `"use client"` only when using hooks, event handlers, context, or browser APIs:

**`button.styles.ts`**

```typescript
import type { InferComponentStylesConfig } from "@simplex/aqua-style";
import { cx } from "@simplex/aqua-style";

import { createStyles } from "@/lib/aqua.config";

export const ButtonStyles = createStyles({
  classes: { root: cx("inline-flex items-center") },
  variants: {
    size: {
      sm: { root: cx("h-8 text-sm") },
      lg: { root: cx("h-10 text-lg") },
    },
  },
  defaultVariants: { size: "sm" },
});

export type ButtonStylesConfig = InferComponentStylesConfig<typeof ButtonStyles>;
```

**`button.tsx`**

```tsx
import type { ButtonStylesConfig } from "./button.styles";
import { ButtonStyles } from "./button.styles";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, ButtonStylesConfig {}

export function Button(props: ButtonProps) {
  const { style, className, children, classes, size, ...otherProps } = props;
  const $classes = ButtonStyles({ classes, variants: { size } }, className);

  return (
    <button {...otherProps} style={style} className={$classes.root}>
      {children}
    </button>
  );
}
```

**`index.ts`**

```typescript
export * from "./button";
export * from "./button.styles";
```

#### Props

Accept `style` and `className` on every component root element:

**Native root** — extend HTML attributes, spread `...otherProps`:

```tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, ButtonStylesConfig {}
```

**Composite root** — pick semantically relevant props from the wrapped component:

```tsx
interface ThemeToggleProps
  extends Pick<DropdownMenuProps, "open" | "onOpenChange">, ThemeToggleStylesConfig {
  style?: React.CSSProperties;
  className?: string;
}
```

**Ordering:**

- `extends` — `HTMLAttributes` or `Pick<...>` → `StylesConfig`
- Destructuring — `HTMLAttributes` or `Pick<...>` → `StylesConfig` → `...otherProps`
- JSX — `{...otherProps}` → `key`/`ref` → `HTMLAttributes` or `Pick<...>` → `StylesConfig`

**Function props** — use method shorthand:

```typescript
onError?(error: unknown): void;  // ✅
onError?: (error: unknown) => void; // ❌
```

#### Body Order

Follow this order inside a component function:

1. **Props** — destructuring
2. **Static / derived** — `$classes`, constants
3. **Custom hooks** — `useTheme`, `useRouter`
4. **React hooks** — `useState`, `useRef`, `useMemo`
5. **Effects** — `useEffect`, `useLayoutEffect`

```tsx
function Example(props: ExampleProps) {
  // 1. props
  const { style, className, classes, variant, ...otherProps } = props;

  // 2. static / derived
  const $classes = ExampleStyles({ classes, variants: { variant } }, className);

  // 3. custom hooks
  const { theme } = useTheme();

  // 4. react hooks
  const [open, setOpen] = React.useState(false);

  // 5. effects
  React.useEffect(() => {
    // ...
  }, []);

  return <div {...otherProps} style={style} className={$classes.root} />;
}
```

#### Stateful Component

Support uncontrolled and controlled modes via `useControllableState`:

```tsx
interface ToggleProps extends ToggleStylesConfig {
  style?: React.CSSProperties;
  className?: string;
  pressed?: boolean;
  onPressedChange?(pressed: boolean): void;
}

function Toggle(props: ToggleProps) {
  const { style, className, classes, pressed, onPressedChange, ...otherProps } = props;
  const $classes = ToggleStyles({ classes }, className);

  const [$pressed, $setPressed] = useControllableState({
    value: pressed,
    onChange: onPressedChange,
  });

  return (
    <button {...otherProps} style={style} className={$classes.root} aria-pressed={$pressed} onClick={() => $setPressed(!$pressed)}>
      ...
    </button>
  );
}

// uncontrolled
<Toggle />

// controlled
<Toggle pressed={isOn} onPressedChange={setIsOn} />
```

Name the prop pair after what it represents: `open`/`onOpenChange`, `value`/`onValueChange`, `pressed`/`onPressedChange`.

For multi-part components, use a `Root` to hold state and share via context:

```tsx
// accordion-root.tsx
function AccordionRoot(props: AccordionRootProps) {
  const { children, value, onValueChange, ...otherProps } = props;

  const [$value, $setValue] = useControllableState({
    value,
    onChange: onValueChange,
  });

  return (
    <AccordionContext value={$value} onValueChange={$setValue}>
      <div {...otherProps}>{children}</div>
    </AccordionContext>
  );
}

// accordion-item.tsx
function AccordionItem(props: AccordionItemProps) {
  const { $value, setValue } = useAccordionContext();
  // ...
}

// index.ts
export * from "./accordion-root";
export * from "./accordion-item";
export * from "./accordion-trigger";
export * from "./accordion-content";

// usage
<AccordionRoot value={active} onValueChange={setActive}>
  <AccordionItem>
    <AccordionTrigger>...</AccordionTrigger>
    <AccordionContent>...</AccordionContent>
  </AccordionItem>
</AccordionRoot>;
```

#### Hooks

Extract business logic into custom hooks. Keep only UI state in the component:

```tsx
// ✅ business logic in hook, UI state in component
function ChatPanel(props: ChatPanelProps) {
  const { messages, send, isLoading } = useChat(props.conversationId);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  return (
    <div className={$classes.root}>
      <Sidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />
      <MessageList messages={messages} />
      <MessageInput onSend={send} disabled={isLoading} />
    </div>
  );
}

// ❌ fetch, state, callbacks all in component
function ChatPanel(props: ChatPanelProps) {
  const [messages, setMessages] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(false);

  const send = React.useCallback(async (text: string) => {
    setIsLoading(true);
    const res = await fetch("/api/messages", { ... });
    setMessages((prev) => [...prev, await res.json()]);
    setIsLoading(false);
  }, []);

  // ...
}
```
