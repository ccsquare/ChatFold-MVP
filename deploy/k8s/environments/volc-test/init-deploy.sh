#!/bin/bash

# ChatFold 火山云测试环境 Kubernetes 首次部署脚本
# 用于创建 namespace、secret、configmap 等基础资源，并进行首次部署
#
# 注意：此脚本仅用于首次部署！
# 后续代码更新请使用: ./deploy.sh

set -e

# 前置断言：确保当前 kubectl 上下文是火山云集群
check_context() {
    CURRENT_CONTEXT=$(kubectl config current-context)

    # 允许的火山云集群上下文
    VOLC_CONTEXTS=("cluster-foldingix-test" "volc" "vke")

    IS_VOLC=false
    for ctx in "${VOLC_CONTEXTS[@]}"; do
        if [[ "$CURRENT_CONTEXT" == *"$ctx"* ]]; then
            IS_VOLC=true
            break
        fi
    done

    if [ "$IS_VOLC" = false ]; then
        echo -e "\033[1;33m[WARN]\033[0m 当前 kubectl 上下文可能不是火山云集群"
        echo -e "\033[1;33m[WARN]\033[0m 当前上下文: $CURRENT_CONTEXT"
        echo ""
        read -p "$(echo -e '\033[1;33m是否继续部署? [y/N]:\033[0m ')" -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "\033[0;32m[INFO]\033[0m 取消部署"
            exit 0
        fi
    fi

    echo -e "\033[0;32m[INFO]\033[0m 当前 kubectl 上下文: $CURRENT_CONTEXT"
    echo ""
}

# 执行上下文检查
check_context

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

step() {
    echo -e "${BLUE}==>${NC} $1"
}

# Namespace
NAMESPACE="chatfold"

# 部署配置文件目录
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"

# 检查 kubectl 是否可用
check_kubectl() {
    if ! command -v kubectl &>/dev/null; then
        error "kubectl 未安装，请先安装 kubectl"
        exit 1
    fi
    info "kubectl 已安装"
}

# 检查 Kubernetes 集群是否运行
check_cluster() {
    if ! kubectl cluster-info >/dev/null 2>&1; then
        error "无法连接到 Kubernetes 集群，请检查 kubeconfig 配置"
        exit 1
    fi
    info "Kubernetes 集群连接正常"

    # 显示当前集群信息
    CURRENT_CONTEXT=$(kubectl config current-context)
    info "当前集群: ${CURRENT_CONTEXT}"

    # 确认是否继续
    echo ""
    warn "即将部署到火山云测试环境，请确认集群配置正确"
    read -p "$(echo -e ${YELLOW}是否继续部署? [Y/n]:${NC})" -n 1 -r
    echo
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        info "取消部署"
        exit 0
    fi
}

# 检查 secret.yaml 是否存在
check_secret_file() {
    step "检查密钥文件"

    if [ ! -f "$DEPLOY_DIR/secret.yaml" ]; then
        error "secret.yaml 文件不存在"
        echo ""
        echo "请创建 secret.yaml 文件并填入实际的密钥"
        echo "可参考 secret.yaml.example 模板"
        exit 1
    fi

    info "✓ secret.yaml 文件存在"
}

# 创建 Namespace
deploy_namespace() {
    step "创建 Namespace: ${NAMESPACE}"
    kubectl create namespace ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -
    info "✓ Namespace ${NAMESPACE} 已创建"
}

# 安装独立 ingress-nginx controller
deploy_ingress_controller() {
    step "安装独立 ingress-nginx controller"

    if ! command -v helm &>/dev/null; then
        error "helm 未安装，请先安装 helm"
        exit 1
    fi

    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx 2>/dev/null || true
    helm repo update

    helm upgrade --install chatfold-ingress ingress-nginx/ingress-nginx \
        --namespace ${NAMESPACE} \
        --values "$DEPLOY_DIR/ingress-nginx.yaml" \
        --wait --timeout 300s

    kubectl wait --for=condition=ready pod \
        -l app.kubernetes.io/name=ingress-nginx,app.kubernetes.io/instance=chatfold-ingress \
        -n ${NAMESPACE} --timeout=120s

    info "✓ 独立 ingress-nginx controller 已部署"
}

# 部署 ConfigMap
deploy_configmap() {
    step "部署 ConfigMap"
    kubectl apply -f "$DEPLOY_DIR/configmap.yaml"
    info "✓ ConfigMap 配置已应用"
}

