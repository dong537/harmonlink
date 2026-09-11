# 冻结 admin bundle 路由审查

## 范围与判定规则

本审查只读以下冻结产物和当前 API 代码，不修改 `apps/web/**`、冻结 bundle 或业务 controller：

- 请求清单：`.tmp/frozen-all-methods.tsv`、`.tmp/frozen-scan-utf8.tsv`。
- admin API 函数和页面：`.tmp/live-assets/admin-Nbz2zY6I.js`、`XuiNodes-zXDW2nwS.js`、`DedicatedOrders-aEFQHCdf.js`、`DedicatedPlans-DpTUygNT.js`、`DedicatedSkuV2-DhmdHMcy.js`、`Settings-DHlEMD3q.js`、`Users-SavIzOgP.js`、`Dashboard-C1Px7ChX.js`。
- 兼容层：`apps/api/src/modules/api-v1-compat/**`。
- canonical 模块：catalog、users、orders、payments、wallet、pricing、providers、dedicated-lines、tickets 及 Prisma schema。

扫描结果是 **88 条 admin 请求记录、72 个去参数后的唯一路径模式**。这里的“可支持”不是“路径名称相似”，而是同时满足 method、query/body、响应字段、权限/租户范围、错误语义和 Source of Truth。`LEGACY_API_V1_ALIASES` 为空，因此 `/api/admin/*` 不能自动成为 `/api/v1/admin/*`。

状态含义：

- **SUPPORTED**：已有 `/api/v1` adapter，且已经委托真实 use-case/repository；
- **PARTIAL**：存在可复用的 canonical 能力，但 frozen DTO、筛选或后续流程仍不完整，只能另写 adapter；
- **UNSUPPORTED**：没有可证明的等价 canonical 能力。应返回 typed `UNSUPPORTED_CAPABILITY`（或在冻结部署副本移除该调用），不得 alias、返回空成功或直接在 controller 写跨域数据。

## 当前已注册的兼容路径

| 冻结路径 | 当前兼容实现 | 备注 |
| --- | --- | --- |
| `GET /api/v1/admin/dedicated-orders` | `LegacyAdminDedicatedController` | 只投影 dedicated-line limits；不支持旧筛选时返回 501；最大 page size 100。 |
| `POST /api/v1/admin/dedicated-orders/:id/lock` | `LegacyAdminDedicatedController` | 先做 site/admin scope，再返回 `409 UNSUPPORTED_CAPABILITY`；没有伪造 lock。 |
| `GET/POST/PATCH /api/v1/admin/tickets*` | `LegacyCustomerResourcesController` | 将旧 `reply`/`close` 映射到 canonical message/status use-case，并映射持久化 numeric `legacyId`。 |
| `GET /api/v1/admin/users/:legacyUserId/zones` | `LegacyZonesController` | 通过 `users.legacyId` + site/tenant scope 解析目标用户，读取 `user_zones`。 |

其余冻结 admin 路径目前没有 `/api/v1` controller。缺失路由产生 404 并不代表能力存在；若请求仍会被发送，应补显式 typed unsupported，而不是 catch 后返回 `[]`。

## 路由能力矩阵

### 已支持

| 状态 | 冻结 method/path（路径模式） | canonical owner / 近似路由 | 当前 compat | 最小边界与限制 |
| --- | --- | --- | --- | --- |
| SUPPORTED | `GET /admin/tickets`<br>`GET /admin/tickets/:id`<br>`POST /admin/tickets/:id/reply`<br>`PATCH /admin/tickets/:id/close` | `GET /api/admin/tickets`、`GET /api/admin/tickets/:id`、`POST /api/admin/tickets/:id/messages`、`POST /api/admin/tickets/:id/status`；owner 是 `tickets`、`ticket_messages`、`notifications`。 | `/api/v1/admin/tickets*` | 不能做 URL alias：method/body 不同。adapter 负责 `reply -> messages`、`close -> status CLOSED`、小写 status 和 numeric `legacyId`，所有查找带 site/tenant scope。 |
| SUPPORTED | `GET /admin/users/:e/zones` | `ListZonesUseCase` + `user_zones`；没有可直接复用的 `/api/zones` transport。 | `/api/v1/admin/users/:legacyUserId/zones` | 只读 raw array；数字 ID 必须经过持久化 `users.legacyId` 解析，跨 site/tenant 返回 not found。 |

