import { prisma } from '@ipeasy/db';

const NODES = [
  {
    code: 'HK_VM_18545',
    baseUrl: 'https://control-panel-hk-18545-xxx.zeabur.app', // 替换为实际 URL
  },
  {
    code: 'HK_VM_18544',
    baseUrl: 'https://control-panel-hk-18544-xxx.zeabur.app', // 替换为实际 URL
  },
  {
    code: 'HK_VM_18541',
    baseUrl: 'https://control-panel-hk-18541-xxx.zeabur.app', // 替换为实际 URL
  },
];

async function main() {
  console.log('🔄 Updating control node URLs...\n');

  for (const node of NODES) {
    const updated = await prisma.control_nodes.update({
      where: { code: node.code },
      data: { baseUrl: node.baseUrl },
    });
    console.log(`✅ ${updated.code}: ${updated.baseUrl}`);
  }

  console.log('\n✨ URLs updated successfully!');
}

main()
  .catch((error) => {
    console.error('❌ Update failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
