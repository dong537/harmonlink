# Zeabur 部署指南 - Railway 合并后版本

**生成时间**: 2026-08-20  
**分支**: `railway-fixes-merge`  
**目标**: 将 Railway 合并后的完整业务逻辑部署到 Zeabur

---

## 📊 当前状态分析

### Git 状态
- ✅ **当前分支**: `railway-fixes-merge`
- ✅ **最新提交**: 
  - `4f640ce` - Legacy API 代理服务
  - `5d6faba` - 冻结前端 API 兼容性
  - `c91702b` - 专线生产交付强化
- ✅ **远程仓库**: `railway-ref` (本地参考仓库)

### 项目结构
```
365/
├── apps/
│   ├── api/          ✅ 后端 API (NestJS)
│   │   ├── Dockerfile
│   │   └── railway.json
│   ├── web/          ✅ 前端 (Vue/Vite)
│   │   ├── Dockerfile
│   │   └── railway.json
│   └── worker/       ⚠️ 后台任务 Worker
├── packages/
│   ├── db/           ✅ Prisma Schema + 迁移
│   └── contracts/    ✅ API 类型定义
└── infra/
    └── legacy-api-proxy/  ✅ Legacy API 代理 (新增)
```

---

## 🎯 Zeabur 部署架构

### 推荐服务拆分

根据你的 Zeabur 项目链接 `6a786d80e4a69d66638d62e1`，建议部署以下服务：

```
┌─────────────────────────────────────────────────┐
│          Zeabur Project: IPEasy                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  Service 1: PostgreSQL (托管数据库)             │
│    └─ 环境: 6a786d805f062718bc7b8dfb           │
│                                                 │
│  Service 2: Redis (托管缓存)                    │
│    └─ Session + 任务队列                        │
│                                                 │
│  Service 3: ipeasy-api (后端)                   │
│    └─ apps/api/                                 │
│    └─ PORT: 8080                                │
│    └─ Dockerfile: apps/api/Dockerfile          │
│                                                 │
│  Service 4: ipeasy-web (前端)                   │
│    └─ apps/web/                                 │
│    └─ PORT: 4173                                │
│    └─ Dockerfile: apps/web/Dockerfile          │
│                                                 │
│  Service 5: ipeasy-worker (后台任务)            │
│    └─ apps/worker/                              │
│    └─ Dockerfile: apps/worker/Dockerfile       │
│                                                 │
│  Service 6: legacy-api-proxy (可选)             │
│    └─ infra/legacy-api-proxy/                   │
│    └─ Dockerfile: infra/legacy-api-proxy/Dockerfile │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## 🚀 部署步骤

### 阶段 1: 准备工作

#### 1.1 推送代码到 Git 仓库

```bash
# 当前在 railway-fixes-merge 分支

# 添加 Zeabur 使用的 Git 仓库（如果还没有）
git remote add origin <your-github-repo-url>

# 推送 railway-fixes-merge 分支
git push origin railway-fixes-merge

# 或者合并到 main 后推送
git checkout main
git merge railway-fixes-merge --no-ff -m "chore: merge Railway production fixes for Zeabur deployment"
git push origin main
```

#### 1.2 创建 Zeabur 专用 Dockerfile（可选）

如果 Zeabur 需要特殊配置，可以创建：

```dockerfile
# apps/api/Dockerfile.zeabur
FROM node:20-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ipeasy/db generate
RUN pnpm --filter @ipeasy/api... build

WORKDIR /app/apps/api

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Zeabur 特定：先运行迁移再启动
CMD ["sh", "-c", "pnpm --filter @ipeasy/db migrate:deploy && node dist/main"]
```

---

### 阶段 2: Zeabur 服务配置

#### 2.1 部署 PostgreSQL（托管数据库）

**在 Zeabur Dashboard**:
1. 点击 "Add Service" → "PostgreSQL"
2. 选择区域（建议与 API 同区域）
3. 记录生成的 `DATABASE_URL`

**示例**:
```
postgresql://username:password@hostname:5432/database
```

#### 2.2 部署 Redis（托管缓存）

**在 Zeabur Dashboard**:
1. 点击 "Add Service" → "Redis"
2. 选择同区域
3. 记录生成的 `REDIS_URL`

**示例**:
```
redis://default:password@hostname:6379
```

---

#### 2.3 部署后端 API (ipeasy-api)

**步骤**:

1. **创建服务**:
   - Service Name: `ipeasy-api`
   - Source: GitHub Repository
   - Branch: `main` 或 `railway-fixes-merge`
   - Root Directory: `/` (monorepo)
   - Build Command: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @ipeasy/db generate && pnpm --filter @ipeasy/api... build`
   - Start Command: `cd apps/api && node dist/main`
   - Port: `8080`

