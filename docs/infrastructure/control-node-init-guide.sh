#!/bin/bash
# 控制节点初始化脚本
# 使用前需要：
# 1. 已登录具有 OPERATOR 权限的管理员账号
# 2. 已获取 JWT token 并设置为环境变量 API_TOKEN
# 3. 已确认控制节点的 API token

set -e

API_BASE="${API_BASE:-http://localhost:3000/api}"
SITE_ID="${SITE_ID:-<your-site-id>}"

echo "=== 1. 创建节点组 ==="
NODE_GROUP_RESP=$(curl -s -X POST "$API_BASE/admin/control-plane/node-groups" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "hk-primary",
    "name": "香港主节点组",
    "regionCode": "HK"
  }')

echo "节点组创建响应: $NODE_GROUP_RESP"
NODE_GROUP_ID=$(echo "$NODE_GROUP_RESP" | jq -r '.data.id')
echo "节点组ID: $NODE_GROUP_ID"
echo

echo "=== 2. 创建控制节点 ==="
echo "⚠️ 请先确认并设置 CONTROL_NODE_API_TOKEN 环境变量"
if [ -z "$CONTROL_NODE_API_TOKEN" ]; then
  echo "错误: CONTROL_NODE_API_TOKEN 未设置"
  echo "请运行: export CONTROL_NODE_API_TOKEN='<从控制节点服务获取的token>'"
  exit 1
fi

CONTROL_NODE_RESP=$(curl -s -X POST "$API_BASE/admin/control-plane/nodes" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"nodeGroupId\": \"$NODE_GROUP_ID\",
    \"code\": \"hk-node-01\",
    \"name\": \"香港控制节点-01\",
    \"regionCode\": \"HK\",
    \"baseUrl\": \"http://91.149.237.33:57323\",
    \"apiToken\": \"$CONTROL_NODE_API_TOKEN\",
    \"capacityUnits\": 100,
    \"status\": \"ACTIVE\"
  }")

echo "控制节点创建响应: $CONTROL_NODE_RESP"
CONTROL_NODE_ID=$(echo "$CONTROL_NODE_RESP" | jq -r '.data.id')
echo "控制节点ID: $CONTROL_NODE_ID"
echo

echo "=== 3. 创建入站配置 (短视频) ==="
INBOUND_SV_RESP=$(curl -s -X POST "$API_BASE/admin/control-plane/inbound-profiles" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"nodeGroupId\": \"$NODE_GROUP_ID\",
    \"controlNodeId\": \"$CONTROL_NODE_ID\",
    \"code\": \"hk-mixed-60701\",
    \"protocol\": \"MIXED\",
    \"inboundTag\": \"sv-in\",
    \"listenPort\": 60701
  }")

echo "入站配置(SV)创建响应: $INBOUND_SV_RESP"
INBOUND_SV_ID=$(echo "$INBOUND_SV_RESP" | jq -r '.data.id')
echo "入站配置(SV)ID: $INBOUND_SV_ID"
echo

echo "=== 4. 创建入站配置 (直播) ==="
INBOUND_ZB_RESP=$(curl -s -X POST "$API_BASE/admin/control-plane/inbound-profiles" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"nodeGroupId\": \"$NODE_GROUP_ID\",
    \"controlNodeId\": \"$CONTROL_NODE_ID\",
    \"code\": \"hk-mixed-60702\",
    \"protocol\": \"MIXED\",
    \"inboundTag\": \"zb-in\",
    \"listenPort\": 60702
  }")

echo "入站配置(ZB)创建响应: $INBOUND_ZB_RESP"
INBOUND_ZB_ID=$(echo "$INBOUND_ZB_RESP" | jq -r '.data.id')
echo "入站配置(ZB)ID: $INBOUND_ZB_ID"
echo

echo "=== 5. 创建落点策略 (短视频) ==="
POLICY_SV_RESP=$(curl -s -X POST "$API_BASE/admin/control-plane/placement-policies" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"nodeGroupId\": \"$NODE_GROUP_ID\",
    \"inboundProfileId\": \"$INBOUND_SV_ID\",
    \"code\": \"default-hk-sv-policy\",
    \"name\": \"默认香港短视频落点策略\",
    \"targetReplicaCount\": 1,
    \"minReadyReplicaCount\": 1,
    \"allowedNodeIds\": [\"$CONTROL_NODE_ID\"]
  }")

echo "落点策略(SV)创建响应: $POLICY_SV_RESP"
echo

echo "=== 6. 创建落点策略 (直播) ==="
POLICY_ZB_RESP=$(curl -s -X POST "$API_BASE/admin/control-plane/placement-policies" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"nodeGroupId\": \"$NODE_GROUP_ID\",
    \"inboundProfileId\": \"$INBOUND_ZB_ID\",
    \"code\": \"default-hk-zb-policy\",
    \"name\": \"默认香港直播落点策略\",
    \"targetReplicaCount\": 1,
    \"minReadyReplicaCount\": 1,
    \"allowedNodeIds\": [\"$CONTROL_NODE_ID\"]
  }")

echo "落点策略(ZB)创建响应: $POLICY_ZB_RESP"
echo

echo "✅ 控制节点初始化完成！"
echo
echo "生成的资源ID："
echo "  节点组ID: $NODE_GROUP_ID"
echo "  控制节点ID: $CONTROL_NODE_ID"
echo "  入站配置(SV)ID: $INBOUND_SV_ID"
echo "  入站配置(ZB)ID: $INBOUND_ZB_ID"
echo
echo "下一步："
echo "1. 测试投影下发: curl -H 'Authorization: Bearer \$CONTROL_NODE_API_TOKEN' http://91.149.237.33:57323/panel/api/managed-line-projections/test-key"
echo "2. 查询控制节点: curl -H 'Authorization: Bearer \$API_TOKEN' $API_BASE/admin/control-plane/nodes"
