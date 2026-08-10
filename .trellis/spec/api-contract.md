# API 契约规范

## 响应 Envelope

所有业务 API 必须返回统一 envelope：

```ts
type ApiEnvelope<T> =
  | { code: 0; msg: "success"; data: T; requestId: string }
  | {
      code: ErrorCode;
      msg: string;
      data: {
        reasonKey: string;
        reason?: string;
        details?: Record<string, unknown>;
      };
      requestId: string;
    };
```

规则：

- `code` 是稳定业务错误码。
- `reasonKey` 是稳定机器可读原因。
- `reason` 只做人类可读说明，不能替代错误码。
- HTTP status 不能全部 200；认证、权限、服务错误要保留合理 HTTP status。
- `requestId` 必须贯穿日志、审计和响应。

## 平台探针

`/health` 和 `/ready` 是平台探针端点，不属于业务 API：

- 两者都不加 `/api` prefix，不包业务 envelope，直接返回 plain JSON。
- `/health` 只表示进程存活，成功时始终返回 200 `{ status: "ok", timestamp }`。
- `/ready` 必须检查真实依赖：PostgreSQL 通过 `prisma.$queryRaw\`SELECT 1\``，Redis 至少检查 `REDIS_URL` 指向的 TCP 连接可达。
- `/ready` 只有 DB 和 Redis 都可用时返回 200 `{ status: "ok", checks }`；任一失败必须返回 503 `{ status: "error", checks }`，不能把依赖故障吞成 ready。

## 分页、过滤、排序

分页统一：

```ts
type PageResult<T> = {
  page: number;
  pageSize: number;
  total: number;
  items: T[];
};
```

过滤和排序命名统一：

- `page`
- `pageSize`
- `search`
- `sortBy`
- `sortOrder`
- `status`
- `from`
- `to`

## 金额、时间、币种

- 所有金额使用 decimal string，不用 JS number 表示货币。
- 时间统一 ISO 8601 UTC；前端按 locale 展示。
- 第一阶段只允许单币种，由 `APP_PLATFORM_CURRENCY` 拥有。
- payment create、wallet adjustment、ledger、quote output 都必须校验同一币种。

## OpenAPI 生成

- 路由、scope、请求体、响应 schema 必须由统一 schema/registry 生成。
- 禁止运行时路由一份、OpenAPI route catalog 手写另一份。
- 前端 API client 和类型从 OpenAPI 生成。
- OpenAPI 文档必须包含 `apikey` 鉴权、错误码、字段映射和 SDK 示例。

### 1. Scope / Trigger

- Trigger: 后端路由和前端类型跨层共享，OpenAPI schema 是唯一契约来源。

### 2. Signatures

- Runtime endpoint: `GET /openapi.json`，不加 `/api` prefix，不包业务 envelope。
- Swagger UI: `GET /api/docs`。
- Export command: `pnpm --filter @ipeasy/api export:openapi`。
- Type generation command: `pnpm --filter @ipeasy/contracts generate`。
- Type check command: `pnpm --filter @ipeasy/contracts typecheck`。

### 3. Contracts

- `packages/contracts/openapi.json` 是导出的 schema 文件。
- `packages/contracts/src/generated/api.ts` 只能由生成脚本写入，不能手写。
- `packages/contracts/src/index.ts` 对外 re-export `paths`、`components`、`operations`。
- OpenAPI document 必须包含：
  - `info.title = "IPEasy Platform API"`
  - `info.version = "1.0"`
  - `components.securitySchemes.apikey = { type: "apiKey", in: "header", name: "apikey" }`
  - `components.securitySchemes.bearer = { type: "http", scheme: "bearer", bearerFormat: "JWT" }`

### 4. Validation & Error Matrix

- `/openapi.json` 被业务 envelope 包裹 -> 失败；该端点必须直接返回 OpenAPI document。
- 导出脚本缺少真实 DB secret -> 不应失败；OpenAPI 导出是离线 schema 任务，使用导出专用 placeholder env。
- 生成脚本在中文路径下把文件路径 URL encode 后读取 -> 失败；必须读入 JSON 对象后调用 `openapi-typescript` API。

### 5. Good/Base/Bad Cases

- Good: `pnpm --filter @ipeasy/api export:openapi` 后立刻运行 `pnpm --filter @ipeasy/contracts generate`，生成文件通过 `typecheck`。
- Base: 生产产物启动后 `GET /openapi.json` 返回 title、version、security schemes 和 paths。
- Bad: 手写 `src/generated/api.ts`，或在前端维护另一份接口类型。

### 6. Tests Required

- API integration: `GET /openapi.json` 返回 plain OpenAPI document，不含 `code` 字段。
- API integration: 断言 `apikey` 和 bearer security schemes。
- Contracts: 生成后运行 `pnpm --filter @ipeasy/contracts typecheck`。

