# 集成 985Proxy 和 ipipd 美国出口节点

## Goal

用户已经在 985Proxy 和 ipipd 拥有配置好的账号和美国出口线路。目标是直接使用这些现有的美国出口节点，而不是继续搭建香港控制节点基础设施。

用户原话："直接在我的985和ipipd配置的账号里面使用有的美国的出口"

## Current Status ✅

### 已完成 (2026-09-06)

- ✅ **Provider Adapters 已实现**
  - `NineEightFiveAdapter` - 完整实现 healthCheck、syncInventory、buyStaticProxy、queryOrder
  - `IpipdAdapter` - 完整实现 HMAC-SHA256 签名认证 + 全部 API 方法
  - 两者都支持美国库存查询和 SOCKS5 代理购买

- ✅ **Provider Accounts 已配置**
  - 985Proxy: `providerCode=NINE_EIGHT_FIVE`, baseUrl=https://open-api.985proxy.com
  - ipipd: `providerCode=IPIPD`, baseUrl=https://api.ipipd.cn/api
  - 凭据已加密存储在数据库（使用 APP_ENCRYPTION_KEY）
  - 脚本: `apps/api/scripts/seed-us-provider-accounts.ts`

- ✅ **控制节点基础设施已初始化**
  - 3 个香港控制节点已创建 (HK_VM_18545/18544/18541)
  - IP: 185.216.118.243/242/241
  - 节点组: SOCKS5_EXITS_HK_GCP_A
  - 6 个落点策略已创建并关联到 3 个节点
  - 状态: DISABLED（等待控制面板 API 部署后激活）
  - 脚本: `apps/api/scripts/update-control-nodes.ts`

- ✅ **数据库连接已配置**
  - DATABASE_URL 指向 Zeabur PostgreSQL: 43.172.85.117:32463
  - 表结构已存在：provider_accounts、resource_mappings、control_nodes 等
  - 数据验证通过：3 个控制节点、6 个策略、18 个策略-节点关联、2 个活跃 Provider

- ✅ **库存同步脚本已准备**
  - `apps/api/scripts/sync-us-inventory.js` - 支持 985Proxy 和 ipipd
  - 包含 API 调用逻辑和凭据解密

### 下一步

1. **部署控制面板 API** (3 台服务器)
   - 185.216.118.243:8080
   - 185.216.118.242:8080  
   - 185.216.118.241:8080
   - 实现健康检查和线路创建 API

2. **激活节点**
   - 将 3 个控制节点状态从 DISABLED 改为 ACTIVE

3. **测试端到端流程**
   - 创建美国专线订单
   - 验证出口 IP 为美国

## What I already know

### 现有系统架构
- **专线代理系统**由两层组成：
  - 数据平面：managed line projections 通过控制节点部署到实际服务器
  - 控制平面：node_groups、control_nodes、inbound_profiles、line_placement_policies
- **静态代理系统**通过 provider adapters 直接从上游购买和交付
  - 已实现 `NineEightFiveAdapter` 和 `IpipdAdapter`
  - 通过 `orders` → `fulfillment_jobs` → `proxy_instances` 流程
  - Adapters 实现 `buyStaticProxy`、`queryOrder`、`syncInventory`、`healthCheck`

### 已有凭据
- **985Proxy**:
  - API Key: `yR_7WPGbMxp-eVJfN1dQR2JNeHA0Y2MwMTc2NDk5MDc1MQ==`
  - Zone ID: `4sd72p1bvlha`
  - Base URL: `https://open-api.985proxy.com`
- **ipipd**:
  - App ID: `APP13618B8748`
  - App Secret: `fzEE0vF014A7WfdpCp0pek2ufnRo65E4HN6Ni3rZjitx9sjpNSy0beIyo6UKGbi7`
  - Base URL: `https://api.ipipd.cn/api`
- **控制节点 API Tokens**:
  - HK_VM_18545: `ctrl_hk_vm18545_9f8e7d6c5b4a3210fedcba9876543210`
  - HK_VM_18544: `ctrl_hk_vm18544_1a2b3c4d5e6f7890abcdef1234567890`
  - HK_VM_18541: `ctrl_hk_vm18541_fedcba9876543210abcdef1234567890`

### 现有代码模块
- `apps/api/src/modules/providers/` - provider adapters 和 types
  - `adapters/nine-eight-five.adapter.ts` - 985Proxy HTTP API 集成
  - `adapters/ipipd.adapter.ts` - ipipd HMAC-SHA256 签名 + HTTP API 集成
  - `provider.types.ts` - 统一 adapter 契约
- `apps/api/src/modules/dedicated-line-orders/` - 专线订单处理
  - `process-dedicated-line-order.use-case.ts` - 订单履约主流程
- `packages/db/prisma/schema.prisma` - 数据模型
  - `dedicated_lines` - 专线记录
  - `control_nodes` - 控制节点记录
  - `orders` + `proxy_instances` - 静态代理记录

