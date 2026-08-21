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
