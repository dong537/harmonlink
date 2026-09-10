# Frozen Frontend Legacy API

## Scenario: Frozen May Frontend Compatibility

### 1. Scope / Trigger

- Trigger: the recovered May frontend is immutable and calls the hard-coded origin `https://backend-test-0dcb.up.railway.app/api/v1`.
- Applies to `apps/api/src/modules/api-v1-compat`, the raw `/api/v1` response/error boundary, the dedicated-line legacy database projection, and `infra/legacy-api-proxy`.
- The compatibility layer translates transport shapes only. Catalog, pricing, wallet debit, inventory reservation, placement, renewal, and Bark alert rules remain owned by their canonical use cases.
- `apps/web/**` and `frozen/frontend-railway-6f71aaa1/**` must remain byte-for-byte unchanged for this rollout.

### 2. Signatures

- Public unauthenticated:
  - `GET /api/v1/health`
  - `GET /api/v1/settings/capabilities`
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/admin-login`
  - `POST /api/v1/auth/refresh`
- Authenticated:
  - `GET /api/v1/auth/me`
  - `POST /api/v1/auth/logout`
  - `GET /api/v1/users/profile`
- Customer dedicated-line:
  - `GET /api/v1/dedicated-skus`
  - `GET /api/v1/dedicated/locations`
  - `POST /api/v1/dedicated/preview`
  - `POST /api/v1/dedicated/purchase-v2`
  - `GET /api/v1/dedicated/my`
  - `POST /api/v1/dedicated/:legacyId/renew`
  - `POST /api/v1/dedicated/:legacyId/lock`
  - `GET /api/v1/dedicated/:legacyId/qrcode`
  - `PATCH /api/v1/dedicated/:legacyId/remark`
- Database migration: `20260815030000_add_legacy_dedicated_line_fields` adds `dedicated_lines.legacyId SERIAL UNIQUE` and nullable `legacyRemark`.
- Proxy runtime: `LEGACY_PROXY_TARGET=https://backend-production-43893.up.railway.app node infra/legacy-api-proxy/server.mjs`.

### 3. Contracts

- Environment:
  - `LEGACY_API_V1_ENABLED` defaults to `false` and must be exactly `true` to expose compatibility behavior.
  - `LEGACY_API_SITE_ID` is required when the compatibility API is enabled in production. Hostname inference and a default site are forbidden.
  - `LEGACY_PROXY_TARGET` is required by the old-host proxy and must use HTTPS in production.
- `/api/v1` successful responses are raw JSON, never the platform `{code,msg,data,requestId}` envelope.
- `/api/v1` errors are `{statusCode,message,errorCode,timestamp,path}`.
- Legacy login accepts `{email,password}` only. The configured site ID supplies tenant scope.
- Login returns `{access_token,refresh_token,user}`. Refresh tokens start with `rt_`, are stored only as SHA-256 hashes, rotate on refresh, and are rejected by bearer authentication.
- Dedicated preview delegates to `SkuQuoteUseCase` with authenticated `siteId`, `tenantId`, `userId`, `quantity=1`, and the wallet currency.
- Dedicated purchase delegates to `CreateDedicatedLineOrderUseCase`. It must not call a provider adapter directly or duplicate stock, pricing, wallet, placement, or Bark logic.
- SKU protocol values are lowercase (`vless`, `vmess`, `shadowsocks`, `socks5`, `http`) because the frozen frontend filters by lowercase values.
- Legacy line routes accept only the scoped numeric `legacyId`; UUID-to-number coercion is forbidden. Resolution always includes `siteId + tenantId + userId`.
- Legacy line route IDs must match the canonical decimal grammar `/^[1-9]\\d*$/` before conversion. Reject whitespace, leading zeros, signs, exponent notation, decimal notation, zero, and values outside JavaScript's safe-integer range with `VALIDATION_ERROR / dedicated_line_id_invalid`.
- Provider/order/projection workers remain disabled during compatibility smoke checks. Enabling them is a separate production gate.

