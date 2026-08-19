# 客户专线指定分配与迁移控制实施计划

> **执行要求：** 使用 `executing-plans` 在主会话逐任务执行；每个行为变更严格遵循 RED -> GREEN -> REFACTOR。当前会话禁止派生子 Agent，因此不使用 `subagent-driven-development`。

**目标：** 建立客户允许节点集合、线路独占域名和三类可审计迁移，使新订单只进入规定节点，既有线路可在 NY 外部控制边界下安全准备、验证、提交和清理。

**架构：** PostgreSQL 保存 current placement/exit/route 与独立 migration aggregate；准备阶段通过容量预留和目标投影建立 staged desired state，提交事务只在 NY 路由和外部 smoke 证据齐全时切换 current。所有 OpenUI 副作用复用 `external_jobs`、租约、幂等键与 read-back，管理端只消费后端 `allowedActions`。

**技术栈：** Prisma 6.2/PostgreSQL、NestJS 11/Fastify、Vitest 3、React 19/Vite、TanStack Query/Router、Ant Design、现有 OpenUI managed projection API、Zeabur。

## 全局约束

- 生产凭据只从 secret store/环境变量读取；测试、日志、OpenAPI 和迁移记录不得包含 SOCKS5、OpenUI 或管理员明文凭据。
- 当前 placement、exit assignment 和 `delivery_routes.isCurrent` 在 commit 前不得变化。
- 空 allowed-node 集合是配置错误，不代表任意节点；容量不足不得选择集合外节点。
- 迁移相关写操作必须有 `reason + idempotencyKey`，并在 serializable transaction 中校验 site/tenant/line version。
- `NODE_ONLY` 可保留源/目标交集；只预留 `target-source`、只释放 `source-target`。`FULL` 目标与源完全分离。
- `EXIT_ONLY` 不要求 NY 路由，但多副本为滚动切换；要求零混合出口必须使用 `FULL`。
- canary/cutover/rollback 导入只能创建 staged route；只有 commit 能修改 current route。
- 功能开关默认关闭；关闭新迁移入口时，已提交迁移的 cleanup/retry 仍必须可运行。
- 金额继续使用 decimal string，流量/速率继续使用 decimal integer string，时间为 ISO 8601 UTC，列表为 `{ page, pageSize, total, items }`。
- 不新增生产 Mock、fallback、自动故障转移或直接 NY/DNS 写入。

---

### Task 1：数据库迁移与纯领域状态机

**文件：**

- 修改：`packages/db/prisma/schema.prisma`
- 新建：`packages/db/prisma/migrations/20260813090000_add_dedicated_line_migrations/migration.sql`
- 新建：`apps/api/src/modules/dedicated-line-migrations/domain.ts`
- 测试：`apps/api/src/modules/dedicated-line-migrations/domain.spec.ts`
- 修改：`apps/api/src/test-utils/integration-setup.ts`

**接口：**

- 产出 `MigrationType = 'NODE_ONLY' | 'EXIT_ONLY' | 'FULL'`。
- 产出 `MigrationPhase`、`MigrationStatus`、`MigrationAllowedAction`。
- 产出 `assertMigrationTransition(current, event)` 与 `computeNodeDelta(sourceIds, targetIds)`。
- 数据表：`line_placement_policy_nodes`、`dedicated_line_domains`、`dedicated_line_migrations`、`dedicated_line_migration_nodes`、`dedicated_line_smoke_observations`、`control_node_health_observations`、`dedicated_line_migration_recommendations`。
- `delivery_routes` 增加 nullable `migrationId`、nullable `migrationStage` 和 `isStaged`；`dedicated_lines` 增加 nullable unique `activeMigrationId`。

- [ ] **Step 1：先写状态机和节点差集失败测试**

```ts
it('keeps shared nodes and reserves/releases only the set difference', () => {
  expect(computeNodeDelta(['a', 'b'], ['b', 'c'])).toEqual({
    retained: ['b'], reserve: ['c'], release: ['a'],
  });
});

it('rejects commit before cutover evidence', () => {
  expect(() => assertMigrationTransition(
    { type: 'FULL', phase: 'VERIFY', status: 'ACTIVE' },
    { type: 'COMMIT' },
  )).toThrowError(expect.objectContaining({ reasonKey: 'migration_phase_invalid' }));
});
```

- [ ] **Step 2：运行测试并确认因模块不存在而失败**

运行：`pnpm --filter @ipeasy/api test -- src/modules/dedicated-line-migrations/domain.spec.ts`

预期：FAIL，提示无法解析 `./domain` 或缺少导出。

- [ ] **Step 3：实现最小纯领域接口**

