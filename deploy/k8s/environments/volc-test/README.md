# ChatFold 火山云测试环境部署指南

本目录包含 ChatFold 在火山云 Kubernetes 测试环境的部署配置。

## 目录结构

```
volc-test/
├── README.md                   # 本文档
├── init-deploy.sh              # 首次部署脚本 (创建 namespace、controller、secret、configmap 等)
├── deploy.sh                   # 统一部署脚本 (构建、推送、部署)
├── build-and-push-images.sh    # 镜像构建和推送脚本
├── deploy-backend.sh           # 单独部署后端脚本
├── deploy-web.sh               # 单独部署前端脚本
├── ingress-nginx.yaml          # 独立 ingress-nginx controller 的 Helm values
├── configmap.yaml              # ConfigMap 配置
├── secret.yaml.example         # Secret 配置模板 (需复制为 secret.yaml 并填入实际值)
├── backend-deployment.yaml     # 后端 Deployment 配置
├── backend-service.yaml        # 后端 Service 配置
├── web-deployment.yaml         # 前端 Deployment 配置
├── web-service.yaml            # 前端 Service 配置
└── ingress.yaml                # Ingress 配置 (使用独立 IngressClass: chatfold-nginx)
```

## 快速开始

### 前置条件

1. **kubectl**: 已配置连接到火山云 Kubernetes 集群
2. **Docker**: 已安装并运行，已登录到火山云镜像仓库
3. **helm**: 已安装（用于部署独立 ingress-nginx controller）
4. **镜像仓库访问权限**: `spx-cn-shanghai.cr.volces.com/chatfold`

### 首次部署

```bash
# 1. 准备 secret.yaml
cp secret.yaml.example secret.yaml
# 编辑 secret.yaml，填入实际的密钥值

# 2. 运行首次部署脚本
chmod +x init-deploy.sh
./init-deploy.sh
```

### 后续更新

```bash
# 更新所有组件 (后端 + 前端)
./deploy.sh

# 仅更新后端
./deploy.sh backend

# 仅更新前端
./deploy.sh web

# 使用指定的镜像 tag 部署 (不重新构建)
./deploy.sh --tag test-20241230-120000
```

## 脚本说明

### init-deploy.sh

首次部署脚本，执行以下操作:
- 创建 namespace `chatfold`
- 通过 Helm 安装独立 ingress-nginx controller（IngressClass: `chatfold-nginx`）
- 应用 ConfigMap 配置
- 应用 Secret 配置
- 部署后端和前端 Deployment/Service
- 配置 Ingress

### deploy.sh

统一部署脚本，用于代码更新后的部署:
- 构建 Docker 镜像
- 推送到火山云镜像仓库
- 更新 Kubernetes Deployment

### build-and-push-images.sh

仅构建和推送镜像，不执行部署:
- 适用于 CI/CD 流水线
- 支持自定义镜像 tag

## 配置说明

### ConfigMap (configmap.yaml)

非敏感配置项:
- `ENVIRONMENT`: 运行环境 (test)
- `API_BASE_URL`: 后端 API 内部地址
- `NEXT_PUBLIC_BACKEND_URL`: 前端访问后端的 URL

### Secret (secret.yaml)

敏感配置项 (base64 编码):
- `DATABASE_URL`: MySQL 连接字符串
- `REDIS_PASSWORD`: Redis 密码
- `NANOCC_AUTH_TOKEN`: NanoCC 认证 Token
- `TOS_ACCESS_KEY`: TOS 访问密钥
- `TOS_SECRET_KEY`: TOS 密钥

生成 base64 编码:
```bash
echo -n "your-value" | base64
```

### 镜像仓库

- 仓库地址: `spx-cn-shanghai.cr.volces.com`
- 命名空间: `chatfold`
- 镜像名称: `backend`, `web`
- Tag 格式: `test-YYYYMMDD-HHMMSS`

## 常用命令

```bash
# 查看 Pod 状态
kubectl get pods -n chatfold

# 查看后端日志
kubectl logs -f deployment/chatfold-backend -n chatfold

# 查看前端日志
kubectl logs -f deployment/chatfold-web -n chatfold

# 进入后端 Pod
kubectl exec -it deployment/chatfold-backend -n chatfold -- /bin/sh

# 查看 Ingress 状态
kubectl get ingress -n chatfold

# 重启部署
kubectl rollout restart deployment/chatfold-backend -n chatfold
kubectl rollout restart deployment/chatfold-web -n chatfold

# 查看独立 ingress-nginx controller 状态
kubectl get pods -n chatfold -l app.kubernetes.io/instance=chatfold-ingress
kubectl get svc -n chatfold -l app.kubernetes.io/instance=chatfold-ingress

# 查看 controller 日志
kubectl logs -f -n chatfold -l app.kubernetes.io/instance=chatfold-ingress

# 升级 controller
helm upgrade chatfold-ingress ingress-nginx/ingress-nginx \
    --namespace chatfold \
    --values ingress-nginx.yaml
```

## 访问地址

部署完成后，通过独立 ingress-nginx controller 的公网 IP 访问:
- Web 应用: `http://<INGRESS_IP>/`
- API 健康检查: `http://<INGRESS_IP>/api/v1/health`

获取 Ingress IP（从独立 controller 的 LoadBalancer Service）:
```bash
kubectl get svc -n chatfold -l app.kubernetes.io/instance=chatfold-ingress -o jsonpath='{.items[0].status.loadBalancer.ingress[0].ip}'
```

## 故障排除

### Pod 启动失败

```bash
# 查看 Pod 事件
kubectl describe pod -l app=chatfold-backend -n chatfold

# 查看容器日志
kubectl logs -l app=chatfold-backend -n chatfold --previous
```

### 镜像拉取失败

检查 imagePullSecrets 是否配置正确:
```bash
kubectl get secret cr-spx-cn-shanghai -n chatfold
```

### 健康检查失败

检查服务端口和健康检查路径是否正确:
- 后端: `GET /api/v1/health` on port 8000
- 前端: `GET /` on port 3000
