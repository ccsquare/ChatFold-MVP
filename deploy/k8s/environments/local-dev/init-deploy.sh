#!/bin/bash
#
# ChatFold Local Development Environment Setup
# =============================================
# This script sets up MySQL and Redis for local development using Docker.
#
# Prerequisites:
#   - Docker installed and running
#   - Ports 3306 (MySQL) and 6379 (Redis) available
#
# Usage:
#   ./init-deploy.sh [command]
#
# Commands:
#   start   - Start MySQL and Redis containers (default)
#   stop    - Stop containers
#   restart - Restart containers
#   status  - Show container status
#   clean   - Remove containers and volumes (WARNING: deletes all data)
#   logs    - Show container logs
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NETWORK_NAME="chatfold-dev"
MYSQL_CONTAINER="chatfold-mysql"
REDIS_CONTAINER="chatfold-redis"
MYSQL_VOLUME="chatfold-mysql-data"
REDIS_VOLUME="chatfold-redis-data"

# MySQL Configuration
MYSQL_ROOT_PASSWORD="chatfold123"
MYSQL_DATABASE="chatfold"
MYSQL_USER="chatfold"
MYSQL_PASSWORD="chatfold123"
MYSQL_PORT="3306"

# Redis Configuration
REDIS_PORT="6379"

# Print colored message
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    print_success "Docker is running"
}

# Create Docker network if not exists
create_network() {
    if ! docker network inspect $NETWORK_NAME > /dev/null 2>&1; then
        print_info "Creating Docker network: $NETWORK_NAME"
        docker network create $NETWORK_NAME
        print_success "Network created"
    else
        print_info "Network $NETWORK_NAME already exists"
    fi
}

# Create Docker volumes if not exist
create_volumes() {
    if ! docker volume inspect $MYSQL_VOLUME > /dev/null 2>&1; then
        print_info "Creating MySQL volume: $MYSQL_VOLUME"
        docker volume create $MYSQL_VOLUME
    fi

    if ! docker volume inspect $REDIS_VOLUME > /dev/null 2>&1; then
        print_info "Creating Redis volume: $REDIS_VOLUME"
        docker volume create $REDIS_VOLUME
    fi
    print_success "Volumes ready"
}

# Start MySQL container
start_mysql() {
    if docker ps -a --format '{{.Names}}' | grep -q "^${MYSQL_CONTAINER}$"; then
        if docker ps --format '{{.Names}}' | grep -q "^${MYSQL_CONTAINER}$"; then
            print_info "MySQL container is already running"
        else
            print_info "Starting existing MySQL container"
            docker start $MYSQL_CONTAINER
        fi
    else
        print_info "Creating and starting MySQL container"
        docker run -d \
            --name $MYSQL_CONTAINER \
            --network $NETWORK_NAME \
            -p $MYSQL_PORT:3306 \
            -e MYSQL_ROOT_PASSWORD=$MYSQL_ROOT_PASSWORD \
            -e MYSQL_DATABASE=$MYSQL_DATABASE \
            -e MYSQL_USER=$MYSQL_USER \
            -e MYSQL_PASSWORD=$MYSQL_PASSWORD \
            --mount source=$MYSQL_VOLUME,target=/var/lib/mysql \
            mysql:8.0 \
            --character-set-server=utf8mb4 \
            --collation-server=utf8mb4_unicode_ci
    fi
}

# Start Redis container
start_redis() {
    if docker ps -a --format '{{.Names}}' | grep -q "^${REDIS_CONTAINER}$"; then
        if docker ps --format '{{.Names}}' | grep -q "^${REDIS_CONTAINER}$"; then
            print_info "Redis container is already running"
        else
            print_info "Starting existing Redis container"
            docker start $REDIS_CONTAINER
        fi
    else
        print_info "Creating and starting Redis container"
        docker run -d \
            --name $REDIS_CONTAINER \
            --network $NETWORK_NAME \
            -p $REDIS_PORT:6379 \
            --mount source=$REDIS_VOLUME,target=/data \
            redis:7-alpine \
            redis-server --appendonly yes
    fi
}

# Wait for MySQL to be ready
wait_for_mysql() {
    print_info "Waiting for MySQL to be ready..."
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if docker exec $MYSQL_CONTAINER mysqladmin ping -h localhost -u root -p$MYSQL_ROOT_PASSWORD --silent 2>/dev/null; then
            print_success "MySQL is ready"
            return 0
        fi
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done

    print_error "MySQL failed to start within expected time"
    return 1
}

# Wait for Redis to be ready
wait_for_redis() {
    print_info "Waiting for Redis to be ready..."
    local max_attempts=10
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if docker exec $REDIS_CONTAINER redis-cli ping 2>/dev/null | grep -q "PONG"; then
            print_success "Redis is ready"
            return 0
        fi
        echo -n "."
        sleep 1
        attempt=$((attempt + 1))
    done

    print_error "Redis failed to start within expected time"
    return 1
}

