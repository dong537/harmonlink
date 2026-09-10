# Research: 冻结前端 Zone 数据来源与 Zeabur API Docker 部署路径

- Query: 确认冻结 Vue bundle 的 `/api/v1/zones` 完整请求契约、可用的 canonical source of truth，以及 API 在 Zeabur 上应采用的 Docker 构建和部署路径。
- Scope: mixed（仓库代码/冻结制品静态审计 + 已保存的 Zeabur 只读运行时审计）
- Date: 2026-09-08

## Findings

### 结论

1. 冻结前端中的 Zone 是用户自己创建、按用户隔离、用于分组订单和代理的“资源文件夹”，不是平台库存地理层级，也不是 985Proxy 上游账号的 `zoneId` 凭据。
2. 当前 canonical API/Prisma schema 没有这种用户 Zone 的 module、repository 或表。`platform_resources.type = ZONE` 属于供应商资源/库存树，强行映射会混淆 owner、生命周期、权限和字段语义。
3. 当前工作树的 `/api/v1` alias allowlist 为空，compat controller 也没有 Zone handler；已保存的线上 smoke 明确记录 `GET /api/v1/zones -> 404`。因此不能通过 URL rewrite 修复，必须新增真实持久化 source of truth 和显式 compat adapter，或继续返回明确 unsupported 错误。
4. API 的可信构建入口是以仓库根为 Docker build context、指定 `apps/api/Dockerfile`。镜像内使用 Node 20 Alpine、pnpm 9.15.0，生成 Prisma Client、构建 `@ipeasy/api...`，最后从 `/app/apps/api` 执行 `node dist/main`，监听 `8080`。
5. `zeabur.yaml` 虽指向正确 Dockerfile，但 API 端口仍声明为 `3000`；Dockerfile、部署文档及线上 Web 内网代理均使用 `8080`。部署前必须在 Zeabur service 配置中核对 `8080`，不能照搬该 YAML 的端口。

### 冻结 Zone transport 契约

冻结 shared client 把 Axios `baseURL` 固定为 `/api/v1`，成功响应直接返回 `response.data`，所以 Zone 模块中的相对 URL 最终形成以下浏览器请求（`.tmp/live-assets/index-D-BZDcpl.js:2`、`.tmp/live-assets/zone-BGlF3nZB.js:1`）：

| Method | Browser path | 已观察到的输入 |
| --- | --- | --- |
| `GET` | `/api/v1/zones` | 可选 query `includeArchived=true`；未启用时省略 |
| `POST` | `/api/v1/zones` | create DTO |
| `PATCH` | `/api/v1/zones/:id` | update DTO |
| `POST` | `/api/v1/zones/:id/archive` | 无 body |
| `DELETE` | `/api/v1/zones/:id` | 无 body |
| `GET` | `/api/v1/admin/users/:id/zones` | admin 按用户只读查询 |

页面代码进一步固定了以下可观察语义（`.tmp/live-assets/MyZones-BRW-Cbcj.js:1`、`.tmp/live-assets/Zones-BwVGbG8r.js:1`）：

- list/admin list 必须返回 raw array；页面直接赋值后读取 `.length`，不是 canonical `PageResult`，也不是 `{code,msg,data,requestId}` envelope。
- 列表项至少使用 `id`、`code`、`name`、`description`、`status`、`sortOrder`、`createdAt`。
- `status` 的冻结显示值是小写 `active` / `archived`。
- create body 是 `{ code, name, description, sortOrder }`；提交前 `code` 会转为小写。
- `code` 校验为 2-64 字符，允许字母、数字、下划线和连字符；编辑时 code 被禁用，说明它是不可修改的稳定业务键。
- update body 是 `{ name, description, sortOrder }`，不包含 `code`。
- `sortOrder` 页面允许 `0..999`。
- 归档后的 Zone 不能再用于新下单，但既有订单/代理保留且可见。
- 永久删除只应在该 Zone 下没有订单或代理时允许；否则页面引导归档。
- admin 页面明确写明 Zone 按用户隔离，管理端只读查询，不在 admin surface 直接修改。

冻结扫描中 Zone domain 有 6 个请求位点，其中 `/zones*` 5 个、admin 查询 1 个（`.tmp/frozen-scan-utf8.tsv:11`、`:39`、`:88`、`:104`、`:174`、`:175`）。