### 7. Wrong vs Correct

#### Wrong

```bash
npx openapi-typescript packages/contracts/openapi.json -o packages/contracts/src/generated/api.ts
```

在包含中文的 Windows 路径下，Redocly 解析层可能把路径编码成 `%E5...` 后当普通文件路径读取。

#### Correct

```ts
const schema = JSON.parse(await readFile(input, 'utf8'));
const ast = await openapiTS(schema);
await writeFile(output, astToString(ast), 'utf8');
```

生成脚本读取 JSON 对象后调用 `openapi-typescript` API，绕开路径编码问题。

## 985Proxy-compatible 路由

第一阶段只设计契约，不实现真实购买履约。第二阶段至少覆盖：

- `POST /res_static/business`
- `POST /res_static/inventory`
- `POST /res_static/calculate`
- `POST /res_static/buy`
- `POST /res_static/renew`
- `POST /res_static/order_result`
- `POST /res_static/order_list`
- `POST /res_static/ip_list`
- `POST /res_static/ip_detail`
- `POST /res_static/change_auth`
- `POST /res_static/switch_ip_list`
- `POST /res_static/switch_ip`

公开 API 第一阶段兼容 985Proxy：使用 `apikey` 请求头和 `code/msg/data` envelope。

## 错误语义

必须显式返回的错误类型包括：

- `AUTH_REQUIRED`
- `PERMISSION_DENIED`
- `TENANT_SCOPE_VIOLATION`
- `VALIDATION_ERROR`
- `IDEMPOTENCY_CONFLICT`
- `WALLET_INSUFFICIENT_BALANCE`
- `CURRENCY_NOT_SUPPORTED`
- `RESOURCE_MAPPING_MISSING`
- `PRICE_MISSING`
- `UPSTREAM_DISABLED`
- `UPSTREAM_ERROR`
- `UPSTREAM_TIMEOUT`
- `UPSTREAM_OUT_OF_STOCK`
- `UNSUPPORTED_CAPABILITY`
- `INTERNAL_ERROR`
- `NOT_FOUND`

禁止把这些错误转换为空列表、默认成功或无数据状态。

Nest/Fastify 内置异常也必须进入统一错误 envelope：

- 401 -> `AUTH_REQUIRED` / `auth_required`。
- 403 -> `PERMISSION_DENIED` / `permission_denied`。
- 404 -> `NOT_FOUND` / `not_found`，不透传 `Cannot GET ...` 这类路由匹配细节。
- 400、422 和其他 4xx -> `VALIDATION_ERROR` / `invalid_request`。
- 5xx -> `INTERNAL_ERROR` / `http_exception`。

维护模式响应属于业务错误 envelope：HTTP 503、`code: UPSTREAM_DISABLED`、`data.reasonKey: "site_maintenance"`，并携带当前 `requestId`。

## Scenario: 985Proxy-Compatible Res Static API

### 1. Scope / Trigger

- Trigger: code exposes or consumes the reseller-compatible static proxy API under `/res_static/*`.
- Applies to `ResStaticController`, `res-static.dto.ts`, `res-static.mapper.ts`, `configureGlobalPrefix()`, `EnvelopeInterceptor`, `AppExceptionFilter`, `UpstreamApiAdapter`, OpenAPI export, and generated contracts.

### 2. Signatures

- Public endpoints are `POST /res_static/*`, not `/api/res_static/*`.
- Auth uses the existing `apikey` header or bearer token path through `@RequireUser()`.
- Success response: `{ code: 0, msg: "success", data: T }`.
- Failure response: `{ code: ErrorCode, msg: string, data: null }`.
- Public identifiers:
  - order: `ORD_<32 hex chars>`
  - proxy: `IP_<32 hex chars>`
  - resource: `RS_<32 hex chars>`

### 3. Contracts

- `/res_static/*` routes must be excluded from the global `/api` prefix in production bootstrap, test bootstrap, and OpenAPI export through the same helper.
- The platform envelope with `requestId` remains the default for `/api/*`; `/res_static/*` omits `requestId` from the external response but still uses internal request-id logging context.
- Do not return internal UUIDs in 985-compatible fields. Convert UUIDs only inside `res-static.mapper.ts`.
- Public request ids must be decoded at the OpenAPI boundary; raw UUID input is invalid.
- `business` lists saleable resources and may omit stock. `inventory` is the stock source of truth and must use fresh inventory snapshots; missing or stale inventory returns `UPSTREAM_ERROR / inventory_stale`.
- `UPSTREAM_API` must consume the same `code/msg/data` envelope and 985 field names that this platform produces. It should call `/res_static/inventory` for inventory sync, not `/res_static/business`.
- Non-2xx upstream HTTP responses that still contain a valid `code/msg/data` body must preserve the business error code instead of being collapsed to `UPSTREAM_ERROR`.

