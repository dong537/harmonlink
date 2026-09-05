import { prisma } from '@ipeasy/db';

async function main() {
  console.log('🔍 Checking existing infrastructure in detail...\n');

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
  nodeGroups.forEach(ng => {
    console.log(`  - ${ng.code} (${ng.id}): ${ng.name}`);
  });

  console.log(`\nControl Nodes: ${controlNodes.length}`);
  controlNodes.forEach(cn => {
    console.log(`  - ${cn.code} (${cn.id}): ${cn.baseUrl} [${cn.status}]`);
  });

  console.log(`\nInbound Profiles: ${inboundProfiles.length}`);
  inboundProfiles.forEach(ip => {
    console.log(`  - ${ip.code} (${ip.id}): ${ip.protocol} tag=${ip.inboundTag} port=${ip.listenPort}`);
  });

  console.log(`\nPlacement Policies: ${placementPolicies.length}`);
  placementPolicies.forEach(pp => {
    console.log(`  - ${pp.id}: ${pp.sku.code} -> ${pp.inboundTag} (priority ${pp.priority})`);
  });

  if (controlNodes.length > 0) {
    console.log('\n✅ Infrastructure already exists, use existing control node');
  } else if (nodeGroups.length > 0) {
    console.log('\n⚠️  Node group exists but no control nodes. Need to create control node.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
