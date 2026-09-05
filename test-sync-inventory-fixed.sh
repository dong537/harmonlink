#!/bin/bash

echo "🔍 测试库存同步 API（修正版）..."

# 985Proxy 库存同步
echo -e "\n1. 985Proxy 库存同步:"
curl -v -X POST "https://api.yisukj.top/api/resources/sync-inventory" \
  -H "Content-Type: application/json" \
  -d '{"providerCode":"NINE_EIGHT_FIVE"}' \
  -m 30 2>&1 | head -100

echo -e "\n\n--- 分隔线 ---\n\n"

# ipipd 库存同步
echo "2. ipipd 库存同步:"
curl -v -X POST "https://api.yisukj.top/api/resources/sync-inventory" \
  -H "Content-Type: application/json" \
  -d '{"providerCode":"IPIPD"}' \
  -m 30 2>&1 | head -100

