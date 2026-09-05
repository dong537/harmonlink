#!/usr/bin/env node
/**
 * 创建美国专线 SKU 和定价
 * 使用方法: node apps/api/scripts/seed-us-dedicated-line-sku.js
 */

const { Client } = require('pg');

const SITE_ID = '7f486516-aeee-4b80-9d6b-0c364c94c54a';
const DATABASE_URL = 'postgresql://root:am476QUKV3n8k1grlSju92c5Ee0YFTwb@43.172.85.117:32463/zeabur';
const DEFAULT_TEMPLATE_ID = '1c2e394d-6ecb-4a6f-85dc-6a2472f52ec7';

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log('✅ 数据库连接成功\n');

    // 1. 创建美国专线 SKU
    console.log('📝 创建美国专线 SKU...');
    const skuResult = await client.query(`
      INSERT INTO service_skus (
        id,
        "siteId",
        code,
        name,
        description,
        capabilities,
        "contractVersion",
        "isActive",
        "isVisible",
        "sortOrder",
        "createdAt",
        "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        $1,
        $2,
        $3,
        $4,
        $5,
        1,
        true,
        true,
        10,
        now(),
        now()
      )
      ON CONFLICT ("siteId", code) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        capabilities = EXCLUDED.capabilities,
        "updatedAt" = now()
      RETURNING id
    `, [
      SITE_ID,
      'US_DEDICATED',
      '美国专线',
      '基于 985Proxy 美国 Premium 出口的专线代理服务，支持 VLESS/VMESS 协议',
      JSON.stringify({
        delivery: 'dedicated-line',
        supportedProtocols: ['VLESS', 'VMESS', 'MIXED'],
        countryCode: 'US',
        providerCode: 'NINE_EIGHT_FIVE',
        ipType: 'NATIVE',
        features: ['premium', 'stable', 'high-speed']
      })
    ]);

    const skuId = skuResult.rows[0].id;
    console.log(`✅ SKU 已创建: ${skuId}\n`);

    // 2. 创建定价规则
    console.log('📝 创建定价规则...');

    // 上游成本: $0.98/天，我们定价 $1.5/天（利润率 ~53%）
    // 30天套餐: $45 (等效 $1.5/天)
    const pricingRules = [
      { durationDays: 30, minQty: 1, unitPrice: 45.00, currency: 'USD' },
      { durationDays: 90, minQty: 1, unitPrice: 120.00, currency: 'USD' }, // 折扣 11%
      { durationDays: 180, minQty: 1, unitPrice: 216.00, currency: 'USD' }, // 折扣 20%
    ];

    for (const rule of pricingRules) {
      await client.query(`
        INSERT INTO sku_price_rules (
          id,
          "siteId",
          "templateId",
          "skuId",
          "durationDays",
          "minQty",
          "unitPrice",
          currency,
          "createdAt",
          "updatedAt"
        ) VALUES (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          now(),
          now()
        )
        ON CONFLICT ("siteId", "templateId", "skuId", "durationDays", "minQty")
        DO UPDATE SET
          "unitPrice" = EXCLUDED."unitPrice",
          "updatedAt" = now()
      `, [
        SITE_ID,
        DEFAULT_TEMPLATE_ID,
        skuId,
        rule.durationDays,
        rule.minQty,
        rule.unitPrice,
        rule.currency
      ]);

      console.log(`✅ ${rule.durationDays}天套餐: ${rule.unitPrice} ${rule.currency}`);
    }

    // 3. 验证结果
    console.log('\n🔍 验证配置...\n');
    const skuCheck = await client.query(`
      SELECT
        id,
        code,
        name,
        description,
        capabilities,
        "isActive",
        "isVisible"
      FROM service_skus
      WHERE "siteId" = $1 AND code = 'US_DEDICATED'
    `, [SITE_ID]);

    console.log('✅ SKU 配置:');
    console.table(skuCheck.rows);

    const pricingCheck = await client.query(`
      SELECT
        "durationDays",
        "minQty",
        "unitPrice",
        currency
      FROM sku_price_rules
      WHERE "siteId" = $1 AND "skuId" = $2
      ORDER BY "durationDays"
    `, [SITE_ID, skuId]);

    console.log('\n✅ 定价规则:');
    console.table(pricingCheck.rows);

    console.log('\n✅ 美国专线 SKU 配置完成！');
    console.log('\n📌 下一步:');
    console.log('   1. 创建专线订单测试');
    console.log('   2. 验证订单 → 购买 → 出口 → 专线流程');

  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
