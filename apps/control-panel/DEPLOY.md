# Zeabur 部署指南

## 部署步骤

### 1. 准备工作

确保代码已推送到 Git 仓库（GitHub/GitLab）。

### 2. 在 Zeabur 创建 3 个服务

每个控制节点需要独立的 Zeabur 服务实例。

#### 服务 1: HK_VM_18545

1. 登录 [Zeabur Dashboard](https://zeabur.com)
2. 选择已有项目或创建新项目
3. 点击 "Add Service" → "Git"
4. 选择仓库并设置：
   - **Service Name**: `control-panel-hk-18545`
   - **Root Directory**: `apps/control-panel`
   - **Branch**: `main`

5. 配置环境变量：
   ```
   PORT=8080
   NODE_ID=HK_VM_18545
   API_TOKEN=ctrl_hk_vm18545_9f8e7d6c5b4a3210fedcba9876543210
   DATABASE_URL=postgresql://root:am476QUKV3n8k1grlSju92c5Ee0YFTwb@43.172.85.117:32463/zeabur
   ```

6. 点击 "Deploy"

#### 服务 2: HK_VM_18544

重复上述步骤，但使用以下配置：
- **Service Name**: `control-panel-hk-18544`
- **NODE_ID**: `HK_VM_18544`
- **API_TOKEN**: `ctrl_hk_vm18544_1a2b3c4d5e6f7890abcdef1234567890`

#### 服务 3: HK_VM_18541

重复上述步骤，但使用以下配置：
- **Service Name**: `control-panel-hk-18541`
- **NODE_ID**: `HK_VM_18541`
- **API_TOKEN**: `ctrl_hk_vm18541_fedcba9876543210abcdef1234567890`

### 3. 获取部署 URL

部署完成后，Zeabur 会为每个服务分配一个 URL，格式类似：
```
https://control-panel-hk-18545-xxx.zeabur.app
https://control-panel-hk-18544-xxx.zeabur.app
https://control-panel-hk-18541-xxx.zeabur.app
```

### 4. 测试健康检查

```bash
curl https://control-panel-hk-18545-xxx.zeabur.app/health
curl https://control-panel-hk-18544-xxx.zeabur.app/health
curl https://control-panel-hk-18541-xxx.zeabur.app/health
```

预期响应：
```json
{
  "status": "healthy",
  "timestamp": "2026-09-05T...",
  "nodeId": "HK_VM_18545"
}
```

### 5. 更新数据库中的 baseUrl

部署成功后，需要更新 `control_nodes` 表中的 `baseUrl` 字段：

```typescript
// apps/api/scripts/update-control-node-urls.ts
import { prisma } from '@ipeasy/db';

const NODES = [
  {
    code: 'HK_VM_18545',
    baseUrl: 'https://control-panel-hk-18545-xxx.zeabur.app',
  },
  {
    code: 'HK_VM_18544',
    baseUrl: 'https://control-panel-hk-18544-xxx.zeabur.app',
  },
  {
    code: 'HK_VM_18541',
    baseUrl: 'https://control-panel-hk-18541-xxx.zeabur.app',
  },
];

async function main() {
  for (const node of NODES) {
    await prisma.control_nodes.update({
      where: { code: node.code },
      data: { baseUrl: node.baseUrl },
    });
    console.log(`✅ Updated ${node.code}: ${node.baseUrl}`);
  }
}

main().finally(() => prisma.$disconnect());
```

运行脚本：
```bash
cd apps/api
pnpm tsx scripts/update-control-node-urls.ts
```

### 6. 激活控制节点

```typescript
// apps/api/scripts/activate-control-nodes.ts
import { prisma } from '@ipeasy/db';

async function main() {
  await prisma.control_nodes.updateMany({
    where: { status: 'DISABLED' },
    data: { status: 'ACTIVE' },
  });
  console.log('✅ All control nodes activated');
}

main().finally(() => prisma.$disconnect());
```

运行脚本：
```bash
cd apps/api
pnpm tsx scripts/activate-control-nodes.ts
```

## 验证部署

```bash
# 1. 健康检查
curl https://control-panel-hk-18545-xxx.zeabur.app/health

# 2. 测试认证（应该返回 401）
curl https://control-panel-hk-18545-xxx.zeabur.app/lines/test/status

# 3. 测试认证成功（应该返回 200）
curl https://control-panel-hk-18545-xxx.zeabur.app/lines/test/status \
  -H "Authorization: Bearer ctrl_hk_vm18545_9f8e7d6c5b4a3210fedcba9876543210"
```

## 故障排查

### 查看日志
在 Zeabur Dashboard 中点击服务，查看 "Logs" 标签页。

### 常见问题

1. **构建失败**
   - 检查 `zbpack.json` 配置
   - 确认 `pnpm build` 命令能在本地成功执行

2. **启动失败**
   - 检查环境变量是否正确配置
   - 查看服务日志中的错误信息

3. **数据库连接失败**
   - 确认 `DATABASE_URL` 环境变量正确
   - 检查 Zeabur 到 PostgreSQL 的网络连通性

## 下一步

部署完成后：
1. 运行库存同步脚本测试 985Proxy 和 ipipd 集成
2. 创建测试专线订单
3. 验证端到端流程
