# Control Panel API

香港控制节点的轻量级管理 API，用于管理专线的生命周期。

## 功能

- ✅ 健康检查 (`GET /health`)
- ✅ 创建专线 (`POST /lines/create`)
- ✅ 查询状态 (`GET /lines/:lineId/status`)
- ✅ 删除专线 (`POST /lines/:lineId/delete`)

## 环境变量

```bash
PORT=8080                    # API 监听端口
NODE_ID=HK_VM_18545         # 节点标识
API_TOKEN=ctrl_xxx          # API 认证 token
DATABASE_URL=postgresql://  # 数据库连接
```

## 本地开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build

# 运行生产版本
pnpm start
```

## Zeabur 部署

每个控制节点需要部署独立的实例，使用不同的环境变量：

### HK_VM_18545
- `NODE_ID=HK_VM_18545`
- `API_TOKEN=ctrl_hk_vm18545_9f8e7d6c5b4a3210fedcba9876543210`

### HK_VM_18544
- `NODE_ID=HK_VM_18544`
- `API_TOKEN=ctrl_hk_vm18544_1a2b3c4d5e6f7890abcdef1234567890`

### HK_VM_18541
- `NODE_ID=HK_VM_18541`
- `API_TOKEN=ctrl_hk_vm18541_fedcba9876543210abcdef1234567890`

## API 文档

### GET /health
无需认证，返回节点健康状态。

```bash
curl http://localhost:8080/health
```

### POST /lines/create
创建新的专线。需要 Bearer token 认证。

```bash
curl -X POST http://localhost:8080/lines/create \
  -H "Authorization: Bearer ctrl_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "lineId": "line_123",
    "inboundConfig": {
      "protocol": "vless",
      "port": 10001
    },
    "exitProxyConfig": {
      "host": "us-proxy.example.com",
      "port": 1080,
      "username": "user",
      "password": "pass"
    }
  }'
```

### GET /lines/:lineId/status
查询专线状态。需要 Bearer token 认证。

```bash
curl http://localhost:8080/lines/line_123/status \
  -H "Authorization: Bearer ctrl_xxx"
```

### POST /lines/:lineId/delete
删除专线。需要 Bearer token 认证。

```bash
curl -X POST http://localhost:8080/lines/line_123/delete \
  -H "Authorization: Bearer ctrl_xxx"
```
