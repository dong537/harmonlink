# Research: 冻结前端 API 契约缺口

- Query: 审计冻结 Vue 前端对 `GET /api/v1/settings`、`GET /api/v1/dashboard/overview`、`GET /api/v1/zones`、`GET /api/v1/proxy/static/inventory`、`GET /api/v1/orders` 与 `GET /api/v1/tickets` 的真实契约，判定 404/401 根因，并划定可安全实现的 backend compatibility 边界。
- Scope: mixed（仓库代码、冻结制品、既有生产 smoke 证据；未使用生产凭据发起认证请求）
- Date: 2026-09-08

## Findings

### 结论

1. `settings`、`dashboard/overview`、`zones`、`proxy/static/inventory` 的 404 根因是当前 API 没有对应的 Nest route/module；不是 Web 同源代理改写错误。现有 rewrite allowlist 为空，也不能转换 DTO 或响应形状（`apps/api/src/common/http/legacy-api-v1.ts:21-27,45-64`）。
2. `orders` 与 `tickets` 已有显式 `/api/v1` compatibility handlers，并分别受 `@RequireAuth()`、`@RequireUser()` 保护。无凭据返回 401 是预期鉴权结果，不能据此判为缺路由或代理故障（`apps/api/src/modules/api-v1-compat/legacy-customer-resources.controller.ts:62-90,189-243`）。
3. 冻结 shared Axios 固定 `baseURL=/api/v1`、自动附加 bearer token、成功时直接返回 `response.data`（`.tmp/live-assets/index-D-BZDcpl.js:2`）。所以 compatibility route 必须保持冻结 method/query/body 和 raw JSON；不能直接套现代 `{code,msg,data,requestId}` envelope。后端当前也专门对 `/api/v1` 跳过通用成功 envelope（`apps/api/src/common/interceptors/envelope.interceptor.ts:6-18`）。
4. `settings` 可以在明确配置 owner 与公开范围后做一个很窄的只读 adapter；`dashboard` 可以在冻结统计语义确定后基于 canonical repositories 做聚合。这两项不需要新业务副本，但不能 alias 到相似端点。
5. `zones` 缺少独立的用户域实体和订单/代理依赖关系；完整支持需要 Prisma model、migration、scoped repository/use cases，以及真实 PostgreSQL 测试。它不能复用供应商资源树的 `ResourceType.ZONE`。
6. 静态住宅库存已有可复用的 provider/resource/inventory 基础设施，但缺少冻结页面所需的 customer-facing use case 和 DTO 投影。只有真实、fresh、可售库存才能生成 `{countries}`；上游失败或陈旧库存必须显式失败，不能返回空数组、默认国家或假 stock。

### 证据文件

- `.tmp/live-assets/index-D-BZDcpl.js:2`：冻结 shared Axios、`/settings` 与 `/settings/capabilities` 函数、feature capability store。
- `.tmp/live-assets/AppLayout-CpOK0MTi.js:1`：`GET /settings` 的实际消费者；读取 Crisp 配置。
- `.tmp/live-assets/dashboard-CdinzY58.js:1`：dashboard API method/path。
- `.tmp/live-assets/Index-CpL-jM71.js:1`：用户 dashboard 对 overview response 的字段消费。
- `.tmp/live-assets/zone-BGlF3nZB.js:1`、`MyZones-BRW-Cbcj.js:1`、`Zones-BwVGbG8r.js:1`：Zone transport、用户 CRUD 与 admin 只读页面。
- `.tmp/live-assets/proxy-DoXRfSRe.js:1`、`StaticBuy-CtrJSgs0.js:1`：静态库存 query、response 字段及购买页投影。
- `.tmp/live-assets/order-BrtA_D_B.js:1`、`ticket-QcOp_NDZ.js:1`：冻结订单/工单 method、path 与 mutation body。
- `apps/api/src/modules/api-v1-compat/api-v1-compat.controller.ts:40-67`：当前 v1 controller 只在 settings 域暴露 `/settings/capabilities`。
- `apps/api/src/modules/api-v1-compat/legacy-customer-resources.controller.ts:40-120,189-287,371-451`：现有 orders/tickets adapter、权限、分页和 legacy DTO 映射。
- `apps/api/src/modules/api-v1-compat/api-v1-compat.module.ts:15-28`：compat module 的实际依赖；无 Zone/dashboard/static-inventory module。
- `apps/web/serve.mjs:42-49,92-94,154-182,198-203`：Web 同源 `/api/*` 代理与 upstream 状态透传。
- `apps/api/src/modules/resources/resources.controller.ts:69-94,144-170,205-260`：canonical resource/inventory API 与 freshness error。
- `apps/api/src/modules/openapi/res-static.controller.ts:50-95,315-321`：外部 985-compatible `POST /res_static/inventory`，契约并非冻结 GET DTO。
- `apps/api/src/modules/providers/adapters/nine-eight-five.adapter.ts:115-205`、`upstream-api.adapter.ts:191-205,442-546`：真实上游 inventory adapter 与归一化逻辑。
- `packages/db/prisma/schema.prisma:624-709,882-970,1037-1067`：平台资源、库存、订单、代理与 ticket identity 的持久化模型。
- `.trellis/tasks/09-07-fix-frozen-frontend-resource-requests/research/production-smoke-20260908.md:20-32`：已保存的健康、capability、无凭据 401 与 provider 状态证据。
- `.trellis/tasks/09-07-fix-frozen-frontend-resource-requests/research/zones-source-audit.md`、`zones-and-deploy.md`：Zone source-of-truth 与部署路径的专项审计。

