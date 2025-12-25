# ChatFold Backend

Python FastAPI backend for the ChatFold protein folding workbench.

## Quick Start

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run development server
uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/conversations` | POST | Create new conversation |
| `/api/conversations` | GET | List all conversations |
| `/api/conversations/{id}` | GET | Get conversation by ID |
| `/api/conversations/{id}` | DELETE | Delete conversation |
| `/api/tasks` | POST | Create folding task |
| `/api/tasks` | GET | List tasks (or get by ?taskId=) |
| `/api/tasks/{taskId}/stream` | GET | SSE stream for task progress |
| `/api/tasks/{taskId}/stream` | POST | Pre-register sequence |
| `/api/structures/{structureId}` | GET | Download PDB file |
| `/api/structures/{structureId}` | POST | Cache PDB data |

## Configuration

Environment variables (prefix: `CHATFOLD_`):

| Variable | Default | Description |
|----------|---------|-------------|
| `CHATFOLD_HOST` | `0.0.0.0` | Server host |
| `CHATFOLD_PORT` | `8000` | Server port |
| `CHATFOLD_DEBUG` | `true` | Debug mode |
| `CHATFOLD_CORS_ORIGINS` | `["http://localhost:3000"]` | Allowed CORS origins |

## Project Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI application
│   ├── config.py            # Configuration settings
│   ├── models/
│   │   └── schemas.py       # Pydantic data models
│   ├── routers/
│   │   ├── conversations.py # Conversation endpoints
│   │   ├── tasks.py         # Task & SSE endpoints
│   │   └── structures.py    # Structure/PDB endpoints
│   ├── services/
│   │   ├── storage.py       # In-memory storage
│   │   └── mock_folding.py  # Mock folding simulation
│   └── utils/
│       ├── id_generator.py  # ID generation
│       ├── fasta_parser.py  # FASTA parsing
│       └── pdb_generator.py # Mock PDB generation
├── requirements.txt
└── README.md
```

## Development

### API Documentation

When the server is running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### Testing SSE Stream

```bash
curl -N "http://localhost:8000/api/tasks/task_test123/stream?sequence=MVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSH"
```

## Frontend Integration

Update your Next.js frontend to use the Python backend:

1. Set the API base URL in your environment:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```

2. Or configure Next.js rewrites in `next.config.js`:
   ```js
   async rewrites() {
     return [
       {
         source: '/api/:path*',
         destination: 'http://localhost:8000/api/:path*',
       },
     ];
   }
   ```
