# 冻结 Admin Bundle 当前 API 契约审计

## 范围与结论

本文是对当前工作树的只读审计。审计对象是冻结五月版 admin bundle 的请求清单、lazy chunk 的实际请求/字段消费，以及 `apps/api/src/modules/api-v1-compat` 的当前 Nest 路由和实现。本文没有修改 `apps/web/**`、冻结 bundle、Prisma schema 或业务 controller；工作树中其他 Agent 的改动也未回退。

核心结论（以下状态均假设：请求已通过 `RequireAuth`，调用者是 `PLATFORM_ADMIN` 或有 tenant context 的 `TENANT_ADMIN`，`LEGACY_API_V1_ENABLED=true`，且 `LEGACY_API_SITE_ID` 已配置并与会话站点一致）：

- `.tmp/frozen-all-methods.tsv` 中有 **88 条 `/admin/*` 请求记录、72 个去参数后的唯一路径模式**。当前反射审计结果为 **88/88 exact method/path matches，0 missing**。这证明 Nest metadata 已覆盖冻结清单；还不能替代一次真实 Fastify registration/runtime smoke。
- 有真实 handler 的路径只有：`GET /admin/dedicated-orders`（无旧筛选时）、`GET /admin/dedicated-skus`（返回的是较窄的 catalog 投影）、`GET/POST /admin/users`、四个 admin ticket 路由，以及 `GET /admin/users/:legacyUserId/zones`。其中专线列表和 SKU 列表的 HTTP 200 不等于冻结页面的完整 DTO 已满足。另有 canonical `GET /api/admin/dedicated-line-orders` 管理读模型；它不是冻结客户端调用的 `/api/v1/admin/dedicated-orders` 兼容路由，不能互相替代。
- `POST /admin/dedicated-orders/:id/lock` 已注册，但明确返回 `409 UNSUPPORTED_CAPABILITY`（`legacy_dedicated_order_lock_unavailable`），不是 200、404 或 501。
- 其余冻结 admin 路径均有显式兼容 handler，并在有效 admin/site scope 下返回 typed `501 UNSUPPORTED_CAPABILITY`。当前不存在“因 controller 未注册而必然 404”的冻结 admin 路径。
- 对已注册路径，`404` 的主要兼容语义是 gate 关闭：`LEGACY_API_V1_ENABLED` 不是精确字符串 `true` 时返回 `legacy_api_disabled`。未认证请求会先被 `RequireAuth` 拦截为 401；站点、角色或 tenant scope 不符时为 403。

## 证据与方法

### 冻结产物

请求清单按 UTF-16LE 读取，另以 UTF-8 扫描结果交叉核对：

- `.tmp/frozen-all-methods.tsv`、`.tmp/frozen-scan-utf8.tsv`
- `.tmp/live-assets/admin-Nbz2zY6I.js`（admin API 函数定义）
- `.tmp/live-assets/Dashboard-C1Px7ChX.js`、`dashboard-CdinzY58.js`
- `.tmp/live-assets/DedicatedOrders-aEFQHCdf.js`
- `.tmp/live-assets/DedicatedPlans-DpTUygNT.js`、`DedicatedSkuV2-DhmdHMcy.js`
- `.tmp/live-assets/Users-SavIzOgP.js`
- `.tmp/live-assets/XuiNodes-zXDW2nwS.js`
- `.tmp/live-assets/Notifications-CoZEtO_m.js`
- `.tmp/live-assets/Settings-DHlEMD3q.js`
- `.tmp/live-assets/ticket-QcOp_NDZ.js`、`zone-BGlF3nZB.js`、`Zones-BwVGbG8r.js`

为便于复核，核心冻结文件当前 SHA-256 为：

| 文件 | SHA-256（当前工作树） |
| --- | --- |
| `admin-Nbz2zY6I.js` | `6D4B382F2D6F4DB9A7EF45AB58613B024101ED5ED56C9C6A7DC5332870648981` |
| `DedicatedOrders-aEFQHCdf.js` | `94B0A84B1B4063D067D607F3CEB6BAC3FB250D5EE455FA1C210678D1E02127CC` |
| `Users-SavIzOgP.js` | `B8311A251F13EEA5CA11BAF59577F65D7AD36E33FA06190D8CD7C93E8AD816B3` |
| `XuiNodes-zXDW2nwS.js` | `55FE3D7DC701C4BF89F9F584F2ED7F6D327D7125EDAD85FAB1D5EE8F68D716E6` |
| `zone-BGlF3nZB.js` | `270DE35CE38D756797503E230B03BEA49DCD4F4C7CF606049F6BE677214AB54A` |
| `Zones-BwVGbG8r.js` | `443DE2E94F1726AD37AEA640D46E73824F9C7852F34A4DC26C7E309685CCD855` |