### 4. Validation & Error Matrix

- Missing or invalid auth -> `AUTH_REQUIRED`, `data: null` for `/res_static/*`.
- Non-USER auth context -> `PERMISSION_DENIED`, `data: null`.
- Missing tenant on user context -> `PERMISSION_DENIED / tenant_required`.
- Raw UUID or malformed `ORD_`/`IP_`/`RS_` input -> `VALIDATION_ERROR`.
- Missing/stale inventory -> `UPSTREAM_ERROR / inventory_stale`.
- Missing price -> `PRICE_MISSING`.
- Unsupported renew/change-auth/switch-ip capability -> `UNSUPPORTED_CAPABILITY`.
- `/api/res_static/*` appearing in `packages/contracts/openapi.json` or generated types -> contract drift.

### 5. Good/Base/Bad Cases

- Good: `POST /res_static/order_result` accepts `{ order_no: "ORD_..." }` and returns `proxy_list` with decrypted delivery passwords.
- Good: `UpstreamApiAdapter.syncInventory()` reads `/res_static/inventory` and stores `resource_id` as the upstream resource mapping.
- Base: `POST /res_static/business` returns resources without stock when no fresh inventory is available.
- Bad: returning `orders.id`, `proxy_instances.id`, or `platform_resources.id` directly in `order_no`, `proxy_id`, or `resource_id`.
- Bad: treating a missing inventory snapshot as `stock: 0`.
- Bad: parsing a 422 `{ code: "PRICE_MISSING", msg, data: null }` upstream response as generic `UPSTREAM_ERROR`.

### 6. Tests Required

- Unit: public id encode/decode rejects raw UUIDs and mappers do not leak UUIDs.
- Unit: `/res_static` success and error envelopes omit `requestId`, while `/api/*` keeps the platform envelope.
- Unit: `UpstreamApiAdapter` preserves business error codes from non-2xx 985 envelopes.
- OpenAPI: `pnpm --filter @ipeasy/api export:openapi`, then assert generated contracts contain `/res_static/*` and no `/api/res_static/*`.
- Contracts: `pnpm --filter @ipeasy/contracts generate` and `pnpm --filter @ipeasy/contracts typecheck`.

### 7. Wrong vs Correct

#### Wrong

```ts
return { order_no: order.id, stock: snapshot?.stock ?? 0 };
```

#### Correct

```ts
return {
  order_no: encodePublicId('order', order.id),
  stock: requireFreshInventory(snapshot).stock,
};
```

## Scenario: Admin minimum surface APIs

### 1. Scope / Trigger

- Trigger: Admin pages read backend data through TanStack Query and the shared API client, so backend routes, response envelopes, filters, permissions, and frontend error handling must stay aligned.
- Applies to the first Admin surface: login bootstrap, users, wallet ledger, payment confirmation, and audit logs.

### 2. Signatures

- `GET /api/sites/current` -> `{ site, announcements }`.
- `GET /api/users?page&pageSize&search&status` -> `PageResult<AdminUserListItem>`.
- `GET /api/tenants?page&pageSize&search&status` -> `PageResult<TenantListItemDto>`.
- `POST /api/tenants` body `{ code: string, name: string }` -> `TenantListItemDto`.
- `GET /api/tenants/:id` -> `TenantDetailDto`.
- `PUT /api/tenants/:id/status` body `{ status: "ACTIVE" | "SUSPENDED" }` -> `TenantListItemDto`.
- `GET /api/audit?page&pageSize&action&actorType&from&to` -> `PageResult<AuditLogListItem>`.
- `GET /api/wallet/:userId/ledger?page&pageSize&type&from&to` -> `PageResult<LedgerEntryDto>`.
- `GET /api/payments?page&pageSize&status&channel` -> `PageResult<PaymentOrderDto>`.
- `POST /api/payments/:id/confirm` body `{ reason: string }` -> `{ order: PaymentOrderDto, wallet: { available: string, currency: string } }`.
- `POST /api/orders/users/:userId/static-proxy` body `{ resourceId: string, quantity: number, durationDays: number, currency: string, idempotencyKey: string, businessType?: string, reason: string }` -> `{ orderId: string, status: string }`.
- Frontend shared client: `apiRequest<T>(path, init?)` and `userApiRequest<T>(path, init?)` must unwrap the envelope and throw `ApiError(code, reasonKey, details)` when `code !== 0`.

### 3. Contracts