2. **Dockerfile 构建**（推荐）:
   - Dockerfile Path: `apps/api/Dockerfile`
   - Context: `/` (根目录)

3. **环境变量配置** (Environment Variables):

```bash
# ---------- Platform ----------
APP_PUBLIC_BRAND_NAME=IPEasy
APP_PUBLIC_SITE_URL=https://your-domain.zeabur.app
APP_PUBLIC_API_URL=https://api.your-domain.zeabur.app
APP_PUBLIC_SUPPORT_EMAIL=support@ipeasy.com
APP_PLATFORM_CURRENCY=CNY
APP_TIMEZONE=Asia/Shanghai
APP_ADMIN_BASE_PATH=/admin

# ---------- Deployment ----------
NODE_ENV=production
RELEASE_GIT_SHA=${ZEABUR_GIT_COMMIT_SHA}  # Zeabur 自动注入
PORT=8080
API_PUBLIC_URL=https://api.your-domain.zeabur.app
API_INTERNAL_URL=http://ipeasy-api:8080  # Zeabur 内网
CORS_ORIGINS=https://your-domain.zeabur.app
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX_REQUESTS=120
API_RATE_LIMIT_ORDER_MAX_REQUESTS=10
API_BODY_LIMIT_BYTES=1048576
OPENAPI_EXPOSURE_ENABLED=false

# ---------- Database / Security ----------
DATABASE_URL=${POSTGRES_CONNECTION_STRING}  # Zeabur PostgreSQL 自动注入
REDIS_URL=${REDIS_CONNECTION_STRING}       # Zeabur Redis 自动注入
APP_ENCRYPTION_KEY=<32-byte-base64-key>    # ⚠️ 必须手动生成

# ---------- JWT / Session ----------
JWT_SECRET=<your-jwt-secret>                # ⚠️ 必须手动生成
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
SESSION_TOKEN_BYTE_SIZE=32

# ---------- Legacy API Compatibility ----------
LEGACY_API_V1_ENABLED=true                  # 启用 Legacy API
LEGACY_API_SITE_ID=<your-site-id>           # ⚠️ 必须配置站点 ID

# ---------- Provider Accounts (供应商) ----------
PROVIDER_PLATFORM365_ENABLED=false
PROVIDER_PLATFORM365_BASE_URL=https://panel.365proxy.net
PROVIDER_PLATFORM365_API_KEY=<your-api-key>

PROVIDER_NINE_EIGHT_FIVE_ENABLED=false
# ... 其他供应商配置

# ---------- Bark Alert (告警) ----------
BARK_ENABLED=false
BARK_BASE_URL=https://api.day.app
BARK_DEVICE_KEY=<your-bark-key>

# ---------- Worker (后台任务) ----------
WORKER_ENABLED=true
WORKER_CONCURRENCY=5
WORKER_POLL_INTERVAL_MS=5000
```

4. **健康检查**:
   - Health Check Path: `/health`
   - Health Check Timeout: 100s

---

#### 2.4 部署前端 Web (ipeasy-web)

**步骤**:

1. **创建服务**:
   - Service Name: `ipeasy-web`
   - Source: 同一 GitHub Repository
   - Branch: `main` 或 `railway-fixes-merge`
   - Root Directory: `/`
   - Build Command: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @ipeasy/web build`
   - Start Command: `cd apps/web && pnpm preview --host 0.0.0.0 --port 4173`
   - Port: `4173`

2. **Dockerfile 构建**（推荐）:
   - Dockerfile Path: `apps/web/Dockerfile`
   - Context: `/`

3. **环境变量**:

```bash
NODE_ENV=production
WEB_PORT=4173
WEB_PUBLIC_URL=https://your-domain.zeabur.app
VITE_API_BASE_URL=/api
WEB_API_PROXY_TARGET=http://ipeasy-api:8080
```

---

#### 2.5 部署 Worker (ipeasy-worker)

**步骤**:

1. **创建 Dockerfile**（如果不存在）:

```dockerfile
# apps/worker/Dockerfile
FROM node:20-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ipeasy/db generate
RUN pnpm --filter @ipeasy/worker... build

WORKDIR /app/apps/worker

ENV NODE_ENV=production