### 路由扫描

扫描步骤：

1. 保留 TSV 中 path 以 `/admin/` 开头的 88 行。
2. 将 `${e}`、`${t}`、`:id` 等参数名按 segment 位置归一化。
3. 用 `reflect-metadata` 读取非测试 controller 的 Nest `PATH_METADATA` 和 `METHOD_METADATA`，再按 method/path 比对。
4. 读取 handler 的 body/query 和返回投影，不能仅以路径名称相似判定“支持”。

结果详见 [`admin-route-metadata-audit.md`](./admin-route-metadata-audit.md)：当前 normalized admin metadata routes 116，冻结行 88，exact matches 88，missing 0。旧版 [`admin-route-audit.md`](./admin-route-audit.md) 中“其余路径没有 controller、会 404”的描述早于 path-array controller 修复，不能作为当前事实。

当前 controller 注册入口是 [`api-v1-compat.module.ts`](../../../../apps/api/src/modules/api-v1-compat/api-v1-compat.module.ts:15)，包含 `LegacyAdminDedicatedController`、`LegacyAdminControlPlaneController`、`LegacyAdminUsersController`、`LegacyAdminSkusController` 和 `LegacyAdminUnsupportedController`，以及 admin ticket/Zone 所在 controller。`LegacyAdminUnsupportedController` 使用 Nest 支持的 path arrays（例如 [`legacy-admin-unsupported.controller.ts`](../../../../apps/api/src/modules/api-v1-compat/legacy-admin-unsupported.controller.ts:22)），不同 HTTP method 使用独立 handler。

## 共用传输、认证和 gate 契约

- `@Controller('v1')` 加全局 `api` prefix 后，实际地址是 `/api/v1/*`（[`apps/api/src/main.ts`](../../../../apps/api/src/main.ts:15)、[`res-static-compat.ts`](../../../../apps/api/src/common/http/res-static-compat.ts:21)）。
- `LEGACY_API_V1_ALIASES` 当前为空（[`legacy-api-v1.ts`](../../../../apps/api/src/common/http/legacy-api-v1.ts:21)）；canonical `/api/admin/*` 不会自动 alias 成 `/api/v1/admin/*`。
- `/api/v1` 成功响应是冻结客户端读取的 raw JSON，不套现代 `{code,msg,data,requestId}` 成功 envelope。
- `/api/v1` 错误 wire shape 是 `{statusCode,message,errorCode,timestamp,path}`（[`exception-filter.ts`](../../../../apps/api/src/common/errors/exception-filter.ts:20)）。controller 内部的 `reasonKey` 会成为 `AppError.message`，但不会作为独立 `data.reasonKey` 出现在 legacy wire body；单元测试可直接观察 `reasonKey`。
- `RequireAuth` 无 Authorization/API key 时先返回 401。`UserGuard` 会把 admin session 拒绝为 403；admin handler 再检查 `ownerType`、tenant 和固定 site。
- `assertLegacyApiAccess`（[`legacy-site-access.ts`](../../../../apps/api/src/modules/api-v1-compat/legacy-site-access.ts:6)）的顺序是：gate 关闭 -> 404 `legacy_api_disabled`；缺少 `LEGACY_API_SITE_ID` -> 500 `legacy_api_site_not_configured`；会话 site 不匹配 -> 403 `legacy_api_site_mismatch`。

### 状态矩阵（基线）

| 条件 | HTTP | 典型 error code/reason | 说明 |
| --- | ---: | --- | --- |
| 无凭据/过期 bearer | 401 | `AUTH_REQUIRED` / `auth_required` 或 `session_expired` | guard 在 controller 前执行 |
| gate 关闭且已有有效 admin session | 404 | `NOT_FOUND` / `legacy_api_disabled` | 不是缺少 Nest route |
| gate 开启但未配置固定 site | 500 | `INTERNAL_ERROR` / `legacy_api_site_not_configured` | 配置错误 |
| site 不匹配 | 403 | `PERMISSION_DENIED` / `legacy_api_site_mismatch` | 不进入业务查询 |
| USER 或缺 tenant 的 TENANT_ADMIN | 403 | `PERMISSION_DENIED` / `insufficient_permissions`、`tenant_context_required` | admin scope 失败 |
| 有效 admin + 已支持 handler | 200 | raw frozen JSON | 仍可能因参数/资源得到 400/404 |
| 有效 admin + 明确不支持的能力 | 501 | `UNSUPPORTED_CAPABILITY` / handler-specific reason | 不返回 fake empty success |
| 专线 upstream lock | 409 | `UNSUPPORTED_CAPABILITY` / `legacy_dedicated_order_lock_unavailable` | 当前唯一冻结 admin 的 409 |