### 4. Validation & Error Matrix

- Compatibility disabled -> `404 NOT_FOUND`, `legacy_api_disabled`.
- Enabled without production site ID -> process configuration guard fails before listening.
- Invalid/expired/replayed refresh token -> `401 AUTH_REQUIRED`.
- `rt_` token used as bearer access token -> `401 AUTH_REQUIRED`, `refresh_token_not_allowed`.
- Missing buyer tenant -> `403 PERMISSION_DENIED`, `tenant_required`.
- Invalid country/protocol/duration/legacy ID -> `400 VALIDATION_ERROR`.
- No fresh dedicated inventory -> `422 UPSTREAM_OUT_OF_STOCK`; no order, debit, reservation, or provider job; one deduplicated Bark outbox event.
- Lock request while no canonical upstream lock use case exists -> `409 UNSUPPORTED_CAPABILITY`; never report a fake success.
- Ready line without a deliverable URI -> `422 DEDICATED_LINE_CONFIG_INVALID`.
- Proxy body over 2 MiB -> `413 request_body_too_large`; unavailable target -> `502 legacy_proxy_upstream_unavailable`.

### 5. Good/Base/Bad Cases

- Good: frozen frontend -> old backend hostname proxy -> current backend `/api/v1` adapter -> canonical use case -> PostgreSQL.
- Good: a missing fresh SK5 route creates only the inventory-low outbox event and returns a typed legacy error.
- Base: a newly reserved order returns `pending=true`; delivery workers stay disabled until external smoke tests pass.
- Bad: changing the frozen bundle API base URL or rebuilding the frontend to avoid the hard-coded hostname.
- Bad: implementing stock checks, prices, wallet debit, or provider ordering directly in the compatibility controller.
- Bad: allowing refresh tokens through `JwtStrategy`, guessing a site from the request host, or returning a successful lock response without a real control-plane operation.

### 6. Tests Required

- Unit: raw `/api/v1` success/error boundary, capability flags, lowercase SKU protocols, numeric line mapping, connection URI, refresh-token bearer rejection, controller quote/order delegation.
- Real PostgreSQL integration: login without `siteId`, hashed access/refresh sessions, refresh rotation/replay rejection, real catalog quote, and out-of-stock Bark behavior with zero external jobs.
- Migration: apply the full migration chain to an isolated PostgreSQL schema and verify `legacyId` generation.
- Proxy: preserve method, path, query, body, authorization, upstream status, and response headers; verify `/healthz`, 413, and 502 behavior.
- Production smoke: current backend `/health`, `/ready`, `/api/v1/health`, raw capabilities, legacy unauthenticated 401, old-host proxy health, CORS preflight from the frozen frontend origin, and frozen frontend login/catalog/preview.
- Static guard: `git diff --name-only -- apps/web frozen/frontend-railway-6f71aaa1` must be empty.

### 7. Wrong vs Correct

#### Wrong

```ts
const siteId = request.hostname === oldHost ? DEFAULT_SITE_ID : request.hostname;
const stock = await provider.getStock(body.country);
if (stock > 0) await provider.buy(body);
return { status: 'active' };
```

#### Correct

```ts
const siteId = config.get('LEGACY_API_SITE_ID');
const result = await createDedicatedLineOrder.execute(context, {
  skuCode,
  countryCode,
  quantity: 1,
  durationDays,
  currency: wallet.currency,
  idempotencyKey,
});
return { ...result, status: 'reserved', pending: true };
```

## Scenario: Legacy Ticket IDs And Notification Filters

### 1. Scope / Trigger

- Trigger: the frozen client parses ticket route parameters with `Number(...)`
  and requests notification pages with `read=true|false`.
- Applies to `/api/v1/tickets`, `/api/v1/tickets/:legacyId`, admin ticket routes,
  notification list routes, `tickets.legacyId`, and the ticket/notification
  repositories.

### 2. Signatures

- Database: `tickets.legacyId Int @unique @default(autoincrement())`.
- Customer ticket resolver:
  `resolveOwnedLegacyId(legacyId, { ownerId, siteId, tenantId }) -> UUID`.