### 部分支持（不能宣称完整 frozen contract）

| 状态 | 冻结 method/path | canonical owner / 近似路由 | 当前 compat | 缺口与最小实现 |
| --- | --- | --- | --- | --- |
| PARTIAL | `GET /admin/dedicated-orders` | `ListDedicatedLineLimitsUseCase`、`GET /api/admin/control-plane/lines`；真实数据在 `dedicated_lines`、`dedicated_line_orders`、projections。 | `/api/v1/admin/dedicated-orders` | 仅返回 line/limits/projections 的简化 DTO；旧的 `skuCode/status/country/source/protocol/nodeId/userId/email/search/dateFrom/dateTo` 任一筛选会返回 501。详情、deployment、upstream 和 mutation 不由此 route 覆盖。 |
| PARTIAL | `GET /admin/dedicated-skus` | `GET /api/catalog/admin/skus`，Source of Truth 是 `service_skus`；定价另在 `GET /api/pricing/dedicated-skus`。 | 无 | 先用真实 frozen response fixture 对齐字段后再做只读 adapter。catalog DTO 只有 code/name/capabilities 等，不能直接假设等于旧 `productType/trafficGb/basePrice/protocols/status`。 |
| PARTIAL | `GET /admin/users`、`POST /admin/users` | `GET/POST /api/users`，Source of Truth 是 `users`、`wallets`、`audit_logs`。 | 无 | 可做 v1 adapter，但须转换分页 envelope、旧字段和 tenant scope；创建必须继续走 `CreateUserUseCase`，不能直接 Prisma create。 |
| PARTIAL | `POST /admin/users/:e/impersonate` | `POST /api/users/:id/impersonate`（`ImpersonateUserUseCase`，创建 hash-backed USER session 并审计）。 | 无 | 发起 impersonation 可适配；冻结随后调用的 `POST /auth/impersonate/redeem` 没有 canonical redeem controller，因此整条登录回流仍未闭环，不能标为完成。 |

### 不支持：专线订单、部署与 upstream

| 冻结 method/path | canonical 近似能力 | Source of Truth / 原因 |
| --- | --- | --- |
| `GET /admin/dedicated-orders/:e`<br>`GET /admin/dedicated-orders/:e/deployments`<br>`GET /admin/dedicated-orders/:e/rebind-candidates` | control-plane lines、migrations、projections 相关读取 | 旧详情要求 `proxyCode/orderNo/connectionUri/pricingSnapshot/xui_nodes/dedicated_entry_profiles/upstream` 等组合 DTO；canonical 表和 `/api/admin/control-plane/*` 不提供同一 read model。不能把 `dedicated_lines` 列表硬投影成完整订单详情。 |
| `POST /admin/dedicated-orders/:e/lock`<br>`POST /admin/dedicated-orders/:e/probe`<br>`POST /admin/dedicated-orders/:e/rebind`<br>`POST /admin/dedicated-orders/:e/rebind-manual`<br>`POST /admin/dedicated-orders/:e/refund`<br>`POST /admin/dedicated-orders/:e/switch-route` | 有 control-plane migration、health、以及普通 `/api/orders/:id/refund`，但都不是同一对象/状态机 | dedicated-line upstream lock、probe、rebind、route switch、refund 的 use-case/审计契约不存在。普通订单 refund 操作的是 `orders` + wallet ledger，不能套到 `dedicated_line_orders`。lock 已明确返回 409；其余应明确 501。 |
| `POST /admin/dedicated-orders/batch-probe`<br>`POST /admin/dedicated-orders/batch-rebind`<br>`POST /admin/dedicated-orders/batch-refund`<br>`POST /admin/dedicated-orders/batch-switch-route` | 无 batch dedicated-line admin use-case | batch 输入是旧 `proxyIds`/旧 route body，缺少 canonical 幂等、scope、部分失败和审计 contract；不得循环调用单条旧 endpoint 伪造实现。 |
| `POST /admin/dedicated-orders/deployments/:e/retry` | `external_jobs` 与 worker 记录存在，但没有 retry controller/use-case | retry 必须定义 job 类型、状态转换、重试上限、审计和 deployment DTO；直接更新 `external_jobs` 会绕开 worker invariants。 |
| `POST /admin/dedicated-orders/import-upstreams`<br>`POST /admin/dedicated-orders/sync-upstreams` | `POST /api/admin/delivery-routes/import`、provider inventory sync 是不同能力 | frozen body/响应面向旧 upstream/XUI；canonical import 维护 `delivery_route_imports`/`delivery_routes`，provider sync 维护库存快照，二者不能 URL alias。 |
| `POST /admin/dedicated-customer-profiles` | 无对应 model/use-case | 当前 schema 没有 dedicated customer profile owner；不能从 users、zones 或 line projections 猜测并写入。 |
| `GET /admin/xui-nodes/dedicated-proxies/:e/rebind-candidates`<br>`POST /admin/xui-nodes/dedicated-proxies/:e/rebind` | control-plane migration recommendations 是另一套状态机 | 旧接口以 XUI proxy/upstream 为对象，canonical 以 dedicated line/migration 为对象；ID、候选字段、审计和执行 side effect 均不等价。 |