# Stop containers
stop_containers() {
    print_info "Stopping containers..."
    docker stop $MYSQL_CONTAINER $REDIS_CONTAINER 2>/dev/null || true
    print_success "Containers stopped"
}

# Show container status
show_status() {
    echo ""
    echo "=== ChatFold Local Dev Environment Status ==="
    echo ""

    # Network
    if docker network inspect $NETWORK_NAME > /dev/null 2>&1; then
        print_success "Network: $NETWORK_NAME exists"
    else
        print_warning "Network: $NETWORK_NAME does not exist"
    fi

    # MySQL
    if docker ps --format '{{.Names}}' | grep -q "^${MYSQL_CONTAINER}$"; then
        print_success "MySQL: Running on port $MYSQL_PORT"
        echo "         Connection: mysql -h 127.0.0.1 -P $MYSQL_PORT -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DATABASE"
    elif docker ps -a --format '{{.Names}}' | grep -q "^${MYSQL_CONTAINER}$"; then
        print_warning "MySQL: Stopped"
    else
        print_error "MySQL: Not created"
    fi

    # Redis
    if docker ps --format '{{.Names}}' | grep -q "^${REDIS_CONTAINER}$"; then
        print_success "Redis: Running on port $REDIS_PORT"
        echo "         Connection: redis-cli -h 127.0.0.1 -p $REDIS_PORT"
    elif docker ps -a --format '{{.Names}}' | grep -q "^${REDIS_CONTAINER}$"; then
        print_warning "Redis: Stopped"
    else
        print_error "Redis: Not created"
    fi

    echo ""
}

# Clean up everything (dangerous!)
clean_all() {
    print_warning "This will remove all containers and data volumes!"
    read -p "Are you sure? (y/N): " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        print_info "Aborted"
        return
    fi

    print_info "Stopping and removing containers..."
    docker stop $MYSQL_CONTAINER $REDIS_CONTAINER 2>/dev/null || true
    docker rm $MYSQL_CONTAINER $REDIS_CONTAINER 2>/dev/null || true

    print_info "Removing volumes..."
    docker volume rm $MYSQL_VOLUME $REDIS_VOLUME 2>/dev/null || true

    print_info "Removing network..."
    docker network rm $NETWORK_NAME 2>/dev/null || true

    print_success "Cleanup complete"
}

# Show logs
show_logs() {
    local service=$1
    case $service in
        mysql)
            docker logs -f $MYSQL_CONTAINER
            ;;
        redis)
            docker logs -f $REDIS_CONTAINER
            ;;
        *)
            print_info "MySQL logs:"
            docker logs --tail 20 $MYSQL_CONTAINER 2>/dev/null || print_warning "MySQL container not found"
            echo ""
            print_info "Redis logs:"
            docker logs --tail 20 $REDIS_CONTAINER 2>/dev/null || print_warning "Redis container not found"
            ;;
    esac
}

# Print connection info
print_connection_info() {
    echo ""
    echo "=== Connection Information ==="
    echo ""
    echo "MySQL:"
    echo "  Host:     127.0.0.1"
    echo "  Port:     $MYSQL_PORT"
    echo "  Database: $MYSQL_DATABASE"
    echo "  User:     $MYSQL_USER"
    echo "  Password: $MYSQL_PASSWORD"
    echo ""
    echo "  Python:   mysql+pymysql://$MYSQL_USER:$MYSQL_PASSWORD@127.0.0.1:$MYSQL_PORT/$MYSQL_DATABASE"
    echo "  CLI:      mysql -h 127.0.0.1 -P $MYSQL_PORT -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DATABASE"
    echo ""
    echo "Redis:"
    echo "  Host:     127.0.0.1"
    echo "  Port:     $REDIS_PORT"
    echo ""
    echo "  Python:   redis://127.0.0.1:$REDIS_PORT/0"
    echo "  CLI:      redis-cli -h 127.0.0.1 -p $REDIS_PORT"
    echo ""
}

# Main start function
start_all() {
    echo ""
    echo "=== ChatFold Local Development Environment Setup ==="
    echo ""

    check_docker
    create_network
    create_volumes

    echo ""
    start_mysql
    start_redis

    echo ""
    wait_for_mysql
    wait_for_redis

    print_connection_info

    print_success "Local development environment is ready!"
}

# Main
case "${1:-start}" in
    start)
        start_all
        ;;
    stop)
        stop_containers
        ;;
    restart)
        stop_containers
        sleep 2
        start_all
        ;;
    status)
        check_docker
        show_status
        ;;
    clean)
        clean_all
        ;;
    logs)
        show_logs "${2:-all}"
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|clean|logs [mysql|redis]}"
        exit 1
        ;;
esac
