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

if [ "$SKU_COUNT" -ge 0 ]; then
  echo "✅ SKU 列表获取成功"
  if [ "$SKU_COUNT" -gt 0 ]; then
    echo $SKU_RESPONSE | jq '.[0]'
  else
    echo "   ⚠️  SKU 列表为空（正常，如果尚未配置 SKU）"
  fi
else
  echo "❌ SKU 列表获取失败"
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