## 88 条冻结 admin 请求的完整归类

下表按原始请求记录计数；同一路径的多个 method 会分别计入 rows。合计必须为 88。

| 资源组 | 唯一路径 | rows | 当前基线 |
| --- | ---: | ---: | --- |
| `dedicated-customer-profiles` | 1 | 1 | 501 `legacy_admin_resource_unavailable` |
| `dedicated-orders` | 17 | 17 | list 条件 200/501；lock 409；其余 501 |
| `dedicated-plans` | 2 | 4 | 全部 501 `legacy_admin_dedicated_plan_contract_unavailable` |
| `dedicated-skus` | 2 | 3 | GET 200（窄投影）；POST/PATCH 501 |
| `delivery-policy-bindings` | 1 | 2 | 全部 501 `legacy_control_plane_unavailable` |
| `delivery-profiles` | 1 | 2 | 全部 501 `legacy_control_plane_unavailable` |
| `entry-device-groups` | 1 | 2 | 全部 501 `legacy_control_plane_unavailable` |
| `entry-profiles` | 2 | 3 | 全部 501 `legacy_control_plane_unavailable` |
| `external-forward-rules` | 1 | 2 | 全部 501 `legacy_control_plane_unavailable` |
| `notifications` | 2 | 2 | 全部 501 `legacy_admin_broadcast_unavailable` |
| `payment-config` | 1 | 2 | GET 501 dashboard；PUT 501 settings |
| `pending-items` | 1 | 1 | 501 `legacy_admin_dashboard_contract_unavailable` |
| `provider-routing` | 1 | 2 | GET 501 dashboard；PUT 501 settings |
| `proxies` | 1 | 1 | 501 `legacy_admin_residential_capability_unavailable` |
| `recent-orders` | 1 | 1 | 501 `legacy_admin_dashboard_contract_unavailable` |
| `referral` | 2 | 2 | GET 501 dashboard；PATCH 501 residential |
| `relay-deployment-sets` | 1 | 2 | 全部 501 `legacy_control_plane_unavailable` |
| `revenue-trend` | 1 | 1 | 501 `legacy_admin_dashboard_contract_unavailable` |
| `settings` | 2 | 2 | GET 501 dashboard；PUT 501 settings |
| `statistics` | 1 | 1 | 501 `legacy_admin_dashboard_contract_unavailable` |
| `tickets` | 4 | 4 | 200（admin scope/数字 ID） |
| `users` | 17 | 20 | list/create 200；其余 501 |
| `xui-nodes` | 9 | 11 | 全部 501（XUI/control plane） |
| **合计** | **72** | **88** | |

## 已有真实 handler 与冻结契约

### 1. Dedicated orders

冻结 `DedicatedOrders-aEFQHCdf.js` 的列表调用发送：

```text
GET /api/v1/admin/dedicated-orders
query: skuCode,status,country,source,protocol,nodeId,userId,email/search,dateFrom,dateTo,page,limit
```

当前 [`legacy-admin-dedicated.controller.ts`](../../../../apps/api/src/modules/api-v1-compat/legacy-admin-dedicated.controller.ts:44) 只把 `page` 和 `limit/pageSize` 交给 `ListDedicatedLineLimitsUseCase`；默认 `page=1,pageSize=20`，最大 page size 100，返回：

```json
{
  "page": 1,
  "pageSize": 20,
  "limit": 20,
  "total": 0,
  "items": []
}
```

若上述旧筛选字段任一有值，明确返回 501 `legacy_dedicated_order_filters_unavailable`，不会悄悄丢弃筛选。当前 item 真实字段只有：
`proxyId, tenantId, userId, userEmail, userName, skuCode, skuName, country, protocol, status, desiredVersion, inboundTag, limits, projections`。

冻结列表还消费 `proxyCode, orderNo, clientEmail, cityName, nodeName, xuiNodeId, entryGroupCode, upstreamHost, upstreamPort, upstreamUsername, upstreamPassword, upstreamSource, upstreamIpType, lastProbeStatus, lockedUpstream, usedGb, totalGb, expiresAt, createdAt, proxyCreatedAt` 等字段。它们当前未由 list projection 返回，因此这是 **HTTP 200、页面 DTO 不完整**，不能宣称完整 dedicated-orders contract。

其余 16 个路径的当前状态：

