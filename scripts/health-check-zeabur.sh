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
  cat /tmp/api_health.json | jq '.' || cat /tmp/api_health.json
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
  cat /tmp/legacy_health.json | jq '.' || cat /tmp/legacy_health.json
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
