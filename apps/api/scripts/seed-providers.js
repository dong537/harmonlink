#!/usr/bin/env node
/**
 * 种子脚本: 配置 985Proxy 和 ipipd Provider Accounts
 * 使用方法: node apps/api/scripts/seed-providers.js
 */

const crypto = require('crypto');
const { Client } = require('pg');

const SITE_ID = '7f486516-aeee-4b80-9d6b-0c364c94c54a';
const DATABASE_URL = 'postgresql://root:am476QUKV3n8k1grlSju92c5Ee0YFTwb@43.172.85.117:32463/zeabur';
const ENCRYPTION_KEY = 'XuSW0H9sy6Cyirv3KoSQO8CRWHyaZ1r605l9Qi04V8g=';

function encryptAesGcm(plaintext, keyBase64) {
  const key = Buffer.from(keyBase64, 'base64');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return iv.toString('hex') + ':' + authTag + ':' + encrypted;
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log('✅ 数据库连接成功');

    // 加密 985Proxy 凭据
    console.log('\n🔐 加密 985Proxy 凭据...');
    const nineEightFiveCredential = JSON.stringify({
      apikey: 'yR_7WPGbMxp-eVJfN1dQR2JNeHA0Y2MwMTc2NDk5MDc1MQ==',
      zoneId: '4sd72p1bvlha'
    });
    const nineEightFiveEncrypted = encryptAesGcm(nineEightFiveCredential, ENCRYPTION_KEY);

    // 加密 ipipd 凭据
    console.log('🔐 加密 ipipd 凭据...');
    const ipipdCredential = JSON.stringify({
      appId: 'APP13618B8738',
      appSecret: 'fzEE0vF014A7WfdpCp0pek2ufnRo65E4HN6Ni3rZjitx9sjpNSy0beIyo6UKGbi7'
    });
    const ipipdEncrypted = encryptAesGcm(ipipdCredential, ENCRYPTION_KEY);

    // 插入 985Proxy
    console.log('\n📝 插入 985Proxy Provider Account...');
    await client.query(`
      INSERT INTO provider_accounts (
        id, "siteId", "providerCode", "credentialEncrypted", "baseUrl", status, "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, now(), now()
      )
      ON CONFLICT (id) DO NOTHING
    `, [SITE_ID, 'NINE_EIGHT_FIVE', nineEightFiveEncrypted, 'https://open-api.985proxy.com', 'ACTIVE']);
    console.log('✅ 985Proxy 配置完成');

    // 插入 ipipd
    console.log('\n📝 插入 ipipd Provider Account...');
    await client.query(`
      INSERT INTO provider_accounts (
        id, "siteId", "providerCode", "credentialEncrypted", "baseUrl", status, "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, now(), now()
      )
      ON CONFLICT (id) DO NOTHING
    `, [SITE_ID, 'IPIPD', ipipdEncrypted, 'https://api.ipipd.cn/api', 'ACTIVE']);
    console.log('✅ ipipd 配置完成');

    // 验证
    console.log('\n🔍 验证配置...');
    const result = await client.query(`
      SELECT id, "siteId", "providerCode", "baseUrl", status, "createdAt"
      FROM provider_accounts
      WHERE "siteId" = $1
      ORDER BY "providerCode"
    `, [SITE_ID]);

    console.log('\n✅ Provider Accounts 配置完成:');
    console.table(result.rows);

  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
