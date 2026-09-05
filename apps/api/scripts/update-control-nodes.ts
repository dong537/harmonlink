import { prisma } from '@ipeasy/db';
import { encryptAesGcm } from '../src/common/crypto/aes-gcm';
import { createHash } from 'node:crypto';

const APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY!;

// 你的 3 台香港转发服务器
const CONTROL_NODES = [
  { code: 'HK_VM_18545', ip: '185.216.118.243', apiToken: 'PLACEHOLDER_TOKEN_18545' },
  { code: 'HK_VM_18544', ip: '185.216.118.242', apiToken: 'PLACEHOLDER_TOKEN_18544' },
  { code: 'HK_VM_18541', ip: '185.216.118.241', apiToken: 'PLACEHOLDER_TOKEN_18541' },
];

async function main() {
  console.log('🔧 更新控制节点为真实香港服务器...\n');

  const site = await prisma.sites.findFirst();
  if (!site) {
    console.log('❌ 未找到站点');
    return;
  }

  const nodeGroup = await prisma.node_groups.findFirst({
    where: { siteId: site.id, code: 'HK_CONTROL' }
  });

  if (!nodeGroup) {
    console.log('❌ 未找到 HK_CONTROL 节点组');
    return;
  }

  // 删除旧的占位符控制节点
  const oldNodes = await prisma.control_nodes.findMany({
    where: { nodeGroupId: nodeGroup.id }
  });

  if (oldNodes.length > 0) {
    // 先删除关联的 policy_nodes
    await prisma.line_placement_policy_nodes.deleteMany({
      where: { nodeId: { in: oldNodes.map(n => n.id) } }
    });

    // 再删除控制节点
    await prisma.control_nodes.deleteMany({
      where: { nodeGroupId: nodeGroup.id }
    });

    console.log(`✅ 已删除 ${oldNodes.length} 个旧控制节点\n`);
  }

  // 创建真实控制节点
  for (const node of CONTROL_NODES) {
    const credentialPlaintext = JSON.stringify({ token: node.apiToken });
    const credentialCiphertext = encryptAesGcm(credentialPlaintext, APP_ENCRYPTION_KEY);
    const credentialFingerprint = createHash('sha256').update(credentialPlaintext).digest('hex');

    const controlNode = await prisma.control_nodes.create({
      data: {
        siteId: site.id,
        nodeGroupId: nodeGroup.id,
        code: node.code,
        name: `Hong Kong Control ${node.code}`,
        regionCode: 'HK',
        baseUrl: `http://${node.ip}:8080`, // 假设控制面板 API 在 8080 端口
        apiCredentialCiphertext: credentialCiphertext,
        apiCredentialFingerprint: credentialFingerprint,
        capacityUnits: 1000,
        allocatedUnits: 0,
        status: 'DISABLED', // 部署控制面板后改为 ACTIVE
      }
    });

    console.log(`✅ 创建控制节点: ${node.code}`);
    console.log(`   IP: ${node.ip}`);
    console.log(`   Base URL: http://${node.ip}:8080`);
    console.log(`   Status: DISABLED (待部署后激活)\n`);
  }

  // 更新 line_placement_policy_nodes 关联
  const policies = await prisma.line_placement_policies.findMany({
    where: { nodeGroupId: nodeGroup.id }
  });

  const newNodes = await prisma.control_nodes.findMany({
    where: { nodeGroupId: nodeGroup.id }
  });

  await prisma.line_placement_policy_nodes.deleteMany({
    where: { policyId: { in: policies.map(p => p.id) } }
  });

  for (const policy of policies) {
    for (const node of newNodes) {
      await prisma.line_placement_policy_nodes.create({
        data: {
          siteId: site.id,
          policyId: policy.id,
          nodeId: node.id,
        }
      });
    }
  }

  console.log(`✅ 已关联 ${policies.length} 个策略到 ${newNodes.length} 个控制节点\n`);
  console.log('📋 下一步:');
  console.log('1. 在 3 台服务器上部署控制面板服务');
  console.log('2. 获取每台服务器的 API Token');
  console.log('3. 更新 control_nodes 表的 apiCredentialCiphertext');
  console.log('4. 将 status 改为 ACTIVE');
  console.log('5. 测试配置推送');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
