# Dirty tree 分类审计

审计时间：2026-09-10（Asia/Shanghai）
分支：`railway-fixes-merge`
除写入本报告外，审计过程只读；未执行 `add`、`commit`、`push`、删除或部署。

## 重要时间点

审计开始时 HEAD 为 `55daf82`，`git status --porcelain=v1 --untracked-files=all` 返回 510 个路径（用户所说的约 497 与实际快照有偏差）。随后工作树在并发操作中出现新提交 `a26d20f`（当前 HEAD，领先远端 1 个提交）；该提交不是本审计操作产生的。它一次性吸收了原快照的 439 个路径，故不能把“当前 71 个 dirty path”误读为完整变更集。

原始 510 路径的分类（以 `55daf82` 为基准）：

| 类别 | 数量 | 含义 |
| --- | ---: | --- |
| A | 107 | 当前冻结前端兼容、Zone、工单/通知、订单/provider 生产修复、测试门禁、部署配置及对应 Trellis/spec |
| B | 359 | `apps/api/src` 旁路编译产物删除（118 `.js`、118 `.d.ts`、118 `.js.map`）及 5 个编译/解析清理文件 |
| C | 3 | 其他 Trellis 任务或混合历史工作记录，不能默认纳入 |
| D | 41 | 敏感/运维历史改写、未识别运维脚本和临时二进制/抓取文件 |

`a26d20f` 吸收了 A 中 80 个路径和 B 中全部 359 个路径。当前（该提交之后、审计报告写入之前）剩余 71 个 dirty path：A 27、C 3、D 41、B 0。报告本身会再增加 1 个 A 路径。

## apps/web 结论

`git diff --quiet HEAD -- apps/web` 退出码为 0；`git diff --cached --name-only -- apps/web`、`git diff --name-only -- apps/web` 和 `git ls-files --others --exclude-standard -- apps/web` 均为空。即当前及原始快照都没有 `apps/web/**` 改动，满足“冻结前端字节不变”约束。

## A：建议纳入当前任务

### 已被 `a26d20f` 吸收的 80 个路径

这是当前任务的实现/测试主体，但提交消息把业务修复和编译产物清理混在一起。按逻辑可审计的路径边界如下（实际清单以该提交的 `git show --name-status a26d20f` 为准）：

- 冻结兼容与站点隔离：
  `apps/api/src/common/http/legacy-api-v1.{ts,spec.ts}`、`apps/api/src/main.ts`、`apps/api/src/modules/api-v1-compat/**`。
- 工单、通知、用户数字 ID：
  `apps/api/src/modules/tickets/**`、
  `apps/api/src/modules/notifications/{notifications.repository.ts,use-cases/notifications.use-case.spec.ts}`、
  `apps/api/src/modules/users/{users.repository.ts,users.repository.spec.ts}`。
- Zone 及订单/履约串联：
  `apps/api/src/modules/zones/**`、
  `apps/api/src/modules/dedicated-line-orders/**/*.ts`、
  `apps/api/src/modules/dedicated-lines/{dedicated-lines.module.ts,renew-dedicated-line.use-case.ts}`、
  `apps/api/src/modules/orders/**`、
  `apps/api/src/modules/openapi/res-static.controller.ts`。
  其中 `apps/api/src/modules/dedicated-line-orders/renew-dedicated-line.use-case.ts` 是删除项，需确认它是向 canonical `dedicated-lines` 迁移的有意删除，不能仅因测试通过就忽略。
- 数据库契约：
  `packages/db/prisma/schema.prisma`、
  `packages/db/prisma/migrations/20260908020000_add_ticket_legacy_id/migration.sql`、
  `packages/db/prisma/migrations/20260908220000_add_user_legacy_id/migration.sql`、
  `packages/db/prisma/migrations/20260908230000_add_user_zones/migration.sql`。
- Provider/库存与生产门禁：
  `apps/api/src/modules/providers/provider-bootstrap-plans.{ts,spec.ts}`、
  `apps/api/src/modules/dedicated-line-orders/{create-dedicated-line-order.use-case.ts,dedicated-line-inventory.repository.ts}`、
  `apps/api/src/modules/alerts/process-bark-inventory-alert.use-case.{ts,spec.ts}`，以及同目录的相关回归测试。
- 测试与 DI/集成数据库门禁：
  `apps/api/src/test-utils/{integration-setup.ts,integration-database-url.ts,integration-database-url.spec.ts}`、
  `apps/api/vitest.integration.config.ts`，及 `apps/api/src/modules/{admin,customer-reseller,payments}/**/*integration.spec.ts` 的对应改动。
- Provider bootstrap 脚本和示例环境：
  `apps/api/scripts/{create-test-order.js,provider-bootstrap.ts,seed-providers.js,seed-us-dedicated-line-sku.js,seed-us-provider-accounts.sql,seed-us-provider-accounts.ts,test-provider-direct.js,write-us-resources.js}`、`.env.example`。

### 当前仍未提交的 A 路径（27 个）

建议按以下独立提交边界处理：

1. `fix(release): add frozen API build/deploy gates`
   - `.dockerignore`
   - `.zeaburignore`
   - `apps/worker/Dockerfile`
   - `scripts/deploy-zeabur.sh`
   - `scripts/health-check-zeabur.sh`
   - `scripts/predeploy-check.mjs`
   - `zeabur.yaml`
   - `package.json`

