import { prisma } from '@ipeasy/db';
import { encryptAesGcm } from '../src/common/crypto/aes-gcm';
import { createHash } from 'crypto';

const APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY;
if (!APP_ENCRYPTION_KEY) throw new Error('APP_ENCRYPTION_KEY required');

async function main() {
  console.log('🚀 Initializing Hong Kong control node infrastructure...\n');

  const site = await prisma.sites.findFirst();
  if (!site) throw new Error('No site found');

  const tenant = await prisma.tenants.findFirst({ where: { siteId: site.id } });
  if (!tenant) throw new Error('No tenant found');

  // 1. 创建香港节点组
  console.log('1️⃣ Creating Hong Kong node group...');
  const nodeGroup = await prisma.node_groups.create({
    data: {
      siteId: site.id,
      tenantId: tenant.id,
      code: 'HK_CONTROL',
      name: '香港控制节点组',
      regionCode: 'HK',
      isActive: true,
    },
  });
  console.log(`   ✅ Created node group: ${nodeGroup.id}\n`);

  // 2. 创建控制节点（使用占位符配置）
  console.log('2️⃣ Creating control node...');
  
  const placeholderApiKey = 'placeholder-api-key-replace-with-real';
  const apiCredentialCiphertext = encryptAesGcm(placeholderApiKey, APP_ENCRYPTION_KEY);
  const apiCredentialFingerprint = createHash('sha256')
    .update(placeholderApiKey)
    .digest('hex');
  
  const controlNode = await prisma.control_nodes.create({
    data: {
      siteId: site.id,
      tenantId: tenant.id,
      nodeGroupId: nodeGroup.id,
      code: 'HK_01',
      name: '香港控制节点-01',
      regionCode: 'HK',
      baseUrl: 'https://hk-control.example.com',
      apiCredentialCiphertext,
      apiCredentialFingerprint,
      status: 'PROVISIONING',
      capacityUnits: 1000,
      allocatedUnits: 0,
    },
  });
  console.log(`   ✅ Created control node: ${controlNode.id}`);
  console.log(`   ⚠️  Base URL is placeholder: ${controlNode.baseUrl}`);
  console.log(`   ⚠️  Status: ${controlNode.status}\n`);

  // 3. 创建入站配置（VLESS, VMESS, MIXED）
  console.log('3️⃣ Creating inbound profiles...');
  
  const vlessProfile = await prisma.inbound_profiles.create({
    data: {
      siteId: site.id,
      nodeGroupId: nodeGroup.id,
      controlNodeId: controlNode.id,
      protocol: 'VLESS',
      inboundTag: 'vless-in',
      listenAddress: '0.0.0.0',
      listenPort: 443,
      transportProtocol: 'tcp',
      isActive: true,
    },
  });
  console.log(`   ✅ VLESS profile: ${vlessProfile.id} (tag: ${vlessProfile.inboundTag})`);

  const vmessProfile = await prisma.inbound_profiles.create({
    data: {
      siteId: site.id,
      nodeGroupId: nodeGroup.id,
      controlNodeId: controlNode.id,
      protocol: 'VMESS',
      inboundTag: 'vmess-in',
      listenAddress: '0.0.0.0',
      listenPort: 10443,
      transportProtocol: 'tcp',
      isActive: true,
    },
  });
  console.log(`   ✅ VMESS profile: ${vmessProfile.id} (tag: ${vmessProfile.inboundTag})`);

  const mixedProfile = await prisma.inbound_profiles.create({
    data: {
      siteId: site.id,
      nodeGroupId: nodeGroup.id,
      controlNodeId: controlNode.id,
      protocol: 'MIXED',
      inboundTag: 'mixed-in',
      listenAddress: '0.0.0.0',
      listenPort: 20443,
      transportProtocol: 'tcp',
      isActive: true,
    },
  });
  console.log(`   ✅ MIXED profile: ${mixedProfile.id} (tag: ${mixedProfile.inboundTag})\n`);

  // 4. 为 US_DEDICATED SKU 创建落点策略
  console.log('4️⃣ Creating placement policies for US_DEDICATED...');
  
  const usSku = await prisma.service_skus.findUnique({
    where: { siteId_code: { siteId: site.id, code: 'US_DEDICATED' } },
  });
  
  if (!usSku) {
    console.log('   ⚠️  US_DEDICATED SKU not found, skipping placement policies');
  } else {
    // 为每个协议创建策略
    const vlessPolicy = await prisma.line_placement_policies.create({
      data: {
        siteId: site.id,
        skuId: usSku.id,
        inboundProfileId: vlessProfile.id,
        inboundTag: vlessProfile.inboundTag,
        priority: 100,
        isActive: true,
        requirements: {
          protocol: 'VLESS',
          countryCode: 'US',
        },
      },
    });
    console.log(`   ✅ VLESS policy: ${vlessPolicy.id} (priority: ${vlessPolicy.priority})`);

    const vmessPolicy = await prisma.line_placement_policies.create({
      data: {
        siteId: site.id,
        skuId: usSku.id,
        inboundProfileId: vmessProfile.id,
        inboundTag: vmessProfile.inboundTag,
        priority: 90,
        isActive: true,
        requirements: {
          protocol: 'VMESS',
          countryCode: 'US',
        },
      },
    });
    console.log(`   ✅ VMESS policy: ${vmessPolicy.id} (priority: ${vmessPolicy.priority})`);

    const mixedPolicy = await prisma.line_placement_policies.create({
      data: {
        siteId: site.id,
        skuId: usSku.id,
        inboundProfileId: mixedProfile.id,
        inboundTag: mixedProfile.inboundTag,
        priority: 80,
        isActive: true,
        requirements: {
          protocol: 'MIXED',
          countryCode: 'US',
        },
      },
    });
    console.log(`   ✅ MIXED policy: ${mixedPolicy.id} (priority: ${mixedPolicy.priority})`);
    
    // 将控制节点关联到策略
    await prisma.line_placement_policy_nodes.createMany({
      data: [
        { policyId: vlessPolicy.id, controlNodeId: controlNode.id },
        { policyId: vmessPolicy.id, controlNodeId: controlNode.id },
        { policyId: mixedPolicy.id, controlNodeId: controlNode.id },
      ],
    });
    console.log(`   ✅ Linked control node to all policies`);
  }

  console.log('\n✅ Hong Kong control infrastructure initialized successfully!');
  console.log('\n📋 Summary:');
  console.log(`   Node Group: ${nodeGroup.code} (${nodeGroup.id})`);
  console.log(`   Control Node: ${controlNode.code} (${controlNode.id})`);
  console.log(`   Inbound Profiles: 3 (VLESS, VMESS, MIXED)`);
  console.log(`   Placement Policies: 3 (for US_DEDICATED SKU)`);
  console.log('\n⚠️  Important next steps:');
  console.log('1. Deploy actual HK control server');
  console.log('2. Update control_nodes.baseUrl with real server URL');
  console.log('3. Update control_nodes.apiCredentialCiphertext with real API key');
  console.log('4. Update control_nodes.status to ACTIVE');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
