#!/bin/bash

# ChatFold 火山云测试环境部署脚本
# 构建镜像、推送到火山云镜像仓库、并更新 Kubernetes Deployment
#
# 用法:
#   ./deploy.sh              # 构建、推送并部署所有组件
#   ./deploy.sh backend      # 仅更新后端
#   ./deploy.sh web          # 仅更新前端
#   ./deploy.sh --tag TAG    # 使用指定的 tag（不构建，直接部署）
#
# 首次部署请使用: ./init-deploy.sh

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印函数
info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
step() { echo -e "${BLUE}[STEP]${NC} $1"; }

# 火山云容器镜像仓库配置
REGISTRY=${REGISTRY:=spx-cn-shanghai.cr.volces.com}
REGISTRY_NAMESPACE=${REGISTRY_NAMESPACE:=chatfold}
IMAGE_TAG="test-$(date +%Y%m%d-%H%M%S)"
IMAGE_TAG_LATEST="test-latest"

# 镜像名称
BACKEND_IMAGE_NAME="backend"
WEB_IMAGE_NAME="web"

# 构建配置
NODE_ENV=${NODE_ENV:=test}

# Kubernetes 配置
NAMESPACE="chatfold"

# 获取项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

# 解析参数
SKIP_BUILD=false
DEPLOY_BACKEND=true
DEPLOY_WEB=true
CUSTOM_TAG=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --tag)
            CUSTOM_TAG="$2"
            SKIP_BUILD=true
            shift 2
            ;;
        backend)
            DEPLOY_WEB=false
            shift
            ;;
        web)
            DEPLOY_BACKEND=false
            shift
            ;;
        -h|--help)
            echo "用法: ./deploy.sh [选项] [组件]"
            echo ""
            echo "组件:"
            echo "  backend     仅构建并部署后端"
            echo "  web         仅构建并部署前端"
            echo "  (默认)      构建并部署所有组件"
            echo ""
            echo "选项:"
            echo "  --tag TAG            使用指定的 tag（不构建，直接部署）"
            echo "  -h, --help           显示帮助信息"
            echo ""
            echo "示例:"
            echo "  ./deploy.sh                    # 更新所有组件"
            echo "  ./deploy.sh backend            # 仅更新后端"
            echo "  ./deploy.sh web                # 仅更新前端"
            echo "  ./deploy.sh --tag test-latest  # 使用指定 tag 部署"
            echo ""
            echo "首次部署请使用: ./init-deploy.sh"
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

# 前置检查：确保当前上下文是火山云集群
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
        warn "当前 kubectl 上下文可能不是火山云集群"
        warn "当前上下文: $CURRENT_CONTEXT"
        echo ""
        read -p "$(echo -e '\033[1;33m是否继续部署? [y/N]:\033[0m ')" -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            info "取消部署"
            exit 0
        fi
    fi

    info "当前上下文: $CURRENT_CONTEXT"
}

# 检查 Docker 是否运行
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        error "Docker 未运行，请启动 Docker"
        exit 1
    fi
}

# 检查 Deployment 是否存在
check_deployment_exists() {
    if ! kubectl get deployment chatfold-backend -n "$NAMESPACE" >/dev/null 2>&1; then
        error "Deployment 不存在！请先运行 ./init-deploy.sh 进行首次部署"
        exit 1
    fi
}

# 构建后端镜像
build_backend() {
    step "构建后端镜像..."
    cd "$PROJECT_ROOT/backend"

    BACKEND_IMAGE="${REGISTRY}/${REGISTRY_NAMESPACE}/${BACKEND_IMAGE_NAME}:${IMAGE_TAG}"
    BACKEND_IMAGE_LATEST="${REGISTRY}/${REGISTRY_NAMESPACE}/${BACKEND_IMAGE_NAME}:${IMAGE_TAG_LATEST}"

    docker build \
        -t "${BACKEND_IMAGE}" \
        -t "${BACKEND_IMAGE_LATEST}" \
        -f "$PROJECT_ROOT/deploy/docker/Dockerfile.backend" \
        --build-arg GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown") \
        --build-arg GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown") \
        --build-arg BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
        .

    info "✓ 后端镜像构建完成: ${BACKEND_IMAGE}"
}

# 构建前端镜像
build_web() {
    step "构建前端镜像 (NODE_ENV=${NODE_ENV})..."
    cd "$PROJECT_ROOT/web"

    WEB_IMAGE="${REGISTRY}/${REGISTRY_NAMESPACE}/${WEB_IMAGE_NAME}:${IMAGE_TAG}"
    WEB_IMAGE_LATEST="${REGISTRY}/${REGISTRY_NAMESPACE}/${WEB_IMAGE_NAME}:${IMAGE_TAG_LATEST}"

    docker build \
        -t "${WEB_IMAGE}" \
        -t "${WEB_IMAGE_LATEST}" \
        -f "$PROJECT_ROOT/deploy/docker/Dockerfile.web" \
        --build-arg NODE_ENV=${NODE_ENV} \
        --build-arg GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown") \
        --build-arg GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown") \
        --build-arg BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
        .

    info "✓ 前端镜像构建完成: ${WEB_IMAGE}"
}

