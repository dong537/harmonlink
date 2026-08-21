# IPEasy 平台业务逻辑全景架构

**生成时间**: 2026-08-20  
**Railway 合并后**: railway-fixes-merge 分支  
**数据源**: Prisma Schema + Backend Specs + 核心 Use Cases

---

## 📋 目录

1. [业务域概览](#业务域概览)
2. [核心业务流程](#核心业务流程)
3. [数据模型架构](#数据模型架构)
4. [技术栈与边界](#技术栈与边界)
5. [关键业务规则](#关键业务规则)

---

## 业务域概览

### 平台定位

**IPEasy = 全球家宽代理平台**
- 提供静态/动态住宅 IP 代理服务
- 支持多国家、多协议（HTTP/SOCKS5/VLESS/VMESS）
- 面向企业和个人用户的 SaaS 平台

### 核心价值链

```
供应商 → 库存同步 → 定价 → 用户下单 → 履约交付 → 续费/迁移 → 运维监控
  ↓          ↓         ↓        ↓          ↓           ↓         ↓
Platform365 上游商   SKU系统  钱包扣款  专线部署   智能调度   健康观测
  IPIPD     API账户   价格模板  订单系统  节点分配   路由导入   故障迁移
```

---

## 核心业务流程

### 1. 用户注册与租户体系

**多租户架构**：
```
Site (站点)
  └─ Tenant (租户)
       ├─ User (普通用户)
       ├─ AdminUser (管理员)
       └─ ApiKey (API密钥)
```

**关键规则**：
- 每个 **Site** 有独立域名、品牌配置、系统设置
- **Tenant** 可以有 owner (租户所有者)
- User 必须属于 Tenant，Tenant 必须属于 Site
- 支持 KYC 认证、风险标记

**状态机**：
- User: `ACTIVE` → `SUSPENDED` → `BANNED`
- Tenant: `ACTIVE` → `SUSPENDED` → `CLOSED`
- Admin: `ACTIVE` → `SUSPENDED`

---

### 2. 钱包与支付系统

**钱包账户模型**：
```typescript
Wallet {
  available: Decimal    // 可用余额
  frozen: Decimal       // 冻结金额
  currency: String      // CNY/USD
  version: Int          // 乐观锁版本号
}
```

**账本事件类型**：
- `DEPOSIT` - 充值
- `DEBIT` - 扣款（下单）
- `REFUND` - 退款
- `ADJUSTMENT` - 调整
- `FREEZE` / `UNFREEZE` - 冻结/解冻
- `RENEWAL` - 续费
- `COMMISSION` - 佣金

**支付流程**：
```
1. 用户发起充值 → PaymentOrder (PENDING)
2. 选择渠道 (MANUAL/YIPAY/ALIPAY)
3. 确认到账 → PaymentOrder (COMPLETED)
4. 写入 LedgerEntry + 更新 Wallet.available
```

**关键约束**：
- 所有钱包操作必须通过 `idempotencyKey` 防重
- 余额不足时下单失败，不透支
- LedgerEntry 记录 `balanceAfter`，可审计

---

### 3. 专线订单与履约系统

#### 3.1 SKU 定价体系

**三层定价**：
```
1. PriceTemplate (价格模板)
   └─ SkuPriceRules (SKU规则: 模板级)

2. SkuPriceOverrides (SKU覆盖: 站点级)

3. UserSkuPriceOverrides (SKU覆盖: 用户级)
```

**查询顺序**：
```
User级覆盖 → 站点级覆盖 → 用户绑定的模板规则 → 默认模板
```

**SKU 能力定义**：
```json
{
  "code": "DEDICATED_LINE_VLESS_01",
  "name": "VLESS 专线",
  "capabilities": {
    "protocols": ["vless", "vmess"],
    "trafficQuota": "100GB",
    "bandwidth": "100Mbps"
  }
}
```

---

#### 3.2 库存管理

**库存快照模型**：
```
DedicatedLineInventorySnapshot {
  providerAccountId: 供应商账户
  skuId: SKU
  countryCode: 国家
  quantity: 总量
  reservedQuantity: 已预留量
  sourceVersion: 快照版本
  capturedAt: 采集时间
  expiresAt: 过期时间
}
```

**库存预留流程**：
```
1. 用户下单 → 查询最新快照
2. 创建 StockReservation (status=ACTIVE)
3. 更新 snapshot.reservedQuantity += quantity
4. 下单成功 → status=CONSUMED
5. 下单失败/超时 → status=RELEASED, 释放库存
```

**库存不足处理**：
- 返回 `422 UPSTREAM_OUT_OF_STOCK`
- **不创建订单、不扣款、不预留**
- 发送 Bark 告警（OutboxEvent 去重）

---

#### 3.3 专线订单生命周期

**状态机**：
```
DedicatedLineOrder (订单)
  ↓ 创建
DedicatedLine (专线实例)
  ↓
PENDING_PAYMENT → QUEUED → PROVISIONING → ACTIVE
                                ↓
                          DEGRADED (部分故障)
                                ↓
                    SUSPENDED / EXPIRED / CANCELLED
```

**关键字段**：
- `idempotencyKey` - 防重键
- `contractVersion` - 合约版本（SKU能力版本）
- `legacyId` - 兼容旧前端的数字 ID（自增）
- `clientIdentityCiphertext` - 加密的客户端凭证（UUID 或 用户名/密码）

---

### 4. 专线交付与部署

#### 4.1 节点与放置策略

**节点层级**：
```
NodeGroup (节点组: 区域级)
  └─ ControlNode (控制节点: 单机)
       └─ InboundProfile (入站配置: 协议+端口)
```

**放置策略 (LinePlacementPolicy)**：
```typescript
{
  mode: "ACTIVE_ACTIVE" | "HOT_STANDBY",  // 主主 / 主备
  targetReplicaCount: 2,                  // 目标副本数
  minReadyReplicaCount: 1,                // 最小就绪数
  maxUnitsPerNode: 100,                   // 单节点最大容量
  allowedNodes: [nodeId1, nodeId2]        // 允许的节点白名单
}
```

**Placement 实例**：
```
DedicatedLinePlacement
  └─ DedicatedLinePlacementNode (多个)
       ├─ nodeId
       ├─ ordinal (序号: 0, 1, 2...)
       └─ assignedAt
```

---

#### 4.2 投影系统 (Projection)

**设计模式**: Event Sourcing + CQRS

**投影生命周期**：
```
PENDING → APPLYING → READY → (可能) FAILED / DELETING → DELETED
```

**投影职责**：
- 将 `DedicatedLine` 的期望状态同步到各个 `ControlNode`
- 每个 (Line, Node) 组合一个投影记录
- 记录 `desiredVersion` vs `observedVersion`
- 记录 `desiredHash` vs `observedHash`（幂等性）

**投影字段**：
```typescript
DedicatedLineProjection {
  dedicatedLineId: UUID
  nodeId: UUID
  projectionKey: String (唯一键)
  status: ProjectionStatus
  desiredVersion: Int
  observedVersion: Int?
  nodeExternalId: String? (节点侧的ID)
  lastErrorCode: String?
  retryCount: Int
}
```

---

#### 4.3 出口分配 (Exit Assignment)

**住宅出口池**：
```
ResidentialExit {
  providerCode: "PLATFORM_365" | "NINE_EIGHT_FIVE" | "IPIPD"
  countryCode: "US" / "GB" / "JP" ...
  endpointCiphertext: 加密的出口地址
  credentialCiphertext: 加密的认证信息
  identityFingerprint: 唯一指纹
  maxReplicaFanout: 1 (一个出口最多分配给几条专线)
  status: AVAILABLE | RESERVED | ASSIGNED | QUARANTINED | EXPIRED
}
```

**分配规则**：
- 一条专线 **必须** 分配一个出口 (ExitAssignment)
- 出口状态: `AVAILABLE` → `ASSIGNED` (active) → `RELEASING` → `RELEASED`
- 隔离期 (Quarantine): 出口故障后进入隔离，不再分配

---

#### 4.4 交付路由 (Delivery Route)

**路由导入系统**：
```
DeliveryRouteImport (一次导入批次)
  ├─ sourceName: "3x-ui-node-1"
  ├─ sourceVersion: "2026-08-15T10:00:00Z"
  └─ sourceFingerprint: SHA256(source)
       ↓
  DeliveryRoute (多条路由)
    ├─ dedicatedLineId
    ├─ entranceGroupCode
    ├─ listenPort
    ├─ isCurrent: Boolean (当前生效)
    ├─ isStaged: Boolean (灰度中)
    └─ deliveryRouteDomains (域名列表)
         ├─ hostname
         ├─ port
         └─ isPrimary
```

**路由切换流程**：
```
1. 导入新路由 → isCurrent=false, isStaged=false
2. Canary 灰度 → isStaged=true (部分流量)
3. Cutover 切换 → 旧路由 isCurrent=false, 新路由 isCurrent=true
4. Rollback 回滚 → 恢复旧路由
```

---

### 5. 专线迁移系统

#### 5.1 迁移类型

```typescript
enum DedicatedLineMigrationType {
  NODE_ONLY,    // 只迁移节点（出口不变）
  EXIT_ONLY,    // 只迁移出口（节点不变）
  FULL          // 节点+出口全迁移
}
```

#### 5.2 迁移阶段

```
PREPARE      (准备: 预留资源)
  ↓
CANARY_ROUTE (灰度路由)
  ↓
VERIFY       (验证: smoke test)
  ↓
CUTOVER_ROUTE (切换路由)
  ↓
COMMIT       (提交: 释放旧资源)
  ↓
CLEANUP      (清理)

or

ROLLBACK     (回滚: 恢复旧配置)
```

#### 5.3 迁移状态

```
ACTIVE           (进行中)
NEEDS_OPERATOR   (需人工介入)
COMPLETED        (已完成)
CANCELLED        (已取消)
FAILED           (已失败)
```

#### 5.4 迁移推荐 (Migration Recommendation)

**触发条件**：
- 节点健康检查失败
- 出口健康检查失败
- 节点容量不足

**推荐记录**：
```typescript
DedicatedLineMigrationRecommendation {
  dedicatedLineId: UUID
  sourceNodeId: UUID (故障节点)
  incidentVersion: Int (故障版本号)
  status: ACTIVE | RESOLVED | DISMISSED
  reasonCode: "NODE_UNHEALTHY" | "EXIT_EXPIRED" | "CAPACITY_EXCEEDED"
  candidates: [
    { nodeId, rank, eligible, reasonCode }
  ]
}
```

---

### 6. 监控与观测

#### 6.1 出口健康检查

```
ExitHealthObservation {
  residentialExitId: UUID
  dedicatedLineId: UUID?
  reachable: Boolean
  observedIp: String?
  observedCountryCode: String?
  latencyMs: Int?
  failureType: "TIMEOUT" | "DNS_FAIL" | "IP_MISMATCH"
  observedAt: DateTime
  freshUntil: DateTime (有效期)
}
```

**检查频率**: 每 5 分钟一次  
**失败阈值**: 连续 3 次失败 → 触发迁移推荐

---

#### 6.2 节点健康检查

```
ControlNodeHealthObservation {
  nodeId: UUID
  projectionKey: String? (关联投影)
  reachable: Boolean
  observedVersion: Int?
  observedHash: String?
  latencyMs: Int?
  failureType: String?
  observedAt: DateTime
}
```

---

#### 6.3 烟雾测试 (Smoke Test)

**迁移过程中的验证**：
```
DedicatedLineSmokeObservation {
  dedicatedLineId: UUID
  migrationId: UUID
  stage: CANARY | CUTOVER | ROLLBACK
  hostname: String (测试域名)
  verified: Boolean
  observedIp: String?
  observedCountryCode: String?
  latencyMs: Int?
  failureType: String?
  observedAt: DateTime
  freshUntil: DateTime
}
```

---

### 7. 异步任务系统

#### 7.1 ExternalJob (外部任务队列)

**用途**: 长时间运行的业务任务

```typescript
ExternalJob {
  kind: "DEDICATED_LINE_PROVISION" | "DEDICATED_LINE_RENEW" | ...
  aggregateType: "DedicatedLine"
  aggregateId: UUID
  desiredVersion: Int
  status: QUEUED | LEASED | RETRYING | COMPLETED | FAILED | NEEDS_OPERATOR
  attempt: Int
  maxAttempts: 5
  nextRunAt: DateTime
  leaseOwner: String? (worker ID)
  leaseExpiresAt: DateTime?
  payload: Json
}
```

**任务调度**：
- Worker 定期轮询 `status=QUEUED` 且 `nextRunAt <= now`
- 抢占式租约 (lease): 更新 `leaseOwner` + `leaseExpiresAt`
- 超时自动释放: `leaseExpiresAt < now` → 重新进入队列

---

#### 7.2 OutboxEvent (事件发布)

**用途**: 可靠事件发布（Transactional Outbox Pattern）

```typescript
OutboxEvent {
  topic: "dedicated_line.provisioned" | "inventory.low" | ...
  aggregateType: "DedicatedLine"
  aggregateId: UUID
  desiredVersion: Int
  status: PENDING | LEASED | RETRYING | PUBLISHED | FAILED
  payload: Json
  idempotencyKey: String
  dedupeKey: String (去重键)
}
```

**去重机制**：
- 同一 `dedupeKey` 只发布一次
- 例如: 库存不足告警 → `dedupeKey = "inventory_low:SK5:US"`

---

### 8. Legacy API v1 兼容层

**背景**: Railway 恢复的旧前端硬编码了 `/api/v1` 端点

#### 8.1 兼容范围

**端点映射**：
```
POST /api/v1/auth/login          → LoginUseCase (legacy mode)
POST /api/v1/auth/refresh        → 刷新 token (refresh_token 开头 rt_)
GET  /api/v1/dedicated-skus      → CatalogRepository.listSaleableSkus
POST /api/v1/dedicated/preview   → SkuQuoteUseCase
POST /api/v1/dedicated/purchase-v2 → CreateDedicatedLineOrderUseCase
GET  /api/v1/dedicated/my        → DedicatedLineDeliveryUseCase.list
POST /api/v1/dedicated/:id/renew → RenewDedicatedLineUseCase
```

#### 8.2 关键差异

**响应格式**：
- 新 API: `{code, msg, data, requestId}` (标准 envelope)
- Legacy API: 直接返回 JSON，无 envelope

**错误格式**：
- Legacy: `{statusCode, message, errorCode, timestamp, path}`

**认证**：
- Access Token: JWT Bearer (兼容新旧)
- **Refresh Token**: 前缀 `rt_`，只能用于 `/auth/refresh`，**禁止** 作为 Bearer Token

**数字 ID**：
- 旧前端只认数字 ID
- 新增 `dedicated_lines.legacyId SERIAL UNIQUE`
- 路由参数 `:id` 解析为数字，后端转换为 UUID

---

### 9. 联邦上游系统 (Federated Upstream)

**用途**: 对接其他平台的库存/价格

```typescript
FederatedUpstreamConnection {
  kind: "PLATFORM_365" | "NINE_EIGHT_FIVE" | "IPIPD"
  baseUrl: String
  credentialEncrypted: String
  status: ACTIVE | DISABLED
  lastScannedAt: DateTime?
  lastScanStatus: SUCCESS | FAILED
}

FederatedUpstreamScan {
  connectionId: UUID
  status: SUCCESS | FAILED
  balanceAmount: Decimal? (对方余额)
  inventory: Json (库存快照)
  prices: Json (价格列表)
  capturedAt: DateTime
  expiresAt: DateTime
}
```

**扫描流程**：
```
1. 定时任务触发扫描
2. 调用上游 API 获取库存+价格
3. 写入 FederatedUpstreamScan
4. 更新 connection.lastScannedAt
```

---

## 数据模型架构

### 实体关系图（核心）

```
Site (站点)
 ├─ Tenant (租户) ──> User (用户) ──> Wallet (钱包)
 │                                      └─ LedgerEntry (账本)
 │
 ├─ ServiceSku (SKU) ──> PriceTemplate (价格模板)
 │                        └─ SkuPriceRules (规则)
 │
 ├─ ProviderAccount (供应商账户) ──> ResidentialExit (出口池)
 │
 ├─ NodeGroup (节点组) ──> ControlNode (控制节点)
 │                          └─ InboundProfile (入站配置)
 │
 └─ DedicatedLineOrder (订单)
     └─ DedicatedLine (专线)
         ├─ DedicatedLinePlacement (放置)
         │   └─ DedicatedLinePlacementNode (节点实例)
         ├─ DedicatedLineProjection (投影)
         ├─ DedicatedLineExitAssignment (出口分配)
         ├─ DeliveryRoute (交付路由)
         └─ DedicatedLineMigration (迁移)
```

---

### 关键约束

#### 唯一性约束

```sql
-- 站点+租户代码唯一
UNIQUE (siteId, code) ON tenants

-- 用户邮箱全局唯一
UNIQUE (email) ON users

-- 专线客户端指纹唯一
UNIQUE (siteId, clientIdentityFingerprint) ON dedicated_lines

-- 专线入站配置唯一
UNIQUE (siteId, inboundProfileId, clientEmail) ON dedicated_lines

-- 出口身份指纹唯一
UNIQUE (siteId, identityFingerprint) ON residential_exits

-- 投影键唯一
UNIQUE (siteId, projectionKey) ON dedicated_line_projections
UNIQUE (nodeId, nodeExternalId) ON dedicated_line_projections

-- 幂等键范围唯一
UNIQUE (siteId, tenantId, userId, idempotencyKey) ON orders
UNIQUE (siteId, tenantId, userId, idempotencyKey) ON dedicated_line_orders
UNIQUE (siteId, idempotencyKey) ON external_jobs
UNIQUE (siteId, idempotencyKey) ON outbox_events
```

---

### 索引策略

**高频查询索引**：
```sql
-- 用户专线列表
INDEX (siteId, tenantId, userId, status) ON dedicated_lines

-- 库存查询
INDEX (siteId, providerCode, skuId, countryCode, capturedAt) 
  ON dedicated_line_inventory_snapshots

-- 任务调度
INDEX (status, nextRunAt, leaseExpiresAt) ON external_jobs

-- 投影同步
INDEX (nodeId, status, desiredVersion) ON dedicated_line_projections

-- 出口健康
INDEX (siteId, residentialExitId, observedAt) ON exit_health_observations
```

---

## 技术栈与边界

### 后端架构

```
NestJS (主框架)
  ├─ Module 划分
  │   ├─ Auth (认证)
  │   ├─ Users (用户)
  │   ├─ Wallet (钱包)
  │   ├─ Catalog (商品目录)
  │   ├─ DedicatedLineOrders (订单)
  │   ├─ DedicatedLines (专线)
  │   ├─ Fulfillment (履约)
  │   ├─ Providers (供应商适配器)
  │   ├─ ApiV1Compat (Legacy 兼容)
  │   └─ Worker (后台任务)
  │
  ├─ Common
  │   ├─ Config (配置)
  │   ├─ Crypto (加密)
  │   ├─ Errors (错误)
  │   ├─ Auth (认证上下文)
  │   └─ Interceptors (拦截器)
  │
  └─ Prisma (ORM)
```

---

### 数据流向

```
请求 → Guard (权限) → Controller → Use Case → Repository → Prisma → PostgreSQL
                                       ↓
                                 Domain Logic
                                       ↓
                            ExternalJob / OutboxEvent
                                       ↓
                                  Worker Pool
                                       ↓
                          Provider Adapter / ControlNode API
```

---

### 关键依赖

**ORM**: Prisma Client
- 生成路径: `packages/db/generated/client`
- 迁移目录: `packages/db/prisma/migrations`

**缓存**: Redis
- Session 存储
- 任务队列锁

**加密**: AES-GCM
- `APP_ENCRYPTION_KEY` (32 字节 base64)
- 出口凭证、客户端凭证、供应商凭证

**配置**: ConfigService
- 环境变量验证
- 类型安全的配置访问

---

## 关键业务规则

### 1. 幂等性规则

**所有写操作必须幂等**：
- 订单: `idempotencyKey` (siteId + tenantId + userId 范围)
- 钱包: `idempotencyKey` (全局唯一)
- 任务: `idempotencyKey` + `dedupeKey`

**重复请求行为**：
- 相同 `idempotencyKey` → 返回已有结果
- 不同 `idempotencyKey` → 创建新记录

---

### 2. 库存一致性

**库存扣减规则**：
```
1. 查询最新快照 (capturedAt 最新 且 未过期)
2. 检查 quantity - reservedQuantity >= 需求量
3. 创建预留 StockReservation
4. 原子更新 snapshot.reservedQuantity += 需求量
5. 订单完成 → 预留 CONSUMED
6. 订单失败/超时 → 预留 RELEASED, 回退库存
```

**库存不足规则**：
- 不创建订单
- 不扣钱包
- 不调用供应商 API
- 发送 Bark 告警（去重）

---

### 3. 钱包扣款规则

**扣款顺序**：
```
1. 查询价格 (SkuQuoteUseCase)
2. 检查余额 >= totalPrice
3. 创建订单 (幂等)
4. 扣款 LedgerEntry (type=DEBIT, idempotencyKey)
5. 更新 Wallet.available -= totalPrice
6. 履约失败 → 退款 LedgerEntry (type=REFUND)
```

**余额不足**：
- 返回 `422 INSUFFICIENT_BALANCE`
- 不创建订单

---

### 4. 专线交付规则

**交付完整性**：
```
专线 ACTIVE 状态必须满足：
1. ✅ Placement 已创建
2. ✅ PlacementNode >= minReadyReplicaCount
3. ✅ Projection 全部 READY
4. ✅ ExitAssignment 已分配
5. ✅ DeliveryRoute isCurrent=true
6. ✅ 至少一个 DeliveryRouteDomain isPrimary=true
7. ✅ ClientIdentity 已加密存储
```

**交付失败处理**：
- Projection FAILED → 自动重试 (maxRetries=5)
- 重试失败 → status=NEEDS_OPERATOR
- 出口分配失败 → 触发迁移推荐

---

### 5. 迁移安全规则

**迁移前置条件**：
```
1. ✅ 专线状态 = ACTIVE | DEGRADED
2. ✅ 无正在进行的迁移 (activeMigrationId=null)
3. ✅ 目标节点容量充足
4. ✅ 目标出口状态 = AVAILABLE (如果迁移出口)
```

**灰度验证**：
```
Canary 阶段:
- 导入灰度路由 (isStaged=true)
- Smoke Test 验证新路由
- 至少观测 1 个周期 (例如 5 分钟)
- 验证通过 → 进入 Cutover
- 验证失败 → Rollback
```

**回滚保护**：
```
Rollback 阶段:
- 恢复旧路由 (isCurrent=true)
- 旧投影重新激活
- 新投影标记 DELETING
- 释放新资源（节点容量、出口）
```

---

### 6. 健康检查规则

**出口健康**：
```
检查频率: 5 分钟
失败阈值: 连续 3 次
隔离期: 24 小时

失败类型:
- TIMEOUT: 连接超时
- DNS_FAIL: 域名解析失败
- IP_MISMATCH: 观测IP与预期不符
- COUNTRY_MISMATCH: 国家码不匹配
```

**节点健康**：
```
检查频率: 1 分钟
失败阈值: 连续 5 次
状态: ACTIVE | DRAINING | DISABLED

DRAINING: 不接受新专线，等待现有专线迁走
DISABLED: 完全禁用，触发批量迁移
```

---

### 7. 续费规则

**续费流程**：
```
1. 查询当前专线状态
2. 查询续费价格 (SkuQuoteUseCase)
3. 检查钱包余额
4. 扣款 (LedgerEntry type=RENEWAL)
5. 更新 expiresAt += durationDays
6. 保持原有配置（节点、出口、路由）
```

**续费限制**：
- 状态必须是 ACTIVE | DEGRADED | EXPIRING
- 不允许 CANCELLED | FAILED 状态续费
- 续费后 expiresAt 不超过 3 年

---

### 8. Legacy API 兼容规则

**强制约束**：
- 环境变量 `LEGACY_API_V1_ENABLED=true` 才启用
- 生产环境必须配置 `LEGACY_API_SITE_ID`
- Refresh Token 前缀 `rt_`，只能用于 `/auth/refresh`
- SKU 协议值小写 (`vless`, `vmess`, ...)
- 专线路由参数使用 `legacyId` (数字)，内部转换为 UUID

**禁止操作**：
- 不能从 hostname 推断 siteId
- 不能在兼容层直接调用供应商 API
- 不能复制库存/定价/钱包逻辑
- 不能返回假的 "lock" 成功响应

---

## 总结

### 核心价值链

```
供应商库存 → SKU定价 → 用户下单 → 钱包扣款 → 库存预留 → 节点放置 → 出口分配 → 投影同步 → 路由交付 → 健康监控 → 智能迁移
```

### 关键设计原则

1. **多租户隔离**: 所有数据查询必须带 `siteId` + `tenantId` + `userId`
2. **幂等性保证**: 所有写操作通过 `idempotencyKey` 防重
3. **最终一致性**: 投影系统异步同步，允许短暂不一致
4. **可观测性**: 所有关键操作写入 AuditLog
5. **故障自愈**: 健康检查 + 迁移推荐 + 自动迁移
6. **向后兼容**: Legacy API 兼容层，不破坏旧前端

### 数据流总结

```
User Request
  ↓
Auth Guard (JWT + Session)
  ↓
Controller (参数校验)
  ↓
Use Case (业务逻辑)
  ├─ 查询定价 (CatalogRepository)
  ├─ 检查库存 (InventoryRepository)
  ├─ 扣款钱包 (WalletRepository + LedgerEntry)
  ├─ 创建订单 (DedicatedLineOrderRepository)
  └─ 发起履约 (ExternalJob 异步)
       ↓
Worker Pool (后台任务)
  ├─ 预留资源 (节点容量 + 出口)
  ├─ 创建投影 (Projection)
  ├─ 同步配置 (ControlNode API)
  ├─ 导入路由 (DeliveryRoute)
  └─ 健康检查 (ExitHealth + NodeHealth)
       ↓
ControlNode (3x-ui / V2Ray Panel)
  ├─ 应用配置
  ├─ 报告状态 (observedVersion + observedHash)
  └─ 提供连接 (VLESS/VMESS/...)
       ↓
End User (Clash / V2RayN / ...)
```

---

**文档版本**: v1.0  
**生成工具**: Claude Code (Opus 5)  
**更新日期**: 2026-08-20
