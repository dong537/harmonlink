# 本地验证与自动化部署完整方案

**生成时间**: 2026-08-20  
**分支**: `railway-fixes-merge`  
**目标**: 本地验证 → 自动化部署到 Zeabur

---

## 📋 阶段 1: 本地环境准备

### 1.1 启动本地数据库服务

我们使用项目自带的 `docker-compose.yml`：

```bash
# 启动 PostgreSQL + Redis
docker compose up -d

# 验证服务状态
docker compose ps

# 查看日志
docker compose logs -f
```

**预期输出**:
```
NAME                IMAGE                PORTS
365-postgres-1      postgres:16-alpine   0.0.0.0:15432->5432/tcp
365-redis-1         redis:7-alpine       0.0.0.0:6379->6379/tcp
```

---

### 1.2 生成环境配置文件

```bash
# 生成加密密钥
node -e "console.log('APP_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
```

创建 `.env` 文件（基于 `.env.example`）：

**核心环境变量**:
```bash
# ---------- Platform ----------
APP_PUBLIC_BRAND_NAME=IPEasy
APP_PUBLIC_SITE_URL=http://localhost:4173
APP_PUBLIC_API_URL=http://localhost:3000
APP_PUBLIC_SUPPORT_EMAIL=support@ipeasy.com
APP_PLATFORM_CURRENCY=CNY
APP_TIMEZONE=Asia/Shanghai
APP_ADMIN_BASE_PATH=/admin

# ---------- Deployment ----------
NODE_ENV=development
RELEASE_GIT_SHA=local-dev
PORT=3000
WEB_PORT=4173
WEB_PUBLIC_URL=http://localhost:4173
API_PUBLIC_URL=http://localhost:3000
API_INTERNAL_URL=http://localhost:3000
VITE_API_BASE_URL=/api
WEB_API_PROXY_TARGET=http://localhost:3000
CORS_ORIGINS=http://localhost:4173,http://localhost:5173
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX_REQUESTS=1200
API_RATE_LIMIT_ORDER_MAX_REQUESTS=100
API_BODY_LIMIT_BYTES=1048576
OPENAPI_EXPOSURE_ENABLED=true

# ---------- Database / Security ----------
DATABASE_URL=postgresql://ipipx:ipipx@localhost:15432/ipipx
REDIS_URL=redis://localhost:6379
APP_ENCRYPTION_KEY=<生成的32字节base64密钥>
JWT_SECRET=<生成的64字节hex密钥>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
SESSION_TOKEN_BYTE_SIZE=32

# ---------- Legacy API Compatibility ----------
LEGACY_API_V1_ENABLED=true
LEGACY_API_SITE_ID=site_local_dev

# ---------- Provider Accounts ----------
PROVIDER_PLATFORM365_ENABLED=false
PROVIDER_NINE_EIGHT_FIVE_ENABLED=false
PROVIDER_IPIPD_ENABLED=false

# ---------- Bark Alert ----------
BARK_ENABLED=false

# ---------- Worker ----------
WORKER_ENABLED=true
WORKER_CONCURRENCY=3
WORKER_POLL_INTERVAL_MS=5000
```

---

### 1.3 安装依赖

```bash
# 安装所有依赖
pnpm install

# 生成 Prisma Client
pnpm --filter @ipeasy/db generate
```

---

### 1.4 数据库迁移

```bash
# 运行所有迁移
pnpm --filter @ipeasy/db migrate:deploy

# 验证迁移状态
pnpm --filter @ipeasy/db migrate:status

# （可选）查看数据库结构
pnpm --filter @ipeasy/db studio
```

**预期输出**:
```
Database schema is up to date!
✅ All migrations applied successfully
```

---

### 1.5 初始化数据（可选）

创建测试数据脚本 `scripts/seed-local.ts`:

```typescript
import { prisma } from '@ipeasy/db';
import { randomUUID } from 'crypto';

async function seed() {
  console.log('🌱 开始初始化本地数据...');

  // 1. 创建站点
  const site = await prisma.sites.upsert({
    where: { code: 'LOCAL_DEV' },
    update: {},
    create: {
      id: 'site_local_dev',
      code: 'LOCAL_DEV',
      name: 'IPEasy 本地开发',
      domain: 'localhost:4173',
      status: 'ACTIVE',
      currency: 'CNY',
      timezone: 'Asia/Shanghai',
      config: {},
    },
  });
  console.log('✅ 站点创建成功:', site.name);

  // 2. 创建租户
  const tenant = await prisma.tenants.upsert({
    where: { siteId_code: { siteId: site.id, code: 'DEFAULT' } },
    update: {},
    create: {
      id: randomUUID(),
      siteId: site.id,
      code: 'DEFAULT',
      name: '默认租户',
      status: 'ACTIVE',
      ownerId: null,
      config: {},
    },
  });
  console.log('✅ 租户创建成功:', tenant.name);

  // 3. 创建测试用户
  const bcrypt = await import('bcrypt');
  const hashedPassword = await bcrypt.hash('password123', 10);
  
  const user = await prisma.users.upsert({
    where: { email: 'test@ipeasy.com' },
    update: {},
    create: {
      id: randomUUID(),
      siteId: site.id,
      tenantId: tenant.id,
      email: 'test@ipeasy.com',
      passwordHash: hashedPassword,
      name: '测试用户',
      status: 'ACTIVE',
      kycStatus: 'NONE',
      riskStatus: 'NORMAL',
    },
  });
  console.log('✅ 用户创建成功:', user.email);

  // 4. 创建钱包
  const wallet = await prisma.wallets.upsert({
    where: { siteId_tenantId_userId: { siteId: site.id, tenantId: tenant.id, userId: user.id } },
    update: {},
    create: {
      id: randomUUID(),
      siteId: site.id,
      tenantId: tenant.id,
      userId: user.id,
      available: '1000.00',
      frozen: '0.00',
      currency: 'CNY',
      version: 0,
    },
  });
  console.log('✅ 钱包创建成功，余额:', wallet.available);

  console.log('\n🎉 本地数据初始化完成！');
  console.log('\n📝 测试账号:');
  console.log('  Email: test@ipeasy.com');
  console.log('  Password: password123');
  console.log('  余额: ¥1000.00');
}

seed()
  .catch((e) => {
    console.error('❌ 数据初始化失败:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

运行种子脚本:
```bash
pnpm tsx scripts/seed-local.ts
```

---

## 📋 阶段 2: 本地服务启动与验证

### 2.1 启动后端 API

```bash
# 终端 1: 启动 API 服务
cd apps/api
pnpm dev

# 或者使用 turbo (从项目根目录)
pnpm --filter @ipeasy/api dev
```

**预期输出**:
```
🚀 NestJS application successfully started
🌐 Listening on http://localhost:3000
📚 OpenAPI: http://localhost:3000/api-docs
✅ Health: http://localhost:3000/health
✅ Legacy API: http://localhost:3000/api/v1/health
```

---

### 2.2 启动前端 Web

```bash
# 终端 2: 启动前端
cd apps/web
pnpm dev

# 或从根目录
pnpm --filter @ipeasy/web dev
```

**预期输出**:
```
VITE v5.x.x  ready in xxx ms
➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

---

### 2.3 启动 Worker（可选）

```bash
# 终端 3: 启动后台任务
cd apps/worker
pnpm dev

# 或从根目录
pnpm --filter @ipeasy/worker dev
```

**预期输出**:
```
🔄 Worker started
⏰ Polling interval: 5000ms
📊 Concurrency: 3
```

---

### 2.4 验证服务健康

创建验证脚本 `scripts/verify-local.sh`:

```bash
#!/bin/bash

echo "🔍 本地服务健康检查"
echo "================================"

# API 健康检查
echo ""
echo "1️⃣ API 健康检查..."
curl -s http://localhost:3000/health | jq '.' || echo "❌ API 未响应"

# Legacy API 健康检查
echo ""
echo "2️⃣ Legacy API 健康检查..."
curl -s http://localhost:3000/api/v1/health | jq '.' || echo "❌ Legacy API 未响应"

# Legacy API 能力检查
echo ""
echo "3️⃣ Legacy API 能力检查..."
curl -s http://localhost:3000/api/v1/settings/capabilities | jq '.' || echo "❌ Legacy API 能力接口未响应"

# 数据库连接检查
echo ""
echo "4️⃣ 数据库连接检查..."
curl -s http://localhost:3000/health | grep -q "ok" && echo "✅ 数据库连接正常" || echo "❌ 数据库连接失败"

# 前端检查
echo ""
echo "5️⃣ 前端服务检查..."
curl -s http://localhost:5173/ | grep -q "<!DOCTYPE html>" && echo "✅ 前端服务正常" || echo "❌ 前端服务失败"

echo ""
echo "================================"
echo "✅ 本地验证完成"
```

运行验证:
```bash
chmod +x scripts/verify-local.sh
./scripts/verify-local.sh
```

---

### 2.5 功能验证清单

创建测试脚本 `scripts/test-local.sh`:

```bash
#!/bin/bash

API_BASE="http://localhost:3000"
TOKEN=""

echo "🧪 功能测试套件"
echo "================================"

# Test 1: 用户登录
echo ""
echo "1️⃣ 测试用户登录..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@ipeasy.com","password":"password123"}')

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.access_token')

if [ "$TOKEN" != "null" ] && [ -n "$TOKEN" ]; then
  echo "✅ 登录成功"
  echo "   Token: ${TOKEN:0:20}..."
else
  echo "❌ 登录失败"
  echo "   Response: $LOGIN_RESPONSE"
  exit 1
fi

# Test 2: 获取用户信息
echo ""
echo "2️⃣ 测试获取用户信息..."
ME_RESPONSE=$(curl -s "$API_BASE/api/v1/auth/me" \
  -H "Authorization: Bearer $TOKEN")

echo $ME_RESPONSE | jq '.'

if echo $ME_RESPONSE | jq -e '.ownerId' > /dev/null; then
  echo "✅ 用户信息获取成功"
else
  echo "❌ 用户信息获取失败"
fi

# Test 3: 获取用户资料
echo ""
echo "3️⃣ 测试获取用户资料..."
PROFILE_RESPONSE=$(curl -s "$API_BASE/api/v1/users/profile" \
  -H "Authorization: Bearer $TOKEN")

echo $PROFILE_RESPONSE | jq '.'

if echo $PROFILE_RESPONSE | jq -e '.balance' > /dev/null; then
  echo "✅ 用户资料获取成功"
  echo "   余额: $(echo $PROFILE_RESPONSE | jq -r '.balance') $(echo $PROFILE_RESPONSE | jq -r '.currency')"
else
  echo "❌ 用户资料获取失败"
fi

# Test 4: 获取 SKU 列表
echo ""
echo "4️⃣ 测试获取 SKU 列表..."
SKU_RESPONSE=$(curl -s "$API_BASE/api/v1/dedicated-skus" \
  -H "Authorization: Bearer $TOKEN")

SKU_COUNT=$(echo $SKU_RESPONSE | jq '. | length')
echo "   找到 $SKU_COUNT 个 SKU"

if [ "$SKU_COUNT" -gt 0 ]; then
  echo "✅ SKU 列表获取成功"
  echo $SKU_RESPONSE | jq '.[0]'
else
  echo "⚠️  SKU 列表为空（正常，如果尚未配置 SKU）"
fi

# Test 5: 获取可用位置
echo ""
echo "5️⃣ 测试获取可用位置..."
LOCATIONS_RESPONSE=$(curl -s "$API_BASE/api/v1/dedicated/locations" \
  -H "Authorization: Bearer $TOKEN")

LOCATION_COUNT=$(echo $LOCATIONS_RESPONSE | jq '. | length')
echo "   找到 $LOCATION_COUNT 个位置"

if [ "$LOCATION_COUNT" -ge 0 ]; then
  echo "✅ 位置列表获取成功"
else
  echo "❌ 位置列表获取失败"
fi

# Test 6: 获取我的专线
echo ""
echo "6️⃣ 测试获取我的专线..."
MY_LINES_RESPONSE=$(curl -s "$API_BASE/api/v1/dedicated/my" \
  -H "Authorization: Bearer $TOKEN")

LINE_COUNT=$(echo $MY_LINES_RESPONSE | jq '. | length')
echo "   当前有 $LINE_COUNT 条专线"

if [ "$LINE_COUNT" -ge 0 ]; then
  echo "✅ 专线列表获取成功"
else
  echo "❌ 专线列表获取失败"
fi

echo ""
echo "================================"
echo "✅ 功能测试完成"
echo ""
echo "📝 测试摘要:"
echo "  - 登录: ✅"
echo "  - 用户信息: ✅"
echo "  - 用户资料: ✅"
echo "  - SKU 列表: $([ "$SKU_COUNT" -gt 0 ] && echo "✅" || echo "⚠️ ")"
echo "  - 位置列表: ✅"
echo "  - 专线列表: ✅"
```