- Admin login must read `GET /api/sites/current` first and submit the returned `site.id` to `POST /api/auth/login`; it must not hard-code a fake site id.
- `GET /api/sites/current` uses `req.authContext.siteId` when authenticated. Without auth, it resolves by request host domain; in local/test host mismatch it may fall back to the first real `ACTIVE` site ordered by `createdAt asc`. If no active site exists, return `NOT_FOUND / site_not_found`.
- `AdminUserListItem` fields: `id`, `email`, `tenantId`, `status`, `kycStatus`, `createdAt`.
- `TenantListItemDto` fields: `id`, `siteId`, `code`, `name`, `status`, `customerCount`, `createdAt`, `updatedAt`.
- `TenantDetailDto` extends tenant list fields with `orderCount`, `monthlyOrders`, `totalBalance`, `balanceByCurrency`, and `stats`.
- Tenant APIs are site-scoped by `ctx.siteId`; platform admins can list/read/update all tenants in that site only. Tenant admins can list/read only `ctx.tenantId`.
- Tenant detail balance aggregation must use decimal math and expose `balanceByCurrency` as the source of truth; `totalBalance` is the platform-currency projection.
- `AuditLogListItem` fields: `id`, `action`, `actorType`, `actorId`, `targetType`, `targetId`, `requestId`, `createdAt`.
- Admin assisted static proxy purchase uses the path `userId` as the target customer source of truth. The request body must not contain `siteId`, `tenantId`, wallet id, price, or admin actor id.
- Admin assisted purchase must be generated into OpenAPI as `AdminCreateStaticProxyOrderDto` and `CreateStaticProxyOrderResultDto`; frontend contracts come from `packages/contracts/src/generated/api.ts`, never from hand-written duplicated route types.
- Frontend filter options must use database enum values:
  - `UserStatus`: `ACTIVE | SUSPENDED | BANNED`
  - `PaymentOrderStatus`: `PENDING | CONFIRMING | COMPLETED | FAILED | REFUNDED`
  - `LedgerEntryType`: `DEPOSIT | DEBIT | REFUND | ADJUSTMENT | FREEZE | UNFREEZE | RENEWAL | COMMISSION`
  - `AuditActorType`: `USER | ADMIN_USER | SYSTEM | APIKEY`
- Admin API list pages must render loading, empty, error, permission, and pagination states from the real query result. They must not convert errors to `[]` or empty objects.

### 4. Validation & Error Matrix

- Missing or invalid session -> `AUTH_REQUIRED`.
- `USER` calling `/api/users` or `/api/audit` -> HTTP 403, `PERMISSION_DENIED`, `reasonKey: "insufficient_permissions"`.
- `TENANT_ADMIN` calling `/api/users` or `/api/audit` -> only records in `ctx.tenantId`.
- `PLATFORM_ADMIN` calling `/api/users` or `/api/audit` -> all records in `ctx.siteId`, across tenants.
- `TENANT_ADMIN` calling `/api/tenants/:otherTenantId` -> HTTP 403, `TENANT_SCOPE_VIOLATION`.
- `PLATFORM_ADMIN` calling `/api/tenants/:id` for another site -> HTTP 404, `NOT_FOUND / tenant_not_found`.
- `POST /api/tenants` with duplicate `code` inside a site -> HTTP 409, `VALIDATION_ERROR / tenant_code_exists`.
- `PUT /api/tenants/:id/status` with status outside `ACTIVE | SUSPENDED` -> HTTP 400, `VALIDATION_ERROR / tenant_status_invalid`.
- Payment confirmation when `PAYMENT_CONFIRMATION_ENABLED !== "true"` -> HTTP 503, `UPSTREAM_DISABLED`, `reasonKey: "payment_confirmation_disabled"`.
- Payment confirmation with empty/blank `reason` after the feature flag is enabled -> HTTP 400, `VALIDATION_ERROR`, `reasonKey: "reason_required"`.
- `POST /api/orders/users/:userId/static-proxy` by `USER` -> HTTP 403, `PERMISSION_DENIED`, `reasonKey: "admin_only"`.
- `POST /api/orders/users/:userId/static-proxy` by tenant admin for another tenant's user -> HTTP 403, `TENANT_SCOPE_VIOLATION`, `reasonKey: "tenant_access_denied"`.
- `POST /api/orders/users/:userId/static-proxy` with blank `reason` -> HTTP 400, `VALIDATION_ERROR`, `reasonKey: "reason_required"`.
- `POST /api/orders/users/:userId/static-proxy` reusing an idempotency key for another target user -> HTTP 409, `IDEMPOTENCY_CONFLICT`, `reasonKey: "order_idempotency_conflict"`.
- Network failure or non-JSON response in the frontend client -> `ApiError(0 or status, "network_error")`.

### 5. Good/Base/Bad Cases

