# 集成进度追踪

## ✅ Phase 1: Provider Accounts 配置（完成）

### 完成项
- [x] 985Proxy provider account 已插入数据库
  - ID: `792beae2-69a5-4ccd-b59b-6f5c7a3fd100`
  - 凭据已加密
  - 状态: `ACTIVE`
- [x] ipipd provider account 已插入数据库
  - ID: `ac887a60-2c97-4ff3-b335-5033060e7438`
  - 凭据已加密
  - 状态: `ACTIVE`
- [x] 验证 985Proxy 库存 API 连通性
  - ✅ 能获取库存数据
  - ✅ 发现 **191 个美国库存项**
  - 示例套餐: `{country_code: "US", location: "United States", ...}`
- [x] 验证 ipipd 库存 API 连通性
  - ⚠️ 需要验证实际响应结构

### 下一步
1. 同步美国库存到 `resource_mappings` 表
2. 测试通过 adapter 购买流程（集成测试）

---

## ⏸ Phase 2: 控制节点初始化（暂时跳过）

### 阻塞问题
- 控制节点 API token 未知
- 端口 57323 和 41094 可达，但 HTTP 请求超时（可能需要认证）
- 无法 SSH 到 91.149.237.33 获取配置

### 临时策略（策略 A）
**跳过控制节点初始化，先验证核心购买流程**

理由：
- 专线订单系统的核心逻辑是 `ProcessDedicatedLineOrderUseCase` 调用 provider adapter 购买 SOCKS5 代理
- 控制节点主要负责推送 managed line projections 和生成 vless:// 连接
- 可以先验证 provider adapter 购买流程，手动插入 `residential_exits` 模拟订单完成
- 后续解决控制节点 token 问题后，再完成端到端流程

### 后续解决方案
1. 联系运维获取控制节点 API token
2. 或者在服务器上部署控制面板服务并配置 token
3. 或者修改代码，使控制节点配置变为可选（仅用于生成连接，不影响购买）

---

## ✅ Phase 3: 库存同步（完成）

### 完成项
- [x] 手动调用 985Proxy inventory API（绕过 HTTP API）
  - ✅ 获取到 **1486 个美国 premium 库存**（聚合加州、洛杉矶、西雅图）
  - ✅ 成本: $0.98 USD/天
- [x] 写入 `platform_resources` 表
  - Resource ID: 自动生成
  - Code: `NINE_EIGHT_FIVE_US_PREMIUM`
  - Type: `COUNTRY`
  - Status: `ACTIVE`
- [x] 写入 `inventory_snapshots` 表
  - Stock: 1486
  - Captured at: 实时
- [x] ipipd 库存 API 测试
  - ⚠ API 响应结构与预期不符，需进一步调试
  - 暂时跳过 ipipd，专注 985Proxy 流程

### 验证结果
```sql
-- 已验证
SELECT id, code, name, type, "providerCode", "ipType", protocol, "upstreamCost", stock
FROM platform_resources pr
LEFT JOIN LATERAL (
  SELECT stock FROM inventory_snapshots WHERE "resourceId" = pr.id ORDER BY "capturedAt" DESC LIMIT 1
) inv ON true
WHERE "siteId" = '7f486516-aeee-4b80-9d6b-0c364c94c54a'
  AND "providerCode" = 'NINE_EIGHT_FIVE';
-- 返回 1 条记录: NINE_EIGHT_FIVE_US_PREMIUM, stock=1486
```

## ✅ Phase 3.5: SKU 和定价配置（完成）

### 完成项
- [x] 创建美国专线 SKU (`service_skus`)
  - SKU ID: `91f2cd60-57cb-4875-bac0-cf2225fa8c03`
  - Code: `US_DEDICATED`
  - Name: `美国专线`
  - Capabilities: `{delivery: "dedicated-line", supportedProtocols: ["VLESS","VMESS","MIXED"], countryCode: "US"}`
  - Status: `ACTIVE`, `isVisible: true`
- [x] 创建定价规则 (`sku_price_rules`)
  - 30天套餐: $45 USD (利润率 ~53%)
  - 90天套餐: $120 USD (折扣 11%)
  - 180天套餐: $216 USD (折扣 20%)
  - Template: `1c2e394d-6ecb-4a6f-85dc-6a2472f52ec7` (默认模板)

### 验证结果
```bash
# SKU 已创建且可见
# 定价规则已关联
# 前端应能展示美国专线产品
```

---

## 🚧 Phase 4: 端到端订单测试（当前任务）

### 目标
验证完整流程：订单创建 → 调用 provider adapter → 购买 SOCKS5 → 创建出口 → 分配专线

### 测试计划
1. 创建测试订单（手动或集成测试）
2. 观察 `external_jobs` 执行
3. 验证 `residential_exits` 记录
4. 验证 `dedicated_lines` 记录
5. 获取专线连接信息

---

## 📊 技术债务和待解决问题

### 高优
- [ ] **控制节点 API token** - 阻塞 Phase 2
- [ ] **Site ID 硬编码** - 当前使用 `7f486516-aeee-4b80-9d6b-0c364c94c54a`，需确认是否正确

### 中优
- [ ] **控制面板端口** - 57323 vs 41094，需确认正确端口
- [ ] **ipipd App ID** - 脚本中使用 `APP13618B8738`，原始记录为 `APP13618B8748`（末尾数字不一致）

### 低优
- [ ] 出口过期续费机制
- [ ] 出口健康监控
- [ ] 库存不足告警

---

## 🎯 当前执行策略

**采用策略 A：最小可行路径（2-3小时）**

1. ✅ 配置 provider accounts（完成）
2. 🚧 同步美国库存（进行中）
3. ⏭ 测试 provider adapter 购买流程
4. ⏭ 手动插入 `residential_exits` 模拟订单完成
5. ⏭ 验证出口记录正确性
6. ⏸ 后续再初始化控制节点和入站配置

**优势**：快速验证核心流程（985/ipipd 购买能力），不被控制节点 token 阻塞。