```ts
export function computeNodeDelta(sourceIds: readonly string[], targetIds: readonly string[]) {
  const source = new Set(sourceIds);
  const target = new Set(targetIds);
  return {
    retained: targetIds.filter((id) => source.has(id)),
    reserve: targetIds.filter((id) => !source.has(id)),
    release: sourceIds.filter((id) => !target.has(id)),
  };
}
```

状态转换明确区分 `PREPARE -> CANARY_ROUTE -> VERIFY -> CUTOVER_ROUTE -> COMMIT -> CLEANUP`，并为
`EXIT_ONLY` 提供 `PREPARE -> VERIFY -> COMMIT -> CLEANUP`。禁止从任意阶段直接标记完成。

- [ ] **Step 4：扩展 Prisma schema 和 SQL migration**

SQL 必须包含：

```sql
CREATE UNIQUE INDEX "dedicated_line_domains_site_hostname_port_key"
ON "dedicated_line_domains"("siteId", "hostname", "port");

CREATE UNIQUE INDEX "dedicated_lines_activeMigrationId_key"
ON "dedicated_lines"("activeMigrationId");
```

迁移顺序先建 migration/domain 表，再给现有表加 nullable FK；不能为历史线路填默认域名或伪造迁移。

- [ ] **Step 5：生成 Prisma Client 并验证 schema**

运行：`pnpm --filter @ipeasy/db generate`

预期：`Generated Prisma Client`，无 validation error。

- [ ] **Step 6：将新表加入真实集成测试清理顺序并跑纯领域测试**

运行：`pnpm --filter @ipeasy/api test -- src/modules/dedicated-line-migrations/domain.spec.ts`

预期：PASS，覆盖合法路径、非法跳步、终态不可取消、节点差集和 FULL 不允许交集。

### Task 2：允许节点策略真正约束新订单

**文件：**

- 新建：`apps/api/src/modules/dedicated-lines/create-placement-policy.use-case.ts`
- 新建：`apps/api/src/modules/dedicated-lines/create-placement-policy.use-case.spec.ts`
- 修改：`apps/api/src/modules/dedicated-line-orders/dedicated-line-placement.repository.ts`
- 测试：`apps/api/src/modules/dedicated-line-orders/dedicated-line-placement.repository.spec.ts`
- 修改：`apps/api/src/modules/dedicated-line-orders/dedicated-line-order.repository.ts`
- 修改：`apps/api/src/modules/dedicated-lines/dedicated-line-control-plane.admin.controller.ts`
- 修改：`apps/api/src/modules/dedicated-lines/dedicated-lines.module.ts`
- 修改：`apps/api/src/modules/dedicated-line-orders/tests/dedicated-line-order-completion-integration.spec.ts`

**接口：**

- `CreatePlacementPolicyUseCase.execute(ctx, body)` 接收完整 `allowedNodeIds: string[]`。
- `DedicatedLinePlacementPlan` 增加 `allowedNodeIds` 和 `maxUnitsPerNode`。
- `allocateProjectionNodes` 只从 plan 的 allowed nodes 中原子预留。

- [ ] **Step 1：写策略校验 RED 测试**

```ts
it('rejects an empty allowed node set instead of treating it as any node', async () => {
  await expect(useCase.execute(ctx, validBody({ allowedNodeIds: [] })))
    .rejects.toMatchObject({ reasonKey: 'placement_allowed_nodes_required' });
});

it('rejects nodes outside the selected group or tenant scope', async () => {
  await expect(useCase.execute(ctx, validBody({ allowedNodeIds: ['foreign-node'] })))
    .rejects.toMatchObject({ reasonKey: 'placement_allowed_node_invalid' });
});
```

- [ ] **Step 2：运行并确认 RED**

运行：`pnpm --filter @ipeasy/api test -- src/modules/dedicated-lines/create-placement-policy.use-case.spec.ts`

预期：FAIL，`CreatePlacementPolicyUseCase` 不存在。

- [ ] **Step 3：实现策略 use case 并从 controller 移走业务校验**

完整替换体至少包含：`tenantId?`、`userId?`、`skuId?`、`nodeGroupId`、`inboundProfileId`、
`allowedNodeIds`、`mode`、`targetReplicaCount`、`minReadyReplicaCount`、`maxUnitsPerNode`、`priority`。
在一个事务中创建 policy 与 allowed-node relations，并写 audit。

- [ ] **Step 4：写订单分配 RED 测试**

```ts
it('never falls back to an active node outside the policy allowlist', async () => {
  const plan = await repository.resolveForOrder(input);
  expect(plan.allowedNodeIds).toEqual(['allowed-node']);
  await expect(allocateWithOnlyDisallowedCapacity(plan))
    .rejects.toMatchObject({ reasonKey: 'dedicated_line_control_node_capacity_exhausted' });
});
```