- Good: Admin login calls `/api/sites/current`, then `/api/auth/login` with a real `siteId`; session token is stored in `sessionStorage`.
- Good: Tenant list returns `PageResult` instead of a raw array, so admin pages can use the same pagination contract as users/payments/audit.
- Good: Platform admin updates a tenant status and writes `tenant.status.update` audit under the target tenant id.
- Good: Payment confirmation requires a non-empty reason, writes wallet/ledger/payment state atomically, and stores `audit_logs.reason`.
- Good: Admin assisted purchase posts to `/api/orders/users/:userId/static-proxy`; the returned order belongs to `:userId`, while the audit row records `actorType=ADMIN_USER` and `meta.targetUserId`.
- Base: `/api/users` and `/api/audit` return `PageResult` with real totals and server-side filtering.
- Bad: A frontend enum option such as `CONFIRMED`, `TENANT_ADMIN`, or `PLATFORM_ADMIN` is used for filters when the database enum expects `COMPLETED` or `ADMIN_USER`.
- Bad: Catching API errors and returning `[]` makes permission or backend failures look like empty data.
- Bad: Admin UI sends `tenantId`, `walletId`, or price fields to create an assisted order; those are backend/database-owned values.

### 6. Tests Required

- Frontend unit tests: API client preserves backend `reasonKey/details`, attaches Bearer token from `sessionStorage`, and normalizes fetch failures to `network_error`.
- Frontend unit tests: Admin login reads current site id before login and handles invalid credentials.
- API integration tests: `/api/sites/current` resolves a real active site in local/test host contexts.
- API integration tests: `/api/tenants` platform-admin site scope, tenant-admin own-tenant list, detail stats, cross-site 404, status audit.
- API integration tests: `PLATFORM_ADMIN` can list `/api/users`; `TENANT_ADMIN` is tenant-scoped; `USER` is denied for `/api/users` and `/api/audit`.
- API integration tests: `POST /api/orders/users/:userId/static-proxy` covers platform admin success, tenant admin same/cross-tenant behavior, ordinary user denial, required reason, idempotency no-double-debit, and cross-user idempotency conflict.
- API integration tests: Payment confirmation with `PAYMENT_CONFIRMATION_ENABLED=true` persists `audit_logs.reason` and remains idempotent.
- Build gates: `pnpm --filter @ipeasy/api typecheck`, `pnpm --filter @ipeasy/api lint`, `pnpm --filter @ipeasy/api test`, `pnpm --filter @ipeasy/api test:integration`, `pnpm --filter @ipeasy/web typecheck`, `pnpm --filter @ipeasy/web lint`, `pnpm --filter @ipeasy/web test`, `pnpm --filter @ipeasy/web build`.

### 7. Wrong vs Correct

#### Wrong

```ts
await apiRequest('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ siteId: 'admin', email, password }),
});
```

This invents a site id and fails against the real database.

#### Correct

```ts
const current = await apiRequest<{ site: { id: string } }>('/api/sites/current');
await apiRequest('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ siteId: current.site.id, email, password }),
});
```

The frontend reads the backend-owned site source of truth before logging in.

#### Wrong

```ts
await apiRequest('/api/orders/users/' + userId + '/static-proxy', {
  method: 'POST',
  body: JSON.stringify({ resourceId, tenantId, walletId, price, reason }),
});
```

This asks the client to supply backend-owned identity, wallet, and price state.

#### Correct

```ts
await apiRequest(`/api/orders/users/${encodeURIComponent(userId)}/static-proxy`, {
  method: 'POST',
  body: JSON.stringify({ resourceId, quantity, durationDays, currency, idempotencyKey, reason }),
});
```

The API boundary identifies only the target user and purchase intent; backend use cases own tenant lookup, quote, debit, order creation, and audit.

## Scenario: Customer minimum surface APIs

### 1. Scope / Trigger

- Trigger: Customer pages need the current user id to read wallet and ledger data, but login returns an opaque session token. The frontend must not decode it as a JWT or invent a user id.
- Applies to Customer login, wallet overview, wallet ledger, and top-up order creation.

### 2. Signatures

- `GET /api/auth/me` -> `{ ownerId, ownerType, siteId, tenantId, scopes }`.
- `GET /api/sites/current` -> `{ site, announcements }`.
- `POST /api/auth/login` body `{ email, password, siteId }` -> `{ token, expiresAt }`.
- `GET /api/wallet/:userId` -> `WalletDto`.
- `GET /api/wallet/:userId/ledger?page&pageSize&type&from&to` -> `PageResult<LedgerEntryDto>`.
- `POST /api/payments` body `{ amount: string, currency: string, channel: PaymentChannel, idempotencyKey: string }` -> `PaymentOrderDto`.

### 3. Contracts

