# Zeabur Worker 配置指南

## 问题诊断

### 发现
1. ✅ 测试订单已创建（订单 ID: `898d1d84-1c84-4914-857d-96762deb72e9`）
2. ✅ `external_jobs` 表已插入任务（kind: `PROVIDER_DEDICATED_LINE_ORDER`, status: `QUEUED`）
3. ✅ **Zeabur 上 worker 服务正在运行**（截图显示 openui 服务 1/1 运行中）
4. ❌ **任务未被执行**（status 保持 `QUEUED`，`completedAt` 为空）

### 根因
**Worker 服务缺少必需的环境变量**

`apps/worker/src/main.ts` 第 63 行：
```typescript
executionEnabled: env.DEDICATED_LINE_ORDER_EXECUTION_ENABLED === 'true',
```

如果该环境变量未设置或不为 `'true'`，worker 会跳过所有任务并记录：
```
dedicated_line_order_worker_disabled
```

---

## 解决方案：在 Zeabur 上配置环境变量

### 必需环境变量

访问 Zeabur 控制台 → worker 服务 → 环境变量，添加以下配置：

#### 1. 专线订单处理（必需）
```bash
DEDICATED_LINE_ORDER_EXECUTION_ENABLED=true
DEDICATED_LINE_ORDER_PROVIDER_ALLOWLIST=NINE_EIGHT_FIVE,IPIPD
WORKER_DEDICATED_LINE_ORDER_BATCH_SIZE=5
WORKER_DEDICATED_LINE_ORDER_POLL_INTERVAL_MS=10000
```

#### 2. 加密密钥（必需）
```bash
APP_ENCRYPTION_KEY=XuSW0H9sy6Cyirv3KoSQO8CRWHyaZ1r605l9Qi04V8g=
```
**重要**：加密密钥必须与数据库中已加密的凭据一致，否则无法解密 provider accounts。

#### 3. 数据库连接（应已配置）
```bash
DATABASE_URL=postgresql://root:am476QUKV3n8k1grlSju92c5Ee0YFTwb@43.172.85.117:32463/zeabur
```

#### 4. 其他 worker 配置（可选）
```bash
PROVIDER_FULFILLMENT_EXECUTION_ENABLED=true
WORKER_FULFILLMENT_BATCH_SIZE=10
WORKER_FULFILLMENT_POLL_INTERVAL_MS=15000

PROVIDER_INVENTORY_SYNC_ENABLED=true
WORKER_INVENTORY_SYNC_INTERVAL_MS=3600000

DEDICATED_LINE_PROJECTION_EXECUTION_ENABLED=false
DEDICATED_LINE_MIGRATION_EXECUTION_ENABLED=false
BARK_ALERTS_ENABLED=false
```

---

## 配置步骤

### 方式 1：通过 Zeabur 控制台（推荐）

1. 访问 https://zeabur.com/projects/6a786d805f062718bc7b8dfb
2. 点击左侧 **worker** 服务
3. 切换到 **环境变量**（Environment）标签
4. 逐个添加上述环境变量
5. 点击 **重新启动** 按钮

### 方式 2：通过 `zeabur.yaml`（全局配置）

编辑 `zeabur.yaml` 第 42-53 行：
```yaml
  worker:
    source:
      type: git
      repo: your-org/your-repo
      branch: railway-fixes-merge
    build:
      type: docker
      dockerfile: apps/worker/Dockerfile
      context: .
    env:
      NODE_ENV: production
      WORKER_ENABLED: "true"
      # 新增环境变量
      DEDICATED_LINE_ORDER_EXECUTION_ENABLED: "true"
      DEDICATED_LINE_ORDER_PROVIDER_ALLOWLIST: "NINE_EIGHT_FIVE,IPIPD"
      APP_ENCRYPTION_KEY: "XuSW0H9sy6Cyirv3KoSQO8CRWHyaZ1r605l9Qi04V8g="
      WORKER_DEDICATED_LINE_ORDER_BATCH_SIZE: "5"
      WORKER_DEDICATED_LINE_ORDER_POLL_INTERVAL_MS: "10000"
```

提交并推送：
```bash
git add zeabur.yaml
git commit -m "feat(worker): enable dedicated line order execution"
git push origin railway-fixes-merge
```

Zeabur 会自动检测更改并重新部署 worker 服务。

---

## 验证步骤

### 1. 重启 worker 后，检查日志

Zeabur 控制台 → worker 服务 → 日志（Logs），应看到：
```
Dedicated-line order worker started with interval 10000ms
```