- [ ] **Step 5：运行 RED 后实现 allowlist 查询与容量预留**

`resolveForOrder` 的 node 查询必须包含：

```ts
id: { in: policy.allowedNodes.map(({ nodeId }) => nodeId) },
status: 'ACTIVE',
nodeGroupId: policy.nodeGroupId,
```

`allocateProjectionNodes` 必须使用同一 allowlist，并保留现有带上限谓词的原子 `UPDATE`；并发失去容量时只
在 allowlist 内重选。

- [ ] **Step 6：运行单元与订单完成集成测试**

运行：

```powershell
pnpm --filter @ipeasy/api test -- src/modules/dedicated-lines/create-placement-policy.use-case.spec.ts src/modules/dedicated-line-orders/dedicated-line-placement.repository.spec.ts
pnpm --filter @ipeasy/api test:integration -- src/modules/dedicated-line-orders/tests/dedicated-line-order-completion-integration.spec.ts
```

预期：新订单的 placement nodes 全在允许集合内；集合容量不足时没有 line/projection 被部分创建。

### Task 3：线路独占域名和普通交付导入

**文件：**

- 新建：`apps/api/src/modules/dedicated-lines/line-domain-bindings.use-case.ts`
- 测试：`apps/api/src/modules/dedicated-lines/line-domain-bindings.use-case.spec.ts`
- 修改：`apps/api/src/modules/dedicated-lines/delivery-route-import.domain.ts`
- 修改：`apps/api/src/modules/dedicated-lines/delivery-route-import.domain.spec.ts`
- 修改：`apps/api/src/modules/dedicated-lines/delivery-route-import.use-case.ts`
- 新建：`apps/api/src/modules/dedicated-lines/tests/line-domain-and-route-integration.spec.ts`
- 修改：`apps/api/src/modules/dedicated-lines/delivery-routes.controller.ts`
- 修改：`apps/api/src/modules/dedicated-lines/dedicated-line-delivery.use-case.ts`

**接口：**

- `PUT /api/admin/control-plane/lines/:id/domains` 为完整替换，body 为
  `{ domains: [{hostname,port,role}], reason, idempotencyKey }`。
- 普通初次交付导入使用 `stage: 'INITIAL'`，且域名集合必须与 active binding 完全相等。

- [ ] **Step 1：写域名不变量 RED 测试**

```ts
it('requires exactly one primary and at least one backup', async () => {
  await expect(useCase.execute(ctx, lineId, {
    domains: [{ hostname: 'a.example.com', port: 60701, role: 'PRIMARY' }],
    reason: 'bind delivery domains', idempotencyKey: 'domains-1',
  })).rejects.toMatchObject({ reasonKey: 'line_backup_domain_required' });
});
```

同时测试跨线路 `(hostname, port)` 冲突、大小写归一化、端口不匹配和租户越权。

- [ ] **Step 2：运行 RED，再实现完整替换和审计**

运行：`pnpm --filter @ipeasy/api test -- src/modules/dedicated-lines/line-domain-bindings.use-case.spec.ts`

实现不能自动从历史 route 认领域名；ACTIVE/DEGRADED 线路不允许在替换中移除当前 route 正在使用的域名，
除非后续迁移已 staged 并由 commit 执行。

- [ ] **Step 3：写普通 route import RED 测试**

```ts
it('rejects an initial route whose domains differ from the owned bindings', async () => {
  const response = await request.post('/api/admin/delivery-routes/import')
    .set(auth).send(initialImport({ domains: [{ hostname: 'foreign.example.com', port: 60701, isPrimary: true }] }));
  expect(response.status).toBe(422);
  expect(response.body.code).toBe('VALIDATION_ERROR');
});
```

- [ ] **Step 4：实现 `INITIAL` 导入并保持历史快照**

普通导入流程：校验 binding -> 创建 route -> 事务内将旧 current 置 false -> 新 route 置 current -> 收敛 line
状态。返回值增加 `stage: 'INITIAL'` 和 `currentChanged: true`。

- [ ] **Step 5：运行领域、API 集成和客户交付测试**

预期客户只看到 active binding/current route 的主域名和备用域名，不看到退休域名或 staged route。

### Task 4：创建迁移、预留目标资源并投影准备

**文件：**

