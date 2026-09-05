import { prisma } from '@ipeasy/db';
import { NineEightFiveAdapter } from '../src/modules/providers/adapters/nine-eight-five.adapter';
import { IpipdAdapter } from '../src/modules/providers/adapters/ipipd.adapter';
import { DedicatedLineInventoryRepository } from '../src/modules/dedicated-line-orders/dedicated-line-inventory.repository';
import { decryptAesGcm } from '../src/common/crypto/aes-gcm';
import type { ProviderRuntimeConfig, InventorySyncResult } from '../src/modules/providers/provider.types';

const APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY;
if (!APP_ENCRYPTION_KEY) {
  throw new Error('APP_ENCRYPTION_KEY is required');
}

async function main() {
  console.log('🔍 Syncing US inventory from providers...\n');

  const site = await prisma.sites.findFirst();
  if (!site) throw new Error('No site found');

  const providers = await prisma.provider_accounts.findMany({
    where: { 
      siteId: site.id,
      status: 'ACTIVE',
      providerCode: { in: ['NINE_EIGHT_FIVE', 'IPIPD'] },
    },
  });

  const inventoryRepo = new DedicatedLineInventoryRepository(null as any);
  let totalSnapshots = 0;
  let totalMappedSkus = 0;

  for (const provider of providers) {
    console.log(`\n📦 Provider: ${provider.providerCode}`);
    console.log(`   Account ID: ${provider.id}`);
    console.log(`   Base URL: ${provider.baseUrl}`);
    
    try {
      const credential = JSON.parse(decryptAesGcm(provider.credentialEncrypted, APP_ENCRYPTION_KEY));
      
      const config: ProviderRuntimeConfig = {
        code: provider.providerCode as 'NINE_EIGHT_FIVE' | 'IPIPD',
        upstreamAccountId: provider.id,
        baseUrl: provider.baseUrl,
        credential,
        status: provider.status as 'ACTIVE' | 'DISABLED',
        timeoutMs: 30000,
      };

      let syncResult: InventorySyncResult;

      if (provider.providerCode === 'NINE_EIGHT_FIVE') {
        const adapter = new NineEightFiveAdapter();
        syncResult = await adapter.syncInventory(config);
      } else if (provider.providerCode === 'IPIPD') {
        const adapter = new IpipdAdapter();
        syncResult = await adapter.syncInventory(config);
      } else {
        console.log(`   ⚠️  Unknown provider code, skipping`);
        continue;
      }

      // 过滤美国库存
      const usItems = syncResult.items.filter(item => 
        item.countryCode.trim().toUpperCase() === 'US'
      );

      console.log(`   ✅ Fetched inventory:`);
      console.log(`      Total items: ${syncResult.items.length}`);
      console.log(`      US items: ${usItems.length}`);
      if (usItems.length > 0) {
        const totalStock = usItems.reduce((sum, item) => sum + item.stock, 0);
        console.log(`      Total US stock: ${totalStock}`);
        console.log(`      Sample: ${JSON.stringify(usItems[0], null, 2)}`);
      }

      // 写入数据库
      const persistResult = await inventoryRepo.syncProviderSnapshot({
        siteId: site.id,
        providerAccountId: provider.id,
        providerCode: provider.providerCode as 'NINE_EIGHT_FIVE' | 'IPIPD',
        items: syncResult.items,
        capturedAt: syncResult.syncedAt,
      });

      console.log(`   💾 Persisted:`);
      console.log(`      Snapshots: ${persistResult.snapshots}`);
      console.log(`      Mapped SKUs: ${persistResult.mappedSkus}`);

      totalSnapshots += persistResult.snapshots;
      totalMappedSkus += persistResult.mappedSkus;

    } catch (error: any) {
      console.error(`   ❌ Error:`, error.message);
      if (error.stack) {
        console.error(`   Stack:`, error.stack.split('\n').slice(0, 5).join('\n'));
      }
    }
  }
  
  console.log(`\n✨ Sync complete`);
  console.log(`   Total snapshots: ${totalSnapshots}`);
  console.log(`   Total mapped SKUs: ${totalMappedSkus}`);
}

main()
  .catch((error) => {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