### Source of Truth 分析

#### `platform_resources` 不能承载用户 Zone

Prisma 中确有 `ResourceType.ZONE`，但它属于 `platform_resources` 的地理/供应商资源树（`packages/db/prisma/schema.prisma:624`、`:648`）：

- 强制字段包含 `providerCode`、`ipType`、`protocol`、库存/销售 `status`、`isVisible`、`isSaleable`，并关联 inventory、resource mapping、price 和 order。
- 唯一键包含 `siteId + providerCode + upstreamAccountId + code + ipType`（`packages/db/prisma/schema.prisma:679`），owner 不是用户。
- canonical controller 是 `/api/resources`，普通用户只能读取 public/saleable 投影；创建和更新要求 admin，并使用 `PUT` 而不是冻结 Zone 的用户级 `POST/PATCH`（`apps/api/src/modules/resources/resources.controller.ts:69`、`:76`、`:82`、`:164`、`:170`、`:191`）。
- repository list 的权威 scope 是 `siteId`，随后叠加 provider/current-account/tenant 和库存投影；结果是分页 `PageResult`（`apps/api/src/modules/resources/resources.repository.ts:192`、`:198`、`:212`、`:219`）。public catalog 还强制 `ACTIVE + isVisible + isSaleable`（`apps/api/src/modules/resources/resources.repository.ts:465`、`:466`、`:472`）。

Deletion test：若把冻结 Zone 直接 alias 到 `/resources`，调用方仍需自行伪造 provider、协议、IP 类型、销售状态、分页和 owner 语义，复杂度没有被 Module 隐藏，反而把两个领域污染在一起。因此这是错误的 shallow reuse。

#### 985Proxy `zoneId` 也不是用户 Zone

当前 `provider_accounts` 只持久化加密 provider credential，没有独立 Zone relation（`packages/db/prisma/schema.prisma:602`、`:608`、`:610`）。985 adapter 从 account credential 的可选 `zoneId`（或环境变量）读取上游静态库存/购买参数（`apps/api/src/modules/providers/adapters/nine-eight-five.adapter.ts:44`、`:45`；字段白名单见 `apps/api/src/modules/providers/provider-credential.ts:59`、`:61`）。这是运维配置的上游 account scope，不是用户可 CRUD 的资源文件夹。

#### 当前没有可复用实体

对 `packages/db/prisma/schema.prisma` 的精确检索没有找到 `zones` model、`zoneId` 或 `zoneCode` 字段；订单和代理也没有用户 Zone 外键。当前 compat alias 数组为空（`apps/api/src/common/http/legacy-api-v1.ts:21`、`:26`），而 `ApiV1CompatController` 只声明 auth/profile/dedicated routes（`apps/api/src/modules/api-v1-compat/api-v1-compat.controller.ts:39`、`:56`、`:62`、`:68`、`:123`、`:139`、`:218`）。线上审计记录 `GET /api/v1/zones` 返回 `404 NOT_FOUND`（`.tmp/runtime-zeabur-audit.md:57`、`:69`）。

### 推荐的实现边界

若本任务决定支持 Zone，建议建立独立深 Module，而不是给兼容 controller 填临时数组或映射库存资源：

- PostgreSQL/Prisma 新建用户 Zone 实体（命名遵循现有 snake_case），owner scope 至少包含 `siteId + tenantId + userId`；`code` 在用户 scope 内唯一。
- domain/use case 负责 code 不变量、`ACTIVE -> ARCHIVED` 状态转换、排序范围，以及归档/删除依赖规则；repository 只做 scoped CRUD 和依赖查询。
- `/api/v1/zones*` controller 只把冻结 DTO/小写状态/raw response 映射到 canonical use case，不复制订单、代理或 provider 规则。
- 所有 customer/admin compat 路由先执行 `LEGACY_API_V1_ENABLED` 和固定 `LEGACY_API_SITE_ID` gate，并验证 `ctx.siteId` 与配置站点相同；现有隔离研究已证明仅验证 token scope 不够（`.trellis/tasks/09-07-fix-frozen-frontend-resource-requests/research/site-isolation.md:7`、`:53`）。
- admin 查询必须由后端解析 target user 并做同站点/租户权限校验，不能信任 body/query 中的 authority 字段。
- 若订单/代理尚无 Zone relation，`archive` 的“禁止新单”和 `delete` 的“无依赖才允许”不能被真实证明。实现前应先决定关联 owner 和写入路径；无法完成时返回 typed unsupported/conflict，不能假成功或静默删除。
- 迁移后更新架构 spec，把“平台资源 `platform_resources`”与“用户组织 Zone”列为两个不同 source of truth。

