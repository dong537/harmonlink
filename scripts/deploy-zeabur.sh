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