- Customer login must call `/api/sites/current` first and submit the returned `site.id`; it must not hard-code `siteId`.
- Session token from `/api/auth/login` is opaque and hash-backed. The frontend stores it in `sessionStorage.user_token` and sends it as `Authorization: Bearer <token>`.
- Customer pages must call `/api/auth/me` to derive the current `ownerId`. If `ownerType !== "USER"`, treat the session as permission denied or invalid for the Customer surface.
- Wallet overview and ledger use `ownerId` from `/api/auth/me` as `:userId`; they do not use local token decoding.
- Top-up order uses wallet currency as the source of truth for `currency`. Amount is submitted as decimal string, and `idempotencyKey` is generated per submit.
- First-stage Customer routes expose only `/login`, `/`, `/overview`, `/wallet`, and `/wallet/topup`. Static proxy purchase/copy/export routes stay out of the Customer nav and route tree until their task.

### 4. Validation & Error Matrix

- Missing `user_token` before Customer route load -> redirect `/login`.
- `/api/auth/me` returns `AUTH_REQUIRED` or another non-network auth error -> clear `user_token` and redirect `/login`.
- `/api/auth/me` network failure -> keep route load; page-level TanStack Query renders an error Alert instead of empty/default data.
- `/api/auth/me` returns non-`USER` ownerType -> `PERMISSION_DENIED / insufficient_permissions` for Customer data flow.
- `GET /api/wallet/:userId` with a different user id -> `PERMISSION_DENIED / cannot_read_other_wallet`.
- `POST /api/payments` without matching platform currency -> `CURRENCY_NOT_SUPPORTED`.
- `POST /api/payments` with non-positive amount -> `VALIDATION_ERROR`.

### 5. Good/Base/Bad Cases

- Good: Customer login reads real site id, stores opaque token, then Customer pages read `/api/auth/me` before wallet calls.
- Good: Top-up form blocks `amount <= 0`, sends `amount`, `currency`, `channel`, and `idempotencyKey`, then shows returned order id/status.
- Base: Ledger empty state shows Customer-specific copy such as `customer.ledger.empty`.
- Bad: `decodeUserToken()` is used against an opaque token to guess `userId`.
- Bad: Top-up form submits only `{ amount, channel }`, causing backend validation/runtime failure for missing `currency` or `idempotencyKey`.
- Bad: Customer `/buy` or `/proxies` route appears in first-stage route tree as a fake or unfinished surface.

### 6. Tests Required

- API integration: `GET /api/auth/me` returns current `ownerId`, `ownerType`, `siteId`, `tenantId`, and `scopes` for an opaque session.
- Frontend unit tests: Customer login reads `/api/sites/current` before `/api/auth/login`, stores `user_token`, and handles invalid credentials.
- Frontend unit tests: Wallet overview calls `/api/auth/me` before `/api/wallet/:ownerId` and does not render default zero balance on permission/API failure.
- Integration/regression: full API integration suite must keep payment order create validation and auth session behavior green.
- Build gates: `pnpm --filter @ipeasy/api typecheck`, `pnpm --filter @ipeasy/api lint`, `pnpm --filter @ipeasy/api test`, `pnpm --filter @ipeasy/api test:integration`, `pnpm --filter @ipeasy/web typecheck`, `pnpm --filter @ipeasy/web lint`, `pnpm --filter @ipeasy/web test`, `pnpm --filter @ipeasy/web build`.

### 7. Wrong vs Correct

#### Wrong

```ts
const userId = decodeUserToken()?.sub ?? '';
await userApiRequest(`/api/wallet/${encodeURIComponent(userId)}`);
```

Login returns an opaque session token, so this produces no reliable user id.

#### Correct

```ts
const current = await userApiRequest<{ ownerId: string; ownerType: string }>('/api/auth/me');
if (current.ownerType !== 'USER') throw new ApiError('PERMISSION_DENIED', 'insufficient_permissions');
await userApiRequest(`/api/wallet/${encodeURIComponent(current.ownerId)}`);
```

The backend session is the source of truth for the Customer owner id.

## Scenario: Tenant Brand Config API

### 1. Scope / Trigger

- Trigger: reseller/tenant-facing frontend needs public brand metadata before login or portal bootstrap.
- Applies to `TenantBrandController`, `TenantsRepository`, Prisma `tenants.brandConfig`, OpenAPI export, and generated contracts.

### 2. Signatures

- `GET /api/tenants/:id/brand` -> `TenantBrandDto`.
- `PUT /api/tenants/:id/brand` body `UpdateTenantBrandConfigDto` -> `TenantBrandDto`.
- `TenantBrandDto`: `{ tenantId, siteName, logoUrl?, primaryColor?, customDomain?, supportEmail? }`.
- `UpdateTenantBrandConfigDto`: `{ siteName, logoUrl?: string | null, primaryColor?: string | null, customDomain?: string | null, supportEmail?: string | null }`.

### 3. Contracts

