# Admin route metadata audit

This is a read-only audit of the current API source and the frozen frontend
request list. No `apps/web` files or frozen bundles were changed by this
audit. The unsupported admin controller was edited by another agent while the
audit was running; the result below is from the current worktree after that
edit.

## Method

- Read `.tmp/frozen-all-methods.tsv` as UTF-16LE and keep the 88 rows whose
  path starts with `/admin/`.
- Load every non-test `*.controller.ts` with `ts-node` and inspect Nest
  `PATH_METADATA` and `METHOD_METADATA` using `reflect-metadata`.
- Normalize `/v1/admin/...` and `/admin/...` to the same path, and normalize
  parameter names (`${e}`, `${t}`, `:id`) by segment position.

The metadata command used validation-only dummy environment values
(`NODE_ENV=test`, local dummy `DATABASE_URL`/`REDIS_URL`, a 64-character hex
`APP_ENCRYPTION_KEY`, `JWT_SECRET`, and `APP_PLATFORM_CURRENCY=USD`). It did not
start Nest or connect to a database.

## Current result

| metric | count |
| --- | ---: |
| frozen `/admin/` method rows | 88 |
| current normalized admin metadata routes | 116 |
| frozen rows with an exact method/path metadata match | 88 |
| frozen rows with no registered route | 0 |

The current source covers every frozen admin method/path. The additional 28
metadata routes are canonical admin routes or compatibility routes not present
in the frozen admin bundle.

## Important transition finding

An earlier scan, before the other agent's edit, observed 39 missing routes. The
old implementation stacked ordinary decorators on one method, for example
multiple `@Get(...)` or `@Post(...)` declarations. Nest's
`RequestMapping` implementation writes `PATH_METADATA` directly, so that old
shape retained only one path per method. The current source uses Nest-supported
path arrays (`@Get([...])`, `@Post([...])`, etc.) and separate handlers where
the HTTP method differs. A fresh reflection scan now shows the full arrays and
zero missing frozen routes.

Evidence:

- `apps/api/node_modules/@nestjs/common/decorators/http/request-mapping.decorator.js`
  calls `Reflect.defineMetadata(PATH_METADATA, path, descriptor.value)`.
- `apps/api/src/modules/api-v1-compat/legacy-admin-unsupported.controller.ts`
  now uses array metadata for same-method paths and separate PUT/PATCH/DELETE
  handlers where needed.

The multi-path change still needs a runtime route smoke test in the API test
environment; the reflection check proves metadata coverage, not Fastify
registration or response behavior.

## Dashboard first-view request chain

The frozen admin dashboard invokes:

```text
GET /api/v1/users/profile
GET /api/v1/dashboard/admin-pending-tasks
GET /api/v1/admin/statistics
GET /api/v1/admin/pending-items
GET /api/v1/admin/recent-orders?limit=5
GET /api/v1/admin/revenue-trend?days=7
```

`LegacySurfaceController` explicitly returns 501 for
`dashboard/admin-pending-tasks`, so a 501 is intentional but must be surfaced
as an unavailable capability rather than treated as an empty dashboard.

The compat profile endpoint is guarded by `@RequireUser()` at
`apps/api/src/modules/api-v1-compat/api-v1-compat.controller.ts:127-128`.
`UserGuard` rejects any context whose owner type is not `USER`
(`apps/api/src/common/auth/guards.ts:69-76`), while `JwtStrategy` maps admin
sessions to `PLATFORM_ADMIN`, `OPERATOR`, or `TENANT_ADMIN`
(`apps/api/src/common/auth/jwt.strategy.ts:27-42`). Admin sessions may
therefore receive 403 before the admin dashboard renders; this remains a
separate first-view risk even though route registration is complete.

## Verification

The final metadata scan completed with 288 total controller routes, 0 import
errors, `frozenCount=88`, `foundCount=88`, and `missingCount=0`. The focused
controller test also passed:

```text
pnpm --filter @ipeasy/api exec vitest run \
  src/modules/api-v1-compat/legacy-admin-unsupported.controller.spec.ts \
  --maxWorkers=1
1 file passed, 4 tests passed
```

`pnpm --filter @ipeasy/api exec tsc --noEmit` also completed successfully.

Existing worktree changes were left untouched; this document is the only file
added by this audit.
