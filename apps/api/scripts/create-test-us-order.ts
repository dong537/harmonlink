import { prisma } from '@ipeasy/db';
import { DedicatedLineInventoryRepository } from '../src/modules/dedicated-line-orders/dedicated-line-inventory.repository';
import { WalletRepository } from '../src/modules/wallet/wallet.repository';
import { randomBytes } from 'crypto';

async function main() {
  console.log('🧪 Creating test US dedicated line order...\n');

  const site = await prisma.sites.findFirst();
  if (!site) throw new Error('No site found');

  const tenant = await prisma.tenants.findFirst({ where: { siteId: site.id } });
  if (!tenant) throw new Error('No tenant found');

  const user = await prisma.users.findFirst({ 
    where: { siteId: site.id, tenantId: tenant.id },
  });
  if (!user) throw new Error('No user found');

  const sku = await prisma.service_skus.findUnique({
    where: { siteId_code: { siteId: site.id, code: 'US_DEDICATED' } },
  });
  if (!sku) throw new Error('US_DEDICATED SKU not found');

  const providerAccount = await prisma.provider_accounts.findFirst({
    where: {
      siteId: site.id,
      providerCode: 'NINE_EIGHT_FIVE',
      status: 'ACTIVE',
    },
  });
  if (!providerAccount) throw new Error('NINE_EIGHT_FIVE provider account not found');

  // 获取入站配置
  const inboundProfile = await prisma.inbound_profiles.findFirst({
    where: { siteId: site.id },
  });
  if (!inboundProfile) throw new Error('No inbound profile found - need to initialize control nodes first');

  const placementPolicy = await prisma.line_placement_policies.findFirst({
    where: { 
      siteId: site.id, 
      skuId: sku.id,
      inboundProfileId: inboundProfile.id,
    },
  });
  if (!placementPolicy) throw new Error('No placement policy found for US_DEDICATED');

  console.log('✅ Found all required resources:');
  console.log(`   Site: ${site.domain}`);
  console.log(`   Tenant: ${tenant.name}`);
  console.log(`   User: ${user.email}`);
  console.log(`   SKU: ${sku.code} (${sku.name})`);
  console.log(`   Provider: ${providerAccount.providerCode}`);
  console.log(`   Inbound Profile: ${inboundProfile.id}`);
  console.log(`   Placement Policy: ${placementPolicy.id}`);

  const walletRepo = new WalletRepository();
  const inventoryRepo = new DedicatedLineInventoryRepository(walletRepo);

  const route = await inventoryRepo.findFreshRoute({
    siteId: site.id,
    tenantId: tenant.id,
    skuId: sku.id,
    countryCode: 'US',
  });

  if (!route) {
    throw new Error('No fresh inventory route found for US');
  }

  console.log(`\n✅ Found fresh route:`);
  console.log(`   Provider: ${route.providerCode}`);
  console.log(`   Resource ID: ${route.providerResourceId}`);

  const idempotencyKey = `test-us-order-${randomBytes(8).toString('hex')}`;

  const result = await inventoryRepo.reserveAndEnqueue({
    siteId: site.id,
    tenantId: tenant.id,
    userId: user.id,
    providerCode: 'NINE_EIGHT_FIVE',
    providerAccountId: route.providerAccountId,
    skuId: sku.id,
    countryCode: 'US',
    quantity: 1,
    idempotencyKey,
    orderSnapshot: {
      skuCode: sku.code,
      skuName: sku.name,
      regionCode: null,
      businessType: 'premium',
      durationDays: 30,
      unitPrice: '100.00',
      totalPrice: '100.00',
      currency: 'CNY',
      priceSource: 'test',
      contractVersion: 1,
    },
    charge: {
      amount: '100.00',
      currency: 'CNY',
      idempotencyKey: `charge-${idempotencyKey}`,
    },
    jobPayload: {
      durationDays: 30,
      currency: 'CNY',
      protocol: 'SOCKS5',
      providerResourceId: route.providerResourceId,
      placementPolicyId: placementPolicy.id,
      inboundProfileId: inboundProfile.id,
      inboundTag: placementPolicy.inboundTag,
      lineProtocol: 'VLESS',
      maxReplicaFanout: 1,
    },
  });

  if (result.kind === 'INSUFFICIENT') {
    console.error('\n❌ Insufficient inventory:');
    console.error(`   Requested: ${result.requestedQuantity}`);
    console.error(`   Available: ${result.availableQuantity}`);
    return;
  }

  console.log('\n✅ Order created successfully:');
  console.log(`   Order ID: ${result.orderId}`);
  console.log(`   Reservation ID: ${result.reservationId}`);
  console.log(`   Job ID: ${result.jobId}`);
  console.log(`   Snapshot ID: ${result.snapshotId}`);
  console.log(`   Replayed: ${result.replayed}`);

  console.log('\n🔄 Next step: Run the worker to execute this order');
  console.log(`   Job will call 985Proxy to purchase SOCKS5 proxy`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