# 部署 Secret
deploy_secret() {
    step "部署 Secret"
    kubectl apply -f "$DEPLOY_DIR/secret.yaml"
    info "✓ Secret 配置已应用"
}

# 部署后端
deploy_backend() {
    step "部署后端服务"
    kubectl apply -f "$DEPLOY_DIR/backend-deployment.yaml"
    kubectl apply -f "$DEPLOY_DIR/backend-service.yaml"
    info "✓ 后端服务已部署"
}

# 部署前端
deploy_web() {
    step "部署前端服务"
    kubectl apply -f "$DEPLOY_DIR/web-deployment.yaml"
    kubectl apply -f "$DEPLOY_DIR/web-service.yaml"
    info "✓ 前端服务已部署"
}

# 部署 Ingress
deploy_ingress() {
    step "部署 Ingress"
    kubectl apply -f "$DEPLOY_DIR/ingress.yaml"
    info "✓ Ingress 配置已应用"
}

# 等待 Pod 就绪
wait_for_pods() {
    step "等待 Pod 就绪..."

    echo "等待后端 Pod..."
    kubectl wait --for=condition=ready pod \
        -l app=chatfold-backend \
        -n ${NAMESPACE} \
        --timeout=300s || {
        warn "后端 Pod 未在 5 分钟内就绪，请检查日志"
        kubectl get pods -n ${NAMESPACE} -l app=chatfold-backend
        kubectl describe pods -n ${NAMESPACE} -l app=chatfold-backend | tail -30
    }

    echo "等待前端 Pod..."
    kubectl wait --for=condition=ready pod \
        -l app=chatfold-web \
        -n ${NAMESPACE} \
        --timeout=300s || {
        warn "前端 Pod 未在 5 分钟内就绪，请检查日志"
        kubectl get pods -n ${NAMESPACE} -l app=chatfold-web
        kubectl describe pods -n ${NAMESPACE} -l app=chatfold-web | tail -30
    }

    info "✓ Pod 部署完成"
}

# 显示部署状态
show_status() {
    step "部署状态"

    echo ""
    echo "Namespace:"
    kubectl get namespace ${NAMESPACE}

    echo ""
    echo "Pods:"
    kubectl get pods -n ${NAMESPACE} -o wide

    echo ""
    echo "Services:"
    kubectl get svc -n ${NAMESPACE}

    echo ""
    echo "Ingress:"
    kubectl get ingress -n ${NAMESPACE}

    # 从独立 controller 的 LoadBalancer Service 获取 IP
    INGRESS_IP=$(kubectl get svc -n ${NAMESPACE} \
        -l app.kubernetes.io/instance=chatfold-ingress \
        -o jsonpath='{.items[0].status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")

    echo ""
    info "=== 访问地址 ==="
    echo ""
    if [ -n "$INGRESS_IP" ]; then
        echo "Web 应用: http://${INGRESS_IP}/"
        echo "API 健康检查: http://${INGRESS_IP}/api/v1/health"
    else
        warn "Ingress IP 尚未分配，请稍后检查:"
        echo "  kubectl get ingress -n ${NAMESPACE}"
    fi

    echo ""
    info "=== 常用命令 ==="
    echo "查看 Pod 状态:"
    echo "  kubectl get pods -n ${NAMESPACE}"
    echo ""
    echo "查看后端日志:"
    echo "  kubectl logs -f deployment/chatfold-backend -n ${NAMESPACE}"
    echo ""
    echo "查看前端日志:"
    echo "  kubectl logs -f deployment/chatfold-web -n ${NAMESPACE}"
    echo ""
    echo "更新部署（代码改动后）:"
    echo "  ./deploy.sh           # 构建、推送并部署所有组件"
    echo "  ./deploy.sh backend   # 仅更新后端"
    echo "  ./deploy.sh web       # 仅更新前端"
}

# 主流程
main() {
    info "=== ChatFold 火山云测试环境 Kubernetes 部署 ==="

    check_kubectl
    check_cluster
    check_secret_file

    deploy_namespace
    deploy_ingress_controller
    deploy_configmap
    deploy_secret
    deploy_backend
    deploy_web
    deploy_ingress

    wait_for_pods
    show_status

    info "=== 部署完成 ==="
}

main "$@"