- `GET /api/tenants/:id/brand` is public and returns only public brand fields; it must not include admin users, credentials, billing, provider, or wallet data.
- `tenants.brandConfig` is the tenant brand source of truth. If it is unset, `siteName` comes from the real `tenants.name`; optional brand fields stay absent instead of fake defaults.
- `PUT /api/tenants/:id/brand` is full replacement of the brand config. `siteName` is required; nullable optional fields clear the stored optional value.
- Swagger DTO fields that are `string | null` must use `@ApiPropertyOptional({ type: String, nullable: true })`; otherwise generated contracts may drift to `Record<string, never>`.

### 4. Validation & Error Matrix

- Missing tenant on public GET -> `NOT_FOUND / tenant_not_found`.
- Empty `siteName` -> `VALIDATION_ERROR / brand_site_name_required`.
- Non-HTTPS `logoUrl` -> `VALIDATION_ERROR / brand_logo_url_invalid`.
- Invalid `#RRGGBB` color -> `VALIDATION_ERROR / brand_primary_color_invalid`.
- Custom domain with scheme/path/port or invalid labels -> `VALIDATION_ERROR / brand_custom_domain_invalid`.
- Invalid support email -> `VALIDATION_ERROR / brand_support_email_invalid`.

### 5. Tests Required

- Unit: brand validation normalizes strings and rejects invalid URL/color/domain/email.
- API integration: public GET returns `tenants.name` when config is unset.
- API integration: TENANT_ADMIN can update own brand and writes audit.
- API integration: TENANT_ADMIN cross-tenant update returns 403; PLATFORM_ADMIN cross-site update returns 404.
- Contracts: export OpenAPI, generate contracts, and typecheck after DTO changes.

## Scenario: Public Site And Tenant Domain Resolution

### 1. Scope / Trigger

- Trigger: public pages, login, registration, or tenant brand rendering call `GET /api/sites/current`.
- Applies to `SitesController`, `SitesRepository`, public frontend bootstrap, auth shell, customer registration, and CORS configuration.

### 2. Signatures

- Request: `GET /api/sites/current` may include `x-public-host: <frontend host>`.
- Response: `{ site, tenant?: { id, code, name, brandConfig }, announcements }`.
- Registration: `POST /api/auth/register` accepts `{ email, password, siteId, tenantId? }`.

### 3. Contracts

- Host resolution order is authenticated context, `sites.domain`, `tenants.brandConfig.customDomain`, then first active site for local/test fallback.
- In split frontend/backend deployments, backend `Host` is the backend service domain. Public frontend calls must send `x-public-host` with `window.location.host`, and CORS must allow this header.
- CORS must allow configured platform origins plus active `sites.domain` and active `tenants.brandConfig.customDomain`; otherwise a browser preflight blocks the request before `/api/sites/current` can resolve the tenant.
- Tenant custom domain is public routing context only. Registration may pass `tenantId`, but backend must validate the tenant belongs to the submitted site and is `ACTIVE`.
- Public UI must prefer `tenant.brandConfig` over `site.brandConfig` for brand name, logo, primary color, support email, and public copy.
- Do not silently fall back from an invalid requested tenant to the default signup tenant; that registers users into the wrong reseller.

### 4. Validation & Error Matrix

- Host equals an active `sites.domain` -> returns site and `tenant: null`.
- Host equals an active tenant `customDomain` -> returns site plus that tenant public brand.
- Authenticated request with `ctx.tenantId` -> returns that tenant public brand.
- Register with valid `tenantId + siteId` -> user, wallet, session, and audit use that tenant.
- Register with missing/inactive/cross-site tenant -> `VALIDATION_ERROR / signup_tenant_invalid`.

### 5. Tests Required

- API integration: `GET /api/sites/current` resolves a tenant custom domain.
- Use case: registration with `tenantId` uses repository validation and writes to that tenant.
- Frontend: registration reads current site with `x-public-host` and submits returned `tenantId`.

## Scenario: Tenant Opening Creates Usable Tenant Admin

### 1. Scope / Trigger

- Trigger: platform admin opens a tenant/sub-site from admin tenant or reseller management.
- Applies to `TenantsController.create`, `TenantsRepository`, admin tenant create UI, auth login, and tenant-scoped admin pages.

### 2. Signatures

- `POST /api/tenants` body `{ code, name, adminEmail, adminPassword }`.
- Response is `TenantListItem`; the tenant admin plaintext password is accepted only in the request and is never returned.

### 3. Contracts

- Opening a tenant must create a usable `TENANT_ADMIN` account in the same transaction as the `tenants` row and `tenant.create` audit log.
- Do not create an empty tenant that nobody can log into or operate.
- The tenant admin row must use the new tenant id, `role='TENANT_ADMIN'`, `status='ACTIVE'`, and a bcrypt password hash.
- The audit metadata should include the created tenant admin id/email for traceability, but never include the plaintext password.
- Duplicate tenant code returns `VALIDATION_ERROR / tenant_code_exists`; duplicate admin email returns `VALIDATION_ERROR / admin_email_exists`.

