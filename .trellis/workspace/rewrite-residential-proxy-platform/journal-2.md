# Journal - rewrite-residential-proxy-platform (Part 2)

> Continuation from `journal-1.md` (archived at ~2000 lines)
> Started: 2026-08-18

---



## Session 59: 浏览器门禁与生产状态复核

**Date**: 2026-08-18
**Task**: 浏览器门禁与生产状态复核
**Branch**: `master`

### Summary

复核后 Railway backup count 仍为 0，backend/worker/frontend 旧部署仍运行且 /ready DB/Redis 正常。仓库 E2E 实际启动但因缺少 DATABASE_URL_TEST/DATABASE_URL 在 server 启动阶段停止；未引入 mock DB，未上线或改节点。

### Main Changes

(Add details)

### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 63: 修复 Zeabur 线上登录与冻结前端资源图

**Date**: 2026-09-06
**Task**: fix-online-auth-deploy
**Target**: Zeabur project `untitled`, production web service
`6a7c372d2d4cb87f2ba3ad35`

### Findings

- The recovered bundle still used
  `https://backend-test-0dcb.up.railway.app/api/v1`; cross-origin login was
  blocked by CORS.
- The current API was healthy and its `/api/v1` compatibility capability was
  enabled, so the failure was at the frontend origin boundary.
- Renaming only the entry module exposed a second issue: lazy chunks import the
  historical shared filename `index-D-BZDcpl.js`. Removing that filename made
  `/login` and the public landing route render blank despite an HTTP 200 entry.

### Changes

- Rewrote only the generated deployment copy's API base to `/api/v1`.
- Published the content-hashed entry asset
  `index-zeabur-92e5166011fc.js` and retained the rewritten historical shared
  module filename for the lazy-import graph.
- Did not modify `apps/web` source, page structure, styles, API production
  secrets, database, or worker configuration.

### Verification

- `node --check` passed for the rewritten entry module.
- Deployed entry has zero Railway-origin occurrences and serves with immutable
  caching; old missing asset behavior was corrected by the compatibility copy.
- `/healthz` -> 200; `/api/v1/settings/capabilities` -> 200 with dedicated UI
  and purchase enabled and residential UI/purchase disabled.
- Clean Playwright browser: `/login` renders its form, lazy assets have no 404,
  and `/proxy/dedicated/buy` follows the expected unauthenticated redirect.
- Invalid login submission stays on `/login`, calls the same-origin
  `/api/v1/auth/login`, and receives HTTP 401 `invalid_credentials` with no
  page errors. A valid customer credential was not available for this smoke
  run, so successful-session navigation remains an explicit residual check.

## Session 60: Zeabur openui overwrite verification

**Date**: 2026-08-19
**Task**: Explicitly overwrite the Zeabur `openui` service and verify the result.

### Evidence

- Target context was set and verified: project `untitled`, environment `production`, service `openui`.
- Local `npm run predeploy:check` passed.
- Direct deploy completed successfully and restarted the service.
- The uploaded monorepo caused the existing `PREBUILT_V2` service to enter `CRASHED`; runtime/build log endpoints returned no usable diagnostic output from the legacy CLI.
- The service was restored with the previously documented known-good OpenUI image tag. Final status is `RUNNING`.
- Zeabur reports no public domain. Temporary expose returned HTTP 422, and `openui.zeabur.internal` is not resolvable from this workstation; public HTTP smoke testing is therefore blocked.

### Safety

- No environment variable, token, password, node configuration, or repository cleanup operation was performed.
- Do not claim public production smoke success until a public domain or an in-network execution path is provided.

## Session 61: Zeabur split-service deployment

**Date**: 2026-08-19
**Task**: Deploy the 365Proxy monorepo to the dedicated `api`, `worker`, and `web` services.

### Evidence

- Existing service IDs were resolved from the Zeabur project export; `openui` was not modified in this phase.
- Direct deployments completed for `api`, `worker`, and `web`; all three returned `RUNNING` after rollout.
- The existing web domain `365proxy-untitled.zeabur.app` returned HTTP 200 for `/healthz` and `/`.
- Web-to-API routing returned HTTP 200 for `/api/sites/current`.
- API generated domain `365proxy-api.zeabur.app` was provisioned; `/api/sites/current` returned HTTP 200.
- Direct `/health` and `/ready` requests on the API domain returned HTTP 404, not a readiness response. This is an unresolved route/proxy configuration issue and must not be interpreted as DB/Redis readiness evidence.
- Worker remained `RUNNING`; dedicated execution flags remain disabled.

### Remaining production gates

- Run Prisma migrations through an authenticated Zeabur service command or release job after a verified database backup.
- Fix or expose the API health/readiness route and then require `/ready` to report DB and Redis checks as `ok`.
- Verify worker runtime logs/heartbeat through a supported Zeabur log or exec path.
- Keep dedicated line execution disabled until migration, OpenUI HTTPS/Bearer checks, and controlled order acceptance are complete.

### Correction

- After the rollout settled, `https://365proxy-api.zeabur.app/ready` was rechecked and returned HTTP 200 with both DB and Redis checks `ok`.
- The installed Zeabur CLI is 0.5.4 and has no `service exec` command. Prisma migration execution therefore remains pending a supported release-job or dashboard command path.

## Session 62: Dedicated line launch gate