| 冻结 method/path | 冻结调用形状 | 当前 handler/状态 |
| --- | --- | --- |
| `GET /admin/dedicated-orders/:id` | 详情按 `proxyId`；期待订单、upstream、pricingSnapshot、connectionUri 等组合对象 | 已注册，501 `legacy_dedicated_order_detail_contract_unavailable` |
| `GET /admin/dedicated-orders/:id/deployments` | 按 `proxyId`；期待 raw deployment array，含 `xui_nodes`/entry profile 字段 | 同上，501 |
| `GET /admin/dedicated-orders/:id/rebind-candidates` | `page,limit,search`；期待 `{items,total}` 候选 | 同上，501 |
| `POST /admin/dedicated-orders/:id/lock` | `{locked:boolean}`；期望 `lockedUpstream,lockedAt` | 409 `legacy_dedicated_order_lock_unavailable`（[`legacy-admin-dedicated.controller.ts`](../../../../apps/api/src/modules/api-v1-compat/legacy-admin-dedicated.controller.ts:75)） |
| `POST /admin/dedicated-orders/:id/probe` | 无 body；期望 `{result:{ok,exitCountry,latencyMs,error}}` | 501 `legacy_dedicated_order_mutation_unavailable` |
| `POST /admin/dedicated-orders/:id/rebind` | `{upstreamId}` | 501 mutation |
| `POST /admin/dedicated-orders/:id/rebind-manual` | Socks5 或 host/port/credentials、expiresAt、rate/traffic limits | 501 mutation |
| `POST /admin/dedicated-orders/:id/refund` | `{reason}` | 501 mutation |
| `POST /admin/dedicated-orders/:id/switch-route` | `{xuiNodeId?,protocol?,entryGroupCode?}` | 501 mutation |
| `POST /admin/dedicated-orders/batch-probe` | `{proxyIds}`；逐项 `ok/result.ok` | 501 mutation |
| `POST /admin/dedicated-orders/batch-rebind` | `{proxyIds}`；逐项 `ok` | 501 mutation |
| `POST /admin/dedicated-orders/batch-refund` | `{proxyIds,reason}`；逐项 `ok` | 501 mutation |
| `POST /admin/dedicated-orders/batch-switch-route` | `{proxyIds,xuiNodeId?,protocol?,entryGroupCode?}` | 501 mutation |
| `POST /admin/dedicated-orders/deployments/:id/retry` | 无 body | 501 mutation |
| `POST /admin/dedicated-orders/import-upstreams` | `{country,cityName?,expiresAt,rate limits?,lines:string[]}` | 501 mutation |
| `POST /admin/dedicated-orders/sync-upstreams` | `{country?:string}`；期望 `{scope,country,total}` | 501 mutation |

这些 501 路径由 [`legacy-admin-unsupported.controller.ts`](../../../../apps/api/src/modules/api-v1-compat/legacy-admin-unsupported.controller.ts:65) 的 path arrays 显式注册。没有等价的 dedicated-line upstream lock/probe/rebind/route-switch/refund/batch/retry 状态机，禁止把普通订单 refund、control-plane health 或 provider sync 直接 alias 进来。

### 2. Users 与管理员 Zone

#### 用户列表和创建（真实 200 边界）

冻结用户页发送：

```text
GET /api/v1/admin/users
query: page,limit,email,role,status
POST /api/v1/admin/users
body: {email,password,role,initialBalance,tenantId?}
```

[`legacy-admin-users.controller.ts`](../../../../apps/api/src/modules/api-v1-compat/legacy-admin-users.controller.ts:40) 返回同时兼容旧客户端的 `{data,list,items,page,pageSize,limit,total}`。每个 item 是：
`id`（持久化 numeric `users.legacyId`）、`email,nickname,role,balance,status,createdAt`。`status` 将 canonical `ACTIVE` 映射为 `active`，`SUSPENDED/BANNED` 映射为 `disabled`；`role` 当前固定输出 `user`。repository 的 site/tenant 过滤和 wallet balance 投影见 [`users.repository.ts`](../../../../apps/api/src/modules/users/users.repository.ts:177)。

支持限制：

- `role` 只能省略或为 `user`；`role=admin` -> 501 `legacy_admin_user_role_filter_unavailable`。
- `status` 只接受 `active`/`disabled`；`deleted` -> 501 `legacy_admin_deleted_users_unavailable`，其他值 -> 400。
- 创建只允许普通 user；非 user role、非零 `initialBalance`、写入 `name/nickname` -> 501。`email/password` 缺失 -> 400。创建继续委托 `CreateUserUseCase`，不是 controller 直接 Prisma 写入。

#### 管理员用户 Zone

`GET /api/v1/admin/users/:legacyUserId/zones` 不属于 `LegacyAdminUsersController`，而由 [`legacy-zones.controller.ts`](../../../../apps/api/src/modules/api-v1-compat/legacy-zones.controller.ts:75) 注册。它先验证 admin/site/tenant，再用 `users.resolveLegacyIdForScope` 按 `siteId + tenantId + persisted legacyId` 解析用户，返回 raw Zone array（`id,code,name,description,status,sortOrder,createdAt`）。有效 scope 下为 200；非法数字 -> 400 `user_id_invalid`；不存在或越权用户 -> 404 `user_not_found`。

