#!/bin/bash

# ChatFold 测试环境镜像构建和推送脚本
# 用于构建 Docker 镜像并推送到火山云容器镜像仓库
#
# 用法:
#   ./build-and-push-images.sh              # 构建并推送所有镜像
#   ./build-and-push-images.sh backend      # 仅构建并推送后端
#   ./build-and-push-images.sh web          # 仅构建并推送前端

set -e

# 火山云容器镜像仓库地址
REGISTRY=${REGISTRY:=spx-cn-shanghai.cr.volces.com}
REGISTRY_NAMESPACE=${REGISTRY_NAMESPACE:=chatfold}
IMAGE_TAG=${IMAGE_TAG:=test-$(date +%Y%m%d-%H%M%S)}

# 构建配置
NODE_ENV=${NODE_ENV:=test}
BACKEND_VERSION=${BACKEND_VERSION:=1.0.0}
WEB_VERSION=${WEB_VERSION:=1.0.0}

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 打印信息
info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 获取项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

# 解析参数
BUILD_BACKEND=true
BUILD_WEB=true

while [[ $# -gt 0 ]]; do
    case $1 in
        backend)
            BUILD_WEB=false
            shift
            ;;
        web)
            BUILD_BACKEND=false
            shift
            ;;
        -h|--help)
            echo "用法: ./build-and-push-images.sh [组件]"
            echo ""
            echo "组件:"
            echo "  backend     仅构建并推送后端镜像"
            echo "  web         仅构建并推送前端镜像"
            echo "  (默认)      构建并推送所有镜像"
            echo ""
            echo "环境变量:"
            echo "  REGISTRY              镜像仓库地址 (默认: spx-cn-shanghai.cr.volces.com)"
            echo "  REGISTRY_NAMESPACE    镜像命名空间 (默认: chatfold)"
            echo "  IMAGE_TAG             镜像标签 (默认: test-YYYYMMDD-HHMMSS)"
            echo "  NODE_ENV              前端构建环境 (默认: test)"
            exit 0
            ;;
        *)
            shift
            ;;
    esac
done

# 检查 Docker 是否运行
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        error "Docker 未运行，请启动 Docker"
        exit 1
    fi
    info "Docker 运行正常"
}

# 登录到容器镜像仓库
docker_login() {
    info "登录到容器镜像仓库: $REGISTRY"

    # TODO: 根据实际情况配置登录方式
    # 方式1: 使用环境变量
    # echo "${REGISTRY_PASSWORD}" | docker login ${REGISTRY} -u ${REGISTRY_USERNAME} --password-stdin

    # 方式2: 使用 docker login 交互式登录
    # docker login ${REGISTRY}

    # 方式3: 火山云 CLI 登录（如果已安装）
    # volcengine acr login --region cn-shanghai

    warn "请确保已登录到容器镜像仓库: docker login ${REGISTRY}"
}

# 构建并推送后端镜像
build_and_push_backend() {
    info "开始构建后端镜像..."
    cd "$PROJECT_ROOT/backend"

    BACKEND_IMAGE="${REGISTRY}/${REGISTRY_NAMESPACE}/backend:${IMAGE_TAG}"
    BACKEND_IMAGE_LATEST="${REGISTRY}/${REGISTRY_NAMESPACE}/backend:test-latest"

    # 构建 backend 镜像，传入 OCI metadata 参数
    if docker build \
        -t "${BACKEND_IMAGE}" \
        -t "${BACKEND_IMAGE_LATEST}" \
        -f "$PROJECT_ROOT/deploy/docker/Dockerfile.backend" \
        --build-arg GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown") \
        --build-arg GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown") \
        --build-arg BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
        --build-arg VERSION=${BACKEND_VERSION} \
        .; then
        info "后端镜像构建成功: ${BACKEND_IMAGE}"
    else
        error "后端镜像构建失败"
        exit 1
    fi

    info "推送后端镜像..."
    docker push "${BACKEND_IMAGE}"
    docker push "${BACKEND_IMAGE_LATEST}"
    info "后端镜像推送成功"
}

# 构建并推送前端镜像
build_and_push_web() {
    info "开始构建前端镜像..."
    cd "$PROJECT_ROOT/web"

    WEB_IMAGE="${REGISTRY}/${REGISTRY_NAMESPACE}/web:${IMAGE_TAG}"
    WEB_IMAGE_LATEST="${REGISTRY}/${REGISTRY_NAMESPACE}/web:test-latest"

    # 构建 web 镜像，传入 OCI metadata 参数
    if docker build \
        -t "${WEB_IMAGE}" \
        -t "${WEB_IMAGE_LATEST}" \
        -f "$PROJECT_ROOT/deploy/docker/Dockerfile.web" \
        --build-arg NODE_ENV=${NODE_ENV} \
        --build-arg GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown") \
        --build-arg GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown") \
        --build-arg BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
        --build-arg VERSION=${WEB_VERSION} \
        .; then
        info "前端镜像构建成功: ${WEB_IMAGE}"
    else
        error "前端镜像构建失败"
        exit 1
    fi

    info "推送前端镜像..."
    docker push "${WEB_IMAGE}"
    docker push "${WEB_IMAGE_LATEST}"
    info "前端镜像推送成功"
}

# 显示镜像信息
show_images() {
    info "=== 镜像信息 ==="
    if [[ "$BUILD_BACKEND" == "true" ]]; then
        echo "后端镜像:"
        echo "  ${REGISTRY}/${REGISTRY_NAMESPACE}/backend:${IMAGE_TAG}"
        echo "  ${REGISTRY}/${REGISTRY_NAMESPACE}/backend:test-latest"
    fi
    if [[ "$BUILD_WEB" == "true" ]]; then
        echo ""
        echo "前端镜像:"
        echo "  ${REGISTRY}/${REGISTRY_NAMESPACE}/web:${IMAGE_TAG}"
        echo "  ${REGISTRY}/${REGISTRY_NAMESPACE}/web:test-latest"
    fi
}

# 主流程
main() {
    info "=== ChatFold 测试环境镜像构建和推送 ==="
    info "镜像仓库: ${REGISTRY}"
    info "命名空间: ${REGISTRY_NAMESPACE}"
    info "镜像标签: ${IMAGE_TAG}"
    echo ""

    check_docker
    docker_login

    if [[ "$BUILD_BACKEND" == "true" ]]; then
        build_and_push_backend
    fi

    if [[ "$BUILD_WEB" == "true" ]]; then
        build_and_push_web
    fi

    echo ""
    show_images

    info "=== 构建和推送完成 ==="
    info "下一步: 运行 ./deploy.sh --tag ${IMAGE_TAG} 部署到测试环境 Kubernetes"
}

main "$@"
