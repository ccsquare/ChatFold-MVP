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

### Setup with tailwind-merge

```typescript
// lib/aqua.config.ts
import { twMerge } from "tailwind-merge";

import { create } from "@simplex/aqua-style";

export const { createId, createTokens, createStyles } = create({
  mergeClasses: twMerge,
});
```

### Define Theme Tokens (Optional)

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

### Define Component Styles

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

### Define Component

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

### Multi-Slot Component Example

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

### Custom Theme Example

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

Each component follows a 3-file pattern:

```
components/
  simplex/                    # @simplex component group
    button/
      button.styles.ts        # styles and variants
      button.tsx              # component
      index.ts                # barrel export
  ui/                         # shadcn/ui components
    ...
```

| Pattern       | Description         |
| ------------- | ------------------- |
| `*.styles.ts` | Styles and variants |
| `*.tsx`       | Component           |
| `*.tokens.ts` | Design tokens       |
| `index.ts`    | Barrel export       |

### Exports

Only export what consumers actually need. Internal sub-components and their styles stay internal:

```typescript
// ✅ correct
export * from "./button";
export * from "./button.styles";

// ❌ wrong — internal sub-component leaked
export * from "./button-icon";
```

---

### Styles

#### Root Class

Every component style **must** define a `root` class, even if empty. Route components (pages, layouts) are exempt:

```typescript
// ✅ correct
export const ButtonStyles = createStyles({
  classes: { root: cx("inline-flex items-center") },
});

// ✅ correct — empty root is fine
export const DividerStyles = createStyles({
  classes: { root: "" },
});

// ❌ wrong — missing root
export const BadStyles = createStyles({
  classes: { container: cx("flex") },
});
```

#### Parts as Slots

Every visible part that consumers might want to customize **must** have a slot in `classes`:

```typescript
export const ThemeToggleStyles = createStyles({
  classes: {
    root: "", // trigger button
    menu: "", // dropdown panel
    option: "", // each menu item
  },
});
```

```tsx
// In component — apply $classes to each part
<DropdownMenuContent className={$classes.menu}>
  {options.map(({ value, label }) => (
    <DropdownMenuItem className={$classes.option}>...</DropdownMenuItem>
  ))}
</DropdownMenuContent>

// ❌ wrong — hardcoded classes, no slot for override
<DropdownMenuContent className="w-48">
  <DropdownMenuItem className="text-lg">...</DropdownMenuItem>
</DropdownMenuContent>
```

#### Variants and Defaults

If a component defines `variants`, it **must** define `defaultVariants` for every variant:

```typescript
export const ButtonStyles = createStyles({
  classes: { root: cx("inline-flex items-center") },
  variants: {
    size: {
      sm: { root: cx("h-8 px-3 text-sm") },
      md: { root: cx("h-9 px-4 text-base") },
      lg: { root: cx("h-10 px-6 text-lg") },
    },
    variant: {
      solid: { root: cx("bg-primary text-white") },
      ghost: { root: cx("bg-transparent") },
    },
  },
  defaultVariants: { size: "md", variant: "solid" }, // ← required for every variant
});
```

Use string `"true"` / `"false"` as keys for boolean variants:

```typescript
variants: {
  disabled: {
    true: { root: cx("pointer-events-none opacity-50") },
    false: { root: cx("cursor-pointer") },
  },
}

// Usage
Styles({ variants: { disabled: true } });
```

#### Classes Override

Consumers override styles via the `classes` prop. Two forms:

**Object** — static overrides:

```tsx
<Button classes={{ root: "w-full" }} />
```

**Function** — overrides that depend on resolved variants:

```tsx
<Button
  size="lg"
  classes={(variants) => ({
    root: cx(variants.size === "lg" ? "px-8" : "px-4"),
  })}
/>
```

The function receives the final variant values (after merging with `defaultVariants`), so you can conditionally apply classes without duplicating variant logic.

#### CSS Class Grouping

Group Tailwind classes by category for readability:

```typescript
root: cx(
  // layout
  "flex items-center justify-center gap-2",
  // box
  "h-9 px-4 py-2",
  // typography
  "text-sm font-medium",
  // surface
  "bg-primary rounded-md border border-input shadow-sm",
  // motion
  "transition-colors",
  // state
  "hover:bg-primary/90 focus-visible:outline-none disabled:pointer-events-none",
  // responsive
  "sm:h-10 md:h-11 lg:px-6",
),
```

Split into sub-groups when a category has 3+ classes:

```typescript
root: cx(
  // ...
  // state: hover
  "hover:bg-primary/90",
  // state: focus
  "focus-visible:outline-none focus-visible:ring-1",
  // state: disabled
  "disabled:pointer-events-none disabled:opacity-50",
),
```

---

### Component

#### React Import

Always use namespace import:

```typescript
// ✅ correct
import * as React from "react";

React.useState();
React.useEffect();
React.CSSProperties;

// ❌ wrong
import React from "react";
import { useState, useEffect } from "react";
```

#### Definition

> Add `"use client";` only when using hooks, event handlers, context, or browser APIs. Pure presentational components don't need it.

**1. `button.styles.ts`**

```typescript
import type { InferComponentStylesConfig } from "@simplex/aqua-style";
import { cx } from "@simplex/aqua-style";

import { createStyles } from "@/lib/aqua.config";

export const ButtonStyles = createStyles({
  classes: { root: cx("...") },
  variants: { ... },
  defaultVariants: { ... },
});

export type ButtonStylesConfig = InferComponentStylesConfig<typeof ButtonStyles>;
```

**2. `button.tsx`**

```tsx
import type { ButtonStylesConfig } from "./button.styles";
import { ButtonStyles } from "./button.styles";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, ButtonStylesConfig {}

export function Button(props: ButtonProps) {
  const { style, className, children, classes, variant, size, ...otherProps } = props;

  const $classes = ButtonStyles({ classes, variants: { variant, size } }, className);

  return (
    <button {...otherProps} style={style} className={$classes.root}>
      {children}
    </button>
  );
}
```

**3. `index.ts`**

```typescript
export * from "./button";
export * from "./button.styles";
```

#### Props

Every component **must** accept `style` and `className` and forward them to the root element.

**Native root** (`<button>`, `<div>`, etc.) — extend HTML attributes, spread `...otherProps`:

```tsx
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, ButtonStylesConfig {}

export function Button(props: ButtonProps) {
  const { style, className, children, classes, variant, size, ...otherProps } = props;
  // ...
  return (
    <button {...otherProps} style={style} className={$classes.root}>
      {children}
    </button>
  );
}
```

**Composite root** (wrapping another component) — declare `style` and `className` explicitly:

```tsx
export interface ThemeToggleProps extends ThemeToggleStylesConfig {
  style?: React.CSSProperties;
  className?: string;
}
```

**Ordering rules:**

- **`extends`**: Native HTML attributes first, then style config — `extends React.*HTMLAttributes<...>, StylesConfig`
- **Destructuring**: Native props first (`style`, `className`, `children`, `disabled`), then custom props (`classes`, `variant`, `size`), ending with `...otherProps`
- **JSX**: React special props (`key`, `ref`) first, then spread, then same order as destructuring — `<li key={id} {...otherProps} style={style} className={$classes.root}>`

#### Body Order

Inside a component function:

1. **Props** — destructuring
2. **Static / derived** — `$classes`, constants from props
3. **Custom hooks** — `useTheme`, `useRouter`, project-specific hooks
4. **React hooks** — `useState`, `useRef`, `useMemo`, `useCallback`
5. **Effects** — `useEffect`, `useLayoutEffect`

```tsx
export function Example(props: ExampleProps) {
  // 1. props
  const { style, className, children, classes, variant, ...otherProps } = props;

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

  return (
    <div {...otherProps} style={style} className={$classes.root}>
      {children}
    </div>
  );
}
```