#### 其余用户路径

以下冻结调用都已注册；除明确支持的用户 mutation 外，其余仍按 reason key 由 `LegacyAdminUnsupportedController` 的分组返回 typed 501：

| 冻结路径 | 请求/页面消费 | 当前状态 |
| --- | --- | --- |
| `DELETE /admin/users/:id` | 删除目标用户；成功返回 `{id:<persisted numeric legacyId>}` | 200；先按 `siteId + tenantId + legacyId` 解析，存在业务记录时返回 422 `user_has_business_records` |
| `PUT /admin/users/:id/status` | `{status:"active"|"disabled"}`；成功返回 `{id:<persisted numeric legacyId>,status:"active"|"disabled"}` | 200；先按 `siteId + tenantId + legacyId` 解析，再委托 canonical user use case |
| `PUT /admin/users/:id/role` | `{role:"admin"|"user"}` | 501 mutation |
| `PATCH /admin/users/:id/credentials` | `{email?,password?,confirmPassword?}` | 501 mutation |
| `GET /admin/users/:id/api-key` | 期待 `{hasKey,prefix,updatedAt}` | 501 `legacy_admin_user_resource_unavailable` |
| `POST /admin/users/:id/api-key/regenerate` | 期待一次性 `apiKey` 和 metadata | 501 mutation |
| `DELETE /admin/users/:id/api-key` | 撤销 key | 501 mutation |
| `POST /admin/users/:id/impersonate` | 期待 `{ticket,target.email}`，随后调用 `/auth/impersonate/redeem` | 501 mutation；redeem controller 也未形成闭环 |
| `POST /admin/users/:id/add-balance` | `{amount,remark}` | 501 mutation |
| `POST /admin/users/:id/deduct-balance` | `{amount,remark}` | 501 mutation |
| `POST /admin/users/:id/gift-balance` | `{amount,remark}` | 501 mutation |
| `POST /admin/users/:id/set-balance` | `{balance,remark}` | 501 mutation |
| `GET /admin/users/:id/dedicated-prefs` | `{ipPreference,defaultLockUpstream,remark}` | 501 user resource |
| `PUT /admin/users/:id/dedicated-prefs` | 同上 body | 501 mutation |
| `GET /admin/users/:id/ips` | user、staticProxies、dynamicChannels、recentTransactions 组合对象 | 501 user resource |
| `GET /admin/users/:id/referral` | referral projection | 501 user resource |
| `PATCH /admin/users/:id/commission-rate` | `{commissionRate}` | 501 mutation |

bundle 还会从用户页请求 `PATCH /price/user-overrides/:id/batch`（`{updates:[...]}`）和 `GET /price/user-ip-pool/:id`；它们不在 88 条 `/admin/*` 计数中，当前也没有可证明的 frozen admin v1 contract。`PATCH /admin/proxies/:id/limit` 属于 88 条清单，当前 501 `legacy_admin_residential_capability_unavailable`，不能按 dedicated line limits 直接 alias。

### 3. Dedicated SKU 与旧 Dedicated Plans

#### `GET /admin/dedicated-skus`

当前 [`legacy-admin-skus.controller.ts`](../../../../apps/api/src/modules/api-v1-compat/legacy-admin-skus.controller.ts:18) 真实调用 `CatalogRepository.listSkus(ctx.siteId, true)`，只保留 `capabilities.delivery === "dedicated-line"`，返回 200 raw array。当前投影字段为：
`id,code,name,description,status,isActive,isVisible,contractVersion,protocols,capabilities`。

这不是完整冻结 DTO：`DedicatedSkuV2-DhmdHMcy.js` 的表格读取 snake_case 字段 `product_type,duration_days,traffic_gb,rate_limit_mbps_down,rate_limit_mbps_up,base_price,min_success_count,is_enterprise,is_exclusive`，并读取 `dedicated_entry_profiles`、`dedicated_relay_deployment_set` 等嵌套字段。当前 camelCase catalog projection 没有这些字段，所以该路径应记录为 **HTTP 200、contract partial**，不能当作新专线 SKU 编排页已可用。

#### SKU 写入和旧 Plans

