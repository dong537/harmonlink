import { prisma } from '@ipeasy/db';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';

async function seed() {
  console.log('🌱 开始初始化本地数据...');

  // 1. 创建站点
  const site = await prisma.sites.upsert({
    where: { code: 'LOCAL_DEV' },
    update: {},
    create: {
      id: 'site_local_dev',
      code: 'LOCAL_DEV',
      name: 'IPEasy 本地开发',
      domain: 'localhost:4173',
      status: 'ACTIVE',
      currency: 'CNY',
      timezone: 'Asia/Shanghai',
      config: {},
    },
  });
  console.log('✅ 站点创建成功:', site.name);

  // 2. 创建租户
  const tenant = await prisma.tenants.upsert({
    where: { siteId_code: { siteId: site.id, code: 'DEFAULT' } },
    update: {},
    create: {
      id: randomUUID(),
      siteId: site.id,
      code: 'DEFAULT',
      name: '默认租户',
      status: 'ACTIVE',
      ownerId: null,
      config: {},
    },
  });
  console.log('✅ 租户创建成功:', tenant.name);

  // 3. 创建测试用户
  const hashedPassword = await bcrypt.hash('password123', 10);

  const user = await prisma.users.upsert({
    where: { email: 'test@ipeasy.com' },
    update: {},
    create: {
      id: randomUUID(),
      siteId: site.id,
      tenantId: tenant.id,
      email: 'test@ipeasy.com',
      passwordHash: hashedPassword,
      name: '测试用户',
      status: 'ACTIVE',
      kycStatus: 'NONE',
      riskStatus: 'NORMAL',
    },
  });
  console.log('✅ 用户创建成功:', user.email);

  // 4. 创建钱包
  const wallet = await prisma.wallets.upsert({
    where: { siteId_tenantId_userId: { siteId: site.id, tenantId: tenant.id, userId: user.id } },
    update: {},
    create: {
      id: randomUUID(),
      siteId: site.id,
      tenantId: tenant.id,
      userId: user.id,
      available: '1000.00',
      frozen: '0.00',
      currency: 'CNY',
      version: 0,
    },
  });
  console.log('✅ 钱包创建成功，余额:', wallet.available);

  console.log('\n🎉 本地数据初始化完成！');
  console.log('\n📝 测试账号:');
  console.log('  Email: test@ipeasy.com');
  console.log('  Password: password123');
  console.log('  余额: ¥1000.00');
}

seed()
  .catch((e) => {
    console.error('❌ 数据初始化失败:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