**如果看到**：
```
dedicated_line_order_worker_disabled
```
说明环境变量未生效，需要重新检查配置。

### 2. 观察任务执行

10-30 秒后，查询任务状态：
```sql
SELECT 
  id, kind, status, attempt, "lastErrorCode", "completedAt", "createdAt"
FROM external_jobs
WHERE "dedicatedLineOrderId" = '898d1d84-1c84-4914-857d-96762deb72e9'
ORDER BY "createdAt" DESC
LIMIT 1;
```

**预期结果**：
- `status` 变为 `COMPLETED` 或 `FAILED`
- `completedAt` 不为空
- 如果失败，`lastErrorCode` 和 `lastErrorDetail` 会显示错误原因

### 3. 检查出口记录

如果任务成功：
```sql
SELECT id, "countryCode", "providerCode", "deliveredAt"
FROM residential_exits
WHERE "siteId" = '7f486516-aeee-4b80-9d6b-0c364c94c54a'
ORDER BY "createdAt" DESC
LIMIT 5;
```

应看到 1 条新记录：
- `countryCode`: `'US'`
- `providerCode`: `'NINE_EIGHT_FIVE'`
- `deliveredAt` 不为空

### 4. 检查专线记录

```sql
SELECT id, status, "createdAt"
FROM dedicated_lines
WHERE "siteId" = '7f486516-aeee-4b80-9d6b-0c364c94c54a'
ORDER BY "createdAt" DESC
LIMIT 5;
```

应看到 1 条新记录：
- `status`: `'ACTIVE'`

---

## 预期端到端流程

```
用户下单（测试订单 898d1d84-1c84-4914-857d-96762deb72e9）
  ↓
创建 external_job（kind: PROVIDER_DEDICATED_LINE_ORDER, status: QUEUED）
  ↓
Worker 轮询（每 10 秒）
  ↓
ProcessDedicatedLineOrderUseCase.execute()
  ↓
NineEightFiveAdapter.buyStaticProxy() → 985Proxy API
  ↓
返回 ProxyDelivery[]（美国 SOCKS5 代理）
  ↓
插入 residential_exits（countryCode=US, providerCode=NINE_EIGHT_FIVE）
  ↓
创建 dedicated_lines（status=ACTIVE）
  ↓
分配出口到专线（dedicated_line_exit_assignments）
  ↓
external_job 标记为 COMPLETED
  ↓
用户获取专线连接信息（vless:// 或 vmess://）
```

---

## 故障排查

### 问题 1：任务仍然 QUEUED
- **检查**：worker 日志是否有 `dedicated_line_order_worker_disabled`
- **解决**：确认环境变量 `DEDICATED_LINE_ORDER_EXECUTION_ENABLED=true` 已配置并重启

### 问题 2：任务 FAILED，错误 "Encryption key not found"
- **检查**：`APP_ENCRYPTION_KEY` 环境变量
- **解决**：确认加密密钥与本地 `.env` 一致

### 问题 3：任务 FAILED，错误 "Provider account not found"
- **检查**：`provider_accounts` 表记录
- **解决**：运行种子脚本 `node apps/api/scripts/seed-providers.js`

### 问题 4：任务 FAILED，错误 "985Proxy API error"
- **检查**：provider_accounts 中的 `credentialEncrypted` 是否正确
- **检查**：985Proxy API 是否可达（网络问题）
- **解决**：手动测试 985Proxy API：`node apps/api/scripts/test-provider-direct.js`

### 问题 5：任务 COMPLETED，但没有 residential_exits 记录
- **检查**：worker 日志中的 `dedicated_line_order_job_result`
- **检查**：use case 返回的 `ProxyDelivery[]` 是否为空
- **可能原因**：库存不足、provider API 返回格式变化

---

## 下一步

1. **立即操作**：在 Zeabur 控制台配置环境变量并重启 worker
2. **验证**：等待 10-30 秒后检查任务状态
3. **如果成功**：更新 progress.md，标记 Phase 4 完成
4. **如果失败**：根据错误日志诊断，更新 implementation-notes.md

---

## 参考资料

- Worker 主入口：`apps/worker/src/main.ts`
- 订单 worker：`apps/worker/src/dedicated-line-order-worker.ts`
- Use case：`apps/api/src/modules/dedicated-line-orders/process-dedicated-line-order.use-case.ts`
- 985Proxy adapter：`apps/api/src/modules/providers/adapters/nine-eight-five.adapter.ts`
- Zeabur 配置：`zeabur.yaml`
