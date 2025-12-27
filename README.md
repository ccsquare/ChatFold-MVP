# ChatFold MVP

A ChatGPT-style protein folding workbench with three-column layout, real-time SSE streaming, and 3D structure visualization.

## Features

- **Three-column layout**: Sidebar (files/chats) | Canvas (3D viewer) | Console (steps/chat)
- **File upload**: Drag & drop FASTA/PDB files
- **Structure tabs**: Multiple PDB files open in tabs
- **SSE streaming**: Real-time folding progress with step events
- **3D visualization**: Mol* protein structure rendering
- **Quality metrics**: pLDDT and PAE scores display
- **Dark/light theme**: Figma-aligned design system

## Quick Start

```bash
# Start both frontend and backend
./start.sh

# Or manually:
# Frontend (port 3000)
cd web && npm install && npm run dev

# Backend (port 8000)
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Open http://localhost:3000

## Architecture

```
Frontend (Next.js)              Backend (FastAPI)
┌──────────────┐              ┌──────────────────┐
│  Web UI      │◄────HTTP────►│  API Endpoints   │
│  Port: 3000  │              │  Port: 8000      │
└──────────────┘              └──────────────────┘
       │                              │
       ▼                              ▼
┌──────────────┐              ┌──────────────────┐
│  Mol* 3D     │              │  SSE Streaming   │
│  Viewer      │              │  Mock Folding    │
└──────────────┘              └──────────────────┘
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Health check |
| POST/GET | `/api/v1/conversations` | Conversation CRUD |
| POST/GET | `/api/v1/tasks` | Task management |
| GET | `/api/v1/tasks/{id}/stream` | SSE progress stream |
| GET | `/api/v1/structures/{id}` | Download PDB file |

## SSE Events

```typescript
event: step
data: {
  "eventId": "evt_0001",
  "taskId": "task_123",
  "stage": "MSA" | "MODEL" | "RELAX" | "QA" | "DONE" | "ERROR",
  "status": "queued" | "running" | "partial" | "complete" | "failed",
  "progress": 0-100,
  "message": "Human readable status",
  "artifacts": [{ "structureId": "str_001", "metrics": { "plddtAvg": 85.5 }}]
}
```

## Project Structure

```
ChatFold-MVP/
├── web/                    # Next.js 14 frontend
│   └── src/
│       ├── app/            # App Router pages
│       ├── components/     # React components (36 files)
│       ├── hooks/          # useFoldingTask, useResizable
│       └── lib/            # store.ts, types.ts, utils
│
├── backend/                # FastAPI backend
│   └── app/
│       ├── api/v1/         # Versioned endpoints
│       ├── services/       # storage, mock_folding
│       └── models/         # Pydantic schemas
│
└── docs/                   # Documentation
```

## Tech Stack

**Frontend**
- Next.js 14 (App Router) / React 18 / TypeScript
- TailwindCSS / shadcn/ui (Radix UI)
- Zustand (state management with persistence)
- Mol* 4.5.0 (3D visualization)

**Backend**
- Python 3.10+ / FastAPI
- Pydantic (data validation)
- Uvicorn (ASGI server)

## Test Data

Sample files in `web/tests/fixtures/`:
- `9CG9_HMGB1.fasta` - Sample FASTA sequence
- `9CG9_HMGB1.pdb` - Reference PDB structure (Git LFS)

## Usage

1. **Start conversation**: Click "+" or upload a FASTA file
2. **Submit sequence**: Paste FASTA in chat or drag-drop file
3. **Watch progress**: Steps panel shows real-time folding stages
4. **View structures**: Click "Open" on generated structures
5. **Download**: Use toolbar or step card download buttons

## Design

- **Theme**: Dark mode with `#1e1e1e` background
- **Fonts**: Karla, PingFang SC
- **Colors**: See `tailwind.config.ts` for palette
