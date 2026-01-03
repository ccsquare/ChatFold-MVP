#!/bin/bash
# Start Multi-Instance ChatFold Environment
#
# Usage:
#   ./scripts/start-multi-instance.sh [up|down|logs|ps]
#
# Options:
#   up     - Start all services (default)
#   down   - Stop all services
#   logs   - View logs
#   ps     - Show running containers

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/deploy/docker/docker-compose.multi-instance.yml"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }

case "${1:-up}" in
    up)
        log_info "Starting multi-instance environment..."
        docker compose -f "$COMPOSE_FILE" up --build -d

        log_info "Waiting for services to be healthy..."
        sleep 10

        echo ""
        log_success "Multi-instance environment started!"
        echo ""
        echo "  Services:"
        echo "    Backend 1:  http://localhost:8001"
        echo "    Backend 2:  http://localhost:8002"
        echo "    Redis:      localhost:6379"
        echo "    MySQL:      localhost:3306"
        echo ""
        echo "  Commands:"
        echo "    View logs:  $0 logs"
        echo "    Stop:       $0 down"
        echo "    Run tests:  ./scripts/test-multi-instance.sh"
        echo ""
        ;;

    down)
        log_info "Stopping multi-instance environment..."
        docker compose -f "$COMPOSE_FILE" down
        log_success "All services stopped"
        ;;

    logs)
        docker compose -f "$COMPOSE_FILE" logs -f
        ;;

    ps)
        docker compose -f "$COMPOSE_FILE" ps
        ;;

    *)
        echo "Usage: $0 [up|down|logs|ps]"
        exit 1
        ;;
esac