- 新建：`apps/api/src/modules/dedicated-line-migrations/dedicated-line-migration.repository.ts`
- 新建：`apps/api/src/modules/dedicated-line-migrations/create-migration.use-case.ts`
- 测试：`apps/api/src/modules/dedicated-line-migrations/create-migration.use-case.spec.ts`
- 新建：`apps/api/src/modules/dedicated-line-migrations/dto.ts`
- 新建：`apps/api/src/modules/dedicated-line-migrations/dedicated-line-migrations.controller.ts`
- 新建：`apps/api/src/modules/dedicated-line-migrations/dedicated-line-migrations.module.ts`
- 修改：`apps/api/src/app.module.ts`
- 修改：`apps/api/src/modules/dedicated-line-projections/dedicated-line-projection.repository.ts`
- 修改：`apps/api/src/modules/dedicated-line-projections/build-managed-line-projection-request.ts`
- 新建：`apps/api/src/modules/dedicated-line-migrations/tests/create-migration-integration.spec.ts`

**接口：**

- `CreateDedicatedLineMigrationUseCase.execute(ctx,lineId,input): Promise<MigrationSummary>`。
- 目标 projection work 必须从 migration target exit 读取，而非 current assignment；job payload 显式带
  `migrationId` 和 `exitId`。
- `POST /api/admin/control-plane/lines/:id/migrations`。

- [ ] **Step 1：写三类创建和冲突 RED 测试**

覆盖：重复 idempotency 返回同一 migration；不同 body 复用 key 返回 409；activeMigration 已存在返回
`LINE_MIGRATION_ALREADY_ACTIVE`；NODE_ONLY 差集；FULL 禁止节点交集；EXIT_ONLY 保持节点集合；目标出口
必须 AVAILABLE/RESERVED、国家匹配、fresh health、fanout 足够。

- [ ] **Step 2：运行 RED 并实现 serializable create transaction**

事务顺序固定为：

```text
锁 line/current version -> 校验 activeMigrationId -> 校验 policy allowlist
-> 原子预留 target-source 节点容量 -> 原子 reserve target exit
-> create migration + source/target nodes -> set line.activeMigrationId
-> create target projections/jobs -> audit
```

任何一步失败必须回滚所有 DB 预留。

- [ ] **Step 3：让 projection repository 加载 staged target exit**

现有非迁移 job 继续从 active assignment 读取；只有 payload 中有效的 migration/exit 且 scope/version 匹配时，
从 target exit 读取。不要增加“找不到就退回 current exit”的 fallback。

- [ ] **Step 4：投影完成后推进阶段**

所有 target projections READY 时：NODE_ONLY/FULL 进入 `CANARY_ROUTE`；EXIT_ONLY 进入 `VERIFY`。部分成功只
更新副本状态，不推进迁移，不修改 line current status。

- [ ] **Step 5：运行 unit/integration 测试并核对容量**

验证成功创建后仅 `target-source` 增加 allocatedUnits；失败/幂等 replay 不重复增加。

### Task 5：迁移 staged 路由、target manifest 和外部 smoke 证据

**文件：**

- 修改：`apps/api/src/modules/dedicated-lines/delivery-route-import.domain.ts`
- 修改：`apps/api/src/modules/dedicated-lines/delivery-route-import.use-case.ts`
- 新建：`apps/api/src/modules/dedicated-line-migrations/get-target-manifest.use-case.ts`
- 新建：`apps/api/src/modules/dedicated-line-migrations/queue-migration-smoke.use-case.ts`
- 新建：`apps/api/src/modules/dedicated-line-migrations/process-migration-smoke.use-case.ts`
- 测试：`apps/api/src/modules/dedicated-line-migrations/process-migration-smoke.use-case.spec.ts`
- 新建：`apps/api/src/modules/dedicated-line-migrations/migration-smoke.adapter.ts`
- 测试：`apps/api/src/modules/dedicated-line-migrations/migration-smoke.adapter.spec.ts`
- 新建：`apps/worker/src/dedicated-line-migration-worker.ts`
- 测试：`apps/worker/src/dedicated-line-migration-worker.spec.ts`
- 修改：`apps/worker/src/main.ts`
- 修改：`apps/api/src/common/config/env.schema.ts`
- 修改：`.env.example`

**接口：**

- route import 接收 `migrationId` 与 `stage: 'CANARY' | 'CUTOVER' | 'ROLLBACK'`。
- `GET .../migrations/:id/target-manifest?stage=CANARY|CUTOVER|ROLLBACK` 不返回 secret。
- smoke job kind 为 `VERIFY_DEDICATED_LINE_MIGRATION`。
- Adapter 输入来自服务端解密的专线凭据和 staged 域名，输出真实 observed IP/country/latency/stability。

- [ ] **Step 1：写 staged import RED 测试**

```ts
it('creates a canary route without changing the current route', async () => {
  const before = await currentRoute(lineId);
  await importRoute(canaryImport(migrationId));
  expect(await currentRoute(lineId)).toEqual(before);
  expect(await stagedRoute(migrationId, 'CANARY')).toMatchObject({ isStaged: true, isCurrent: false });
});
```