- Admin ticket resolver:
  `resolveLegacyIdForScope(legacyId, { siteId, tenantId }) -> UUID`.
- Notification list query: `readState: 'read'|'unread'` or legacy `read=true|false`.

### 3. Contracts

- Canonical ticket APIs keep UUID `id`; only the compatibility boundary replaces
  the response `id` with the persisted numeric `legacyId`.
- Every legacy ID lookup includes the caller's site and owner/tenant scope.
  Cross-scope IDs return `404 ticket_not_found` and never reveal ownership.
- Tenant-admin order and ticket list routes require a non-null authenticated
  `tenantId`; a malformed tenant-admin context must return
  `403 tenant_context_required` rather than allowing a site-wide query.
- Notification `read=true` maps to `where.readAt != null`; `read=false` maps to
  `where.readAt = null`. The same predicate must be used by `count` and
  `findMany`, so `total` is the filtered total.
- Ticket notification related IDs are bulk-projected to numeric IDs only after
  an owner-scoped lookup. Missing or out-of-scope related tickets are omitted,
  not replaced with UUIDs or fabricated numbers.

### 4. Validation & Error Matrix

- Non-positive, non-integer, or unsafe numeric ticket ID ->
  `400 VALIDATION_ERROR / ticket_id_invalid`.
- Numeric ID outside the customer/admin scope -> `404 NOT_FOUND /
  ticket_not_found`.
- Invalid notification read value -> no read predicate; never reinterpret it as
  an empty result or a successful mutation.
- Migration not applied -> deployment is rejected before enabling the frozen
  ticket routes.

### 5. Good / Base / Bad Cases

- Good: ticket `legacyId=17` resolves to its UUID only for the owning user and
  returns `id: 17` through `/api/v1`.
- Base: canonical ticket DTOs expose `legacyId` as metadata while UUID identity
  remains the source of truth for use cases.
- Bad: hashing UUIDs, keeping an in-memory UUID-to-number map, or converting a
  UUID with `Number(...)`.

### 6. Tests Required

- Unit: numeric parsing, customer/admin scope resolution, and bulk notification
  ticket projection.
- Repository: assert the exact `where` predicate appears in both `count` and
  `findMany` for read and unread pages.
- PostgreSQL integration: migration creates unique IDs, customer/admin routes
  round-trip numeric IDs, and notification links resolve within scope.

### 7. Wrong vs Correct

#### Wrong

```ts
return { id: Number(ticket.id) };
```

#### Correct

```ts
const id = await tickets.resolveOwnedLegacyId(legacyId, ownerScope);
return toLegacyTicketDetail(await getTicket.execute(ctx, id));
```

## Scenario: Dedicated-Line User Zones

### 1. Scope / Trigger

- Trigger: the frozen dedicated-line client groups orders by a user-owned Zone
  and sends `zoneCode` during preview, purchase, or renewal.
- Applies to the `/api/v1/zones` compatibility routes, dedicated-line order and
  renewal use cases, and the `user_zones`/order/line database relations.

### 2. Signatures

- `GET /api/v1/zones?includeArchived=true` -> raw `Zone[]`.
- `POST /api/v1/zones`, `PATCH /api/v1/zones/:id`,
  `POST /api/v1/zones/:id/archive`, `DELETE /api/v1/zones/:id`.
- `GET /api/v1/admin/users/:legacyUserId/zones` resolves the persisted numeric
  user ID with `siteId + tenantId` scope.
- `zoneCode?: string` is accepted by preview, purchase, and renewal; a valid
  value resolves through `ResolveActiveZoneUseCase` before money or stock work.

### 3. Contracts

- PostgreSQL `user_zones` is the source of truth. Codes are normalized to
  lowercase, restricted to `[a-z0-9_-]{2,64}`, and unique within
  `siteId + tenantId + userId`; `sortOrder` is an integer from 0 through 999.