建议的最低测试面：

1. Unit：create/update validation、code immutable、includeArchived、archive 状态转换、依赖存在时删除失败、raw legacy DTO/status 映射。
2. Permission：同站本人 CRUD、其他用户拒绝、tenant admin/platform admin 的只读范围、foreign-site token 在进入 repository 前被拒绝。
3. Real PostgreSQL integration：scope 唯一键、归档过滤、并发重复 code、真实依赖阻止删除；禁止 memory mock DB。
4. Browser/API smoke：冻结页面用真实凭据完成 list/create/edit/archive；没有可用真实用户凭据时必须标记 blocked，不得伪造成功。

### Zeabur API Docker 构建与部署路径

`apps/api/Dockerfile` 是当前仓库内的明确构建契约（`apps/api/Dockerfile:1`、`:5`、`:7`、`:9`、`:10`、`:11`、`:13`、`:16`、`:18`、`:20`）：

```text
build context: repository root
dockerfile: apps/api/Dockerfile
base: node:20-alpine
package manager: pnpm 9.15.0 via Corepack
install: pnpm install --frozen-lockfile --prod=false
generate: pnpm --filter @ipeasy/db generate
build: pnpm --filter @ipeasy/api... build
runtime cwd: /app/apps/api
port: 8080
command: node dist/main
```

必须使用仓库根作为 context，因为 Dockerfile 执行 `COPY . .` 并依赖 pnpm workspace、共享 DB package 和 transitive workspace build。只上传 `apps/api` 会缺少 workspace 文件和 `packages/db`。

部署配置证据与注意点：

- `zeabur.yaml:3-6` 指向 `./apps/api/Dockerfile`，但 API port 写成 `3000`；这是已确认的配置漂移。
- 部署文档明确规定 API Dockerfile 为 `apps/api/Dockerfile`、port `8080`、health path `/health`（`README-DEPLOYMENT.md:260`、`:264`、`:265`、`:266`）。
- Dockerfile 本身没有运行 `prisma migrate deploy`；若新增 Zone 表，必须在应用启动/流量切换前通过受控部署步骤执行 migration。仓库文档给出的 Zeabur exec 入口是 `cd /app && pnpm --filter @ipeasy/db migrate:deploy`（`README-DEPLOYMENT.md:295`、`:297`、`:299`）。
- 当前 Zeabur project 是 `6a786d80e4a69d66638d62e1`，API service 是 `6a7c0cb82d4cb87f2ba391e1`，域名是 `https://365proxy-api.zeabur.app`；Web 是 `https://365pro.zeabur.app`（`.tmp/runtime-zeabur-audit.md:21`、`:23`、`:26`、`:27`）。
- 保存的运行时审计显示 API/Web 为 `PREBUILT_V2`，Web 代理目标是 `http://api.zeabur.internal:8080`，并已配置 legacy 开关和 site ID（`.tmp/runtime-zeabur-audit.md:48`、`:50`、`:52`、`:53`）。这支持实际服务端口为 `8080`，但不替代新 deployment metadata 核验。
- 审计时 `/health`、`/ready`、Web `/healthz` 和 Web 同源 `/api/sites/current` 都返回 200（`.tmp/runtime-zeabur-audit.md:32`、`:38`、`:39`、`:40`、`:41`），只证明既有服务/transport 健康，不证明新代码已部署或 Zone contract 可用。

部署验证顺序应是：

1. 本地以根 context 构建 `apps/api/Dockerfile`，并核对镜像启动监听 `8080`。
2. 对目标数据库运行已审查 migration；不要依赖 runtime auto-migration。
3. 向现有 API service ID 部署，核对 Dockerfile/source、端口 `8080`、最终 deployment 状态和 release SHA，避免创建重复 service。
4. 依次 smoke `/health`、`/ready`、同源 `/api/v1/settings/capabilities`、无凭据应为 401 的 legacy route，再用真实 scoped 凭据验证 Zone 流程。
5. 核对 Web 同源代理仍指向 `api.zeabur.internal:8080`，且 `apps/web/**`/冻结 bundle 没有变化。

