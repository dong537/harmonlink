# `/api/v1/zones` Source-of-Truth Audit

## 结论

当前 API 没有实现 `/api/v1/zones`，也没有可复用的用户 Zone 数据源。启用 legacy API 后该路径仍会因为没有匹配的 Nest route 返回 404；禁用时也没有走现有的 `legacy_api_disabled` typed error。不能把它 alias 到 `/api/resources`、`platform_resources.type = ZONE` 或 985Proxy 的 `credential.zoneId`，这些对象的 owner、生命周期和字段语义都不同。若要支持冻结页面，必须新增真实持久化模型及 canonical module/use cases；在此之前只能保留明确的 unsupported/blocked 行为，不能返回假数组或假成功。

## 现有 Route 与缺口

- `ApiV1CompatController` 只有 auth/profile/dedicated 路由，未声明 `zones` handler（`apps/api/src/modules/api-v1-compat/api-v1-compat.controller.ts:40-55` 及后续方法）。
- `ApiV1CompatModule` 只导入 auth、catalog、dedicated、users、wallet、orders、notifications、tickets，没有 Zone module/repository（`apps/api/src/modules/api-v1-compat/api-v1-compat.module.ts:15-28`）。
- legacy rewrite allowlist 为空，不能通过 URL rewrite 产生 Zone route（`apps/api/src/common/http/legacy-api-v1.ts:21-27`）。
- 全局前缀为 `/api`，因此兼容 controller 的 `@Controller('v1')` 对应 `/api/v1/*`；没有 controller 方法时 `/api/v1/zones` 不会命中现有 canonical `/resources` controller。
- 线上审计快照已记录 `GET /api/v1/zones -> 404`（`.tmp/runtime-zeabur-audit.md:57,69`）。

## 冻结客户端实际契约

冻结 bundle 的 Axios base URL 是 `/api/v1`，响应 interceptor 直接返回 `response.data`。`zone-BGlF3nZB.js` 定义了 6 个调用：

| Method | Path | 观察到的语义 |
| --- | --- | --- |
| GET | `/api/v1/zones?includeArchived=true` | 当前用户 Zone 列表；默认不带 query |
| POST | `/api/v1/zones` | body `{ code, name, description, sortOrder }` |
| PATCH | `/api/v1/zones/:id` | body `{ name, description, sortOrder }`；code 不可修改 |
| POST | `/api/v1/zones/:id/archive` | 归档，无 body |
| DELETE | `/api/v1/zones/:id` | 永久删除，无 body |
| GET | `/api/v1/admin/users/:id/zones` | admin 按用户只读查询 |

页面代码（`MyZones-BRW-Cbcj.js`、`Zones-BwVGbG8r.js`）固定了以下可观察行为：

- list/admin list 必须返回 raw array，而不是 canonical `PageResult` 或平台 envelope；每项至少有 `id`, `code`, `name`, `description`, `status`, `sortOrder`, `createdAt`。
- status 使用小写 `active` / `archived`。创建时 code 转小写，前端校验为 2-64 个字母/数字/`_`/`-`，排序为 `0..999`。
- 归档后不能用于新下单，但既有订单/代理保留且可见；永久删除只应在没有订单或代理依赖时允许，否则应提示归档。
- Zone 是“账号下按用户隔离的资源文件夹”，admin 页面只读，不在 admin surface 直接修改。

这些是从 minified bundle 提取的 transport/UI 证据，不是正式 OpenAPI；当前没有真实成功 response fixture，也没有证据证明 Zone `id` 应为数字还是 UUID。

## Candidate Source-of-Truth 排除

### `platform_resources` / `ResourceType.ZONE`