# 推送后端镜像
push_backend() {
    step "推送后端镜像..."

    BACKEND_IMAGE="${REGISTRY}/${REGISTRY_NAMESPACE}/${BACKEND_IMAGE_NAME}:${IMAGE_TAG}"
    BACKEND_IMAGE_LATEST="${REGISTRY}/${REGISTRY_NAMESPACE}/${BACKEND_IMAGE_NAME}:${IMAGE_TAG_LATEST}"

    docker push "${BACKEND_IMAGE}"
    docker push "${BACKEND_IMAGE_LATEST}"

    info "✓ 后端镜像推送完成"
}

# 推送前端镜像
push_web() {
    step "推送前端镜像..."

    WEB_IMAGE="${REGISTRY}/${REGISTRY_NAMESPACE}/${WEB_IMAGE_NAME}:${IMAGE_TAG}"
    WEB_IMAGE_LATEST="${REGISTRY}/${REGISTRY_NAMESPACE}/${WEB_IMAGE_NAME}:${IMAGE_TAG_LATEST}"

    docker push "${WEB_IMAGE}"
    docker push "${WEB_IMAGE_LATEST}"

    info "✓ 前端镜像推送完成"
}

# 部署后端
deploy_backend() {
    step "部署后端 (使用显式 tag: ${IMAGE_TAG})..."

    BACKEND_IMAGE="${REGISTRY}/${REGISTRY_NAMESPACE}/${BACKEND_IMAGE_NAME}:${IMAGE_TAG}"

    # 使用 kubectl set image 强制更新
    kubectl set image deployment/chatfold-backend \
        backend="${BACKEND_IMAGE}" \
        -n "$NAMESPACE"

    info "等待后端部署完成..."
    kubectl rollout status deployment/chatfold-backend -n "$NAMESPACE" --timeout=300s

    info "✓ 后端部署完成"
}

# 部署前端
deploy_web() {
    step "部署前端 (使用显式 tag: ${IMAGE_TAG})..."

    WEB_IMAGE="${REGISTRY}/${REGISTRY_NAMESPACE}/${WEB_IMAGE_NAME}:${IMAGE_TAG}"

    kubectl set image deployment/chatfold-web \
        web="${WEB_IMAGE}" \
        -n "$NAMESPACE"

    info "等待前端部署完成..."
    kubectl rollout status deployment/chatfold-web -n "$NAMESPACE" --timeout=300s

    info "✓ 前端部署完成"
}

# 显示部署状态
show_status() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    step "部署状态"
    echo ""

    echo "镜像 Tag: ${IMAGE_TAG}"
    echo ""

    echo "当前运行的镜像:"
    kubectl get deployment -n "$NAMESPACE" -o jsonpath='{range .items[*]}  {.metadata.name}: {.spec.template.spec.containers[0].image}{"\n"}{end}'

    echo ""
    echo "Pods:"
    kubectl get pods -n "$NAMESPACE"

    # 从独立 controller 的 LoadBalancer Service 获取 IP
    INGRESS_IP=$(kubectl get svc -n ${NAMESPACE} \
        -l app.kubernetes.io/instance=chatfold-ingress \
        -o jsonpath='{.items[0].status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    info "部署完成！"
    echo ""
    if [ -n "$INGRESS_IP" ]; then
        echo "访问地址: http://${INGRESS_IP}/"
        echo "API 健康检查: http://${INGRESS_IP}/api/v1/health"
    fi
}

# 主流程
main() {
    echo ""
    info "=== ChatFold 火山云测试环境部署 ==="
    echo ""

    check_context
    check_docker
    check_deployment_exists

    if [[ "$SKIP_BUILD" == "false" ]]; then
        info "镜像 Tag: ${IMAGE_TAG}"
        echo ""

        if [[ "$DEPLOY_BACKEND" == "true" ]]; then
            build_backend
            push_backend
        fi

        if [[ "$DEPLOY_WEB" == "true" ]]; then
            build_web
            push_web
        fi
    else
        info "跳过构建，使用指定 Tag: ${IMAGE_TAG}"
    fi

    echo ""

    if [[ "$DEPLOY_BACKEND" == "true" ]]; then
        deploy_backend
    fi

    if [[ "$DEPLOY_WEB" == "true" ]]; then
        deploy_web
    fi

    show_status
}

main "$@"
