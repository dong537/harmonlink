#!/bin/bash

# 测试 985Proxy health check
echo "Testing 985Proxy health check..."
curl -X POST \
  -H "Content-Type: application/json" \
  https://api.yisukj.top/providers/792beae2-69a5-4ccd-b59b-6f5c7a3fd100/health-check \
  2>&1 | head -30

echo -e "\n\n---\n"

# 测试 ipipd health check
echo "Testing ipipd health check..."
curl -X POST \
  -H "Content-Type: application/json" \
  https://api.yisukj.top/providers/ac887a60-2c97-4ff3-b335-5033060e7438/health-check \
  2>&1 | head -30

