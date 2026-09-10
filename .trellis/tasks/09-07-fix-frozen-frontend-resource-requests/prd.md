# 修复冻结前端专线资源请求

## Goal

让 Zeabur 上的冻结五月版 Vue 前端通过同源 `/api/v1` 可靠完成专线平台的认证、专线目录/购买/管理、订单、通知和工单流程。冻结前端源码和视觉保持不变；兼容层只转换传输契约，库存、报价、钱包、订单和履约继续由现有 canonical use case 负责。

## Requirements

* 保持 `apps/web/**` 和冻结部署 bundle 不变；只允许部署副本做已验证的同源 API 代理/重写。
* `/api/v1` 开关必须严格受 `LEGACY_API_V1_ENABLED` 控制；生产启用时必须配置 `LEGACY_API_SITE_ID`。
* 所有已认证的 legacy customer/admin 资源都必须验证 `ctx.siteId === LEGACY_API_SITE_ID`，不允许其他站点的有效会话访问固定站点兼容接口。
* 通知 `read=true`、`read=false` 的筛选必须在 repository 的 `where` 和 `count` 中完成，分页总数必须是过滤后的真实总数。
* 工单兼容接口必须向冻结前端返回稳定数字 `id`，并把数字 ID 持久化到 `tickets.legacyId`；列表、创建、详情、回复、关闭、管理员接口和工单通知都要做作用域内双向解析。
* 工单数字 ID 解析必须同时限制 `siteId`、tenant/owner scope；非法、越权或不存在的 ID 返回 typed 400/404，不能 hash、内存映射或直接把 UUID 转数字。
* 集成测试只能接受显式 `DATABASE_URL_TEST`，不得回退到 `DATABASE_URL`。
* 专线库存、报价、钱包、下单、Bark 和 worker 状态不得在兼容控制器中重复实现；静态/动态/住宅历史接口不得用假空数据或成功 alias 覆盖。

## Acceptance Criteria

* [ ] API unit tests cover fixed-site mismatch, disabled API, notification read filters, numeric ticket mapping and unsupported capability errors.
* [ ] Prisma schema and migration create a unique auto-increment `tickets.legacyId` for existing and new rows.
* [ ] Real PostgreSQL integration tests prove customer/admin ticket numeric ID round trips and notification ticket links resolve to numeric IDs within scope.
* [ ] Notification pages return correct `total` and page contents for read/unread filters.
* [ ] `DATABASE_URL_TEST` is required by integration setup and a missing value fails before any destructive query.
* [ ] API typecheck, focused tests, build and applicable lint pass; no `apps/web/**` files are modified.
* [ ] Zeabur active Docker deployment passes `/health`, `/ready`, same-origin `/api/v1/settings/capabilities`, unauthenticated 401 checks, and clean browser asset/API smoke.
* [ ] No production credential, token, password or secret is written to the repository or response.

## Definition of Done

* Tests added before implementation and observed failing for each changed behavior.
* Backend specs and task verification notes updated.
* Deployment is performed only from the verified Docker build path; failed Node.js/Turbo path is not reused.
* Any unverified flow requiring a real customer credential is explicitly reported as blocked rather than simulated.

## Technical Approach

1. Add red tests for site scope, repository-level notification filtering, numeric ticket mapping, notification ticket links, and strict test database configuration.
2. Add `tickets.legacyId` to Prisma schema and an additive migration; expose it as optional metadata in canonical ticket DTOs so the current React contract keeps UUID `id`.
3. Add scoped repository resolvers for legacy ticket IDs and use them only at the `/api/v1` boundary. Map legacy response IDs to numbers while canonical APIs retain UUIDs.
4. Add a scoped bulk ticket-ID projection for notification mapping to avoid per-row queries and preserve pagination.
5. Run focused tests, typecheck/build, Trellis quality checks, then deploy and smoke test the active Zeabur Docker service.

## Decision (ADR-lite)

**Context**: The frozen client executes `Number(route.params.id)` for ticket details. Returning canonical UUIDs makes the detail route silently skip its request, while a temporary hash or in-memory map is not stable across deployments.

**Decision**: Persist a unique numeric legacy ID in PostgreSQL and resolve it only with the caller's site/tenant/owner scope at the compatibility boundary.

**Consequences**: One additive migration is required before ticket detail is production-ready. Canonical APIs keep UUID identity, while `/api/v1` returns numeric IDs. Existing tickets receive IDs during migration and new tickets use the database sequence.

## Out of Scope

* Rebuilding or visually changing the Vue/React frontend.
* Implementing the full historical 189-endpoint bundle surface.
* Enabling residential, static, dynamic, referral, billing or admin capabilities that have no canonical source of truth.
* Creating fake production users, tokens, inventory, orders or notifications for smoke tests.
* Activating provider/worker fulfillment before separate production gates pass.