## Files Found

- `.tmp/live-assets/index-D-BZDcpl.js`：冻结客户端 shared Axios 实例，固定 `/api/v1` base URL 和 raw `response.data` 行为。
- `.tmp/live-assets/zone-BGlF3nZB.js`：六个 Zone 请求的 method/path/query 定义。
- `.tmp/live-assets/MyZones-BRW-Cbcj.js`：用户 Zone CRUD、字段、校验、归档和删除语义。
- `.tmp/live-assets/Zones-BwVGbG8r.js`：admin 按用户只读 Zone 查询及列表字段。
- `.tmp/frozen-scan-utf8.tsv`：冻结 bundle 的 method/path/source inventory。
- `.tmp/frozen-contract-agent.md`：2026-09-07 冻结 API 契约审计；将 zones 分类为未支持/待逐端点适配。
- `apps/api/src/common/http/legacy-api-v1.ts`：当前 legacy rewrite allowlist；读取时为空。
- `apps/api/src/modules/api-v1-compat/api-v1-compat.controller.ts`：现有 raw `/api/v1` auth/profile/dedicated adapter，无 Zone handler。
- `apps/api/src/modules/resources/resources.controller.ts`：canonical `/resources` HTTP interface，证明其为平台库存资源而非用户 Zone CRUD。
- `apps/api/src/modules/resources/resources.repository.ts`：`platform_resources` 的 site/provider/account/tenant/saleability 查询路径。
- `packages/db/prisma/schema.prisma`：当前数据库模型；只有 `ResourceType.ZONE` 枚举，没有用户 zones model 或订单/代理 Zone 外键。
- `apps/api/src/modules/providers/adapters/nine-eight-five.adapter.ts`：上游 provider credential `zoneId` 的实际消费者。
- `apps/api/Dockerfile`：API Docker build/runtime source of truth。
- `zeabur.yaml`：服务 Dockerfile 配置；API/Web port 仍为 3000，存在漂移。
- `.zeabur/config.yaml`：Zeabur project ID。
- `README-DEPLOYMENT.md`：Zeabur Dashboard 的 Dockerfile、8080 port、health 和 migration 操作说明。
- `research/zeabur-deployment-guide.md`：仓库级 Zeabur Docker runbook 和外部文档链接。
- `.tmp/runtime-zeabur-audit.md`：2026-09-07 服务 ID、域名、PREBUILT 类型、健康检查和日志查询限制。
- `.tmp/zeabur-new-deploy.log`：最近一次新 CLI 上传在 prepare 阶段 timeout 的证据。

## Code Patterns

- Raw frozen transport：`.tmp/live-assets/index-D-BZDcpl.js:2` 定义 `I="/api/v1"`、`axios.create({baseURL:I})`，response interceptor 返回 `e.data`。
- Frozen Zone calls：`.tmp/live-assets/zone-BGlF3nZB.js:1` 集中声明 list/create/update/archive/delete/admin list。
- User-owned semantics：`.tmp/live-assets/MyZones-BRW-Cbcj.js:1` 明示“账号下的资源文件夹”、用户 CRUD、code immutable、archive/delete 前置条件。
- Admin read projection：`.tmp/live-assets/Zones-BwVGbG8r.js:1` 明示“按用户隔离”和只读查询。
- No rewrite fallback：`apps/api/src/common/http/legacy-api-v1.ts:26` 的 allowlist 为空，`:71` 的 rewrite 只对 allowlisted exact method/path 生效。
- Inventory resource model：`packages/db/prisma/schema.prisma:648` 定义 `platform_resources`；`:660-668` 是 provider/protocol/saleability 字段；`:679-680` 是 provider account scope。
- Inventory query scope：`apps/api/src/modules/resources/resources.repository.ts:198-237` 组合 site、type、provider/current account、分页和 inventory mapping。
- Compat feature gate：`.trellis/spec/backend/legacy-api-v1.md:39-44` 固定开关、site ID、raw success/error shape。
- Docker build：`apps/api/Dockerfile:5-20` 固定 pnpm、generate、build、8080 和 `node dist/main`。
- Runtime health：`.tmp/runtime-zeabur-audit.md:38-44` 保存 API/DB/Redis/Web/同源代理的成功 smoke 及其证据边界。

