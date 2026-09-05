# 修复全仓错误至可生产状态

## 目标

让 monorepo 全部包的 typecheck / build / lint / test 通过，并且 **worker 进程能真正启动**。

成功标准：

- `apps/worker` typecheck 0 错误，且 `main.ts` 中专线投影调用点保持启用状态（不靠注释掉代码换取通过）
- `apps/api` lint 0 错误
- `apps/web` 测试 341/341 通过
- api / web build 保持通过，api 510 个测试保持通过

明确不做：

- 不实现 dedicated-line-order 处理链路（见下方「超出范围」）
- 不恢复 bark 告警 outbox、control-node 健康探测（API 侧模块整体缺失，属独立特性）
- 不为通过检查而注释掉活的业务调用点
- 不动 `.ts.broken` 废弃副本以外的既有架构

## 事实基线（2026-08-21 实测，非推断）

| 包 | typecheck | build | lint | test |
|---|---|---|---|---|
| api | 0 | 通过 | **7 错** | 510/510 |
| web | 0 | 通过 | 干净 | **12 失败 / 341** |
| worker | **2 错** | — | — | — |
| contracts / db / config | 0 | — | — | — |

两处需纠正的既有误判，记录以免重犯：

1. `catalog/*.ts.broken` 并非"把文件藏起来骗过 tsc"。同名 `.ts` 真实存在且参与编译，`.broken` 只是旁边的废弃副本。api 的 0 错误是真实的。
2. IDE 曾报的 Prisma 字段错误（`site_id_code`、`inventorySource`、`availableCount`）在当前磁盘内容中已不存在，来自 IDE 缓存的旧文件内容。

## 工作项

### W1 — worker 缺失模块（最高优先，决定进程能否启动）

`apps/worker/src/main.ts` 引用两个全仓不存在的模块：

- `./dedicated-line-projection-worker` — **调用点是活的**（main.ts:77、108、124），因此 worker 进程当前完全无法启动
- `./dedicated-line-order-worker` — 调用点已全部注释

**W1 只做 projection worker。** 依据：API 侧依赖齐备且已从 `@ipeasy/api/worker` 正常导出 —

- `DedicatedLineProjectionRepository`：`findQueued(limit)` / `recoverExpiredLeases()` / `claimRunnableJob` / `markReady` / `markFailed` 均已实现
- `ProcessDedicatedLineProjectionUseCase.execute(jobId, workerId)` 已实现
- env 已定义 `DEDICATED_LINE_PROJECTION_EXECUTION_ENABLED`、`WORKER_DEDICATED_LINE_PROJECTION_POLL_INTERVAL_MS`、`WORKER_DEDICATED_LINE_PROJECTION_BATCH_SIZE`

实现方式：照抄同目录 `dedicated-line-migration-worker.ts` 的既有范式（queue / executor / options 三段式 + `running` 重入保护 + `Promise.allSettled` + 复用 `fulfillment-worker.ts` 的 `WorkerLogger`）。main.ts:77 的构造签名即为契约，不改调用点。

`order-worker` 的 import 与其已注释的调用点一并移除 —— 保留一个指向不存在模块的 import 只会让 typecheck 永久失败。

### W2 — api lint 7 错

- `external-work/domain.ts` 4 个 `no-explicit-any`：位于 `ExternalJob` / `CreateExternalJobInput` / `ExternalJobResult` 三个接口。已验证三者在源码中零引用（仅 `dist/` 有编译产物），**删除死代码**而非编造类型。同文件 `LeasedJob` 与 `assertLeaseCompletion` 被两个 repository 真实使用，保留不动。
- `dedicated-line-orders/renew-dedicated-line.use-case.ts:3` 未使用 import `AuthenticatedContext`
- `dedicated-lines/terminate-dedicated-line.use-case.ts:21` 未使用变量 `reason`

后两项需先判断是"import 多余"还是"逻辑漏用"。若为漏用（例如 `reason` 本应写入审计），修逻辑而非删变量或加 `_` 前缀掩盖。

### W3 — web 12 个测试失败

失败集中在 9 个文件，耗时 2-11 秒，且多为「断言某请求未发出」类用例，形态疑似统一超时/等待问题而非各自的业务逻辑错：

- `customer-api-key-flow` / `wallet-adjust` / `admin-login` / `customer-login`(2) / `admin-proxy-list`(2) / `admin-ticket-flow` / `user-pricing`(2) / `customer-ticket-flow` / `admin-order-operations`

先定位共因（怀疑 mock 未命中导致真实等待、或 `getComputedStyle`/i18n mock 缺失），再决定是修测试还是修实现。**禁止放宽断言或加长超时来"通过"。**

## 超出范围：order worker 链路

`apps/api/src/worker.ts:11-15` 显示 API 侧 `DedicatedLineOrderRepository` 与 `ProcessDedicatedLineOrderUseCase` 均未实现，`dedicated-line-orders/` 目录只有 controller / module / 两个 use-case / inventory repository。

让 order worker 跑起来需在 API 侧从零实现 repository + 处理 UseCase（租约、重试、幂等、状态机），属独立特性，不并入本任务。本任务只移除对不存在模块的 import，使 typecheck 通过，并在此记录后续入口。

## 验证

按包运行，全部需通过：

- `apps/worker`: `npx tsc --noEmit`
- `apps/api`: `npx tsc --noEmit` / `npx eslint src` / `npx nest build` / `npx vitest run`
- `apps/web`: `npx vitest run` / `npx eslint src` / `npx vite build`

worker 额外要求：typecheck 通过后确认 projection 调用点仍为启用状态，不接受"注释掉换通过"。

## 风险

- W3 共因未定位就逐个改测试 → 会掩盖真实实现缺陷
- W1 若照抄 migration worker 时未对齐 projection repository 的实际方法签名 → 编译过但运行时报错
- `Promise.allSettled` 并发执行同批 job 依赖 repository 的租约机制保证互斥，不得自行加锁绕过