### 4. Validation & Error Matrix

- Missing code/name/adminEmail -> `VALIDATION_ERROR / tenant_required_fields_missing`; no tenant/admin/audit rows.
- `adminPassword.length < 8` -> `VALIDATION_ERROR / password_too_weak`; no tenant/admin/audit rows.
- Successful create -> new tenant admin can immediately log in and receives `ownerType='TENANT_ADMIN'` with the new `tenantId`.

### 5. Tests Required

- API integration: platform admin creates tenant, created tenant admin logs in, and audit metadata records tenant admin id/email.
- API integration: weak password creates no tenant or admin rows.
- Frontend component: new tenant form posts `adminEmail` and `adminPassword` to `/api/tenants`.

## Scenario: Main-Site Admin Order Projection For Tenant Purchases

### 1. Scope / Trigger

- Trigger: main-site admins need to review purchases made by reseller/tenant users.
- Applies to `OrdersRepository.listForAdmin`, `OrdersController.list`, the admin order table, and order search/filter UI.

### 2. Signatures

- `GET /api/orders?page&pageSize&status&tenantId&userId&search` returns `PageResult<AdminOrderListItem>`.
- `AdminOrderListItem` includes `tenantId`, `tenantCode`, `tenantName`, `tenantAdminId`, `tenantAdminEmail`, `userId`, and `userEmail` in addition to order, provider, upstream, amount, and failure fields.

### 3. Contracts

- Do not create a duplicate "main-site order" table. `orders.siteId + orders.tenantId + orders.userId` is the source of truth for both main-site and tenant order views.
- `PLATFORM_ADMIN` with no `tenantId` filter sees all orders for the current `siteId`, including tenant/reseller purchases.
- `TENANT_ADMIN` always sees only `ctx.tenantId`; a tenant filter from the UI must not widen scope.
- The main-site admin order projection must show which tenant/reseller, which tenant admin account owns that reseller context, and which tenant user made the purchase. Read these from real relations: `orders.user.email`, `orders.user.tenant.{code,name}`, and the active `TENANT_ADMIN` under `orders.user.tenant.admin_users`.
- Search should cover order id, tenant id, tenant code/name, tenant admin email, user id/email, provider, upstream order id/status, and failure reason.

### 4. Validation & Error Matrix

- Tenant user purchase -> one `orders` row with real `tenantId` and `userId`; main-site list displays tenant name/code/id, tenant admin email, and user email/id.
- Platform admin tenant filter -> only that tenant's orders.
- Tenant admin list -> own tenant orders regardless of query tenant filter.
- Missing tenant/user relation -> surface nullable display fields; do not invent fake names.

### 5. Tests Required

- Repository unit: admin list projects tenant id/code/name, tenant admin email, and user email from real relations.
- Frontend component: admin order table renders tenant and tenant-user columns.

## Scenario: Pagination Query Parameter Coercion

### 1. Scope / Trigger

- Trigger: HTTP query params arrive as strings, while Prisma `skip` and `take` require numbers. This is an API-to-repository contract.

### 2. Signatures

- Request query: `page?: string | number`, `pageSize?: string | number`.
- Repository calculation: `Number(query.page ?? 1)`, `Number(query.pageSize ?? 20)`.
- Response: `PageResult<T>` with numeric `page`, `pageSize`, `total`, and `items`.

### 3. Contracts

- Default `page = 1`, `pageSize = 20` unless the endpoint states otherwise.
- Convert pagination values before computing `skip/take`.
- Do not pass raw query strings into Prisma.

### 4. Validation & Error Matrix

- `page=1&pageSize=10` -> HTTP 200 and numeric metadata.
- DB query failure -> `INTERNAL_ERROR`, not an empty page.
- Non-numeric values must be rejected as `VALIDATION_ERROR` when DTO validation is added; never allow `NaN` into Prisma.

### 5. Good/Base/Bad Cases

- Good: `const page = Number(query.page ?? 1); const pageSize = Number(query.pageSize ?? 20);`.
- Base: missing pagination returns first page.
- Bad: relying on JS implicit coercion or using `as any` around Prisma `take`.

### 6. Tests Required

- API integration tests with string query params for wallet ledger, payment orders, orders, and proxies.
- Regression tests for DB outage returning 500 envelope instead of empty/default data.

### 7. Wrong vs Correct

#### Wrong

```ts
const page = query.page ?? 1;
return prisma.ledger_entries.findMany({ take: query.pageSize as any });
```

#### Correct

```ts
const page = Number(query.page ?? 1);
const pageSize = Number(query.pageSize ?? 20);
return prisma.ledger_entries.findMany({
  skip: (page - 1) * pageSize,
  take: pageSize,
});
```
