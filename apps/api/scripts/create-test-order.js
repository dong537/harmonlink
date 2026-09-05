#!/usr/bin/env node
/**
 * 创建测试专线订单
 * 使用方法: node apps/api/scripts/create-test-order.js
 */

const { Client } = require('pg');

const SITE_ID = '7f486516-aeee-4b80-9d6b-0c364c94c54a';
const DATABASE_URL = 'postgresql://root:am476QUKV3n8k1grlSju92c5Ee0YFTwb@43.172.85.117:32463/zeabur';
const TENANT_ID = 'f0bc95b2-6bca-44c5-8572-b55750b46871';
const SKU_ID = '91f2cd60-57cb-4875-bac0-cf2225fa8c03';

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log('✅ 数据库连接成功\n');

    // 1. 查询用户（如果没有就创建测试用户）
    let userId;
    const userCheck = await client.query(`
      SELECT id FROM users
      WHERE "siteId" = $1
      ORDER BY "createdAt" DESC
      LIMIT 1
    `, [SITE_ID]);

    if (userCheck.rows.length === 0) {
      console.log('📝 创建测试用户...');
      const userResult = await client.query(`
        INSERT INTO users (
          id, "siteId", "tenantId", email, "passwordHash", "displayName", role, status, "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, now(), now()
        ) RETURNING id
      `, [
        SITE_ID,
        TENANT_ID,
        'test@365proxy.com',
        '$2b$10$dummy.hash.for.testing', // 假密码哈希
        'Test User',
        'CUSTOMER',
        'ACTIVE'
      ]);
      userId = userResult.rows[0].id;
      console.log(`✅ 测试用户已创建: ${userId}\n`);
    } else {
      userId = userCheck.rows[0].id;
      console.log(`✅ 使用现有用户: ${userId}\n`);
    }

    // 2. 创建专线订单
    console.log('📝 创建美国专线订单...');
    const orderResult = await client.query(`
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
        $12,
        $13,
        $14,
        $15,
        $16,
        now(),
        now()
      ) RETURNING id
    `, [
      SITE_ID,
      TENANT_ID,
      userId,
      SKU_ID,
      'US_DEDICATED', // skuCode
      '美国专线', // skuName
      'US', // countryCode
      'PREMIUM', // businessType
      30, // durationDays
      1, // quantity
      45.00, // unitPrice
      45.00, // totalPrice
      'USD', // currency
      'MANUAL_TEST', // priceSource
      1, // contractVersion
      `test-${Date.now()}` // idempotencyKey
    ]);

    const orderId = orderResult.rows[0].id;
    console.log(`✅ 订单已创建: ${orderId}\n`);

    // 3. 创建 external_job（触发订单处理）
    console.log('📝 创建订单处理任务...');
    const jobResult = await client.query(`
      INSERT INTO external_jobs (
        id,
        "siteId",
        "tenantId",
        "userId",
        "dedicatedLineOrderId",
        kind,
        "aggregateType",
        "aggregateId",
        "desiredVersion",
        payload,
        "idempotencyKey",
        "dedupeKey",
        status,
        "nextRunAt",
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
        $12,
        now(),
        now(),
        now()
      ) RETURNING id
    `, [
      SITE_ID,
      TENANT_ID,
      userId,
      orderId,
      'PROCESS_DEDICATED_LINE_ORDER', // kind
      'DedicatedLineOrder', // aggregateType
      orderId, // aggregateId
      1, // desiredVersion
      JSON.stringify({
        orderId: orderId,
        countryCode: 'US',
        providerCode: 'NINE_EIGHT_FIVE',
        quantity: 1,
        durationDays: 30,
        lineProtocol: 'VLESS',
        businessType: 'PREMIUM',
      }),
      `test-job-${Date.now()}`, // idempotencyKey
      `dedicated-line-order:${orderId}`, // dedupeKey
      'QUEUED' // status
    ]);

    const jobId = jobResult.rows[0].id;
    console.log(`✅ 任务已创建: ${jobId}\n`);

    console.log('✅ 测试订单创建完成！\n');
    console.log('📌 下一步:');
    console.log('   1. 启动 API 服务器（如果未启动）');
    console.log('   2. 观察 external_jobs 执行日志');
    console.log('   3. 查询订单状态变化');
    console.log('\n🔍 查询命令:');
    console.log(`   -- 订单状态\n   SELECT id, status, "createdAt" FROM dedicated_line_orders WHERE id = '${orderId}';`);
    console.log(`\n   -- 任务状态\n   SELECT id, status, "executedAt", "resultSummary" FROM external_jobs WHERE id = '${jobId}';`);
    console.log(`\n   -- 出口记录\n   SELECT id, "countryCode", "providerCode", "deliveredAt" FROM residential_exits WHERE "siteId" = '${SITE_ID}' ORDER BY "createdAt" DESC LIMIT 5;`);
    console.log(`\n   -- 专线记录\n   SELECT id, status, "createdAt" FROM dedicated_lines WHERE "siteId" = '${SITE_ID}' ORDER BY "createdAt" DESC LIMIT 5;`);

  } catch (error) {
    console.error('❌ 错误:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
