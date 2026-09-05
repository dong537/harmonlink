#!/usr/bin/env node
/**
 * 将 985Proxy 美国库存写入 platform_resources 表
 * 使用方法: node apps/api/scripts/write-us-resources.js
 */

const { Client } = require('pg');

const SITE_ID = '7f486516-aeee-4b80-9d6b-0c364c94c54a';
const DATABASE_URL = 'postgresql://root:am476QUKV3n8k1grlSju92c5Ee0YFTwb@43.172.85.117:32463/zeabur';
const PROVIDER_ACCOUNT_ID_985 = '792beae2-69a5-4ccd-b59b-6f5c7a3fd100';

// 从上一步的输出获取（简化版，只选美国 premium）
// 聚合所有美国 premium 库存：加利福尼亚1082 + 洛杉矶324 + 西雅图80 = 1486
const US_RESOURCES = [
  {
    countryCode: 'US',
    regionCode: null, // 聚合多个城市
    stock: 1486,
    upstreamCost: 0.98,
    upstreamCostCurrency: 'USD',
    ipType: 'NATIVE',
    protocol: 'SOCKS5',
  }
];

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log('✅ 数据库连接成功\n');

    console.log('📝 写入美国库存资源...\n');

    for (const resource of US_RESOURCES) {
      const code = `NINE_EIGHT_FIVE_US_PREMIUM`;
      const name = `美国 Premium 出口 (985Proxy)`;

      // 插入或更新 platform_resources
      const resourceResult = await client.query(`
        INSERT INTO platform_resources (
          id,
          "siteId",
          code,
          name,
          type,
          "providerCode",
          "upstreamAccountId",
          "ipType",
          protocol,
          "upstreamCost",
          "upstreamCostCurrency",
          status,
          "sortOrder",
          "isVisible",
          "isSaleable",
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
          $8,
          $9,
          $10,
          $11,
          0,
          true,
          true,
          now(),
          now()
        )
        ON CONFLICT ("siteId", "providerCode", "upstreamAccountId", code, "ipType")
        DO UPDATE SET
          name = EXCLUDED.name,
          "upstreamCost" = EXCLUDED."upstreamCost",
          "upstreamCostCurrency" = EXCLUDED."upstreamCostCurrency",
          status = EXCLUDED.status,
          "updatedAt" = now()
        RETURNING id
      `, [
        SITE_ID,
        code,
        name,
        'COUNTRY', // type - 使用正确的枚举值
        'NINE_EIGHT_FIVE',
        PROVIDER_ACCOUNT_ID_985,
        resource.ipType,
        resource.protocol,
        resource.upstreamCost,
        resource.upstreamCostCurrency,
        'ACTIVE'
      ]);

      const resourceId = resourceResult.rows[0].id;

      // 插入库存快照
      await client.query(`
        INSERT INTO inventory_snapshots (
          id,
          "resourceId",
          "siteId",
          "providerCode",
          stock,
          "capturedAt",
          "freshnessTtlSeconds",
          "isStale",
          "upstreamAccountId"
        ) VALUES (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          $4,
          now(),
          3600,
          false,
          $5
        )
      `, [
        resourceId,
        SITE_ID,
        'NINE_EIGHT_FIVE',
        resource.stock,
        PROVIDER_ACCOUNT_ID_985
      ]);

      console.log(`✅ ${code}`);
      console.log(`   Resource ID: ${resourceId}`);
      console.log(`   Cost: ${resource.upstreamCost} ${resource.upstreamCostCurrency}`);
      console.log(`   Stock: ${resource.stock}\n`);
    }

    // 验证
    console.log('\n🔍 验证写入结果...\n');
    const result = await client.query(`
      SELECT
        pr.id,
        pr.code,
        pr.name,
        pr.type,
        pr."providerCode",
        pr."ipType",
        pr.protocol,
        pr."upstreamCost",
        pr."upstreamCostCurrency",
        pr.status,
        inv.stock,
        inv."capturedAt"
      FROM platform_resources pr
      LEFT JOIN LATERAL (
        SELECT stock, "capturedAt"
        FROM inventory_snapshots
        WHERE "resourceId" = pr.id
        ORDER BY "capturedAt" DESC
        LIMIT 1
      ) inv ON true
      WHERE pr."siteId" = $1
        AND pr."providerCode" = 'NINE_EIGHT_FIVE'
      ORDER BY pr.code
    `, [SITE_ID]);

    console.log('✅ 当前 985Proxy 资源:');
    console.table(result.rows);

  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