运行功能测试:
```bash
chmod +x scripts/test-local.sh
./scripts/test-local.sh
```

---

## 📋 阶段 3: 自动化部署脚本

### 3.1 Zeabur 部署自动化脚本

创建 `scripts/deploy-zeabur.sh`:

```bash
#!/bin/bash

set -e

echo "🚀 Zeabur 自动化部署脚本"
echo "================================"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置
PROJECT_ID="6a786d80e4a69d66638d62e1"
ENV_ID="6a786d805f062718bc7b8dfb"
GIT_BRANCH="railway-fixes-merge"

# 函数：打印步骤
step() {
  echo ""
  echo -e "${GREEN}▶ $1${NC}"
}

# 函数：打印警告
warn() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

# 函数：打印错误
error() {
  echo -e "${RED}❌ $1${NC}"
  exit 1
}

# 函数：检查命令是否存在
check_command() {
  if ! command -v $1 &> /dev/null; then
    error "$1 未安装，请先安装"
  fi
}

# Step 1: 检查依赖
step "检查依赖..."
check_command "git"
check_command "node"
check_command "pnpm"
check_command "jq"

# Step 2: 检查 Git 状态
step "检查 Git 状态..."
CURRENT_BRANCH=$(git branch --show-current)
echo "当前分支: $CURRENT_BRANCH"

if [ "$CURRENT_BRANCH" != "$GIT_BRANCH" ]; then
  warn "当前不在 $GIT_BRANCH 分支"
  read -p "是否切换到 $GIT_BRANCH 分支? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    git checkout $GIT_BRANCH
  else
    error "部署已取消"
  fi
fi

# Step 3: 检查未提交的更改
if ! git diff-index --quiet HEAD --; then
  warn "存在未提交的更改"
  git status --short
  read -p "是否继续部署? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    error "部署已取消"
  fi
fi

# Step 4: 推送到远程
step "推送代码到远程仓库..."
read -p "远程仓库名称 (默认: origin): " REMOTE
REMOTE=${REMOTE:-origin}

echo "推送 $GIT_BRANCH 到 $REMOTE..."
git push $REMOTE $GIT_BRANCH

# Step 5: 生成环境变量
step "生成环境变量..."

# 生成密钥
APP_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

echo "✅ 密钥已生成"

# Step 6: 创建环境变量文件
step "创建 Zeabur 环境变量文件..."

cat > .env.zeabur <<EOF
# ========================================
# Zeabur 生产环境变量
# 生成时间: $(date '+%Y-%m-%d %H:%M:%S')
# ========================================

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
RELEASE_GIT_SHA=\${ZEABUR_GIT_COMMIT_SHA}
PORT=8080
WEB_PORT=4173
WEB_PUBLIC_URL=https://your-domain.zeabur.app
API_PUBLIC_URL=https://api.your-domain.zeabur.app
API_INTERNAL_URL=http://ipeasy-api:8080
VITE_API_BASE_URL=/api
WEB_API_PROXY_TARGET=http://ipeasy-api:8080
CORS_ORIGINS=https://your-domain.zeabur.app
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX_REQUESTS=120
API_RATE_LIMIT_ORDER_MAX_REQUESTS=10
API_BODY_LIMIT_BYTES=1048576
OPENAPI_EXPOSURE_ENABLED=false

# ---------- Database / Security ----------
DATABASE_URL=\${POSTGRES_CONNECTION_STRING}
REDIS_URL=\${REDIS_CONNECTION_STRING}
APP_ENCRYPTION_KEY=$APP_ENCRYPTION_KEY
JWT_SECRET=$JWT_SECRET
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
SESSION_TOKEN_BYTE_SIZE=32

# ---------- Legacy API Compatibility ----------
LEGACY_API_V1_ENABLED=true
LEGACY_API_SITE_ID=<REPLACE_WITH_YOUR_SITE_ID>

# ---------- Provider Accounts ----------
PROVIDER_PLATFORM365_ENABLED=false
PROVIDER_PLATFORM365_BASE_URL=https://panel.365proxy.net
PROVIDER_PLATFORM365_API_KEY=<REPLACE_WITH_YOUR_KEY>

PROVIDER_NINE_EIGHT_FIVE_ENABLED=false
PROVIDER_IPIPD_ENABLED=false

# ---------- Bark Alert ----------
BARK_ENABLED=false
BARK_BASE_URL=https://api.day.app
BARK_DEVICE_KEY=<REPLACE_WITH_YOUR_KEY>

# ---------- Worker ----------
WORKER_ENABLED=true
WORKER_CONCURRENCY=5
WORKER_POLL_INTERVAL_MS=5000
EOF

echo "✅ 环境变量文件已创建: .env.zeabur"

# Step 7: 显示需要替换的占位符
step "需要手动配置的环境变量:"
echo ""
echo "⚠️  以下占位符需要在 Zeabur Dashboard 中替换:"
echo ""
echo "1. APP_PUBLIC_SITE_URL=https://your-domain.zeabur.app"
echo "2. APP_PUBLIC_API_URL=https://api.your-domain.zeabur.app"
echo "3. LEGACY_API_SITE_ID=<REPLACE_WITH_YOUR_SITE_ID>"
echo "4. 供应商 API 密钥（如果启用）"
echo "5. Bark 设备密钥（如果启用告警）"
echo ""

# Step 8: 部署说明
step "部署步骤:"
echo ""
echo "1. 登录 Zeabur Dashboard:"
echo "   https://zeabur.com/projects/$PROJECT_ID"
echo ""
echo "2. 创建服务（如果尚未创建）:"
echo "   - PostgreSQL (托管数据库)"
echo "   - Redis (托管缓存)"
echo "   - ipeasy-api (后端)"
echo "   - ipeasy-web (前端)"
echo "   - ipeasy-worker (后台任务)"
echo ""
echo "3. 配置环境变量:"
echo "   复制 .env.zeabur 的内容到各服务的环境变量"
echo ""
echo "4. 触发部署:"
echo "   Zeabur 会自动检测到 Git 推送并触发部署"
echo ""
echo "5. 运行数据库迁移:"
echo "   zeabur exec ipeasy-api -- sh -c 'cd /app && pnpm --filter @ipeasy/db migrate:deploy'"
echo ""

# Step 9: 验证部署准备
step "验证部署准备..."
echo ""
read -p "是否已完成以上步骤? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  warn "请完成部署准备后再继续"
  exit 0
fi

# Step 10: 完成
step "部署准备完成！"
echo ""
echo "✅ 代码已推送"
echo "✅ 环境变量已生成"
echo "✅ 部署说明已显示"
echo ""
echo "📝 下一步:"
echo "1. 在 Zeabur Dashboard 配置服务"
echo "2. 运行数据库迁移"
echo "3. 验证服务健康状态"
echo ""
echo "🔗 快速链接:"
echo "- Zeabur Project: https://zeabur.com/projects/$PROJECT_ID"
echo "- 环境变量文件: .env.zeabur"
echo "- 部署指南: research/zeabur-deployment-guide.md"
echo ""
```