2. `chore(security): add tracked-file secret scan`
   - `scripts/scan-secrets.mjs`
   - `scripts/scan-secrets.spec.mjs`

3. `docs(task): record frozen frontend compatibility verification`
   - `.trellis/tasks/09-07-fix-frozen-frontend-resource-requests/**`
   - `.trellis/spec/backend/{database-guidelines.md,legacy-api-v1.md,quality-guidelines.md}`

若要重写 `a26d20f`，至少应先把其业务实现与 B 类清理拆成两个提交；数据库 schema 变更与三条 migration 必须保持同一实现提交，不能把迁移单独推送到未配套代码的远端。

## B：编译生成物/应删除或忽略

原始快照中的 359 个 B 路径已经被 `a26d20f` 删除/吸收：

- 精确 glob：`apps/api/src/**/*.js`、`apps/api/src/**/*.d.ts`、`apps/api/src/**/*.js.map`。
- 数量核对：每种扩展名 118 个，共 354 个；另有 `.gitignore`、`apps/api/check-metadata.mjs`、`apps/api/eslint.config.js`、`apps/api/src/test-inject.ts`、`apps/api/vitest.config.ts` 5 个“清理/解析边界”文件。
- `.gitignore` 已加入上述 source-side artifact 规则；后续构建应只产出到 `dist/`，不能把生成文件重新写回 `src/`。

不要把这些删除误当作业务回退；但应在提交审查中确认没有任何运行入口仍依赖 `src` 旁路 `.js` 文件。

## C：不默认纳入

以下 3 个路径与其他任务或混合历史工作相关，建议从当前提交排除：

- `.trellis/tasks/08-16-dedicated-node-integration/check.jsonl`
- `.trellis/tasks/08-16-dedicated-node-integration/implement.jsonl`
- `.trellis/workspace/rewrite-residential-proxy-platform/journal-2.md`

`journal-2.md` 同时包含多个任务的历史会话，不能用“其中有当前任务字样”作为纳入理由；如需归档，应由对应任务的 finish/journal 流程单独提交。

## D：临时、敏感或需单独人工复核

### D1：已跟踪的敏感/运维历史改写（12 个）

这些改动表现为把历史运维文档中的凭据/连接信息替换为占位描述。不要与功能提交混合；先人工确认替换完整，再单独使用安全提交：

- `.trellis/tasks/09-05-integrate-985proxy-ipipd-us-exits/{implementation-notes.md,prd.md,production-readiness.md,progress.md,zeabur-worker-config.md,research/provider-apis.md}`
- `.trellis/tasks/archive/2026-09/08-21-fix-all-errors-production-ready/production-readiness-state.md`
- `apps/control-panel/{.env.example,DEPLOY.md,README.md}`
- `docs/infrastructure/server-discovery-report.md`

工作树版本的 `node scripts/scan-secrets.mjs` 报告无高置信度跟踪文件发现；这不等于 Git 历史已被清理，也不替代人工审阅和远端 secret rotation。报告不记录任何凭据值。

### D2：未识别运维脚本（8 个）

这些脚本没有被当前 PRD 的源码契约直接引用，且至少有一处凭据形状的本地赋值，必须先审阅后决定是否保留，默认不纳入：

- `apps/api/scripts/{check-all-orders.ts,create-985-order-apikey.js,create-985-order-via-api.js,create-985-order-via-api.sh,create-985-test-order.ts,create-test-order-v3.ts,inspect-failed-job.ts,retry-queued-orders.ts}`

### D3：临时抓取/二进制文件（21 个）

默认删除或加入本地忽略（本次审计未删除）：

`elo0`、`elo1`、`elo1.txt`、`elo2`、`horton0`、`horton1`、`horton2`、`search.html`、`w18474.pdf`、`w18474.txt`、`w18720.pdf`、`w18720.txt`、`w18917.pdf`、`w18917.txt`、`world0`、`world1`、`world1.txt`、`world1raw.txt`、`world2`、`x1`、`x2`。

## 建议的最终提交顺序

若尚未推送且需要恢复可审计历史，建议：

1. B 清理提交：只包含上述 354 个 source-side 产物删除和 5 个解析/忽略边界文件。
2. A 实现提交：包含 `a26d20f` 的 80 个业务/测试/迁移路径，必要时再按“兼容/Zone/订单”与“测试门禁”拆分；确认 renewal 删除语义。
3. A 发布门禁提交：当前 A 的 `.dockerignore`、Zeabur/Worker/health/deploy、package script。
4. A 安全扫描提交：两个 scanner 文件；D1 的历史凭据替换可在人工复核后另成安全修复提交，不要混入业务提交。
5. C、D2、D3 保持不提交；D1 不应丢弃，但先完成敏感内容审计与必要的凭据轮换。

## 风险与验证

- `a26d20f` 的提交消息和内容边界不一致：同一提交同时包含 354 个生成物删除和业务实现，回滚/挑拣会放大风险。
- 当前分支已领先远端 1 个提交；在父 Agent 确认提交归属前不要 push 或 amend。
- `apps/web/**` 零差异已由三条独立 Git 检查确认。
- Trellis 记录显示本地 API/DB/Worker/Web 检查曾通过，但生产 IPIPD 上游认证仍是 401、履约开关保持关闭；不要把健康检查结果写成 provider 履约已验证。
- 工作树仍有 D1/D2 文件；`predeploy:check` 在提交分组完成前应视为 blocked，不能用临时文件删除或宽泛 fallback 绕过。