### 不支持：SKU、方案与控制面旧资源

| 冻结 method/path | canonical 近似能力 | Source of Truth / 原因 |
| --- | --- | --- |
| `GET /admin/dedicated-plans`、`POST /admin/dedicated-plans`<br>`PATCH /admin/dedicated-plans/:e`、`DELETE /admin/dedicated-plans/:e` | `service_skus`、catalog/pricing 模块 | frozen `DedicatedPlans` 编辑 `productType/trafficGb/basePrice/protocols/sortOrder/status`，没有 dedicated-plans model 或写 use-case；不能把它误写成 pricing override。 |
| `POST /admin/dedicated-skus`、`PATCH /admin/dedicated-skus/:e` | `service_skus`、`pricing` | canonical 只有 SKU 读取和 pricing rule/override 写入；没有 SKU create/update controller。pricing route 不拥有 SKU metadata，禁止从 compat controller 直接 Prisma 写 `service_skus`。 |
| `GET/POST /admin/entry-profiles`、`POST /admin/entry-profiles/:e/check`<br>`GET/POST /admin/entry-device-groups`<br>`GET/POST /admin/delivery-profiles`<br>`GET/POST /admin/delivery-policy-bindings`<br>`GET/POST /admin/external-forward-rules`<br>`GET/POST /admin/relay-deployment-sets` | `node_groups`、`control_nodes`、`inbound_profiles`、`line_placement_policies`、`delivery_routes`、migration tables | 这些表是新 control-plane 的 node/inbound/placement/route 模型；冻结资源的 profile、device group、relay、forward rule DTO 和生命周期没有对应 owner/use-case。最近似的 `/api/admin/control-plane/references` 或 `/api/admin/delivery-routes/import` 不能冒充旧接口。 |

### 不支持：广播、配置、统计和 referral

| 冻结 method/path | canonical 近似能力 | Source of Truth / 原因 |
| --- | --- | --- |
| `POST /admin/notifications/broadcast/preview`<br>`POST /admin/notifications/broadcast` | `notifications` 表和 `NotificationsRepository.createForUser` 仅支持单用户领域事件 | frozen target 支持 all/user IDs/role/balance、渠道和 preview count；没有 recipient query、broadcast job、email/Telegram adapter、幂等或审计 use-case。不能用 `createForUser` 循环伪装广播。 |
| `GET /admin/settings`<br>`PUT /admin/settings/:e` | `system_settings` (`siteId + key`) 只有持久化表，没有 admin settings controller | frozen 页面混合 Crisp、Bark、feature flags、SMTP、985 credential 等敏感配置；缺少 key allowlist、secret redaction、owner、审计和更新 use-case。不能把 `/settings/capabilities` 或任意 ConfigService 值当成旧 settings DTO。 |
| `GET/PUT /admin/provider-routing` | `/api/providers`、`/api/tenants/:tenantId/provider-accounts` | frozen body 是启用开关、provider 优先级和区域规则；canonical provider account CRUD 不包含 routing policy，语义、权限和持久化 owner 不同。 |
| `GET/PUT /admin/payment-config` | `/api/payments`、`payment_orders` | frozen body 包含网关 PID/私钥/公钥/回调 URL；canonical payment order 只管订单和确认，schema 没有该 gateway config owner。不得返回或写入未定义的 secret 配置。 |
| `GET /admin/statistics`<br>`GET /admin/pending-items`<br>`GET /admin/recent-orders?limit=...`<br>`GET /admin/revenue-trend?days=...` | `users`、`orders`、`payment_orders`、`proxy_instances`、`audit_logs` 等原始表 | 没有 canonical admin dashboard aggregate/read model。`/api/orders` 或 `/api/payments` 的列表不能直接充当统计、待办、最近订单或趋势响应；指标定义、时区、状态过滤和权限尚未契约化。 |
| `GET /admin/referral/withdrawals`<br>`PATCH /admin/referral/withdrawals/:e` | 无 referral/withdrawal model、repository 或 use-case | 当前 Prisma schema 没有 referral balance、withdrawal state、payout audit 的 Source of Truth；返回空数组会把“无能力”伪装成“无数据”。 |