同时覆盖备用域名不是该线路所有、target node/version 不匹配、投影未全 READY、重复 source version 指纹冲突。

- [ ] **Step 2：运行 RED 后实现 staged import 和 manifest**

CANARY 只允许一个 active BACKUP 域名；CUTOVER 必须是完整 active binding 集合且有且仅有一个 PRIMARY；
ROLLBACK targets 必须等于 source snapshot。三者都不调用 `updateMany({isCurrent:true})`。

- [ ] **Step 3：写 smoke Adapter RED 测试**

使用本地受控 TCP/HTTP 测试服务验证协议请求路径，不访问公共任意 URL；目标探测 URL来自固定配置。失败
分类至少包含 DNS、TCP、AUTH、TARGET、COUNTRY_MISMATCH、STABILITY_WINDOW。

- [ ] **Step 4：实现 smoke job、租约和 worker**

只有服务端 worker 可以写 `dedicated_line_smoke_observations.verified=true`。API 的 `/verify` 只排队，客户端
不能提交结果。成功后 NODE_ONLY/FULL 进入 CUTOVER_ROUTE；EXIT_ONLY 进入 COMMIT。

- [ ] **Step 5：新增默认关闭的配置并测试 ConfigGuard**

```env
DEDICATED_LINE_MIGRATION_EXECUTION_ENABLED=false
DEDICATED_LINE_MIGRATION_SMOKE_TARGET_URL=https://固定受控探测域名/
WORKER_DEDICATED_LINE_MIGRATION_POLL_INTERVAL_MS=5000
WORKER_DEDICATED_LINE_MIGRATION_BATCH_SIZE=10
```

生产开启时 target URL 缺失或不安全必须启动失败；关闭时 worker 只记录一次 disabled 日志。

### Task 6：原子提交、取消/回滚和旧资源清理

**文件：**

- 新建：`apps/api/src/modules/dedicated-line-migrations/commit-migration.use-case.ts`
- 测试：`apps/api/src/modules/dedicated-line-migrations/commit-migration.use-case.spec.ts`
- 新建：`apps/api/src/modules/dedicated-line-migrations/cancel-migration.use-case.ts`
- 测试：`apps/api/src/modules/dedicated-line-migrations/cancel-migration.use-case.spec.ts`
- 新建：`apps/api/src/modules/dedicated-line-migrations/process-migration-cleanup.use-case.ts`
- 测试：`apps/api/src/modules/dedicated-line-migrations/process-migration-cleanup.use-case.spec.ts`
- 新建：`apps/api/src/modules/dedicated-line-projections/delete-dedicated-line-projection.use-case.ts`
- 测试：`apps/api/src/modules/dedicated-line-projections/delete-dedicated-line-projection.use-case.spec.ts`
- 修改：`apps/api/src/modules/alerts/bark-alert-outbox.repository.ts`
- 修改：`apps/api/src/worker.ts`

**接口：**

- `commit` 校验 migration phase、source version、目标全部 READY、fresh smoke、CUTOVER staged route（EXIT_ONLY 除外）。
- cleanup job kind 为 `CLEANUP_DEDICATED_LINE_MIGRATION`；投影删除 job kind 为
  `DELETE_DEDICATED_LINE_PROJECTION`。

- [ ] **Step 1：写 commit 原子性 RED 测试**

```ts
it('does not change any current record when the line version drifted', async () => {
  const before = await readCurrentSnapshot(lineId);
  await expect(useCase.execute(ctx, migrationId, command))
    .rejects.toMatchObject({ reasonKey: 'line_version_conflict' });
  expect(await readCurrentSnapshot(lineId)).toEqual(before);
});
```

覆盖 current placement、assignment、route、desiredVersion 和 audit 的全有或全无。

- [ ] **Step 2：实现 serializable commit**

NODE_ONLY/FULL：将 CUTOVER staged route 置 current、旧 current 置历史；更新 placement nodes/version；FULL
同时切 exit。EXIT_ONLY：更新 current exit assignment 和所有 current projections desired version/hash，路由不变。
提交后设置 phase CLEANUP、status ACTIVE、line.activeMigrationId 保留到 cleanup 终态，并创建 cleanup job。

- [ ] **Step 3：写 cancel/rollback RED 测试并实现**

PREPARE 未触碰 NY：排队删除 target projections，释放 `target-source` 和 target exit reservation 后 CANCELLED。
已有 canary/cutover staged route：进入 ROLLBACK/NEEDS_OPERATOR；只有匹配 source snapshot 的 rollback import 后
允许同样清理。COMMIT 后 cancel 返回 `migration_already_committed`。

- [ ] **Step 4：写 delete read-back 和 cleanup RED 测试**

