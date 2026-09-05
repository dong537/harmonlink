import { prisma } from '@ipeasy/db';

async function main() {
  console.log('🚀 Activating control nodes...\n');

  const result = await prisma.control_nodes.updateMany({
    where: { status: 'DISABLED' },
    data: { status: 'ACTIVE' },
  });

  console.log(`✅ Activated ${result.count} control node(s)`);

  // 验证激活状态
  const nodes = await prisma.control_nodes.findMany({
    select: {
      code: true,
      baseUrl: true,
      status: true,
    },
  });

  console.log('\n📊 Current node status:');
  nodes.forEach(node => {
    console.log(`  - ${node.code}: ${node.status} (${node.baseUrl})`);
  });

  console.log('\n✨ All control nodes activated!');
}

main()
  .catch((error) => {
    console.error('❌ Activation failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
