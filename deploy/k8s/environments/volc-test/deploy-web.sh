#!/bin/bash

# ChatFold Frontend Deployment Script for Volc Test Environment
#
# Usage:
#   ./deploy-web.sh              # Build, push, and deploy
#   ./deploy-web.sh --tag TAG    # Deploy with specific tag (skip build)
#   ./deploy-web.sh --init       # First-time deployment (create namespace, configmap, etc.)
#
# Prerequisites:
#   - Docker running and logged into registry
#   - kubectl configured for volc cluster
#   - Image pull secret 'cr-spx-cn-shanghai' exists in namespace

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
IMAGE_NAME="web"
IMAGE_TAG="test-$(date +%Y%m%d-%H%M%S)"
IMAGE_TAG_LATEST="test-latest"

# Build configuration
NODE_ENV=${NODE_ENV:=test}

# Kubernetes configuration
NAMESPACE="chatfold"

# Get project root directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
WEB_DIR="$PROJECT_ROOT/web"

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
            echo "Usage: ./deploy-web.sh [options]"
            echo ""
            echo "Options:"
            echo "  --tag TAG    Deploy with specific tag (skip build)"
            echo "  --init       First-time deployment (create namespace, configmap, etc.)"
            echo "  -h, --help   Show this help message"
            echo ""
            echo "Examples:"
            echo "  ./deploy-web.sh              # Build and deploy"
            echo "  ./deploy-web.sh --init       # First-time setup"
            echo "  ./deploy-web.sh --tag test-20241229-120000  # Deploy specific tag"
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

    VOLC_CONTEXTS=("cluster-foldingix-test" "volc" "vke")

    IS_VOLC=false
    for ctx in "${VOLC_CONTEXTS[@]}"; do
        if [[ "$CURRENT_CONTEXT" == *"$ctx"* ]]; then
            IS_VOLC=true
            break
        fi
    done

    if [ "$IS_VOLC" = false ]; then
        warn "Current kubectl context may not be Volc cluster"
        warn "Current context: $CURRENT_CONTEXT"
        echo ""
        read -p "$(echo -e '\033[1;33mContinue deployment? [y/N]:\033[0m ')" -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            info "Deployment cancelled"
            exit 0
        fi
    fi

    info "Current context: $CURRENT_CONTEXT"
}

# Check Docker
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        error "Docker is not running. Please start Docker."
        exit 1
    fi
}

# Initialize namespace and resources (first-time deployment)
init_resources() {
    step "Initializing namespace and resources..."

    # Create namespace if not exists
    if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
        info "Creating namespace: $NAMESPACE"
        kubectl create namespace "$NAMESPACE"
    else
        info "Namespace $NAMESPACE already exists"
    fi

    # Apply ConfigMap
    info "Applying ConfigMap..."
    kubectl apply -f "$SCRIPT_DIR/configmap.yaml"

    # Apply Service
    info "Applying Service..."
    kubectl apply -f "$SCRIPT_DIR/web-service.yaml"

    # Apply Deployment
    info "Applying Deployment..."
    kubectl apply -f "$SCRIPT_DIR/web-deployment.yaml"

    # Apply Ingress
    info "Applying Ingress..."
    kubectl apply -f "$SCRIPT_DIR/ingress.yaml"

    info "Initialization complete"
}

# Build web image
build_web() {
    step "Building frontend image (NODE_ENV=${NODE_ENV})..."
    cd "$WEB_DIR"

    WEB_IMAGE="${REGISTRY}/${REGISTRY_NAMESPACE}/${IMAGE_NAME}:${IMAGE_TAG}"
    WEB_IMAGE_LATEST="${REGISTRY}/${REGISTRY_NAMESPACE}/${IMAGE_NAME}:${IMAGE_TAG_LATEST}"

    docker build \
        -t "${WEB_IMAGE}" \
        -t "${WEB_IMAGE_LATEST}" \
        -f "$PROJECT_ROOT/deploy/docker/Dockerfile.web" \
        --build-arg NODE_ENV=${NODE_ENV} \
        --build-arg GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown") \
        --build-arg GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown") \
        --build-arg BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
        --build-arg VERSION=$(grep '"version"' package.json | sed 's/.*"version": "\(.*\)".*/\1/' || echo "0.1.0") \
        .

    info "Frontend image built: ${WEB_IMAGE}"
}

# Push web image
push_web() {
    step "Pushing frontend image..."

    WEB_IMAGE="${REGISTRY}/${REGISTRY_NAMESPACE}/${IMAGE_NAME}:${IMAGE_TAG}"
    WEB_IMAGE_LATEST="${REGISTRY}/${REGISTRY_NAMESPACE}/${IMAGE_NAME}:${IMAGE_TAG_LATEST}"

    docker push "${WEB_IMAGE}"
    docker push "${WEB_IMAGE_LATEST}"

    info "Frontend image pushed"
}

# Deploy web
deploy_web() {
    step "Deploying frontend (tag: ${IMAGE_TAG})..."

    WEB_IMAGE="${REGISTRY}/${REGISTRY_NAMESPACE}/${IMAGE_NAME}:${IMAGE_TAG}"

    # Check if deployment exists
    if ! kubectl get deployment chatfold-web -n "$NAMESPACE" >/dev/null 2>&1; then
        error "Deployment not found. Please run with --init first."
        exit 1
    fi

    # Update image using kubectl set image
    kubectl set image deployment/chatfold-web \
        web="${WEB_IMAGE}" \
        -n "$NAMESPACE"

    info "Waiting for rollout to complete..."
    kubectl rollout status deployment/chatfold-web -n "$NAMESPACE" --timeout=300s

    info "Frontend deployment complete"
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
    kubectl get deployment chatfold-web -n "$NAMESPACE" -o jsonpath='  {.spec.template.spec.containers[0].image}'
    echo ""
    echo ""

    echo "Pods:"
    kubectl get pods -n "$NAMESPACE" -l app=chatfold-web

    echo ""

    echo "Service:"
    kubectl get svc chatfold-web -n "$NAMESPACE"

    echo ""

    echo "Ingress:"
    kubectl get ingress -n "$NAMESPACE"

    # Get Ingress IP from independent controller's LoadBalancer Service
    INGRESS_IP=$(kubectl get svc -n "$NAMESPACE" \
        -l app.kubernetes.io/instance=chatfold-ingress \
        -o jsonpath='{.items[0].status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")

    echo ""
    echo "============================================================"
    info "Deployment complete!"
    echo ""

    if [ -n "$INGRESS_IP" ]; then
        echo "Access URL: http://${INGRESS_IP}/"
    else
        echo "Ingress IP not yet assigned. Check later with:"
        echo "  kubectl get ingress -n $NAMESPACE"
    fi

    echo ""
    echo "To check logs:"
    echo "  kubectl logs -f deployment/chatfold-web -n $NAMESPACE"
    echo ""
    echo "To port-forward for local testing:"
    echo "  kubectl port-forward svc/chatfold-web 3000:3000 -n $NAMESPACE"
    echo "  Then access: http://localhost:3000/"
}

# Main
main() {
    echo ""
    info "=== ChatFold Frontend Deployment (volc-test) ==="
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
        build_web
        push_web
    else
        info "Skipping build, using tag: ${IMAGE_TAG}"
    fi

    echo ""

    # Deploy
    deploy_web

    # Show status
    show_status
}

main "$@"