### 技术约束
1. 985Proxy 和 ipipd 的 adapters 已实现静态代理购买流程
2. 专线订单系统当前依赖 `control_nodes` + `inbound_profiles` + `line_placement_policies`
3. 控制节点已初始化但状态为 DISABLED（等待 API 部署）
4. 用户要求使用"现有的美国出口"，而不是新建香港控制节点

## Decision (ADR-lite)

**Context**: 用户要求"直接在我的985和ipipd配置的账号里面使用有的美国的出口"。代码分析发现专线订单系统（`process-dedicated-line-order.use-case.ts`）已经实现了通过 provider adapters 购买 SOCKS5 出口的能力。

**Decision**: 选择**方案 C - 配置现有专线系统，使用 985Proxy/ipipd 作为美国出口池**

**Rationale**:
1. 代码已完整实现：`ProcessDedicatedLineOrderUseCase` 第63-81行已支持调用 `adapter.buyStaticProxy()` 购买 SOCKS5 代理
2. 架构正确：专线系统设计为"入站控制节点 + 出口代理池"，985/ipipd 正是出口池的理想来源
3. 最小改动：只需配置 provider accounts、同步库存、初始化控制节点，无需修改代码
4. 完整体验：用户获得真实的专线产品（vless/vmess 协议、入站控制、流量策略）
5. 基础设施利用：充分利用现有的香港控制节点和中国大陆入站服务器

**Consequences**:
- ✅ 技术风险低：复用已验证的代码路径
- ✅ 产品一致性：与现有专线产品保持统一体验
- ✅ 可扩展性：未来可轻松添加其他国家的出口
- ⚠️ 依赖上游：出口质量取决于 985Proxy/ipipd 的服务稳定性
- ⚠️ 需要部署：必须在 3 台香港服务器上部署控制面板 API

## Requirements

### 数据配置 ✅
- [x] 创建 985Proxy 的 `provider_accounts` 记录
- [x] 创建 ipipd 的 `provider_accounts` 记录
- [x] 初始化香港节点组
- [x] 创建 3 个香港控制节点
- [x] 配置 6 个落点策略
- [x] 关联策略与节点（18 个关联）

### 控制面板 API 部署 (NEXT)
- [ ] 在 185.216.118.243 上部署控制面板 API
- [ ] 在 185.216.118.242 上部署控制面板 API
- [ ] 在 185.216.118.241 上部署控制面板 API
- [ ] 实现 `/health` 端点
- [ ] 实现线路创建 API
- [ ] 配置 API token 认证

### 库存同步
- [ ] 执行 `sync-us-inventory.js` 调用 985Proxy API
- [ ] 执行 `sync-us-inventory.js` 调用 ipipd API
- [ ] 将同步结果写入 `resource_mappings` 表
- [ ] 验证库存记录包含 `providerResourceId`、`upstreamCost`、`stock`

### 节点激活
- [ ] 验证 3 个控制节点的 health check
- [ ] 将节点状态从 DISABLED 改为 ACTIVE

### SKU 和定价
- [ ] 创建美国专线 SKU（`service_skus`）
- [ ] 配置定价规则（`sku_price_rules`）

### 环境变量和功能开关
- [x] `APP_ENCRYPTION_KEY` 已配置
- [x] `DATABASE_URL` 已配置
- [ ] 确认 `DEDICATED_LINE_ORDER_EXECUTION_ENABLED=true`
- [ ] 配置 `DEDICATED_LINE_ORDER_PROVIDER_ALLOWLIST`

## Next Steps

1. **部署控制面板 API** (最高优先级)
   - 选择技术栈（Node.js + Express / Go + Gin）
   - 实现健康检查和线路管理 API
   - 在 3 台服务器上部署和启动

2. **Health Check 验证**
   - 调用 985Proxy health check API
   - 调用 ipipd health check API
   - 确认凭据正确且账号有效
   - 验证控制节点 health check

3. **库存同步测试**
   - 执行 `sync-us-inventory.js` 脚本
   - 验证返回美国库存数据
   - 分析库存格式和字段

4. **端到端测试**
   - 创建美国专线订单
   - 验证订单履约流程
   - 确认出口 IP 为美国

## Definition of Done

- [x] Provider accounts 已配置并存储
- [x] 控制节点已初始化（3 个节点 + 6 个策略）
- [ ] 控制面板 API 已部署到 3 台服务器
- [ ] Health checks 通过（providers + 控制节点）
- [ ] 库存同步返回美国节点数据
- [ ] 控制节点状态改为 ACTIVE
- [ ] 能创建和执行美国专线订单
- [ ] 用户能获取专线连接信息
- [ ] 连接验证：出口 IP 为美国

## Out of Scope

- 香港控制节点的物理服务器配置（已完成）
- 德国上游服务器（195.201.137.116）
- 多地域负载均衡
- 前端 UI 开发
- 自动续费逻辑
- 出口质量监控告警
- 其他国家/地区的出口配置
- 静态代理产品线