Adapter DELETE 返回 `DELETED` 且 observed version 匹配后才能把 projection 标 DELETED。404 只有在本地记录已有
nodeExternalId 且随后 GET 也为 404 时按幂等删除成功处理；其他错误重试或 NEEDS_OPERATOR。

- [ ] **Step 5：实现精确一次资源释放和 Bark 告警**

cleanup repository 的更新必须带状态谓词：只把尚未释放的 migration node reservation 改为 released，再对
对应 node `allocatedUnits` 减一；重放不重复减。旧出口无其他 active assignment/reservation 后标 RELEASED。
终态清空 line.activeMigrationId。超过最大重试写去重 topic `alerts.bark.line_migration_cleanup_failed`。

- [ ] **Step 6：运行迁移 use case、worker 与投影 Adapter 测试**

预期覆盖 cleanup 部分失败、worker 重启/租约过期、重复 job、交集节点保留和 Bark 去重。

### Task 7：查询契约、OpenAPI 与管理端迁移工作流

**文件：**

- 新建：`apps/api/src/modules/dedicated-line-migrations/list-migrations.use-case.ts`
- 新建：`apps/api/src/modules/dedicated-line-migrations/get-migration.use-case.ts`
- 修改：`apps/api/src/modules/dedicated-lines/list-dedicated-line-limits.use-case.ts`（重命名职责或新增统一 line list，不把迁移字段硬塞进限额 DTO）
- 修改：`apps/api/src/modules/dedicated-line-migrations/dto.ts`
- 修改：`apps/api/src/modules/dedicated-line-migrations/dedicated-line-migrations.controller.ts`
- 新建：`apps/web/src/features/admin-control-plane/line-migrations.api.ts`
- 新建：`apps/web/src/features/admin-control-plane/line-migrations.feature.tsx`
- 测试：`apps/web/src/features/admin-control-plane/line-migrations.feature.spec.tsx`
- 新建：`apps/web/src/routes/admin/control-plane/migrations/$migrationId.tsx`
- 修改：`apps/web/src/app/router.tsx`
- 修改：`apps/web/src/features/admin-control-plane/control-plane.feature.tsx`
- 修改：`apps/web/src/shared/i18n/zh.ts`
- 修改：`apps/web/src/shared/i18n/en.ts`
- 修改：`packages/contracts/openapi.json`（生成）
- 修改：`packages/contracts/src/generated/api.ts`（生成）

**接口：**

- 列表/详情后端返回 `allowedActions: Array<'IMPORT_CANARY'|'QUEUE_VERIFY'|'IMPORT_CUTOVER'|'COMMIT'|'RETRY'|'CANCEL'|'IMPORT_ROLLBACK'>`。
- 前端不从 phase/status 推导按钮。

- [ ] **Step 1：写 API scope/secret RED 测试**

PLATFORM_ADMIN 只看当前 site；TENANT_ADMIN 只看自身 tenant；详情不返回 baseUrl、credential ciphertext、出口
host/username/password、client identity。分页元数据为 number。

- [ ] **Step 2：实现列表/详情和 Swagger DTO**

详情投影字段包括 source/target node code、容量变化、掩码出口 Provider/country/health、域名角色、route evidence、
smoke evidence、阶段错误、审计时间和 allowedActions。

- [ ] **Step 3：写前端 RED 测试**

```tsx
it('renders only server-authorized actions and sends an audited create command', async () => {
  renderFeature();
  await user.click(await screen.findByRole('button', { name: '迁移' }));
  await user.click(screen.getByRole('radio', { name: '完整迁移' }));
  // choose allowed nodes, enter reason, submit
  expect(postedBody).toMatchObject({ type: 'FULL', reason: expect.any(String), idempotencyKey: expect.any(String) });
  expect(screen.queryByRole('button', { name: '提交切换' })).not.toBeInTheDocument();
});
```

覆盖 loading/empty/error/permission/pending/needs-operator、长域名、容量警告、提交后无取消按钮和键盘关闭/焦点恢复。

- [ ] **Step 4：实现列表行命令和独立详情页**

创建使用 modal；迁移生命周期使用独立详情页和 Ant Design Timeline/Descriptions/Table，不做嵌套卡片。节点选择
只展示后端返回的 allowed candidates 与实时剩余容量。高风险 commit 显示目标线路、NY 证据和不可取消后果。

- [ ] **Step 5：生成和验证 contracts**

运行：

```powershell
pnpm --filter @ipeasy/api export:openapi
pnpm --filter @ipeasy/contracts generate
pnpm --filter @ipeasy/contracts typecheck
```

预期 OpenAPI 含 migrations、domains 和 staged route schema，无 `Record<string, never>` 漂移。

### Task 8：节点健康事件、去重告警与迁移建议

