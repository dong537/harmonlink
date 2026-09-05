import { prisma } from '@ipeasy/db';

async function main() {
  console.log('🔍 Checking control infrastructure...\n');

  const site = await prisma.sites.findFirst();
  if (!site) throw new Error('No site found');

  const nodeGroups = await prisma.node_groups.findMany({
    where: { siteId: site.id },
  });

  const controlNodes = await prisma.control_nodes.findMany({
    where: { siteId: site.id },
  });

  const inboundProfiles = await prisma.inbound_profiles.findMany({
    where: { siteId: site.id },
  });

  const placementPolicies = await prisma.line_placement_policies.findMany({
    where: { siteId: site.id },
    include: { sku: { select: { code: true, name: true } } },
  });

  console.log(`Node Groups: ${nodeGroups.length}`);
  console.log(`Control Nodes: ${controlNodes.length}`);
  console.log(`Inbound Profiles: ${inboundProfiles.length}`);
  console.log(`Placement Policies: ${placementPolicies.length}\n`);

  if (controlNodes.length === 0) {
    console.log('❌ No control nodes found');
    console.log('   Need to initialize Hong Kong control node infrastructure\n');
    console.log('Required steps:');
    console.log('1. Create node_groups record for Hong Kong');
    console.log('2. Create control_nodes record with HK control server endpoint');
    console.log('3. Create inbound_profiles for VLESS/VMESS/MIXED protocols');
    console.log('4. Create line_placement_policies linking SKU to inbound profile');
  } else {
    console.log('✅ Control infrastructure exists\n');
    
    console.log('Node Groups:');
    nodeGroups.forEach(ng => console.log(`  - ${ng.code}: ${ng.name} (${ng.primaryRegionCode})`));
    
    console.log('\nControl Nodes:');
    controlNodes.forEach(cn => console.log(`  - ${cn.id}: ${cn.apiEndpoint} [${cn.status}]`));
    
    console.log('\nInbound Profiles:');
    inboundProfiles.forEach(ip => console.log(`  - ${ip.inboundTag}: ${ip.protocol} port ${ip.listenPort}`));
    
    console.log('\nPlacement Policies:');
    placementPolicies.forEach(pp => console.log(`  - ${pp.sku.code}: tag=${pp.inboundTag}, priority=${pp.priority}`));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