### 冻结 transport 契约

- Axios 实例的 `baseURL` 是 `/api/v1`，timeout 为 360 秒，请求默认 JSON。
- 有 access token 时请求拦截器附加 `Authorization: Bearer <token>`。
- 成功响应直接解析为 HTTP body；冻结调用方不会再自动读取现代 envelope 的 `.data`。
- 401 会触发 refresh 流程；refresh URL 是 `/api/v1/auth/refresh`。因此生产中的 401 还可能表示 token 缺失、过期、refresh 失败或 session scope 不合法，不等同于 route missing。
- 当前 compatibility controllers 使用 `@Controller('v1')`；全局 `/api` prefix 由 bootstrap 配置，所以实际地址是 `/api/v1/*`（`apps/api/src/main.ts:15-39`）。

### 端点矩阵

| 冻结请求 | 冻结输入/消费 | 当前后端 | 判定 |
| --- | --- | --- | --- |
| `GET /api/v1/settings` | 无显式 query；消费者读取 `crispEnabled`, `crispWebsiteId` | 只有 `GET settings/capabilities` | route missing；与 capabilities 不同 |
| `GET /api/v1/dashboard/overview` | 消费 `proxies.dc`, `proxies.residential`, `proxies.mobile`, `proxies.total` | 无 dashboard v1 handler | route + 聚合 contract 缺失 |
| `GET /api/v1/zones` | query `includeArchived=true` 可选；raw array | 无 handler、model、repository | route + source-of-truth 缺失 |
| `GET /api/v1/proxy/static/inventory` | query `ipType`, `duration`, `businessScenario?`；消费 `{countries}` | 无 `/proxy/static/*` v1 handler | route + customer inventory projection 缺失 |
| `GET /api/v1/orders` | query object；消费 legacy paginated order DTO | 已有显式 handler 与 adapter | 无凭据 401 正常；认证契约需实测 |
| `GET /api/v1/tickets` | query object；消费 legacy page 和 numeric ticket IDs | 已有显式 handler、numeric-ID resolver | 无凭据 401 正常；认证 round-trip 需实测 |

### `GET /api/v1/settings`

冻结入口定义两个独立函数：`GET /settings` 与 `GET /settings/capabilities`（`.tmp/live-assets/index-D-BZDcpl.js:2`）。后者用于 feature flags；前者在登录后的 `AppLayout` 中初始化客服组件，读取：

```text
crispEnabled
crispWebsiteId
```

当前 `ApiV1CompatController` 仅声明 `@Get('settings/capabilities')` 并返回 capability flags（`apps/api/src/modules/api-v1-compat/api-v1-compat.controller.ts:63-67`），不能拿该响应冒充 `/settings`。仓库审计未发现一个已定义的 canonical public settings DTO/owner，可安全的最小边界是：