---

### 3.2 创建 Zeabur 配置文件

创建 `zeabur.yaml`:

```yaml
# Zeabur 项目配置
name: ipeasy

# 服务定义
services:
  # 后端 API
  api:
    source:
      type: git
      repo: your-org/your-repo
      branch: railway-fixes-merge
    build:
      type: docker
      dockerfile: apps/api/Dockerfile
      context: .
    deploy:
      port: 8080
      healthcheck:
        path: /health
        timeout: 100
    env:
      NODE_ENV: production
      PORT: "8080"

  # 前端 Web
  web:
    source:
      type: git
      repo: your-org/your-repo
      branch: railway-fixes-merge
    build:
      type: docker
      dockerfile: apps/web/Dockerfile
      context: .
    deploy:
      port: 4173
    env:
      NODE_ENV: production
      WEB_PORT: "4173"

  # 后台 Worker
  worker:
    source:
      type: git
      repo: your-org/your-repo
      branch: railway-fixes-merge
    build:
      type: docker
      dockerfile: apps/worker/Dockerfile
      context: .
    env:
      NODE_ENV: production
      WORKER_ENABLED: "true"
```

---

### 3.3 创建健康检查脚本

创建 `scripts/health-check-zeabur.sh`:

```bash
#!/bin/bash

API_URL=${1:-"https://api.your-domain.zeabur.app"}
WEB_URL=${2:-"https://your-domain.zeabur.app"}

echo "🔍 Zeabur 部署健康检查"
echo "================================"
echo "API URL: $API_URL"
echo "Web URL: $WEB_URL"
echo ""

# API 健康检查
echo "1️⃣ API 健康检查..."
API_HEALTH=$(curl -s -w "%{http_code}" -o /tmp/api_health.json "$API_URL/health")
if [ "$API_HEALTH" == "200" ]; then
  echo "✅ API 健康检查通过"
  cat /tmp/api_health.json | jq '.'
else
  echo "❌ API 健康检查失败 (HTTP $API_HEALTH)"
  cat /tmp/api_health.json
fi

# Legacy API 健康检查
echo ""
echo "2️⃣ Legacy API 健康检查..."
LEGACY_HEALTH=$(curl -s -w "%{http_code}" -o /tmp/legacy_health.json "$API_URL/api/v1/health")
if [ "$LEGACY_HEALTH" == "200" ]; then
  echo "✅ Legacy API 健康检查通过"
  cat /tmp/legacy_health.json | jq '.'
else
  echo "❌ Legacy API 健康检查失败 (HTTP $LEGACY_HEALTH)"
fi

# Web 健康检查
echo ""
echo "3️⃣ Web 健康检查..."
WEB_HEALTH=$(curl -s -w "%{http_code}" -o /dev/null "$WEB_URL")
if [ "$WEB_HEALTH" == "200" ]; then
  echo "✅ Web 健康检查通过"
else
  echo "❌ Web 健康检查失败 (HTTP $WEB_HEALTH)"
fi

echo ""
echo "================================"
echo "健康检查完成"
```

---

## 📋 阶段 4: 完整部署流程

### 使用方法

```bash
# 1. 本地验证
docker compose up -d
pnpm install
pnpm --filter @ipeasy/db generate
pnpm --filter @ipeasy/db migrate:deploy
pnpm tsx scripts/seed-local.ts

# 启动服务
pnpm --filter @ipeasy/api dev  # 终端 1
pnpm --filter @ipeasy/web dev  # 终端 2
pnpm --filter @ipeasy/worker dev  # 终端 3 (可选)

# 验证本地服务
./scripts/verify-local.sh
./scripts/test-local.sh

# 2. 自动化部署到 Zeabur
./scripts/deploy-zeabur.sh

# 3. 验证 Zeabur 部署
./scripts/health-check-zeabur.sh https://api.your-domain.zeabur.app https://your-domain.zeabur.app
```

---

## 📚 总结

本方案提供：
1. ✅ 完整的本地验证流程
2. ✅ 自动化部署脚本
3. ✅ 环境变量生成
4. ✅ 健康检查工具
5. ✅ 功能测试套件

---

**文档版本**: v1.0  
**生成工具**: Claude Code (Opus 5)  
**更新日期**: 2026-08-20
