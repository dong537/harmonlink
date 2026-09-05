-- Phase 1: 配置 985Proxy 和 ipipd Provider Accounts
-- 使用站点: 7f486516-aeee-4b80-9d6b-0c364c94c54a (MAIN / 365Proxy)

-- 注意: credential 字段需要用 encryptAesGcm() 加密
-- 这个 SQL 脚本展示明文 credential 结构,实际插入需要通过应用层加密

-- 1. 985Proxy Provider Account
INSERT INTO provider_accounts (
  id,
  "siteId",
  code,
  credential,
  "baseUrl",
  status,
  "createdAt",
  "updatedAt"
) VALUES (
  gen_random_uuid(),
  '7f486516-aeee-4b80-9d6b-0c364c94c54a',
  'NINE_EIGHT_FIVE',
  -- 实际环境需要加密,这里仅展示结构
  '{"apikey":"yR_7WPGbMxp-eVJfN1dQR2JNeHA0Y2MwMTc2NDk5MDc1MQ==","zoneId":"4sd72p1bvlha"}',
  'https://open-api.985proxy.com',
  'ACTIVE',
  now(),
  now()
)
ON CONFLICT (code, "siteId") DO UPDATE SET
  credential = EXCLUDED.credential,
  "baseUrl" = EXCLUDED."baseUrl",
  status = EXCLUDED.status,
  "updatedAt" = now();

-- 2. ipipd Provider Account
INSERT INTO provider_accounts (
  id,
  "siteId",
  code,
  credential,
  "baseUrl",
  status,
  "createdAt",
  "updatedAt"
) VALUES (
  gen_random_uuid(),
  '7f486516-aeee-4b80-9d6b-0c364c94c54a',
  'IPIPD',
  -- 实际环境需要加密,这里仅展示结构
  '{"appId":"APP13618B8748","appSecret":"fzEE0vF014A7WfdpCp0pek2ufnRo65E4HN6Ni3rZjitx9sjpNSy0beIyo6UKGbi7"}',
  'https://api.ipipd.cn/api',
  'ACTIVE',
  now(),
  now()
)
ON CONFLICT (code, "siteId") DO UPDATE SET
  credential = EXCLUDED.credential,
  "baseUrl" = EXCLUDED."baseUrl",
  status = EXCLUDED.status,
  "updatedAt" = now();

-- 验证插入
SELECT id, "siteId", code, "baseUrl", status
FROM provider_accounts
WHERE "siteId" = '7f486516-aeee-4b80-9d6b-0c364c94c54a'
ORDER BY code;
