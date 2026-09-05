import { prisma } from '@ipeasy/db';

async function main() {
  console.log('📊 Checking dedicated_line_inventory_snapshots...\n');

  const snapshots = await prisma.dedicated_line_inventory_snapshots.findMany({
    where: {
      countryCode: 'US',
    },
    orderBy: { capturedAt: 'desc' },
    include: {
      sku: { select: { code: true, name: true } },
      providerAccount: { select: { providerCode: true, baseUrl: true, status: true } },
    },
  });

  console.log(`Total US snapshots: ${snapshots.length}\n`);

  for (const snapshot of snapshots) {
    console.log('---');
    console.log(`ID: ${snapshot.id}`);
    console.log(`SKU: ${snapshot.sku.code} (${snapshot.sku.name})`);
    console.log(`Provider: ${snapshot.providerAccount.providerCode} [${snapshot.providerAccount.status}]`);
    console.log(`Country: ${snapshot.countryCode}`);
    console.log(`Provider Resource ID: ${snapshot.providerResourceId}`);
    console.log(`Quantity: ${snapshot.quantity}`);
    console.log(`Reserved: ${snapshot.reservedQuantity}`);
    console.log(`Available: ${snapshot.quantity - snapshot.reservedQuantity}`);
    console.log(`Captured At: ${snapshot.capturedAt.toISOString()}`);
    console.log(`Expires At: ${snapshot.expiresAt.toISOString()}`);
    console.log(`Source Version: ${snapshot.sourceVersion}`);
    console.log();
  }

  const totalAvailable = snapshots.reduce(
    (sum, s) => sum + (s.quantity - s.reservedQuantity),
    0
  );

  console.log(`\n✅ Total available US inventory: ${totalAvailable}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
