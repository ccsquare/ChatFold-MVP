#!/bin/bash

# ChatFold Development Server Startup Script
# Usage: ./start.sh [frontend|backend|all]

set -e

# Get the project root (two levels up from this script)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/web"
BACKEND_DIR="$PROJECT_ROOT/backend"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if a port is in use (supports both IPv4 and IPv6)
check_port() {
    local port=$1
    if ss -tlnp 2>/dev/null | grep -q ":$port " || lsof -i :$port > /dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Kill process on port (supports both IPv4 and IPv6)
kill_port() {
    local port=$1
    log_info "Checking port $port..."

    # Try multiple methods to find and kill processes
    # Method 1: lsof
    local pids=$(lsof -ti :$port 2>/dev/null)

    # Method 2: ss + grep (for IPv6 listeners)
    if [ -z "$pids" ]; then
        pids=$(ss -tlnp 2>/dev/null | grep ":$port " | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | sort -u)
    fi

    # Method 3: netstat fallback
    if [ -z "$pids" ]; then
        pids=$(netstat -tlnp 2>/dev/null | grep ":$port " | awk '{print $7}' | cut -d'/' -f1 | sort -u)
    fi

    if [ -n "$pids" ]; then
        log_warn "Port $port is in use (PIDs: $pids), killing..."
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 2
    fi
}

# Start frontend
start_frontend() {
    log_info "Starting frontend server..."
    cd "$FRONTEND_DIR"

    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        log_info "Installing frontend dependencies..."
        npm install
    fi

    # Kill existing process on port 23000
    kill_port 23000

    # Start Next.js dev server
    npm run dev &
    FRONTEND_PID=$!

    # Wait for server to be ready
    log_info "Waiting for frontend to be ready..."
    for i in {1..30}; do
        if curl -s http://localhost:23000 > /dev/null 2>&1; then
            log_success "Frontend running at http://localhost:23000"
            return 0
        fi
        sleep 1
    done

    log_warn "Frontend may still be starting..."
}

# Start backend
start_backend() {
    log_info "Starting backend server..."
    cd "$BACKEND_DIR"

    # Sync dependencies using uv
    log_info "Syncing backend dependencies with uv..."
    uv sync

    # Kill existing process on port 28000
    kill_port 28000

    # Start FastAPI server using uv
    uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 28000 &
    BACKEND_PID=$!

    # Wait for server to be ready
    log_info "Waiting for backend to be ready..."
    for i in {1..30}; do
        if curl -s http://localhost:28000/api/v1/health > /dev/null 2>&1; then
            log_success "Backend running at http://localhost:28000"
            log_success "API docs at http://localhost:28000/docs"
            return 0
        fi
        sleep 1
    done

    log_warn "Backend may still be starting..."
}

# Cleanup function
cleanup() {
    log_info "Shutting down servers..."
    kill_port 23000
    kill_port 28000
    log_success "Servers stopped"
    exit 0
}

# Set up trap for cleanup
trap cleanup SIGINT SIGTERM

# Main
main() {
    local mode="${1:-all}"

    echo ""
    echo "=========================================="
    echo "   ChatFold Development Server"
    echo "=========================================="
    echo ""

    case $mode in
        frontend|front|f)
            start_frontend
            ;;
        backend|back|b)
            start_backend
            ;;
        all|*)
            start_backend
            start_frontend
            echo ""
            log_success "All services started!"
            echo ""
            echo "  Frontend: http://localhost:23000"
            echo "  Backend:  http://localhost:28000"
            echo "  API Docs: http://localhost:28000/docs"
            echo ""
            echo "Press Ctrl+C to stop all servers"
            ;;
    esac

    # Keep script running
    wait
}

main "$@"
