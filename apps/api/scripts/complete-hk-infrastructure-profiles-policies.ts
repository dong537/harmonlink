import { prisma } from '@ipeasy/db';

async function main() {
  console.log('🚀 Creating inbound profiles and placement policies...\n');

  const site = await prisma.sites.findFirst();
  if (!site) throw new Error('No site found');

  const nodeGroup = await prisma.node_groups.findUnique({
    where: { siteId_code: { siteId: site.id, code: 'HK_CONTROL' } },
  });
  if (!nodeGroup) throw new Error('HK_CONTROL node group not found');

  const controlNode = await prisma.control_nodes.findUnique({
    where: { siteId_code: { siteId: site.id, code: 'HK_01' } },
  });
  if (!controlNode) throw new Error('HK_01 control node not found');

  console.log(`Using node group: ${nodeGroup.id}`);
  console.log(`Using control node: ${controlNode.id}\n`);

  // 检查是否已存在 inbound profiles
  const existingProfiles = await prisma.inbound_profiles.findMany({
    where: { siteId: site.id, nodeGroupId: nodeGroup.id },
  });

  if (existingProfiles.length > 0) {
    console.log(`✅ Found ${existingProfiles.length} existing inbound profiles\n`);
  }

  // 重新获取所有 profiles
  const profiles = await prisma.inbound_profiles.findMany({
    where: { siteId: site.id, nodeGroupId: nodeGroup.id },
  });

  const vlessProfile = profiles.find(p => p.protocol === 'VLESS');
  const vmessProfile = profiles.find(p => p.protocol === 'VMESS');
  const mixedProfile = profiles.find(p => p.protocol === 'MIXED');

  if (!vlessProfile || !vmessProfile || !mixedProfile) {
    throw new Error('Missing required inbound profiles');
  }

  // 检查是否已存在 placement policies
  const existingPolicies = await prisma.line_placement_policies.findMany({
    where: { siteId: site.id, nodeGroupId: nodeGroup.id },
  });

  if (existingPolicies.length > 0) {
    console.log(`✅ Found ${existingPolicies.length} existing placement policies`);
    console.log('   Skipping policy creation\n');
    
    // 检查 policy nodes
    const existingPolicyNodes = await prisma.line_placement_policy_nodes.findMany({
      where: { siteId: site.id },
    });
    
    if (existingPolicyNodes.length > 0) {
      console.log(`✅ Found ${existingPolicyNodes.length} policy-node links`);
    } else {
      console.log('⚠️  No policy-node links found, creating them...');
      await prisma.line_placement_policy_nodes.createMany({
        data: existingPolicies.map(policy => ({
          siteId: site.id,
          policyId: policy.id,
          nodeId: controlNode.id,
        })),
      });
      console.log(`   ✅ Linked ${existingPolicies.length} policies to control node`);
    }
    
    console.log('\n✅ Infrastructure already complete!');
    return;
  }

  // 为 US_DEDICATED SKU 创建落点策略
  console.log('2️⃣ Creating placement policies for US_DEDICATED...');
  
  const usSku = await prisma.service_skus.findUnique({
    where: { siteId_code: { siteId: site.id, code: 'US_DEDICATED' } },
  });
  
  if (!usSku) {
    console.log('   ⚠️  US_DEDICATED SKU not found, skipping placement policies');
    return;
  }

  // 为每个协议创建策略
  const vlessPolicy = await prisma.line_placement_policies.create({
    data: {
      siteId: site.id,
      skuId: usSku.id,
      nodeGroupId: nodeGroup.id,
      inboundProfileId: vlessProfile.id,
      targetReplicaCount: 1,
      minReadyReplicaCount: 1,
      maxUnitsPerNode: 500,
      priority: 100,
      isActive: true,
    },
  });
  console.log(`   ✅ VLESS policy: ${vlessPolicy.id}`);

  const vmessPolicy = await prisma.line_placement_policies.create({
    data: {
      siteId: site.id,
      skuId: usSku.id,
      nodeGroupId: nodeGroup.id,
      inboundProfileId: vmessProfile.id,
      targetReplicaCount: 1,
      minReadyReplicaCount: 1,
      maxUnitsPerNode: 500,
      priority: 90,
      isActive: true,
    },
  });
  console.log(`   ✅ VMESS policy: ${vmessPolicy.id}`);

  const mixedPolicy = await prisma.line_placement_policies.create({
    data: {
      siteId: site.id,
      skuId: usSku.id,
      nodeGroupId: nodeGroup.id,
      inboundProfileId: mixedProfile.id,
      targetReplicaCount: 1,
      minReadyReplicaCount: 1,
      maxUnitsPerNode: 500,
      priority: 80,
      isActive: true,
    },
  });
  console.log(`   ✅ MIXED policy: ${mixedPolicy.id}`);
  
  // 将控制节点关联到策略（注意字段名是 nodeId 不是 controlNodeId）
  await prisma.line_placement_policy_nodes.createMany({
    data: [
      { siteId: site.id, policyId: vlessPolicy.id, nodeId: controlNode.id },
      { siteId: site.id, policyId: vmessPolicy.id, nodeId: controlNode.id },
      { siteId: site.id, policyId: mixedPolicy.id, nodeId: controlNode.id },
    ],
  });
  console.log(`   ✅ Linked control node to all policies`);

  console.log('\n✅ Infrastructure setup complete!');
  console.log('\n📋 Summary:');
  console.log(`   Inbound Profiles: 3 (VLESS, VMESS, MIXED)`);
  console.log(`   Placement Policies: 3 (for US_DEDICATED SKU)`);
  console.log(`   Policy-Node Links: 3`);
  console.log('\n📝 System is now ready for US dedicated line orders!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