| 冻结路径 | 冻结输入 | 当前状态 |
| --- | --- | --- |
| `POST /admin/dedicated-skus` | 新 SKU body（V2 页面含 duration/traffic/rate/protocols/basePrice/status 等） | 501 `legacy_admin_dedicated_sku_contract_unavailable` |
| `PATCH /admin/dedicated-skus/:id` | 同类更新 body | 501 同上 |
| `GET /admin/dedicated-plans` | 期待 `id,name,code,productType,trafficGb,basePrice,protocols,sortOrder,status` array | 501 `legacy_admin_dedicated_plan_contract_unavailable` |
| `POST /admin/dedicated-plans` | `{name,code,productType,durationDays,trafficGb,basePrice,protocols,sortOrder,status}` | 501 同上 |
| `PATCH /admin/dedicated-plans/:id` | 同类更新 body | 501 同上 |
| `DELETE /admin/dedicated-plans/:id` | 无 body | 501 同上 |

`service_skus` 是 canonical catalog owner，但没有与冻结 V2 snake_case、嵌套 control-plane 字段相同的 admin write use-case；禁止在 compat controller 直接写 `service_skus` 或把 pricing override 冒充 SKU 编辑。

### 4. Admin tickets（当前唯一完整的 admin CRUD 组）

冻结 ticket chunk 使用：

```text
GET /api/v1/admin/tickets?{page,limit/pageSize,q/search,status}
GET /api/v1/admin/tickets/:id
POST /api/v1/admin/tickets/:id/reply   body {content}
PATCH /api/v1/admin/tickets/:id/close
```

四个 handler 位于 [`legacy-customer-resources.controller.ts`](../../../../apps/api/src/modules/api-v1-compat/legacy-customer-resources.controller.ts:249)。它们委托 admin ticket use cases；`PLATFORM_ADMIN` 看到固定 site 全 tenant，`TENANT_ADMIN` 只看到自己的 tenant。列表是 raw page `{data,list,items,page,pageSize,limit,total}`，item 的 `id` 为持久化 numeric `tickets.legacyId`，状态为 `open/answered/closed`；详情还返回 `ticket`、`messages` 和 `senderRole`。

数字 ID 只接受正整数安全范围；非法值 -> 400 `ticket_id_invalid`，不存在或跨 scope -> 404 `ticket_not_found`。repository 的 `resolveLegacyIdForScope` 同时带 site/tenant 条件（[`tickets.repository.ts`](../../../../apps/api/src/modules/tickets/tickets.repository.ts:191)）。在有效 admin scope、数据库记录存在且 body 合法时，四路由基线为 200；数据库/业务状态错误仍按 canonical error 返回。

### 5. Dashboard、settings、provider/payment、统计

#### 冻结 dashboard 的实际请求链

`Dashboard-C1Px7ChX.js` 首屏并行/串行读取：

| 请求 | 冻结响应消费 | 当前状态 |
| --- | --- | --- |
| `GET /admin/statistics` | `users.total`、`revenue.total/today`、`orders.total/today`、`proxies.total`（另读 today 字段） | 501 `legacy_admin_dashboard_contract_unavailable` |
| `GET /admin/pending-items` | `data[]`，每项含 `id,icon,color,title,description,count,badgeType` | 501 同上 |
| `GET /admin/recent-orders?limit=5` | `data[]`，读 `orderNo,userEmail,amount,createdAt` | 501 同上 |
| `GET /admin/revenue-trend?days=7\|30\|90` | `dates[]`、`revenues[]` | 501 同上 |

页面 catch 后会保留零值/空数组，这只是前端默认状态，不能解释为后端返回的真实零统计。当前没有 canonical admin aggregate/read model，不能把 `/api/orders` 或 `/api/payments` 列表直接当 dashboard contract。

另有不属于 `/admin/*` 88 行的 `GET /dashboard/admin-pending-tasks`，由 `LegacySurfaceController` 明确返回 501 `legacy_capability_unavailable`；`GET /dashboard/overview` 是用户 dashboard，不应与上述 admin statistics 混同。

#### `/admin/settings`、provider routing 和 payment config

冻结 Settings 页的 GET 读取一个混合 settings object，实际使用的 key 包括：
`sharedPrice,premiumPrice,exchangeRate,minRechargeAmount,maxRechargeAmount,telegram1,telegram1Link,telegram2,telegram2Link,crispEnabled,crispWebsiteId,dedicated_scheduler_probe_target,dedicated_scheduler_bark_endpoints,proxy985.apiKey,proxy985.baseUrl,proxy985.apiVersion,proxy985.zone.default,proxy985.zone.shared,proxy985.zone.premium,proxy985.inventoryCacheTtlSeconds,payment.yipay.* ,smtp.*,global_daily_switch_limit,feature.*`。PUT 逐 key 调用 `PUT /admin/settings/:id`，body 是 `{value}`。

`GET /admin/settings` 当前 501 `legacy_admin_dashboard_contract_unavailable`；`PUT /admin/settings/:id` 当前 501 `legacy_admin_settings_contract_unavailable`。不能把 `/api/v1/settings/capabilities` 或 `ConfigService` 全量值冒充这个 DTO，尤其不能泄露 API key、SMTP password、merchant private key。