**Date**: 2026-08-19

- API `/ready` returned HTTP 200 with DB and Redis checks `ok`.
- Public dedicated-line and control-plane endpoints returned HTTP 401 without an authenticated operator context.
- No SKU, node, upstream account, admin credential, or API token was guessed or used.
- Dedicated execution flags remain disabled; no real line was opened and no purchase/test order was submitted.
- A real line test requires an authenticated operator token, a selected SKU/node, verified upstream inventory, and completed migration/release-job evidence.

## Session 65: Final frozen-frontend compatibility verification

**Date**: 2026-09-08
**Task**: fix-frozen-frontend-resource-requests
**Branch**: `railway-fixes-merge`

### Verification

- API unit: 111 files / 689 tests passed.
- Web unit exited 0; API/Web/DB typecheck, API/Web lint, API/Web build, and
  compatibility focus (7 files / 59 tests) passed.
- API `/health` and `/ready` are 200 with DB/Redis checks `ok`; web `/healthz`,
  same-origin `/api/v1/health`, capabilities, and typed unauthenticated 401
  checks passed.
- The deployed Vite graph contains 132 assets and every asset returned 200 after
  one transient TLS retry. `apps/web/**` has no diff.

### Production boundary

- Worker is healthy but fulfillment, line projection/migration/health, and Bark
  execution remain explicitly disabled.
- 985 inventory sync is healthy; IPIPD inventory sync remains blocked by upstream
  HTTP 401. No stock or order success was fabricated.
- Full purchase browser E2E remains blocked until a real customer credential,
  populated delivery routes/lines, verified control nodes, and corrected IPIPD
  credentials are provided.


## Session 60: 修复充值工单与仪表盘线上流程

**Date**: 2026-08-19
**Task**: 修复充值工单与仪表盘线上流程
**Branch**: `master`

### Summary

修复旧静态前端的充值订单入口与布局、移除汇款凭证输入并保留系统幂等 ID；对齐工单创建/回复/关闭 API、分页 items 和 UUID 路由；修复仪表盘 CTA 跳转。Zeabur web 已覆盖部署并通过线上 Playwright smoke，API 4xx=0、console errors=0。API typecheck 通过，记录既有 web 源码类型错误。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `1c27e73` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 61: Fix 5 production-readiness defects: auth scopes, OPERATOR mapping, maintenance, email schema

**Date**: 2026-09-05
**Task**: Fix 5 production-readiness defects: auth scopes, OPERATOR mapping, maintenance, email schema
**Branch**: `railway-fixes-merge`

### Summary

Fixed 5 blocking defects: (1) API key scopes stored but never enforced - added ScopeGuard with session-caller exemption, landed on res-static 15 routes; (2) OPERATOR role silently promoted to PLATFORM_ADMIN in jwt.strategy; (3) maintenance middleware matched all sites via empty OR branch - delegated to SitesRepository.resolvePublicContext; (4) api-v1-compat test encryption key mismatch; (5) email globally unique instead of per-site - migrated to @@unique([siteId, email]). Also fixed clientEmail missing in v1-compat delivery, unified auth input validation. Verification: typecheck clean, lint clean, unit 662/662, integration 241/241 (3 new spec files, 23 new tests).

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `27c99f8` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 64: Frozen frontend compatibility rollout smoke

**Date**: 2026-09-08
**Task**: fix-frozen-frontend-resource-requests
**Branch**: `railway-fixes-merge`

### Summary

Completed the local quality gate and redeployed the compatibility-layer API to the
existing Zeabur API service through the verified Docker context. The frozen frontend
source was not modified.

### Verification

- API unit: 111 files / 689 tests passed.
- Isolated PostgreSQL: 21 migrations and 29 compatibility/ticket/notification
  integration tests passed.
- API Docker deployment is `RUNNING`; runtime listens on port 8080 and production
  migration reports no pending changes.
- API/Web health, readiness, capabilities, unauthenticated 401, same-origin invalid
  login, and all 132 Vite entry/lazy assets passed.
- Worker PID 1 is `node dist/worker/src/main.js` and the service is stable.

### Remaining gates

- IPIPD inventory synchronization returns upstream HTTP 401 and must be fixed before
  enabling that provider.
- Fulfillment execution remains disabled pending controlled provider acceptance tests.
- Historical frontend routes without a canonical source of truth remain explicitly
  unsupported; no fake data or success aliases were added.

## Session 65: Release security gate recheck

**Date**: 2026-09-08
**Task**: fix-frozen-frontend-resource-requests
**Branch**: `railway-fixes-merge`

### Summary

Reworked the tracked-file secret scan so release checks distinguish real remote
credentials from local/test fixtures. Removed a remote database credential from a
historical operations note and kept the frozen frontend untouched.

### Verification

- Secret scanner unit tests: 6 passed, including weak-password remote PostgreSQL detection.
- Full tracked-file secret scan: passed with no high-confidence findings.
- API unit: 111 files / 689 tests passed; Web unit exited 0.
- API/DB/Web typecheck, API/Web lint, API/Web build, YAML parse, and diff checks passed.

### Remaining gates

- IPIPD upstream authentication still returns HTTP 401; no fulfillment execution was
  enabled.
- Control-node, real provider purchase, and real customer browser acceptance remain
  required before production fulfillment.
