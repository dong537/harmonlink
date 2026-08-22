# 补预留过期回收与 TTL 语义收口

## 目标

让 `stock_reservations` 的 5 分钟 TTL 有真正的执行者，并消除 TTL 语义矛盾。

当前 `expiresAt` 只是一个时间戳：全仓库没有任何过期扫描、批量释放或状态回收路径，`InventoryReservationStatus.EXPIRED` 从未被写入过。库存占用是 `dedicated_line_inventory_snapshots.reservedQuantity` 上的计数器递增（`dedicated-line-inventory.repository.ts:192`），不是按 `ACTIVE` 预留实时聚合，因此预留过期时计数器不会自动回落 —— 被占的库存永久不回补。

## 不做什么

- 不改上游轮询/重试策略本身。
- 不引入新的调度框架，沿用 `apps/worker/src/main.ts` 既有 `setInterval` 模式。
- 不做向后兼容与旧数据自动迁移。存量脏预留由一次性运维脚本处理，不写进主代码。
- 不动 P1 权限缺陷与多站隔离 5 处（文档判定不阻断上线，另立任务）。

## 前置架构决策：TTL 语义

TTL 原本有两种互斥读法，选错会把资金缺陷换成库存缺陷：

- 读法 A「过期即可回收」：回收器会把正在等上游返回的合法订单的库存抽走并递减计数器，而该订单随后仍可能交付成功 → 超卖。
- 读法 B「仅同步下单阶段的报价有效期」：进入 worker 后不应再作为过期判据。

**已定：采用 B 的分界，回收器只释放「从未向上游发出采购请求」的过期预留。** 与 `process-dedicated-line-order.use-case.ts:39` 的 `upstreamCallIssued` 同源 —— 以「是否已向上游发出采购」为唯一分界，而非错误码白名单或时间。

## Source of Truth

| 事项 | 权威来源 | 读写路径 |
|---|---|---|
| 预留状态 | `stock_reservations.status` | 仅 `reserveAndEnqueue` 创建；`releaseReservationTx` / `persistCompletedOrder` 终结 |
| 库存占用量 | `dedicated_line_inventory_snapshots.reservedQuantity` | raw SQL 增减，必须与预留状态在同一事务内配对 |
| 是否已发出上游采购 | `external_jobs.attempt` + `status` | `claimRunnableJob` 领取时 `attempt` 递增；`recoverExpiredLeases` 把租约超时打成 `NEEDS_OPERATOR` 而非退回 `QUEUED` |
| 已扣款 | `ledger_entries`（`relatedId = reservationId`, `type = DEBIT`） | `refundReservationTx` 已有退款实现 |

`attempt = 0 且 status = QUEUED` 是「从未执行、从未触碰上游」的可靠证明：领取必然递增 `attempt`，且崩溃后 job 不会被静默退回 `QUEUED`。

## 回收判定

```
status = ACTIVE
AND expiresAt <= now
AND 关联 external_job.attempt = 0
AND 关联 external_job.status = QUEUED
```

单事务内动作，顺序固定：

1. `reservation.status = EXPIRED`，写 `releasedAt`
2. `reservedQuantity -= quantity`（`GREATEST(0, ...)`，复用 `releaseReservationTx` 的既有写法）
3. 若存在 DEBIT 分录则退款（复用 `refundReservationTx`）
4. 关联 `external_job -> CANCELLED`，使其不再可领取

不满足条件的过期预留一律不动，只计数并记录，交由运维介入。回收器绝不猜测上游状态。

## 附带修正

`dedicated-line-order.repository.ts:138` 的 `stock_reservation_expired` 422 必须移除。TTL 只有 5 分钟而上游采购是轮询式的，正常的慢速上游交付本身就会撞上 TTL：钱已付给上游、资源已拿到，落库却被 422 拒绝。这与「已发出上游采购的预留不再受 TTL 约束」直接冲突。

## 数据流

```
worker setInterval
  -> ReclaimExpiredReservationsUseCase
    -> 扫描候选（带 siteId，不跨站）
    -> 逐条单事务：EXPIRED + 递减 + 退款 + job CANCELLED
  -> 返回 { reclaimed, skipped }，skipped 落日志
```

## 风险与验证

| 风险 | 处理 |
|---|---|
| 误伤已付款订单 | 判定条件排除 `attempt > 0`；契约测试覆盖 |
| 计数器与预留状态不一致 | 递减与状态写入同一事务，无独立提交点 |
| 并发回收同一预留 | 状态更新带 `status = ACTIVE` 前置条件，非幂等则跳过 |
| 跨站写 | 扫描与更新都带 `siteId` |

验证：新增 use-case 测试覆盖「未发出上游的过期预留被回收」「已领取（attempt>0）的过期预留不被回收」「已扣款则退款」「重复执行不二次退款」；`persistCompletedOrder` 慢速上游不再 422；跑 typecheck + 相关测试。

## 成功标准

- 过期且从未发出上游采购的预留自动回收，库存计数器回落，已扣款则退款。
- 已发出上游采购的预留永不被自动回收，慢速交付不再被 422 拒绝。
- `EXPIRED` 状态从此有真实写入者。