`GET /admin/provider-routing` 期待 config（`enabled,defaultProviderPriority,rules[]`）；PUT body 为 `{enabled,defaultProviderPriority,rules:[{countryCode,cityName?,ipType,providerPriority}]}`。GET 当前 501 dashboard reason，PUT 当前 501 settings reason。

`GET /admin/payment-config` 读取支付配置；PUT body 含 `enabled,pid,apiUrl,notifyUrl,returnUrl,merchantPrivateKey,platformPublicKey`。两路均 501（GET dashboard reason，PUT settings reason）；canonical payment order 不是 gateway-secret settings owner。

### 6. Notifications broadcast

冻结 `Notifications-CoZEtO_m.js` 的请求契约：

```text
POST /api/v1/admin/notifications/broadcast/preview
body: {target}
response expected: {totalTargets}

POST /api/v1/admin/notifications/broadcast
body: {type,title,content,channels,target}
response expected: {totalTargets,inApp,email,telegram,failed?}
```

`target` 支持 `scope=all|userIds|role|balance`；user id 文本会解析成数字数组，role 可为 user/admin，balance 包含 `balanceOp` 和 `balanceValue`。当前两路都由 [`legacy-admin-unsupported.controller.ts`](../../../../apps/api/src/modules/api-v1-compat/legacy-admin-unsupported.controller.ts:100) 返回 501 `legacy_admin_broadcast_unavailable`。`notifications` canonical repository 只有单用户事件写入，没有 recipient query、broadcast job、渠道 adapter、幂等和审计契约；禁止循环 `createForUser` 伪造广播，也禁止返回 `{totalTargets:0}` 假成功。

### 7. XUI 节点与旧 control-plane 资源

#### XUI routes（11 rows）

冻结 `XuiNodes-zXDW2nwS.js` 的实际输入/消费包括：

- `GET /admin/xui-nodes`：raw array，读取 `id,name,baseUrl,username,status,lastHealthStatus,entryGroups[]`。
- `POST /admin/xui-nodes`、`PATCH /admin/xui-nodes/:id`：node body 含 `name,baseUrl,username,password?,entryGroups:[{code,skuCode,protocol,publicHost,publicPort,inboundId,inboundTag?,enabled,description?}],status`。
- `POST /admin/xui-nodes/bulk-import`：`{nodes:[{name,baseUrl,username,password,entryGroups:[],status,weight,remark?}]}`，期待 `{success,failed,results:[{ok,error?}]}`。
- `DELETE /admin/xui-nodes/:id`：无 body。
- `GET /admin/xui-nodes/:id/inbounds`：raw rows `id,remark,protocol,port,tag`。
- `GET /admin/xui-nodes/:id/mappings`：raw mapping rows，含 order/user/SKU/upstream/status 字段。
- `GET /admin/xui-nodes/:id/stats`：`{inbounds,clients,capabilities}`。
- `POST /admin/xui-nodes/:id/test-connection`：`{ok,latencyMs,capabilities,message}`。
- `GET /admin/xui-nodes/dedicated-proxies/:id/rebind-candidates`：`page,limit,search`，期待 `{items,total}`。
- `POST /admin/xui-nodes/dedicated-proxies/:id/rebind`：`{upstreamId}`。

以上 11 rows 由 [`legacy-admin-control-plane.controller.ts`](../../../../apps/api/src/modules/api-v1-compat/legacy-admin-control-plane.controller.ts:19) 显式注册，全部 501；列表使用 `legacy_xui_nodes_unavailable`，其余使用 `legacy_control_plane_unavailable`。当前 `control_nodes` 的 canonical credential/model 与旧 XUI panel `baseUrl/username/password/entryGroups` 不等价，不能 URL alias 或把 control-node health 投影成 XUI success。

#### 其他旧 control-plane routes（12 rows）

以下路径同样全部已注册、有效 admin 下返回 501 `legacy_control_plane_unavailable`：

```text
GET/POST /admin/entry-profiles
POST     /admin/entry-profiles/:id/check
GET/POST /admin/entry-device-groups
GET/POST /admin/external-forward-rules
GET/POST /admin/relay-deployment-sets
GET/POST /admin/delivery-profiles
GET/POST /admin/delivery-policy-bindings
```

冻结 V2 页面确实会发送这些 body（入口域名、转发目标、节点组成员、交付策略和绑定），但现有 canonical 表/用例的 owner、字段和生命周期不同。不能仅因同名 `entry`、`delivery` 或 `node` 就宣称支持。

### 8. 其他明确 unsupported 的冻结路径

以下路径已在完整归类表中计数，状态和原因固定如下：

