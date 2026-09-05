-- 创建测试专线订单（完整 SQL）
-- 执行: docker run --rm postgres:16-alpine psql "..." -f create-test-order-v2.sql

-- 1. 确保测试用户存在
INSERT INTO users (
  id, "siteId", "tenantId", email, "passwordHash", "displayName", role, status, "createdAt", "updatedAt"
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '7f486516-aeee-4b80-9d6b-0c364c94c54a',
  'f0bc95b2-6bca-44c5-8572-b55750b46871',
  'test@365proxy.com',
  '$2b$10$dummy.hash.for.testing',
  'Test User',
  'CUSTOMER',
  'ACTIVE',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- 2. 创建专线订单
INSERT INTO dedicated_line_orders (
  id,
  "siteId",
  "tenantId",
  "userId",
  "skuId",
  "skuCode",
  "skuName",
  "countryCode",
  "businessType",
  "durationDays",
  quantity,
  "unitPrice",
  "totalPrice",
  currency,
  "priceSource",
  "contractVersion",
  "idempotencyKey",
  "createdAt",
  "updatedAt"
) VALUES (
  gen_random_uuid(),
  '7f486516-aeee-4b80-9d6b-0c364c94c54a',
  'f0bc95b2-6bca-44c5-8572-b55750b46871',
  '00000000-0000-0000-0000-000000000001',
  '91f2cd60-57cb-4875-bac0-cf2225fa8c03',
  'US_DEDICATED',
  '美国专线',
  'US',
  'PREMIUM',
  30,
  1,
  45.00,
  45.00,
  'USD',
  'MANUAL_TEST',
  1,
  'test-' || extract(epoch from now())::text,
  now(),
  now()
)
RETURNING id;

-- 注意: 需要手动记录返回的 order_id，然后创建 external_job
-- 或者使用应用层 API 创建订单（推荐）