- 先决定这两个值由环境配置、site 配置还是 tenant brand 配置拥有，以及 route 是否公开；冻结调用发生在 authenticated layout，但这不能单独证明权限 contract。
- 新增只读 settings use case/adapter，只投影冻结客户端实际需要的字段；不得返回 secret 或整个配置对象。
- 配置缺失时返回明确的关闭状态需要成为有意契约，而不是 broad catch/default 掩盖配置错误。

### `GET /api/v1/dashboard/overview`

冻结 API module 使用无 query 的 `GET /dashboard/overview`（`.tmp/live-assets/dashboard-CdinzY58.js:1`）。页面把响应直接赋给 overview state，并读取：

```json
{
  "proxies": {
    "dc": 0,
    "residential": 0,
    "mobile": 0,
    "total": 0
  }
}
```

余额来自 auth/user store，不是该 response。当前 API v1 controllers 没有 dashboard handler；canonical `orders` 或 `/api/resources` 分别代表交易记录和供应商可售资源，均不是“当前用户代理持有量”，不能直接 alias。

最小正确边界应是一个 authenticated dashboard query use case，通过当前用户的 `siteId + tenantId + userId` scope 聚合 canonical proxy/dedicated-line repositories，再由 v1 adapter 输出上面 raw shape。实现前仍需产品/领域确认：`dc` 是否包含 dedicated line、各类别统计 active 还是全部实例、`total` 是否等于三个字段之和，以及过期/释放中记录如何处理。未确认时不能用零值兜底伪装成功。

### `/api/v1/zones*`

冻结 API surface 不止一个 GET（`.tmp/live-assets/zone-BGlF3nZB.js:1`）：

| Method | Path | Body/query |
| --- | --- | --- |
| `GET` | `/zones` | `includeArchived=true` 可选 |
| `POST` | `/zones` | `{code,name,description,sortOrder}` |
| `PATCH` | `/zones/:id` | `{name,description,sortOrder}`；code 不可改 |
| `POST` | `/zones/:id/archive` | 无 body |
| `DELETE` | `/zones/:id` | 无 body |
| `GET` | `/admin/users/:id/zones` | admin 按用户只读 |

用户/admin 页面直接期待 raw array，item 至少包含 `id`, `code`, `name`, `description`, `status`, `sortOrder`, `createdAt`；状态为小写 `active|archived`。code 在创建时转小写，页面约束为 2-64 个字母、数字、下划线或连字符；`sortOrder` 为 0..999。归档后应禁止新订单但保留既有订单/代理；只有没有依赖时才可永久删除。

当前 Prisma 的 `platform_resources.type=ZONE` 是供应商库存地理树：它按 site/provider/account/code/ipType 唯一，携带 provider、协议、库存和可售状态，没有 user owner（`packages/db/prisma/schema.prisma:624-681`）。985 provider credential 的 `zoneId` 是上游账号/供应链参数，也不是用户文件夹。两者都不能承载上述 CRUD 生命周期。

完整实现需要产品/数据模型决策并落到独立 deep module：

- `user_zones`（或等价）模型，owner scope 至少是 `siteId + tenantId + userId`，code 在 scope 内唯一。
- repository/use cases 负责 immutable code、`ACTIVE -> ARCHIVED`、排序、并发唯一冲突与权限。
- 订单和代理真正持久化 Zone relation；否则“归档禁止新单”和“有依赖禁止删除”无法成立。
- v1 controller 只做 frozen query/body/status/raw-array mapping，并执行 legacy enablement、fixed-site、tenant/user/admin scope。
- admin numeric user ID 尚无可证明的映射 contract；不得把数字强转 UUID。需要持久 legacy user identity 或明确修改 admin lookup contract。

在上述 source of truth 完成前，只能保持明确 unsupported/blocked；返回 `[]` 或把 `/api/resources` 伪装为 Zone 都是错误实现。

### `GET /api/v1/proxy/static/inventory`

冻结 API 调用（`.tmp/live-assets/proxy-DoXRfSRe.js:1`）：

```text
GET /api/v1/proxy/static/inventory
query: { ipType = "shared", duration = 30, businessScenario? }
```

购买页要求 raw response 至少为：

```text
{ countries: [{ countryCode, countryName, continent, stock, cities?: [{ cityName, stock }] }] }
```

页面用 country/city stock 生成 `available` 和购买数量，再请求价格 breakdown（`.tmp/live-assets/StaticBuy-CtrJSgs0.js:1`）。因此库存失败不能被转换成空国家列表或静态默认库存。