CMD ["node", "dist/main"]
```

2. **创建服务**:
   - Service Name: `ipeasy-worker`
   - Dockerfile Path: `apps/worker/Dockerfile`
   - Context: `/`

3. **环境变量**:
   - 复用 API 的大部分环境变量
   - 特别注意：
     - `DATABASE_URL` (连接同一数据库)
     - `REDIS_URL` (连接同一 Redis)
     - `WORKER_ENABLED=true`
     - `WORKER_CONCURRENCY=5`

---

#### 2.6 部署 Legacy API Proxy（可选）

**仅当需要兼容旧域名时部署**

1. **创建 Dockerfile**:

```dockerfile
# infra/legacy-api-proxy/Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY infra/legacy-api-proxy/package.json .
COPY infra/legacy-api-proxy/server.mjs .

RUN npm install

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server.mjs"]
```

2. **环境变量**:

```bash
LEGACY_PROXY_TARGET=https://api.your-domain.zeabur.app
LEGACY_PROXY_OLD_HOST=backend-test-0dcb.up.railway.app
PORT=8080
```

---

### 阶段 3: 数据库迁移

#### 3.1 手动迁移（推荐）

**通过 Zeabur CLI 或 SSH 进入 API 容器**:

```bash
# 连接到 ipeasy-api 服务
zeabur exec ipeasy-api -- /bin/sh

# 运行迁移
cd /app
pnpm --filter @ipeasy/db migrate:deploy

# 验证迁移状态
pnpm --filter @ipeasy/db migrate:status
```

#### 3.2 自动迁移（集成到启动脚本）

**修改 `apps/api/Dockerfile`**:

```dockerfile
# ... 构建步骤 ...

CMD ["sh", "-c", "pnpm --filter @ipeasy/db migrate:deploy && node dist/main"]
```

⚠️ **注意**: 自动迁移在多实例部署时可能产生竞争条件，生产环境建议手动迁移。

---

### 阶段 4: 域名与网络

#### 4.1 配置自定义域名

**在 Zeabur Dashboard**:

1. **API 域名**:
   - Service: `ipeasy-api`
   - Domain: `api.your-domain.com`
   - 更新环境变量 `API_PUBLIC_URL`

2. **Web 域名**:
   - Service: `ipeasy-web`
   - Domain: `your-domain.com`
   - 更新环境变量 `WEB_PUBLIC_URL`

3. **Legacy Proxy 域名** (可选):
   - Service: `legacy-api-proxy`
   - Domain: `backend-test-0dcb.up.railway.app` (通过 CNAME 指向)

#### 4.2 CORS 配置

确保 API 的 `CORS_ORIGINS` 包含前端域名：

```bash
CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com
```

---

### 阶段 5: 验证与烟雾测试

#### 5.1 API 健康检查

```bash
# 公共健康检查
curl https://api.your-domain.zeabur.app/health

# 期望响应
{"status":"ok"}

# Legacy API 健康检查
curl https://api.your-domain.zeabur.app/api/v1/health

# 期望响应
{"status":"ok"}
```

#### 5.2 前端访问

```bash
# 访问前端
open https://your-domain.zeabur.app

# 检查 API 代理
curl https://your-domain.zeabur.app/api/health
```

#### 5.3 数据库连接

```bash
# 进入 API 容器
zeabur exec ipeasy-api -- /bin/sh

# 测试 Prisma 连接
cd /app
pnpm --filter @ipeasy/db studio
```

#### 5.4 关键业务流程测试

**测试清单**:
- [ ] 用户注册/登录
- [ ] 钱包余额查询
- [ ] SKU 列表查询
- [ ] 专线预览（价格计算）
- [ ] 专线购买（库存预留）
- [ ] Legacy API 兼容性（`/api/v1` 端点）

---

## 🔒 安全检查清单

### 必须手动生成的密钥

```bash
# 1. 生成 APP_ENCRYPTION_KEY (32 字节 base64)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 2. 生成 JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 3. 生成 SESSION_SECRET (如果需要)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 环境变量安全

⚠️ **禁止硬编码到代码中的敏感信息**:
- ❌ 数据库密码
- ❌ API 密钥（供应商）
- ❌ JWT Secret
- ❌ 加密密钥
- ❌ Bark 设备密钥

✅ **所有敏感信息必须通过 Zeabur 环境变量注入**。

---

## 📊 监控与日志

### Zeabur 内置监控

**在 Zeabur Dashboard 查看**:
- CPU/内存使用率
- 网络流量
- 日志输出（stdout/stderr）
- 重启次数

### 应用层日志

**推荐集成**:
- **Sentry** (错误追踪)
- **Logflare** (日志聚合)
- **Better Stack** (APM)

**配置示例**:

