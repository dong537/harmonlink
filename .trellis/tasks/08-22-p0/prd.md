# 修复专线下单链路契约断裂（P0）

## 背景

`docs/architecture/专线平台全流程.md` 第 3 章记录的阻断性缺陷。同一个 `payload.request` 对象，生产者写 6 个字段，消费者要求 13 个，导致每一笔专线订单在 worker 首次取到时即失败，且**扣款不退、库存不释放、无自动补偿**。

## 目标

让专线下单链路能真实交付：下单 → 采购 → 建线 → 投影下发。

成功标准：

1. 生产者构造的 `request` 能通过消费者 `parseRequest` 的全部 13 字段校验 —— 由跨两侧的契约测试证明，不是靠人工比对。
2. 采购发出前失败时，预留释放、钱退回。
3. `request` 形状有单一权威类型，字段增删在编译期暴露。

明确不做：

- 不动 `stock_reservations` 过期回收（独立缺口，另开任务）。
- 不动权限缺陷 P1-1/P1-2/P1-3 与 5 处 `siteId` 缺失（非阻断，另开任务）。
- 不重构两套订单栈的共同抽象。

## 关键发现：架构问题已被代码回答

原以为「落点策略在下单同步阶段解析还是 worker 内解析」需要决策。核实后不需要：

`dedicated-line-placement.repository.ts` 的 `DedicatedLinePlacementRepository.resolveForOrder()` 已完整实现，**返回的正是缺失字段**：

```ts
type DedicatedLinePlacementPlan = {
  policyId; inboundProfileId; inboundTag;
  protocol: 'VLESS' | 'VMESS' | 'MIXED';
  targetReplicaCount; minReadyReplicaCount; maxUnitsPerNode; allowedNodeIds;
}
```

它已在 `dedicated-line-orders.module.ts:22` 注册为 provider、有自己的 spec（`dedicated-line-placement.repository.spec.ts`），但**没有任何用例注入它** —— 是死代码。

结论：代码早已选择「同步下单阶段解析落点」，只是接线没完成。修复是接上这条已存在的 seam，不是新增架构。

## 字段来源（逐个核实）

| 字段 | 来源 |
|---|---|
| `protocol: 'SOCKS5'` | 上游采购协议，硬钉死。专线上游只买 SOCKS5 出口 |
| `currency` | `quote.currency`（报价权威，`catalog/domain.ts:155`） |
| `placementPolicyId` | `plan.policyId` |
| `inboundProfileId` | `plan.inboundProfileId` |
| `inboundTag` | `plan.inboundTag` |
| `lineProtocol` | `plan.protocol`（VLESS/VMESS/MIXED，客户侧接入协议） |
| `maxReplicaFanout` | `plan.targetReplicaCount` |

`protocol` 与 `lineProtocol` 是两个不同协议，不能混：前者是**上游出口**协议（SOCKS5，`buyStaticProxy` 用），后者是**客户接入**协议（VLESS/VMESS/MIXED，投影下发用）。

`maxReplicaFanout = targetReplicaCount` 由落库时的二次校验强制：`dedicated-line-order.repository.ts:156` 断言 `exit.maxReplicaFanout !== policy.targetReplicaCount` 即 422。所以这不是自由取值。

## Source of Truth

- 价格：catalog SKU 价格规则（`quote`），下单阶段已确立，不变。
- 落点：`line_placement_policies` + `control_nodes`，由 `resolveForOrder` 解析。
- 库存路由：`findFreshRoute` 快照，提供 `providerResourceId`。
- 地域：**上游采购参数**决定，`control_nodes.regionCode` 全链路不参与选节点（见全流程文档阶段三）。

## 数据流（修复后）

```
POST /dedicated-line-orders
  → quote（价格权威）
  → findFreshRoute（库存路由 + providerResourceId）
  → resolveForOrder（落点策略 → 7 字段中的 5 个）   ← 新接线
  → reserveStock 单事务：预留库存 + 扣钱包 + 入队 external_jobs
      payload.request = 完整 13 字段
  → worker parseRequest 全部通过
  → buyStaticProxy → persistCompletedOrder → 投影下发
```

## 落点策略解析的时机风险

`resolveForOrder` 在下单同步阶段解析，但真正的节点占用发生在 worker 落库时（`allocateProjectionNodes`）。两者之间存在时间窗，策略或节点容量可能漂移。

这个风险**已被现有代码处理**：`persistCompletedOrder` 的二次校验（`dedicated-line-order.repository.ts:142-160`）会拒绝漂移，抛 `dedicated_line_placement_policy_changed` / `dedicated_line_placement_contract_changed`，并走 `persistPurchasedExitsForOperator` 把已采购出口存为待运营处理。所以同步解析是安全的 —— 这也进一步说明代码本来就是这么设计的。

## `releaseReservation` 判定反转

当前（`process-dedicated-line-order.use-case.ts:141`）是白名单式释放：

```ts
const isKnownNoPurchaseFailure = code === UPSTREAM_OUT_OF_STOCK || code === UPSTREAM_DISABLED;
```

正确语义：**只要没有向上游发出采购请求，就必须释放预留并退款。**

`parseRequest` 及三道开关检查全部发生在 `buyStaticProxy` / `queryOrder` 之前，属于「未采购」；`assertDelivery` 的 502、`persistCompletedOrder` 的冲突发生在采购之后，属于「已采购、不能贸然释放」。

判定应以「代码位置是否在采购调用之前」为准，而非枚举错误码 —— 枚举法的失效方式正是本缺陷：新增一个采购前错误码就漏一个。

## 验证

1. 新增契约测试：真实调用 create 用例 → 读回 `external_jobs.payload` → 交给真实 `parseRequest`。这个测试存在，本类缺陷不会再发生。
2. `releaseReservation` 反转的测试：采购前失败断言预留已释放 + 钱已退；采购后失败断言未释放。
3. 现有 spec 全绿：`create-dedicated-line-order.use-case.spec.ts`、`process-dedicated-line-order.use-case.spec.ts`、`dedicated-line-placement.repository.spec.ts`。
4. typecheck + lint + 相关测试。

## 风险

- `resolveForOrder` 从未在生产路径跑过，只有 spec 覆盖。接线后它成为下单必经路径，其 5 个 422（policy_missing / policy_invalid / allowed_nodes_missing / inbound_group_mismatch / capacity_exhausted）会变成真实用户可见错误。需确认这些错误在下单阶段返回是合理的 —— 是的：无可用落点时就该拒绝下单，而不是收钱后失败。
- 没有落点策略数据的站点，下单会从「收钱后失败」变成「下单即 422」。这是正确方向（fail fast），但会暴露配置缺口。
