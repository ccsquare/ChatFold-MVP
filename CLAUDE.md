# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChatFold is a ChatGPT-style protein folding workbench frontend with:
- Three-column layout: Sidebar (files/chats) | Canvas (3D viewer) | Console (steps/chat/charts)
- SSE streaming for real-time folding progress
- Mol* integration for 3D protein structure visualization
- Mock API backend simulating protein folding pipeline

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start development server (http://localhost:3000)
npm run build        # Production build
npm run lint         # Run ESLint
npm run test         # Run Vitest unit tests
npm run test:ui      # Run Vitest with UI
```

## Architecture

### Three-Column Layout
- **Left Sidebar** (`src/components/Sidebar.tsx`): File uploads (FASTA/PDB), conversation list
- **Center Canvas** (`src/components/Canvas.tsx`, `CanvasTabs.tsx`): Tabbed Mol* 3D structure viewer
- **Right Console** (`src/components/ConsoleDrawer.tsx`): Collapsible panel with Steps timeline, Chat, and Charts tabs

### State Management
Global state uses Zustand (`src/lib/store.ts`):
- `conversations`: List of chat sessions with messages, assets, tasks
- `viewerTabs`: Open structure tabs in Canvas
- `activeTask`: Current running folding task with streaming steps
- `thumbnails`: Cached structure preview images (keyed by structureId)

### Mock API Routes (Next.js App Router)
| Endpoint | Description |
|----------|-------------|
| `POST /api/conversations` | Create new conversation |
| `GET /api/conversations` | List conversations |
| `POST /api/tasks` | Start folding task |
| `GET /api/tasks/[taskId]/stream` | SSE stream for task progress |
| `GET /api/structures/[structureId]` | Download PDB file |

### SSE Step Events
The streaming endpoint emits `step` events with this shape:
```typescript
{
  eventId: string;
  taskId: string;
  ts: number;
  stage: 'QUEUED' | 'MSA' | 'MODEL' | 'RELAX' | 'QA' | 'DONE' | 'ERROR';
  status: 'queued' | 'running' | 'partial' | 'complete' | 'failed';
  progress: number; // 0-100
  message: string;
  artifacts?: StructureArtifact[];
}
```

### Mol* Integration
- Uses `molstar` npm package with dynamic imports to avoid SSR issues
- `MolstarViewer.tsx` handles initialization, structure loading, and cleanup
- Falls back to Canvas 2D renderer if Mol* fails to load
- Thumbnail generation via canvas `toDataURL()` after structure loads

### Path Aliases
```typescript
@/* → ./src/*        // Main source
@molstar/* → ./molstar/src/*  // Local molstar (excluded from build)
```

## Key Types (`src/lib/types.ts`)

- `Conversation`: Chat session containing messages, tasks, assets
- `Task`: Folding job with steps and structure artifacts
- `StepEvent`: Single progress event from SSE stream
- `StructureArtifact`: Generated PDB with metrics (pLDDT, PAE)
- `ViewerTab`: Open structure tab in Canvas

## Design Tokens (Tailwind)

Dark theme aligned with Figma design:
- Background: `cf-bg` (#1e1e1e), `cf-bg-secondary`, `cf-bg-tertiary`
- Text: `cf-text` (80% white), `cf-text-secondary` (60%), `cf-text-muted` (40%)
- Accent: `cf-accent` (#623b8b), `cf-success` (#67da7a)
- Border radius: `cf` (6px), `cf-md` (8px), `cf-lg` (12px)

## Testing

- **Unit tests**: Vitest with jsdom (`src/**/*.test.ts`)
- **E2E tests**: Playwright (`tests/`)
- Test setup: `src/test/setup.ts`