Prisma 确有 `ResourceType.ZONE`，但它是供应商库存地理树的一种节点（`packages/db/prisma/schema.prisma:624-681`）。`platform_resources` 强制包含 `siteId`, `providerCode`, `ipType`, `protocol`, `status`, `isVisible`, `isSaleable`，并关联库存、映射、价格和订单；唯一键是 `siteId + providerCode + upstreamAccountId + code + ipType`，没有 user owner。其 canonical HTTP interface 是 `/api/resources`：普通用户只能读 public/saleable 投影，创建要求 admin，响应为分页资源对象（`apps/api/src/modules/resources/resources.controller.ts:69-94,144-170`；`resources.repository.ts:192-237,465-500`）。它不能承载用户 Zone 的 CRUD、archive/delete 依赖或 raw-array 契约。

### 985Proxy `credential.zoneId`

`provider_accounts` 只保存加密 provider credential（`schema.prisma:602-621`）。985 adapter 从凭据中的可选 `zoneId`（或 `UPSTREAM_985PROXY_STATIC_ZONE`）构造上游库存/购买请求（`apps/api/src/modules/providers/adapters/nine-eight-five.adapter.ts:44-52,262-264`）。这是 provider account 的运维范围参数，不是用户可创建、归档或删除的 Zone 文件夹，不能作为 `/api/v1/zones` 的查询来源。

### 现有用户/订单/代理表

`users` 使用 UUID `id`，并以 `siteId + tenantId` 约束身份；没有 numeric legacy user id（`packages/db/prisma/schema.prisma:385-431`）。`orders` 和 `proxy_instances` 只有各自的 `userId`/`tenantId`，没有 Zone 外键或 zone code（`schema.prisma:882-908,946-970`）。因此不能把冻结 admin 页面里的数字输入直接转换为 UUID，也不能从订单/代理反推 Zone 归属。

## Production-safe 判定

当前不能安全实现完整 Zone API。生产实现至少需要：

1. 新增独立的 `user_zones`（或同等命名） Prisma model 和 additive migration，owner scope 至少为 `siteId + tenantId + userId`，并在该 scope 内唯一约束 code；状态、description、sortOrder 和 timestamps 由数据库持久化。
2. canonical repository/use cases 负责 code immutable、ACTIVE -> ARCHIVED、归档后的新单限制、依赖存在时拒绝删除；订单/代理写入路径必须真正记录 Zone 关联，才能证明 archive/delete 语义。仅增加 CRUD 表而不接入订单/代理仍不满足 contract。
3. `/api/v1/zones*` 只做 legacy DTO/status/raw-array 映射，并复用 `LEGACY_API_V1_ENABLED`、固定 `LEGACY_API_SITE_ID`、token site/tenant/user scope；admin lookup 必须后端解析 target user 并验证同站点/租户权限。
4. 用真实 PostgreSQL migration/integration tests 验证 scope、并发 code 唯一、归档过滤和依赖删除保护；没有真实用户凭据时，浏览器流程应标记 blocked，不能用 mock/内存映射/默认数组通过 smoke。

在上述 source of truth 和关联写入路径完成前，建议返回 typed `UNSUPPORTED_CAPABILITY`（或保留 404 disabled/未实现），而不是 alias 到资源库存或返回空列表。新增表后的 Zeabur 流量切换前还必须显式执行 Prisma migration；Dockerfile 不会自动迁移。

## 证据文件

- `.tmp/live-assets/zone-BGlF3nZB.js`：Zone 的 method/path/query。
- `.tmp/live-assets/MyZones-BRW-Cbcj.js`：用户 CRUD、字段校验、归档和删除提示。
- `.tmp/live-assets/Zones-BwVGbG8r.js`：admin 按用户只读列表。
- `.tmp/runtime-zeabur-audit.md`：现网 404 证据。
- `.trellis/tasks/09-07-fix-frozen-frontend-resource-requests/research/zones-and-deploy.md`：同任务的扩展部署审计；本文件聚焦 Source of Truth 与 route 缺口。

本次审计只读代码、schema、冻结 bundle 和既有运行时快照，没有修改生产代码、数据库、配置或部署资源。
