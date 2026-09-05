#!/bin/bash

echo "🔍 检查测试订单状态..."

docker run --rm postgres:16-alpine psql "postgresql://root:am476QUKV3n8k1grlSju92c5Ee0YFTwb@43.172.85.117:32463/zeabur" -c "
SELECT
  id,
  kind,
  status,
  attempt,
  \"lastErrorCode\",
  \"completedAt\",
  \"createdAt\"
FROM external_jobs
WHERE \"dedicatedLineOrderId\" = '898d1d84-1c84-4914-857d-96762deb72e9'
ORDER BY \"createdAt\" DESC
LIMIT 1;
"

echo ""
echo "🔍 检查出口记录..."

docker run --rm postgres:16-alpine psql "postgresql://root:am476QUKV3n8k1grlSju92c5Ee0YFTwb@43.172.85.117:32463/zeabur" -c "
SELECT id, \"countryCode\", \"providerCode\", \"deliveredAt\"
FROM residential_exits
WHERE \"siteId\" = '7f486516-aeee-4b80-9d6b-0c364c94c54a'
ORDER BY \"createdAt\" DESC
LIMIT 3;
"

echo ""
echo "🔍 检查专线记录..."

docker run --rm postgres:16-alpine psql "postgresql://root:am476QUKV3n8k1grlSju92c5Ee0YFTwb@43.172.85.117:32463/zeabur" -c "
SELECT id, status, \"createdAt\"
FROM dedicated_lines
WHERE \"siteId\" = '7f486516-aeee-4b80-9d6b-0c364c94c54a'
ORDER BY \"createdAt\" DESC
LIMIT 3;
"