- Only `ACTIVE` Zones can be selected for new purchases or renewals. The chosen
  Zone ID is persisted on `dedicated_line_orders.zoneId` and inherited by
  `dedicated_lines.zoneId` during fulfillment; placement rows do not duplicate
  Zone identity.
- Compatibility responses use lowercase `active`/`archived` statuses and raw
  arrays. Canonical UUIDs remain the source of truth.

### 4. Validation & Error Matrix

- Non-string or blank `zoneCode` -> `400 VALIDATION_ERROR / zone_code_invalid`.
- Unknown Zone -> `404 NOT_FOUND / zone_not_found`.
- Archived Zone selected for purchase/renewal -> `409 / zone_archived`.
- Duplicate scoped code -> `409 / zone_code_taken`.
- Delete with order/line references -> `409 / zone_has_dependencies`.
- Cross-site, cross-tenant, or cross-user lookup -> scoped `404`; never fall
  back to an unscoped row or fabricate a Zone.

### 5. Good / Base / Bad Cases

- Good: `zoneCode=" SHORT-VIDEO "` resolves to the caller's lowercased active
  Zone and the reservation stores only its scoped UUID.
- Base: archived Zones remain visible only when explicitly requested and retain
  links from historical orders and lines.
- Bad: accepting a client-supplied Zone UUID without ownership scope, silently
  dropping a non-string code, or copying `zoneId` into placement records.

### 6. Tests Required

- Unit: code normalization, blank/non-string input, duplicate/archive/delete
  rules, scope isolation, and controller raw response mapping.
- Integration: all migrations, Zone ownership boundaries, order persistence,
  and fulfillment inheritance from order to line.
- Static guard: `apps/web/**` remains byte-for-byte unchanged.

### 7. Wrong vs Correct

#### Wrong

```ts
const zoneId = body.zoneId ?? null;
await prisma.dedicated_line_orders.create({ data: { zoneId } });
```

#### Correct

```ts
const zone = await resolveActiveZone.execute(scope, body.zoneCode);
await reserveStock.execute({ ...input, zoneId: zone?.id ?? null });
```

## Scenario: Frozen Bundle Same-Origin Deployment

### 1. Scope / Trigger

- Trigger: publishing the recovered Vite bundle without rebuilding `apps/web`.
- Applies to the generated deployment copy of the frozen bundle and the web
  service that proxies same-origin `/api` requests.
- The source frontend and its visual output remain immutable; only a deployment
  copy may receive the minimal API-origin rewrite required for same-origin use.

### 2. Signatures

- Entry document: `GET /` or `GET /login` -> `index.html`.
- Browser API base: `/api/v1` in the entry/shared module.
- Lazy chunks: relative imports to the shared module filename
  `./index-D-BZDcpl.js`.
- Web proxy: `/api/*` -> `WEB_API_PROXY_TARGET`.

### 3. Contracts

- The deployed entry module must not contain the Railway backend origin.
- The entry document must reference the content-hashed replacement asset.
- The original shared module filename must remain available when lazy chunks
  import it; its contents must be the same rewritten module, not the old URL.
- Every path listed by the entry module's dynamic import map must return HTTP
  200, including `Login-*`, `Landing-*`, vendor chunks, and their CSS files.
- Browser requests for authentication and capability discovery must stay on the
  web origin; the browser must not call the API service origin directly.

### 4. Validation & Error Matrix

- Railway origin remains in any deployed JS -> deployment is invalid; do not
  proceed.
- Entry hash changed but shared filename missing -> lazy route 404 and blank
  auth page; restore the compatibility filename and redeploy.
- Static asset 404 or module parse error -> deployment is invalid even if `/`
  returns 200.
- Same-origin invalid login -> HTTP 401 with `invalid_credentials`, not a
  browser CORS/network error.
- Capability request -> HTTP 200 with dedicated flags and residential flags
  matching the API configuration.

### 5. Good/Base/Bad Cases

- Good: rewrite only the generated entry/shared module, retain the chunk import
  graph, and verify the login form renders in a clean browser context.
