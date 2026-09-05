#!/bin/bash

echo "🔍 测试库存同步 API..."

# 985Proxy 库存同步
echo -e "\n1. 985Proxy 库存同步:"
curl -X POST "https://api.yisukj.top/api/resources/sync?providerAccountId=792beae2-69a5-4ccd-b59b-6f5c7a3fd100" \
  -H "Content-Type: application/json" \
  -m 30 2>&1 | head -50

echo -e "\n\n2. ipipd 库存同步:"
curl -X POST "https://api.yisukj.top/api/resources/sync?providerAccountId=ac887a60-2c97-4ff3-b335-5033060e7438" \
  -H "Content-Type: application/json" \
  -m 30 2>&1 | head -50

