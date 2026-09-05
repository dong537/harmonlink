import { prisma } from '@ipeasy/db';

async function main() {
  const skus = await prisma.service_skus.findMany({
    where: { isActive: true },
    select: {
      id: true,
      code: true,
      name: true,
      capabilities: true,
      isVisible: true,
    },
    take: 10,
  });

  console.log('Active SKUs:', skus.length);
  for (const sku of skus) {
    console.log('\n---');
    console.log(`ID: ${sku.id}`);
    console.log(`Code: ${sku.code}`);
    console.log(`Name: ${sku.name}`);
    console.log(`Visible: ${sku.isVisible}`);
    console.log(`Capabilities: ${JSON.stringify(sku.capabilities, null, 2)}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