| 路径 | 当前状态 | 原因/边界 |
| --- | --- | --- |
| `POST /admin/dedicated-customer-profiles` | 501 | 没有 dedicated customer profile Source of Truth；`legacy_admin_resource_unavailable` |
| `PATCH /admin/proxies/:id/limit` | 501 | 旧 proxy 对象/单位未证明等于 dedicated line limit；`legacy_admin_residential_capability_unavailable` |
| `GET /admin/referral/withdrawals` | 501 | 没有 referral withdrawal model；dashboard reason |
| `PATCH /admin/referral/withdrawals/:id` | 501 | 没有 payout state/audit owner；residential reason |

`LegacyAdminUnsupportedController` 还注册了不在本次 88 行清单中的 `/admin/recharges`、`/admin/recharge-approval` 等额外保护路径；它们不改变 88 行计数，也不应被倒推为冻结 bundle 已调用或已支持。

## Source of Truth 与实现边界

| 能力 | 当前 owner/adapter | 结论 |
| --- | --- | --- |
| 专线列表 | `dedicated_lines` + `ListDedicatedLineLimitsUseCase` | 只支持当前窄 projection；旧筛选/详情/上游操作另需 read model/use case |
| 用户列表/创建 | `users`、`wallets`、`UsersRepository`、`CreateUserUseCase` | 已有真实 adapter；numeric ID 来自持久化 `users.legacyId` |
| SKU 读取 | `service_skus`、`CatalogRepository` | GET 真实但字段不满足 V2；写入无等价 use case |
| 工单 | `tickets`、`ticket_messages`、ticket repositories/use cases | admin 四路由已做 scope + numeric ID 映射 |
| Zone | `user_zones`、Zone use cases、`users.legacyId` | admin 用户 Zone read 已支持；不能与供应商资源树 Zone 混用 |
| XUI/control plane | `control_nodes` 等 canonical control-plane 模型 | 与旧 XUI DTO 不同，保持 501 |
| dashboard/settings/broadcast/referral | 没有冻结 DTO 对应的 aggregate/config/recipient/payout owner | 保持 typed 501，不返回空数据或默认 secret |

禁止的替代实现：

- 在 compatibility controller 直接 Prisma 拼跨域 DTO，绕过 use case、权限、审计和幂等。
- 用 `/api/admin/*`、`/api/orders`、`/api/payments` 或 `/api/admin/control-plane/*` 做 URL-only alias。
- catch 501/上游错误后返回 `[]`、零统计或默认配置。
- 把 UUID 强转成冻结页面使用的 numeric user/ticket ID；必须使用持久化 legacy ID 并带 site/tenant scope。

## 验证记录与残余风险

已执行的 focused controller tests（使用仅用于测试导入的 dummy 环境变量：`NODE_ENV=test`、本地 dummy `DATABASE_URL/REDIS_URL`、64 字符 `APP_ENCRYPTION_KEY`、长度合规 `JWT_SECRET`、`APP_PLATFORM_CURRENCY=USD`、`LEGACY_API_V1_ENABLED=true`、`LEGACY_API_SITE_ID=site-1`）：

```text
pnpm --filter @ipeasy/api exec vitest run \
  src/modules/api-v1-compat/legacy-admin-unsupported.controller.spec.ts \
  src/modules/api-v1-compat/legacy-admin-users.controller.spec.ts \
  src/modules/api-v1-compat/legacy-admin-dedicated.controller.spec.ts \
  src/modules/api-v1-compat/legacy-admin-skus.controller.spec.ts \
  src/modules/api-v1-compat/legacy-admin-control-plane.controller.spec.ts \
  --maxWorkers=1

5 test files passed, 32 tests passed
```

未注入环境变量的第一次尝试在 `env.schema` 处提前退出；这不是业务断言失败，说明 controller spec 依赖配置 schema。metadata audit 另记录了 288 个 controller routes、0 import errors、`frozenCount=88/foundCount=88/missingCount=0`；它只验证 reflection，不启动 Nest/Fastify、不连数据库。

交付前仍需：

1. 在 API 测试环境运行代表性 Fastify runtime probes，确认 path-array 注册顺序没有被 generic `:id` 路由遮蔽。
2. 用真实、授权的 admin session 验证 200 raw body、401/403/404/501 wire body；没有生产 credential 时不能用伪造用户替代，需标记 browser smoke blocked。
3. 对 GET dedicated-orders、GET dedicated-skus、admin users/tickets/zones 做 PostgreSQL fixture 验证，锁定字段缺口、分页总数和 scope 隔离。
4. 保持 `apps/web/**` 与冻结 bundle byte-for-byte 不变；本审计没有执行部署或 provider/worker/XUI panel smoke。
