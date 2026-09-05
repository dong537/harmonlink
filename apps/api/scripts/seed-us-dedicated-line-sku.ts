import { prisma } from '@ipeasy/db';

async function main() {
  const site = await prisma.sites.findFirst();
  if (!site) throw new Error('No site found');

  console.log('🔍 Checking US_DEDICATED SKU...\n');

  const sku = await prisma.service_skus.findUnique({
    where: {
      siteId_code: {
        siteId: site.id,
        code: 'US_DEDICATED',
      },
    },
  });

  if (!sku) {
    console.log('❌ US_DEDICATED SKU not found');
    return;
  }

  console.log(`✅ Found SKU: ${sku.name} (${sku.id})`);
  console.log(`   Current capabilities: ${JSON.stringify(sku.capabilities, null, 2)}`);

  // 更新 capabilities 以包含 inventorySource
  const updatedCapabilities = {
    ...sku.capabilities as any,
    inventorySource: {
      providerCode: 'NINE_EIGHT_FIVE',
      providerResourceIds: ['US:premium', 'US:shared'],
    },
  };

  await prisma.service_skus.update({
    where: { id: sku.id },
    data: { capabilities: updatedCapabilities },
  });

  console.log('\n✅ Updated capabilities with inventorySource:');
  console.log(JSON.stringify(updatedCapabilities, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