### 不支持：用户附属管理与 XUI 节点

| 冻结 method/path | canonical 近似能力 | Source of Truth / 原因 |
| --- | --- | --- |
| `DELETE /admin/users/:e`<br>`PUT /admin/users/:e/status`<br>`PUT /admin/users/:e/role`<br>`PATCH /admin/users/:e/credentials` | `users`、`admin_users`、`auth` | 只有用户 list/create 和 admin impersonate use-case；没有删除、状态/角色变更、管理员代改密码的审计化 use-case。`POST /auth/change-password` 是自助接口，不能 alias。 |
| `GET/DELETE /admin/users/:e/api-key`<br>`POST /admin/users/:e/api-key/regenerate` | `GET/POST/DELETE /api/api-keys` | canonical API key 按当前 owner/session 管理，旧接口按目标用户管理；method、target scope、响应（尤其 secret 只出现一次）不一致。需先定义 admin API-key use-case，禁止返回 hash/secret。 |
| `GET/PUT /admin/users/:e/dedicated-prefs`<br>`GET /admin/users/:e/ips`<br>`GET /admin/users/:e/referral`<br>`PATCH /admin/users/:e/commission-rate` | `dedicated_lines`、`proxies`、pricing tables 仅是近似数据 | 没有 dedicated preference、用户 IP pool、referral profile 或 commission owner；旧 DTO 不能由多个表拼成可写/可审计资源。 |
| `POST /admin/users/:e/add-balance`<br>`POST /admin/users/:e/deduct-balance`<br>`POST /admin/users/:e/gift-balance`<br>`POST /admin/users/:e/set-balance` | `POST /api/wallet/:userId/adjust` | generic wallet adjust 要求 direction/reason/currency/idempotency 等 canonical contract；四个旧动作的 gift/set/deduct 语义、审计和幂等不同，不能直接 alias 或在 controller 计算余额。 |
| `GET/POST /admin/xui-nodes`<br>`PATCH/DELETE /admin/xui-nodes/:e`<br>`GET /admin/xui-nodes/:e/inbounds`<br>`GET /admin/xui-nodes/:e/mappings`<br>`GET /admin/xui-nodes/:e/stats`<br>`POST /admin/xui-nodes/:e/test-connection`<br>`POST /admin/xui-nodes/bulk-import` | `GET/POST/PUT /api/admin/control-plane/nodes`、`/references` | frozen XUI node 需要 panel `baseUrl/username/password`、entryGroups、inbound ID/tag/port、XUI capabilities/mapping/stats；`control_nodes` 只存加密 `apiToken`、capacity、node group、health。两者不是同一 model，不能投影或 URL alias。 |
| `PATCH /admin/proxies/:e/limit` | `PUT /api/admin/control-plane/lines/:id/limits`（仅 dedicated line） | frozen `proxyId + limit` 可能指旧 static proxy；canonical line limits 作用于 `dedicated_lines`，ID、单位、权限和响应不同。需要先确认对象和单位，再建 adapter/use-case。 |

## 完整覆盖计数

以下分组来自 `.tmp/frozen-all-methods.tsv` 的去参数路径归并；计数相加为 72，避免因同一路径的多个 method 被重复或遗漏：

