#!/bin/bash

echo "测试香港控制节点端口..."

# 测试 57323 端口
echo -e "\n1. 测试端口 57323:"
timeout 5 bash -c "echo > /dev/tcp/91.149.237.33/57323" 2>&1 && echo "✅ 57323 可达" || echo "❌ 57323 不可达"

# 测试 41094 端口
echo -e "\n2. 测试端口 41094:"
timeout 5 bash -c "echo > /dev/tcp/91.149.237.33/41094" 2>&1 && echo "✅ 41094 可达" || echo "❌ 41094 不可达"

# 尝试 HTTP 请求
echo -e "\n3. 尝试 HTTP 请求 (57323):"
curl -v -m 10 http://91.149.237.33:57323/panel/api/health 2>&1 | head -30

echo -e "\n4. 尝试 HTTP 请求 (41094):"
curl -v -m 10 http://91.149.237.33:41094/panel/api/health 2>&1 | head -30