**文件：**

- 新建：`apps/api/src/modules/dedicated-line-migrations/control-node-health.repository.ts`
- 新建：`apps/api/src/modules/dedicated-line-migrations/process-control-node-health.use-case.ts`
- 测试：`apps/api/src/modules/dedicated-line-migrations/process-control-node-health.use-case.spec.ts`
- 修改：`apps/api/src/modules/dedicated-line-projections/managed-line-projection.adapter.ts`
- 新建：`apps/worker/src/control-node-health-worker.ts`
- 测试：`apps/worker/src/control-node-health-worker.spec.ts`
- 修改：`apps/worker/src/main.ts`
- 修改：`apps/api/src/common/config/env.schema.ts`
- 修改：`.env.example`
- 修改：`apps/api/src/modules/dedicated-line-migrations/list-migrations.use-case.ts`
- 修改：`apps/api/src/modules/dedicated-line-migrations/dedicated-line-migrations.controller.ts`

**接口：**

- 探测对象仅为拥有 current non-DELETED projection 的 ACTIVE/DRAINING 节点，不扫描未使用节点，也不接收调用方 URL。
- 单次探测通过现有 managed projection `GET` 验证 API 鉴权、OpenUI 可达和 projection read-back；结果追加到
  `control_node_health_observations`，不能用 TCP connect 冒充健康。
- 连续失败阈值由 `CONTROL_NODE_HEALTH_FAILURE_THRESHOLD` 控制，默认 3；事件键为
  `nodeId:incidentVersion`，恢复后关闭该事件并递增下一次 incident version。
- `GET /api/admin/control-plane/migration-recommendations` 返回分页建议和候选节点；建议不预留容量。

- [ ] **Step 1：写连续失败与恢复 RED 测试**

```ts
it('creates one recommendation and one Bark event only after the failure threshold', async () => {
  await executeFailure(nodeId, 1);
  await executeFailure(nodeId, 2);
  expect(await recommendationCount(nodeId)).toBe(0);
  await executeFailure(nodeId, 3);
  expect(await recommendationCount(nodeId)).toBe(1);
  expect(await barkCount(nodeId, 1)).toBe(1);
  await executeFailure(nodeId, 4);
  expect(await recommendationCount(nodeId)).toBe(1);
  expect(await barkCount(nodeId, 1)).toBe(1);
});
```

同时测试一次成功恢复后关闭 incident/recommendation，下一轮连续失败生成 incident version 2。

- [ ] **Step 2：运行 RED 后实现 append-only observation 与 incident 聚合**

repository claim 当前节点及一个稳定 current projection，Adapter GET 后校验 projectionKey、observed/desired version、
hash 和 ACTIVE 状态。成功更新 `lastHealthyAt` 并关闭当前 incident；失败追加脱敏 reason，不覆盖最近一次成功证据。

- [ ] **Step 3：为受影响线路生成建议候选**

每条受影响 current line 生成一条 recommendation，候选只能来自该 line 的 policy allowed nodes，排除故障节点、
DISABLED/DRAINING、容量不足、租户不匹配和 inbound 不兼容节点。没有候选也保存 recommendation，并以
`no_eligible_target_node` 明确阻塞，不选择集合外节点。

- [ ] **Step 4：通过事务 outbox 发送去重 Bark**

topic 为 `alerts.bark.control_node_incident`，dedupeKey 为 `control-node:<nodeId>:incident:<version>`；payload 只含
节点 code、影响线路数量、incident version 和管理端 URL，不含 baseUrl/token/client/exit secret。

- [ ] **Step 5：实现 worker 与默认关闭配置**

```env
CONTROL_NODE_HEALTH_MONITOR_ENABLED=false
CONTROL_NODE_HEALTH_FAILURE_THRESHOLD=3
WORKER_CONTROL_NODE_HEALTH_POLL_INTERVAL_MS=30000
WORKER_CONTROL_NODE_HEALTH_BATCH_SIZE=20
```

worker 使用有界 `Promise.allSettled`，禁止同节点重入；关闭时仅记录一次 disabled。迁移执行 gate 关闭不妨碍健康
监控独立开启，但默认两者都关闭。

- [ ] **Step 6：写建议列表 scope 和“确认才创建迁移”测试**

建议 GET 严格 site/tenant scope；建议本身不修改 placement、route、exit、line version、activeMigrationId 或
allocatedUnits。管理员从建议发起迁移时仍调用 Task 4 的 create use case 并重新校验容量，过期候选不能绕过校验。

- [ ] **Step 7：运行 API/worker 测试**

预期覆盖阈值、恢复、新 incident、Bark 去重、无候选、权限、worker 重入和 Adapter read-back mismatch。

