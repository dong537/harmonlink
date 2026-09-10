#!/bin/bash

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${ORDER_ID:?ORDER_ID is required}"
: "${SITE_ID:?SITE_ID is required}"

echo "🔍 检查测试订单状态..."

docker run --rm postgres:16-alpine psql "$DATABASE_URL" -v order_id="$ORDER_ID" -c "
SELECT
  id,
  kind,
  status,
  attempt,
  \"lastErrorCode\",
  \"completedAt\",
  \"createdAt\"
FROM external_jobs
WHERE \"dedicatedLineOrderId\" = :'order_id'
ORDER BY \"createdAt\" DESC
LIMIT 1;
"

echo ""
echo "🔍 检查出口记录..."

docker run --rm postgres:16-alpine psql "$DATABASE_URL" -v site_id="$SITE_ID" -c "
SELECT id, \"countryCode\", \"providerCode\", \"deliveredAt\"
FROM residential_exits
WHERE \"siteId\" = :'site_id'
ORDER BY \"createdAt\" DESC
LIMIT 3;
"

echo ""
echo "🔍 检查专线记录..."

docker run --rm postgres:16-alpine psql "$DATABASE_URL" -v site_id="$SITE_ID" -c "
SELECT id, status, \"createdAt\"
FROM dedicated_lines
WHERE \"siteId\" = :'site_id'
ORDER BY \"createdAt\" DESC
LIMIT 3;
"
