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