## External References

- Zeabur documentation: https://zeabur.com/docs （仓库 runbook 引用：`research/zeabur-deployment-guide.md:623-627`）。
- Prisma Migrate: https://www.prisma.io/docs/concepts/components/prisma-migrate （同上）。
- NestJS deployment: https://docs.nestjs.com/deployment （同上）。
- 镜像/工具版本来自仓库契约：`node:20-alpine`、`pnpm@9.15.0`（`apps/api/Dockerfile:1`、`:5`）。
- Zeabur CLI 运行时审计版本为 `0.5.4`（`.tmp/runtime-zeabur-audit.md:104-110`）。本次没有重新访问外部文档或执行生产写操作。

## Related Specs

- `.trellis/spec/backend/legacy-api-v1.md:5-10`：冻结前端不可修改，compat 只做 transport 映射，canonical use case 保持业务 owner。
- `.trellis/spec/backend/legacy-api-v1.md:39-50`：legacy 开关、固定 site、raw response/error 和 scoped ID 规则。
- `.trellis/spec/architecture.md:12-20`：Domain / Use Case / Repository / Adapter / Controller 边界。
- `.trellis/spec/architecture.md:28-45`：现有平台资源、库存、订单等 source of truth；尚未定义用户 Zone。
- `.trellis/spec/backend/database-guidelines.md:21-31`：repository scope 必须含 site，并由认证上下文提供 tenant/user scope。
- `.trellis/spec/backend/database-guidelines.md:35-39`：schema 变更必须有 Prisma migration，禁止 runtime auto-migration/双读 fallback。
- `.trellis/spec/api-contract.md:30-37`：`/health` 与 `/ready` 的真实依赖语义。
- `.trellis/spec/testing-deployment.md:97-105`、`:122-131`：服务健康检查和生产 smoke gate。
- `.trellis/tasks/09-07-fix-frozen-frontend-resource-requests/research/site-isolation.md`：legacy 固定站点隔离缺口及推荐 gate。

## Caveats / Not Found

- `python ./.trellis/scripts/task.py current --source` 在本 researcher 子会话返回 `(none)`；输出目录来自父 agent 明确指定的 active task 路径，没有猜测其他任务目录。
- 冻结 bundle 是 minified 单行文件，因此多个独立行为都只能引用 `:1` 或 `:2`；`.tmp/frozen-scan-utf8.tsv` 和 `.tmp/api-call-snippets.txt` 提供了可检索的拆分证据。
- 没有找到 Zone 响应的正式 OpenAPI/schema、历史数据库 DDL、真实成功 response fixture，亦未证明 Zone `id` 必须是数字还是 UUID。实现不得仅根据表格宽度或 admin 的“用户 ID”数字输入推断 Zone ID 类型。
- 没有找到订单/代理写入 Zone 的 canonical relation。只新增 CRUD 表无法自动满足“归档后禁止新单”和“有依赖不能删除”；这部分是实现前必须补齐的 contract。
- `.tmp/frozen-contract-agent.md` 是 2026-09-07 的读取快照，其中记录过 notifications/tickets alias；当前工作树 `LEGACY_API_V1_ALIASES` 已为空。Zone 在两份证据中都未支持，但最终实现必须以部署提交的代码重新扫描。
- `.tmp/runtime-zeabur-audit.md` 证明当时的公开 HTTP 和 service 状态，不证明下一次 deployment 成功，也没有可引用的完整 build/runtime log。Zeabur deployment/list/build 查询曾返回 422，runtime log 为空，不能写成“日志无错误”（`.tmp/runtime-zeabur-audit.md:104-112`）。
- 最近一次 CLI 上传日志是 `context deadline exceeded`（`.tmp/zeabur-new-deploy.log:1-7`）；`.tmp/last-api-deploy-root.txt` 与 `.tmp/last-api-deploy-stage.txt` 只保存临时 staging 路径，不是部署成功证据。
- 未运行部署、迁移或带真实用户凭据的 Zone E2E；这些属于实现/验证代理职责。本研究没有修改业务代码、配置、数据库、Zeabur 资源或 Git。