- Base: an unauthenticated dedicated route redirects to the public landing page
  after all lazy chunks load.
- Bad: delete the old shared filename after renaming the entry file; direct HTTP
  checks can pass while `Login-*` fails during dynamic import.
- Bad: point the bundle at `https://365proxy-api.zeabur.app` and rely on CORS
  instead of the web proxy.

### 6. Tests Required

- Static: assert zero Railway-origin occurrences, a valid JS parse, and one
  matching entry reference.
- Asset graph: extract every dynamic-import asset and assert HTTP 200 for each
  from the deployed web origin.
- Browser: clean-context `/login` and `/proxy/dedicated/buy` smoke with zero
  console/page errors; submit invalid credentials and assert same-origin 401.
- API: `/healthz`, `/api/v1/settings/capabilities`, and the login endpoint must
  be checked after deployment.

### 7. Wrong vs Correct

#### Wrong

```text
rename index-D-BZDcpl.js -> index-zeabur-<hash>.js
delete index-D-BZDcpl.js
```

#### Correct

```text
rewrite the API origin in the generated module
publish the new content-hashed entry asset
retain index-D-BZDcpl.js as the rewritten shared-module compatibility asset
verify the complete lazy-import graph in a clean browser
```

## Scenario: Zeabur Docker rollout verification

### 1. Scope / Trigger

- Trigger: deploying compatibility-layer changes to the existing Zeabur API service.
- Applies to the API Docker context, database migration step, Worker runtime check,
  and the Web same-origin smoke suite.

### 2. Signatures

- API service must be redeployed with the existing `--service-id`; omitting it creates
  a duplicate service.
- The API context must place `apps/api/Dockerfile` at the context root when the
  repository root Dockerfile is the Worker image.
- Release verification endpoints: `GET /health`, `GET /ready`,
  `GET /api/v1/health`, and `GET /api/v1/settings/capabilities`.
- Migration command: `cd /app && pnpm --filter @ipeasy/db migrate:deploy`.

### 3. Contracts

- A deployment is not accepted until the selected Docker deployment is `RUNNING`,
  runtime logs show `API listening on port 8080`, and `/ready` reports both DB and
  Redis as `ok`.
- A stale `RELEASE_GIT_SHA` environment variable is not source-version evidence;
  deployment ID, build log, route map, and smoke checks must be recorded instead.
- Worker fulfillment flags stay disabled until provider credentials and controlled
  acceptance orders are verified.

### 4. Validation & Error Matrix

- Node/Nixpacks deployment or `turbo: not found` -> reject and redeploy via the
  verified Docker context.
- Missing migration -> run the authenticated service command before traffic cutover.
- Provider inventory `HTTP 401` / `upstream_auth_failed` -> keep that provider
  unavailable; do not synthesize stock or enable fulfillment.
- Any asset graph 404, old Railway origin, or browser page error -> reject rollout.

### 5. Good/Base/Bad Cases

- Good: existing API service receives a Docker deployment, migrations are idempotent,
  same-origin login returns a typed 401 for invalid credentials, and all lazy assets
  return 200.
- Base: Worker is healthy while fulfillment is disabled and provider sync failures
  are visible in logs.
- Bad: trusting a stale release SHA, enabling fulfillment after an upstream 401, or
  accepting `/` HTTP 200 while lazy chunks fail.

### 6. Tests Required

- Deployment list and runtime/build logs for the exact deployment ID.
- Authenticated migration command with a no-pending-migrations result.
- API/Web health, readiness, capability, and unauthenticated auth checks.
- Clean browser invalid-login smoke and complete Vite asset graph HTTP checks.
- Worker PID/command and filtered runtime log check.

### 7. Wrong vs Correct

#### Wrong

```text
read the old RELEASE_GIT_SHA and declare the new source deployed
```

#### Correct

```text
record the Docker deployment ID and build/runtime evidence
run the migration command
verify /ready, same-origin auth/capabilities, the lazy asset graph, and Worker PID
```