现有相关接口均不等价：

- `POST /res_static/inventory` 是 provider/open API，使用 985 envelope 与请求 body（`apps/api/src/modules/openapi/res-static.controller.ts:50-95`）。
- `/api/resources` 返回 canonical 分页资源 DTO，并非 `{countries}`（`apps/api/src/modules/resources/resources.controller.ts:69-170`）。
- provider adapters 会真实访问 `/res_static/inventory` 并持久化归一化库存，但这是供应商 seam，不是用户 legacy route（`apps/api/src/modules/providers/adapters/nine-eight-five.adapter.ts:115-205`）。

可安全实现的边界是新增 customer static-inventory query use case：按 fixed site、tenant/customer、saleability、`ipType`、duration/scenario 规则读取 canonical resources 与最新 inventory snapshots，拒绝 stale/missing snapshot，再由 v1 adapter 按国家/城市聚合 frozen DTO。还需明确：shared/premium 到 canonical `IpType`/SKU 的映射、城市粒度来源、stock 聚合防重复、freshness TTL、业务场景过滤和 feature gate。生产证据显示 residential capability 当前禁用，且一个 provider 曾返回 upstream 401；在真实库存与购买链路通过前应返回 typed unsupported/upstream error，而不是启用页面或制造数据。

### `GET /api/v1/orders` 与 `GET /api/v1/tickets` 的 401

这些路径已注册，不属于本组 404：

- orders handler 对 query 做 pagination/search/status 转换，根据 user/tenant admin/platform admin 调用 scoped `OrdersRepository`，再映射 legacy page/DTO（`legacy-customer-resources.controller.ts:62-113,330-345,371-394`）。
- tickets list/detail/create/reply/close 都是显式 handler，customer route 使用 `@RequireUser()`；body 分别接收 `{subject,content}`、`{content}`（`legacy-customer-resources.controller.ts:189-243`）。
- ticket response 在 compatibility boundary 把 persisted `legacyId` 映射为数字并输出小写 legacy status（`legacy-customer-resources.controller.ts:415-451`）。
- numeric ID lookup 同时限制 user/site/tenant；admin lookup限制 site/tenant，越界返回 not found（`apps/api/src/modules/tickets/tickets.repository.ts:91-115,185-228`）。

因此：

- 无 `Authorization`、过期 token 或 refresh 失败 -> 401 是正确结果。
- route missing -> 通常是 404，而 Web proxy 会原样保留 upstream status。
- 已存在 handler 不等于冻结流程已完全证明；仍需用真实 test user token 验证分页字段、status/search query、order DTO，以及 ticket 创建后 numeric ID 的 list/detail/reply/close round-trip。
- 不得生成生产用户/凭据来完成 smoke；无授权 credential 时把 authenticated browser smoke 标记 blocked。

### Web 代理与部署漂移判定

`apps/web/serve.mjs` 对所有 `/api`/`/api/*` 请求调用 `proxyApi`，保留 URL query、method、body 与请求 headers，并把 upstream status/response body 直接回传；只有 target 缺失或连接错误才生成 502（`apps/web/serve.mjs:42-49,92-94,154-182`）。因此它不会把 API 的 401 改成 404，也不会凭空补出缺失 controller。

已保存的 production smoke 证明同源 `/api/v1/health` 和 `/settings/capabilities` 可达、无凭据 auth route 返回 typed 401，说明基础代理链路成立。若线上结果与本地 route map 不同，下一步应核对 active deployment ID/image digest 与 route map；只有出现 Web/API 版本漂移、错误 target 或 upstream 不可达证据时，才应把问题归为部署/代理，而不是先改 rewrite。

### 推荐实现顺序

1. 先为四个缺失路径写 route-map/contract RED tests，固定 raw `/api/v1` response、feature flag、disabled API、fixed-site mismatch 和 unauthenticated behavior。
2. `settings`：确认配置 owner/publicity 后，实现只读 use case + frozen adapter。这是最窄、风险最低的真实实现。
3. `dashboard`：确认四项统计定义后，实现 scoped aggregate use case；不要在 controller 中跨表临时拼装。
4. `static inventory`：在 residential feature 继续禁用的前提下先提供 typed unsupported contract；待真实 resource/SKU/freshness/buy path 确认后实现 query projection。
5. `zones`：作为独立数据模型任务处理，先完成模型、依赖关系、迁移和 canonical use cases，再暴露 compatibility endpoints。
6. 对已有 orders/tickets 不做 URL alias；补 authenticated integration/browser evidence，发现字段差异时只在 v1 adapter 修复。