### Task 9：回归、浏览器、部署和真实测试线路演练

**文件：**

- 修改：`.trellis/tasks/08-11-full-stack-audit-delivery/research/phase-7-zeabur-production-verification.md`
- 新建：`.trellis/tasks/08-11-full-stack-audit-delivery/evidence/phase-8-line-migrations/README.md`
- 修改：`.trellis/spec/api-contract.md`
- 修改：`.trellis/spec/backend/quality-guidelines.md`

**接口：** 无新运行时接口；此任务收集发布证据并保持 gate 默认关闭。

- [ ] **Step 1：运行迁移与生成检查**

```powershell
pnpm --filter @ipeasy/db generate
pnpm --filter @ipeasy/db typecheck
pnpm --filter @ipeasy/api typecheck
pnpm --filter @ipeasy/api lint
pnpm --filter @ipeasy/api test
pnpm --filter @ipeasy/worker typecheck
pnpm --filter @ipeasy/worker lint
pnpm --filter @ipeasy/worker test
pnpm --filter @ipeasy/web typecheck
pnpm --filter @ipeasy/web lint
pnpm --filter @ipeasy/web test
pnpm --filter @ipeasy/api build
pnpm --filter @ipeasy/worker build
pnpm --filter @ipeasy/web build
git diff --check
```

若有 `DATABASE_URL_TEST`，再运行 migration deploy 到隔离测试库和相关 integration suite；严禁把会 TRUNCATE 的测试指向生产。

- [ ] **Step 2：浏览器硬门**

在 320、375、768、1024、1440px 与 200% zoom 验证 `/admin/control-plane` 和 migration detail：无 console/page/
request error、无横向页面溢出、表格内部可滚动、modal focus trap/Esc/restore 正确、按钮只按 allowedActions 出现。
截图保存到 evidence 目录。

- [ ] **Step 3：部署但保持迁移 gate 关闭**

先部署数据库 migration，再 API/worker/Web；读取 Zeabur deployment 状态和 runtime logs。验证生产变量：
`DEDICATED_LINE_MIGRATION_EXECUTION_ENABLED=false`，同时 projection/order/provider/payment gates 保持既有安全值。

- [ ] **Step 4：线上只读和未登录 smoke**

验证 OpenAPI 路由、未登录 401 envelope/requestId、Web 路由登录重定向、main bundle 包含迁移页面且无 runtime error。

- [ ] **Step 5：准备真实测试线路后逐步开启**

只有生产已存在：两组容量足够且健康的 OpenUI 节点、线路独占主/备用域名、可用且国家已验证的目标出口、NY
管理员操作窗口、外部 smoke runner，才允许开启 migration execution。先 NODE_ONLY，再 FULL：

```text
create -> target projections READY -> canary import -> external auth/country/stability PASS
-> cutover import -> commit -> customer delivery PASS -> old projection DELETED read-back
-> source-only capacity released once -> migration COMPLETED
```

任一前置不存在，证据必须写“代码已部署，真实迁移未验证”，不能填成功。

- [ ] **Step 6：更新 Trellis 长期规范与验证报告**

记录 Source of Truth、staged/current 不变量、精确容量 delta、EXIT_ONLY 混合窗口、开关和真实未验证项。不得提交
用户未确认的 Git commit；先展示变更范围和建议 commit 分组。

## 自审映射

| 设计要求 | 实施任务 |
| --- | --- |
| 客户允许节点集合与容量内调度 | Task 1-2 |
| 每线独占主/备用域名 | Task 1、3 |
| 三种迁移与唯一活动事务 | Task 1、4、6 |
| canary/staged NY 导入不切 current | Task 3、5、6 |
| 外部真实 smoke 才能提交 | Task 5-6 |
| cleanup 精确释放与 Bark | Task 6 |
| 故障只告警建议、不自动迁移 | Task 8 |
| 管理端真实阶段/allowedActions | Task 7 |
| 节点 managed read-back、事件版本与 Bark 去重 | Task 8 |
| 开关、部署、浏览器、真实线路证据 | Task 9 |

## Evidence Update 2026-08-18

- Local unit/type/lint/build gates are green: API 75 files/460 tests, worker 6 files/26 tests, web build, OpenAPI generation, contracts generation, Prisma validation, and predeploy check.
- Browser E2E was attempted with the repository config and stopped before tests because the real E2E servers require DATABASE_URL_TEST or DATABASE_URL. No mock database was introduced.
- Railway production is still on the previous release. Backend /ready is healthy for DB and Redis. The primary Postgres volume is READY but has zero listed backups; the manual backup mutation is rejected as Not Authorized.
- Production migration and application deployment remain pending. Do not enable dedicated execution gates or change node configuration until backup and database-side migration evidence exist.
