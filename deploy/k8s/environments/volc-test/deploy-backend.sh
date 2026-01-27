#!/bin/bash

# ChatFold Backend Deployment Script for Volc Test Environment
#
# Usage:
#   ./deploy-backend.sh              # Build, push, and deploy
#   ./deploy-backend.sh --tag TAG    # Deploy with specific tag (skip build)
#   ./deploy-backend.sh --init       # First-time deployment

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Print functions
info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
step() { echo -e "${BLUE}[STEP]${NC} $1"; }

# Registry configuration
REGISTRY=${REGISTRY:=spx-cn-shanghai.cr.volces.com}
REGISTRY_NAMESPACE=${REGISTRY_NAMESPACE:=chatfold}
IMAGE_NAME="backend"
IMAGE_TAG="test-$(date +%Y%m%d-%H%M%S)"
IMAGE_TAG_LATEST="test-latest"

# Kubernetes configuration
NAMESPACE="chatfold"

# Get project root directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"

# Parse arguments
SKIP_BUILD=false
INIT_DEPLOY=false
CUSTOM_TAG=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --tag)
            CUSTOM_TAG="$2"
            SKIP_BUILD=true
            shift 2
            ;;
        --init)
            INIT_DEPLOY=true
            shift
            ;;
        -h|--help)
            echo "Usage: ./deploy-backend.sh [options]"
            echo ""
            echo "Options:"
            echo "  --tag TAG    Deploy with specific tag (skip build)"
            echo "  --init       First-time deployment"
            echo "  -h, --help   Show this help message"
            exit 0
            ;;
        *)
            shift
            ;;
    esac
done

if [ -n "$CUSTOM_TAG" ]; then
    IMAGE_TAG="$CUSTOM_TAG"
fi

# Check kubectl context
check_context() {
    CURRENT_CONTEXT=$(kubectl config current-context)
    info "Current context: $CURRENT_CONTEXT"
}

# Check Docker
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        error "Docker is not running. Please start Docker."
        exit 1
    fi
}

# Initialize resources (first-time deployment)
init_resources() {
    step "Initializing backend resources..."

    # Apply Service
    info "Applying Service..."
    kubectl apply -f "$SCRIPT_DIR/backend-service.yaml"

    # Apply Deployment
    info "Applying Deployment..."
    kubectl apply -f "$SCRIPT_DIR/backend-deployment.yaml"

    # Apply updated Ingress
    info "Applying Ingress..."
    kubectl apply -f "$SCRIPT_DIR/ingress.yaml"

    info "Initialization complete"
}

# Build backend image
build_backend() {
    step "Building backend image..."
    cd "$BACKEND_DIR"

    BACKEND_IMAGE="${REGISTRY}/${REGISTRY_NAMESPACE}/${IMAGE_NAME}:${IMAGE_TAG}"
    BACKEND_IMAGE_LATEST="${REGISTRY}/${REGISTRY_NAMESPACE}/${IMAGE_NAME}:${IMAGE_TAG_LATEST}"

    docker build \
        -t "${BACKEND_IMAGE}" \
        -t "${BACKEND_IMAGE_LATEST}" \
        -f "$PROJECT_ROOT/deploy/docker/Dockerfile.backend" \
        --build-arg GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown") \
        --build-arg GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown") \
        --build-arg BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
        .

    info "Backend image built: ${BACKEND_IMAGE}"
}

# Push backend image
push_backend() {
    step "Pushing backend image..."

    BACKEND_IMAGE="${REGISTRY}/${REGISTRY_NAMESPACE}/${IMAGE_NAME}:${IMAGE_TAG}"
    BACKEND_IMAGE_LATEST="${REGISTRY}/${REGISTRY_NAMESPACE}/${IMAGE_NAME}:${IMAGE_TAG_LATEST}"

    docker push "${BACKEND_IMAGE}"
    docker push "${BACKEND_IMAGE_LATEST}"

    info "Backend image pushed"
}

# Deploy backend
deploy_backend() {
    step "Deploying backend (tag: ${IMAGE_TAG})..."

    BACKEND_IMAGE="${REGISTRY}/${REGISTRY_NAMESPACE}/${IMAGE_NAME}:${IMAGE_TAG}"

    # Check if deployment exists
    if ! kubectl get deployment chatfold-backend -n "$NAMESPACE" >/dev/null 2>&1; then
        error "Deployment not found. Please run with --init first."
        exit 1
    fi

    # Update image
    kubectl set image deployment/chatfold-backend \
        backend="${BACKEND_IMAGE}" \
        -n "$NAMESPACE"

    info "Waiting for rollout to complete..."
    kubectl rollout status deployment/chatfold-backend -n "$NAMESPACE" --timeout=120s

    info "Backend deployment complete"
}

# Show deployment status
show_status() {
    echo ""
    echo "============================================================"
    step "Deployment Status"
    echo ""

    echo "Image Tag: ${IMAGE_TAG}"
    echo ""

    echo "Current Image:"
    kubectl get deployment chatfold-backend -n "$NAMESPACE" -o jsonpath='  {.spec.template.spec.containers[0].image}'
    echo ""
    echo ""

    echo "Pods:"
    kubectl get pods -n "$NAMESPACE" -l app=chatfold-backend

    echo ""

    echo "Service:"
    kubectl get svc chatfold-backend -n "$NAMESPACE"

    echo ""
    echo "============================================================"
    info "Deployment complete!"
    echo ""
    # Get Ingress IP from independent controller's LoadBalancer Service
    INGRESS_IP=$(kubectl get svc -n ${NAMESPACE} \
        -l app.kubernetes.io/instance=chatfold-ingress \
        -o jsonpath='{.items[0].status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "<INGRESS_IP>")
    echo "Health check: curl http://${INGRESS_IP}/api/v1/health"
    echo ""
    echo "To check logs:"
    echo "  kubectl logs -f deployment/chatfold-backend -n $NAMESPACE"
}

# Main
main() {
    echo ""
    info "=== ChatFold Backend Deployment (volc-test) ==="
    echo ""

    check_context
    check_docker

    # First-time deployment
    if [[ "$INIT_DEPLOY" == "true" ]]; then
        init_resources
    fi

    # Build and push
    if [[ "$SKIP_BUILD" == "false" ]]; then
        info "Image Tag: ${IMAGE_TAG}"
        echo ""
        build_backend
        push_backend
    else
        info "Skipping build, using tag: ${IMAGE_TAG}"
    fi

    echo ""

    # Deploy
    deploy_backend

    # Show status
    show_status
}

main "$@"
