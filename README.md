# ChatFold MVP

A ChatGPT-style protein folding workbench frontend with three-column layout, streaming steps visualization, and 3D structure viewer.

## Features

- **Three-column layout**: Sidebar (files/chats) | Canvas (3D viewer) | Console (steps/chat/charts)
- **File upload**: Drag & drop FASTA/PDB files
- **Structure tabs**: Multiple PDB files open in tabs
- **SSE streaming**: Real-time folding progress with step events
- **3D visualization**: Canvas-based protein structure rendering
- **Thumbnail caching**: Auto-generated structure previews
- **Dark theme**: Figma-aligned design tokens

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:3000
```

## Mock API Protocol

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/conversations` | Create new conversation |
| GET | `/api/conversations` | List all conversations |
| POST | `/api/tasks` | Create folding task |
| GET | `/api/tasks/[taskId]/stream` | SSE stream for task progress |
| GET | `/api/structures/[id]` | Download structure PDB |

### SSE Events

```typescript
// Task progress stream
event: step
data: {
  "eventId": "evt_0001",
  "taskId": "task_123",
  "ts": 1730000000,
  "stage": "MSA" | "MODEL" | "RELAX" | "QA" | "DONE" | "ERROR",
  "status": "queued" | "running" | "partial" | "complete" | "failed",
  "progress": 0-100,
  "message": "Human readable status",
  "artifacts": [{
    "type": "structure",
    "structureId": "str_001",
    "label": "candidate-1",
    "filename": "candidate_1.pdb",
    "metrics": { "plddtAvg": 85.5, "paeAvg": 5.2 }
  }]
}
```

## Project Structure

```
src/
├── app/
│   ├── api/                 # Mock API routes
│   │   ├── conversations/   # Conversation CRUD
│   │   ├── tasks/           # Task management + SSE
│   │   └── structures/      # PDB download
│   ├── globals.css          # Tailwind + custom styles
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Main page
├── components/
│   ├── LayoutShell.tsx      # Three-column layout
│   ├── Sidebar.tsx          # Left: files + chats
│   ├── Canvas.tsx           # Center: viewer container
│   ├── CanvasTabs.tsx       # PDB file tabs
│   ├── MolstarViewer.tsx    # 3D structure viewer
│   ├── ViewerToolbar.tsx    # Download/screenshot/reset
│   ├── InspectorPanel.tsx   # Right inspector (metrics/notes)
│   ├── ConsoleDrawer.tsx    # Right: steps/chat/charts
│   ├── StepsPanel.tsx       # Streaming steps timeline
│   ├── ChatPanel.tsx        # Chat interface
│   └── ChartsPanel.tsx      # Metrics visualization
├── lib/
│   ├── types.ts             # TypeScript interfaces
│   ├── store.ts             # Zustand state management
│   ├── utils.ts             # Utility functions
│   └── mock/
│       └── generators.ts    # PDB + event generators
└── hooks/                   # Custom React hooks
```

## Usage

1. **Start a conversation**: Click "+" or upload a FASTA file
2. **Submit sequence**: Paste FASTA in chat or drag-drop file
3. **Watch progress**: Steps panel shows real-time folding stages
4. **View structures**: Click "Open" on generated structures
5. **Download**: Use toolbar or step card download buttons

## Test Data

Sample files are in `data/test_data/`:
- `9CG9_HMGB1.fasta` - Sample FASTA sequence
- `9CG9_HMGB1.pdb` - Reference PDB structure

## Design Reference

- **Figma**: Dark theme with `#1e1e1e` background
- **Fonts**: Karla, PingFang SC
- **Border radius**: 6px (cf), 8px (cf-md), 12px (cf-lg)
- **Colors**: See `tailwind.config.ts` for full palette

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: TailwindCSS
- **State**: Zustand
- **Icons**: Lucide React
- **Streaming**: Server-Sent Events (SSE)

## Development Notes

- Mock server simulates 500-1200ms delays between step events
- Thumbnail generation uses canvas toDataURL
- Structure viewer is a lightweight Canvas 2D implementation
- For production, integrate actual Mol* viewer from `@molstar/`