```bash
# 环境变量
SENTRY_DSN=<your-sentry-dsn>
SENTRY_ENVIRONMENT=production
LOG_LEVEL=info
```

---

## 🔄 持续部署流程

### 自动部署

**Zeabur 自动检测 Git 推送**:

```bash
# 开发流程
git checkout -b feature/new-feature
# ... 开发 ...
git commit -m "feat: add new feature"
git push origin feature/new-feature

# 合并到主分支
git checkout main
git merge feature/new-feature
git push origin main

# Zeabur 自动触发部署
```

### 手动部署

**在 Zeabur Dashboard**:
1. 选择服务（例如 `ipeasy-api`）
2. 点击 "Redeploy"
3. 选择分支/提交
4. 确认部署

---

## ⚠️ 常见问题与解决方案

### 问题 1: 数据库迁移失败

**症状**:
```
Error: P1001: Can't reach database server
```

**解决**:
1. 检查 `DATABASE_URL` 是否正确
2. 确认 PostgreSQL 服务在同一项目中
3. 检查网络配置（防火墙/安全组）

---

### 问题 2: Legacy API 返回 404

**症状**:
```
GET /api/v1/health → 404 NOT_FOUND
```

**解决**:
1. 检查 `LEGACY_API_V1_ENABLED=true`
2. 检查 `LEGACY_API_SITE_ID` 是否配置
3. 查看 API 日志确认模块是否加载

---

### 问题 3: 前端无法调用 API

**症状**:
```
CORS Error: Access-Control-Allow-Origin
```

**解决**:
1. 检查 API 的 `CORS_ORIGINS` 包含前端域名
2. 检查 Web 的 `VITE_API_BASE_URL` 配置
3. 确认 API Proxy 配置正确

---

### 问题 4: Worker 任务不执行

**症状**:
- ExternalJob 状态一直 `QUEUED`
- 专线订单卡在 `PENDING_PAYMENT`

**解决**:
1. 确认 Worker 服务正在运行
2. 检查 `WORKER_ENABLED=true`
3. 查看 Worker 日志确认是否报错
4. 检查 Redis 连接

---

## 📚 附录

### A. 环境变量完整清单

参考 `.env.example` 文件，所有环境变量说明：[`.env.example`](.env.example)

### B. Zeabur vs Railway 差异

| 特性 | Railway | Zeabur |
|------|---------|--------|
| 构建工具 | Nixpacks | Docker / Buildpacks |
| 环境变量 | 自动注入 | 自动注入 |
| 数据库 | PostgreSQL 托管 | PostgreSQL 托管 |
| Redis | Redis 托管 | Redis 托管 |
| 域名 | `*.railway.app` | `*.zeabur.app` |
| 区域 | 全球多区域 | 全球多区域 |
| 定价 | 按资源计费 | 按资源计费 |

### C. 参考链接

- **Zeabur 文档**: https://zeabur.com/docs
- **Prisma 迁移**: https://www.prisma.io/docs/concepts/components/prisma-migrate
- **NestJS 部署**: https://docs.nestjs.com/deployment
- **Vite 生产构建**: https://vitejs.dev/guide/build.html

---

## ✅ 部署完成检查清单

部署完成后，逐项确认：

### 基础设施
- [ ] PostgreSQL 服务运行正常
- [ ] Redis 服务运行正常
- [ ] 所有环境变量已配置

### 服务状态
- [ ] ipeasy-api 启动成功
- [ ] ipeasy-web 启动成功
- [ ] ipeasy-worker 启动成功
- [ ] legacy-api-proxy 启动成功（如果需要）

### 数据库
- [ ] 所有迁移已应用（`migrate:deploy`）
- [ ] 迁移状态检查通过（`migrate:status`）
- [ ] 初始数据已导入（如果需要）

### API 功能
- [ ] `/health` 返回 200
- [ ] `/api/v1/health` 返回 200 (Legacy API)
- [ ] 用户登录成功
- [ ] SKU 列表查询成功
- [ ] 专线预览成功

### 前端功能
- [ ] 首页加载正常
- [ ] 登录流程完整
- [ ] 专线购买流程完整
- [ ] API 代理工作正常

### 网络与域名
- [ ] 自定义域名解析正常
- [ ] HTTPS 证书有效
- [ ] CORS 配置正确

### 监控与日志
- [ ] 日志输出正常
- [ ] 错误追踪集成（如果需要）
- [ ] 性能监控正常

---

**部署指南版本**: v1.0  
**生成工具**: Claude Code (Opus 5)  
**更新日期**: 2026-08-20