| 分组 | 唯一路径数 | 请求记录数 | 矩阵位置 |
| --- | ---: | ---: | --- |
| `dedicated-customer-profiles` | 1 | 1 | 专线订单表 |
| `dedicated-orders` | 17 | 17 | 专线订单表 |
| `dedicated-plans` | 2 | 4 | SKU/方案表 |
| `dedicated-skus` | 2 | 3 | 部分支持 + SKU/方案表 |
| `delivery-policy-bindings` | 1 | 2 | 控制面旧资源表 |
| `delivery-profiles` | 1 | 2 | 控制面旧资源表 |
| `entry-device-groups` | 1 | 2 | 控制面旧资源表 |
| `entry-profiles` | 2 | 3 | 控制面旧资源表 |
| `external-forward-rules` | 1 | 2 | 控制面旧资源表 |
| `notifications` | 2 | 2 | 广播表 |
| `payment-config` | 1 | 2 | 配置表 |
| `pending-items` | 1 | 1 | 统计表 |
| `provider-routing` | 1 | 2 | 配置表 |
| `proxies` | 1 | 1 | 用户附属表 |
| `recent-orders` | 1 | 1 | 统计表 |
| `referral` | 2 | 2 | referral 表 |
| `relay-deployment-sets` | 1 | 2 | 控制面旧资源表 |
| `revenue-trend` | 1 | 1 | 统计表 |
| `settings` | 2 | 2 | 配置表 |
| `statistics` | 1 | 1 | 统计表 |
| `tickets` | 4 | 4 | 已支持表 |
| `users` | 17 | 20 | 部分支持 + 用户附属表 |
| `xui-nodes` | 9 | 11 | XUI 节点表 |
| **合计** | **72** | **88** | |

另有一个不属于 `/admin/*` 计数、但由 admin bundle 调用的相关路径：`POST /auth/impersonate/redeem`。它没有 canonical redeem controller；即使补齐 impersonate 发起 adapter，也不能把该回调视为已支持。

## 后续实现边界与验证

1. 先冻结每个旧 DTO 的真实 fixture（含 method、query/body、空/错误状态），再为 PARTIAL 项建立独立 v1 adapter；不要把本矩阵中的“近似路由”直接改成 alias。
2. 对 UNSUPPORTED 项，若冻结部署副本仍会发送请求，优先返回带 `reasonKey` 的 `501 UNSUPPORTED_CAPABILITY`；若产品决定移除该页面/调用，则记录删除范围和验证证据。两者都不能返回 fake empty success。
3. 新能力必须先有 domain/use-case/repository 和审计/权限契约，再接 compat controller。尤其是 wallet、provider、gateway secret、XUI credential、deployment retry 和广播，不得在 controller 直接 Prisma 写表。
4. 验证至少包括：`LEGACY_API_V1_ENABLED`/`LEGACY_API_SITE_ID` gate、site/tenant scope、raw `/api/v1` response（无 canonical envelope）、method/body/response 对齐、真实 PostgreSQL integration、错误不被 catch 成空列表，以及 frozen bundle 的 72 路径静态扫描。

## 证据与残余风险

- canonical route 与权限证据：`apps/api/src/modules/catalog/catalog.controller.ts`、`users/users.controller.ts`、`orders/orders.controller.ts`、`payments/payments.controller.ts`、`wallet/wallet.controller.ts`、`providers/providers.controller.ts`、`dedicated-lines/dedicated-line-control-plane.admin.controller.ts`、`tickets/admin-tickets.controller.ts`。
- Source of Truth 证据：`packages/db/prisma/schema.prisma` 中 `service_skus`、`users`、`wallets`、`payment_orders`、`system_settings`、`provider_accounts`、`node_groups`、`control_nodes`、`inbound_profiles`、`line_placement_policies`、`dedicated_line_orders`、`dedicated_lines`、`delivery_routes`、`tickets`、`notifications`、`external_jobs`。
- 冻结请求函数、body 和页面字段来自 `.tmp/live-assets/admin-Nbz2zY6I.js` 及其 lazy chunks；minified bundle 不是 OpenAPI，字段仍需在 adapter 测试中锁定。
- 本文没有验证真实 admin credential 下的浏览器流程，也没有宣称 provider/worker fulfillment、XUI panel 或 referral 能力可用；这些仍是 blocked/unsupported，不能用 smoke 里的 401/404 推断为实现完成。
