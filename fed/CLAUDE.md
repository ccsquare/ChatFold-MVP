# CLAUDE.md - Fed Project Rules

## Tech Stack

- **Framework**: Next.js 16 / React 19 / TypeScript 5.9
- **Styling**: Tailwind CSS 4 / tailwind-merge / @simplex/aqua-style
- **UI**: Radix UI / Base UI / shadcn / Lucide icons
- **Theme**: next-themes
- **Monorepo**: pnpm workspaces / Turborepo
- **Lint / Format**: oxlint / oxfmt

## Component Rules

Follow the conventions defined in [`packages/aqua-style/README.md`](./packages/aqua-style/README.md):

- **File Structure** — 3-file pattern (`*.styles.ts`, `*.tsx`, `index.ts`)
- **Exports** — only expose what consumers need
- **Styles** — Root Class, Slots, Variants, Class Overrides, Class Grouping
- **Component** — Import, Definition, Props, Body Order, Stateful Component, Hooks

## Before Commit

**Always run from the `fed/` directory** — not the project root:

```bash
cd fed
pnpm format
pnpm lint
```