### 验证矩阵

| 层级 | 必须验证 |
| --- | --- |
| Route/unit | 四个缺失 GET 的 method/path；raw response；legacy disabled；fixed-site mismatch；settings 与 capabilities 不混用 |
| Auth | orders/tickets 无凭据为 typed 401；foreign-site token 在 repository 前拒绝；customer/admin owner type 与 tenant scope |
| Settings | 只返回 allowlisted Crisp 字段；配置来源与公开范围；不泄露 server secret |
| Dashboard | 四类统计 fixture、active/expired/released 边界、`total` invariant、跨用户/租户/站点隔离 |
| Zone unit | validation、code immutable、includeArchived、archive transition、依赖删除冲突、legacy raw DTO |
| Zone PostgreSQL integration | migration、scope 唯一、并发重复、真实 order/proxy dependency、customer/admin 权限；禁止 memory mock DB |
| Inventory unit/integration | ipType/duration/scenario mapping、country/city grouping、fresh snapshot、stale/missing/provider failure、无 empty/default fallback |
| Orders/tickets PostgreSQL | authenticated pagination/filter；ticket numeric ID create/list/detail/reply/close/admin round-trip 与跨 scope 404 |
| Same-origin proxy | method/query/body/Authorization 保留；401/404/upstream status 保留；连接失败才为 502 |
| Browser/deploy | frozen asset hash/graph不变；capability 隐藏禁用 residential；有授权 token 才执行 customer flow；否则明确 blocked |

### Related Specs

- `.trellis/spec/backend/legacy-api-v1.md`：冻结 `/api/v1` raw contract、feature gate、fixed-site、numeric legacy IDs 与 deployment checks。
- `.trellis/spec/api-contract.md`：canonical envelope、`/res_static` 外部 contract、inventory freshness 与 typed errors。
- `.trellis/spec/architecture.md`：controller/use case/repository/adapter 边界及 PostgreSQL source of truth。
- `.trellis/spec/security-permissions.md`：site/tenant/user 权限隔离。
- `.trellis/spec/testing-deployment.md`、`.trellis/spec/backend/quality-guidelines.md`：真实 PostgreSQL、无 fake fallback、provider/inventory 验证门。
- `.trellis/spec/frontend-ui-ux.md`：冻结前端和用户状态/错误不可伪装为空数据的约束。

### External References

本次未依赖外部 API 文档或网络搜索。上游行为只引用仓库内 provider adapter、Trellis spec 与已保存的 2026-09-08 production smoke；因此没有把第三方未验证字段当作 contract。

## Caveats / Not Found

- `python ./.trellis/scripts/task.py current --source` 返回 `Current task: (none)`；本研究按上级明确指定路径写入 `.trellis/tasks/09-07-fix-frozen-frontend-resource-requests/research/`，没有猜测或创建其他 task。
- 冻结 JS 是 minified bundle，多数证据位于单行 `:1` 或 shared entry `:2`；字段名和调用点可靠，但不是正式 OpenAPI，也不能证明所有 lazy route 都在生产中执行。
- 没有找到 `/settings` 的 canonical DTO/owner，也没有真实成功响应 fixture；除 `crispEnabled`/`crispWebsiteId` 外不应推测更多字段。
- 没有找到 dashboard 四种 proxy count 的正式领域定义；尤其 `dc` 与 dedicated-line 的关系、状态过滤需要产品/领域确认。
- 没有找到用户 Zone model、订单/代理 Zone relation，或冻结 admin numeric user ID 到 canonical UUID 的稳定映射。
- 没有使用或伪造生产 customer credential，所以 orders/tickets 的 authenticated browser contract 仍需后续真实凭据验证。
- `apps/web/src` 是另一套 React/Ant Design 源码，主要使用现代 `/api/*` contract；它不是冻结 Vue bundle 的契约证据，也不应为本修复重新编译替换冻结制品。
- 本次仅写研究文档；未修改业务代码、Prisma schema、`apps/web/**`、冻结资产、配置或部署。