## Zone Contract Addendum (2026-09-09)

### Goal and success criteria

Restore the frozen dedicated-line pages that currently fail during initialization because
`GET /api/v1/zones` is missing. The compatibility API must expose real, persisted user-owned
order groups without changing `apps/web/**`, inventing inventory, or changing 3x-ui placement.

Success means the frozen bundle can list, create, update, archive and delete Zones, and a valid
`zoneCode` is validated and persisted through preview/order/renewal and fulfillment. Cross-site,
cross-tenant and cross-user access must fail with a typed error.

### Source of truth and module boundaries

* PostgreSQL `user_zones` is the source of truth for Zone identity, code, lifecycle and ordering.
* `zones` repository and use cases own normalization, validation, ownership checks, archive and
  delete rules. `/api/v1` controllers only translate the frozen transport contract.
* `dedicated_line_orders.zoneId` records the selected Zone at purchase time.
* `dedicated_lines.zoneId` inherits the order Zone when fulfillment succeeds and is the Zone
  projection used by line management.
* `dedicated_line_placements` must not duplicate `zoneId`; node selection remains owned by
  `line_placement_policies` and is independent of user grouping.
* A persistent numeric `users.legacyId` is the only bridge for the frozen admin route that calls
  `Number(userId)`. Resolution must include `siteId + tenantId + legacyId`; hashes, casts and
  process-local mappings are forbidden.

### Interface contract

Frozen-client endpoints:

* `GET /api/v1/zones?includeArchived=true`
* `POST /api/v1/zones`
* `PATCH /api/v1/zones/:id`
* `POST /api/v1/zones/:id/archive`
* `DELETE /api/v1/zones/:id`
* `GET /api/v1/admin/users/:legacyUserId/zones`

Zone list responses are raw arrays, not an envelope. Each row includes `id`, `code`, `name`,
`description`, `status`, `sortOrder`, and `createdAt`; compatibility status values are lowercase
`active` or `archived`. `code` is normalized to lowercase, must be 2-64 characters using only
letters, digits, `_` and `-`, and is unique within `siteId + tenantId + userId`. `sortOrder` is an
integer from 0 through 999.

Preview, create-order and renewal inputs may carry `zoneCode`. When present it must resolve to an
ACTIVE Zone owned by the authenticated user in the active site and tenant. Archived Zones cannot
be selected for new purchases or renewals. Existing orders and lines retain archived Zone links.
Permanent deletion is rejected while any order or line references the Zone.

### Data flow and errors

`frozen web -> /api/v1 adapter -> Zone use case -> Zone repository -> PostgreSQL`.

For purchases: `zoneCode -> scoped active Zone -> canonical preview/create/renew use case ->
dedicated_line_orders.zoneId -> fulfillment -> dedicated_lines.zoneId`. Provider inventory and
3x-ui placement stay on their existing canonical paths. Invalid input, missing/archived Zone,
scope mismatch, duplicate code and dependency-protected deletion return typed `AppError` values;
no catch-to-empty-array, fallback Zone or default success is allowed.

### Additional acceptance criteria

* [ ] Prisma schema and additive migration create `user_zones`, persistent unique user legacy IDs,
      and Zone foreign keys on orders and lines; placement has no Zone copy.
* [ ] Unit tests cover normalization, duplicate code, archive filtering, archived selection,
      dependency-protected deletion, scope boundaries and raw legacy response mapping.
* [ ] Disposable PostgreSQL integration tests prove site/tenant/user isolation, numeric admin user
      resolution, order persistence and fulfillment inheritance.
* [ ] Preview, create-order and renewal share the same scoped active-Zone validation contract.
* [ ] `apps/web/**` remains byte-for-byte untouched and residential capabilities stay disabled.

## Technical Notes

* Correct production web origin: `https://365pro.zeabur.app`.
* API service is healthy at `https://365proxy-api.zeabur.app`; current active deployment is the Docker deployment, not the failed Node.js/Turbo deployment.
* Frozen bundle currently calls hard-coded Railway origin when used directly; Zeabur deployment copy already uses same-origin `/api/v1` and must retain the lazy import graph.
* Relevant code: `apps/api/src/modules/api-v1-compat`, tickets/notifications repositories and use cases, `packages/db/prisma/schema.prisma`, and `apps/api/src/test-utils/integration-setup.ts`.
* Existing audit evidence: `.tmp/runtime-zeabur-audit.md` and the session browser/repository smoke reports; these are local working artifacts and are not production secrets.
