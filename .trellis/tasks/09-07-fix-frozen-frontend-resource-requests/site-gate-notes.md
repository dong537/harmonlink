# Legacy API site gate notes

Date: 2026-09-08

- Authenticated compatibility handlers call the fixed-site gate with the
  authenticated context before any repository or use-case work.
- `cancelOrder`, `deleteNotification`, and the dedicated `lock` route all
  perform the site check before returning their explicit unsupported-capability
  error.
- A missing or non-string `LEGACY_API_SITE_ID` produces the typed
  `legacy_api_site_not_configured` error instead of a runtime `TypeError`.
- Regression coverage includes disabled API, missing configuration, matching
  site, cross-site rejection, and downstream short-circuit assertions.

Checks:

- `vitest` compatibility unit focus: 4 files, 32 tests passed.
- `pnpm --filter @ipeasy/api typecheck` passed.
- `pnpm --filter @ipeasy/api lint -- --quiet` passed.

## Recheck - 2026-09-09

- Zone/compatibility boundary regression suite passed; malformed non-string
  `zoneCode` now returns typed `400 zone_code_invalid`, and blank Zone codes
  return typed validation errors.
- API unit suite: 116 files / 732 tests passed (including Zone, ticket,
  notification, order, and compatibility coverage).
- Web unit suite: 61 files / 359 tests passed. Existing React `act()` warnings
  remain non-failing test output; no `apps/web/**` source was changed.
- API and Web builds, API/Web/DB typechecks, and API/Web lint passed.
- A disposable PostgreSQL instance received all 23 Prisma migrations; the
  serial API integration suite passed 45 files / 250 tests. The temporary
  database container was removed after the run.
- `node --test scripts/scan-secrets.spec.mjs` passed 7 tests and
  `pnpm run security:scan` passed. The scanner now skips tracked paths deleted
  from the working tree instead of crashing before checking remaining files.
- `git diff --check` and the frozen `apps/web` diff guard passed.
- Legacy line IDs now require canonical decimal text before safe-integer
  conversion; whitespace, signs, exponent/decimal forms, leading zeroes, and
  unsafe integers return `dedicated_line_id_invalid`.
- Customer order list queries now include `siteId`, `userId`, and `tenantId` in
  both `count` and `findMany` predicates; repository regression coverage locks
  this isolation contract.

## Release blockers

- `pnpm run predeploy:check` correctly refuses the current dirty worktree;
  it must be rerun after the user-approved commit grouping is complete.
- Production IPIPD inventory authentication still returns upstream HTTP 401;
  fulfillment execution remains disabled. Do not enable the Worker or claim
  end-to-end provider fulfillment until credentials/allowlist and a controlled
  acceptance order succeed.

## Recheck - 2026-09-10

- `apps/web/**` remains byte-for-byte unchanged.
- Fresh local security checks passed: `node scripts/scan-secrets.mjs` and
  `node --test scripts/scan-secrets.spec.mjs` (7/7).
- Web typecheck, lint, and Vite build passed. The shared Web group passed 16
  files / 39 tests. The complete isolated Web suite was started with the
  direct Vitest entrypoint, but Windows module collection did not produce a
  terminal summary within the verification window; this is not counted as a
  full-suite pass.
- Zeabur read-only service/deployment inspection shows the existing `api`,
  `worker`, and `web` services; the active Docker deployments are running.
- Public smoke: Web `/` and `/healthz`, API `/health` and `/ready` returned
  HTTP 200; readiness reported DB and Redis `ok`; capabilities kept residential
  UI/purchase disabled and dedicated UI/purchase enabled; unauthenticated
  `/api/v1/auth/me` returned typed HTTP 401.
- The active Web/API deployment still returns HTTP 404 for
  `/api/v1/zones`, and `/api/sites/current` reports
  `staticProxyPurchaseEnabled=false`. This proves the Zone compatibility
  changes in the dirty worktree are not deployed yet; health checks alone do
  not establish release parity.
- No deployment or commit was performed. Deployment remains blocked until the
  user approves the commit grouping and the full isolated Web suite has a
  terminal result (or a documented CI-equivalent run).

## Recheck - 2026-09-10 (isolated integration rerun)

- A fresh disposable PostgreSQL 16 container on `127.0.0.1:55435` and Redis 7
  on `127.0.0.1:56381` were used by one Vitest process only; both containers
  were removed after verification.
- All 23 Prisma migrations applied successfully to the empty database.
- The complete serial API integration suite passed: 45 files / 254 tests.
  The earlier 44/45 result was caused by an obsolete assertion expecting a
  price change to turn an idempotent retry into HTTP 409. The current contract
  returns the committed order with HTTP 201 and `replayed=true`; the regression
  test now asserts the original price and IDs.
- Fresh unit/build checks passed: API 119 files / 759 tests, Worker 6 files /
  28 tests, API/DB/Worker/Web typecheck, API/Worker/Web lint, API/Worker/Web
  build, Prisma generate/validate, secret scan (7/7), YAML parse, shell syntax,
  `git diff --check`, and the frozen `apps/web` diff guard.
- A Worker build initially exposed a nullable `zoneCode` narrowing error in
  `dedicated-line-inventory.repository.ts`; the explicit `undefined || null`
  guard is now compiled successfully by both Worker and API builds.

## Release hygiene audit - 2026-09-10

- The tracked provider operations surface is limited to the canonical
  environment-driven bootstrap, health, sync, and dry-run paths. Obsolete
  direct-write seed/test scripts were removed because they bypassed audit,
  inventory, or wallet invariants.
- Real-order helper scripts and local diagnostic files remain outside the
  release commit. Deployment must run from a clean worktree at the verified
  commit so untracked local files cannot enter the Docker build context.
- The installed Zeabur CLI is version `0.22.2`; the npm `zeabur@latest`
  package resolved to an older `0.5.4` binary during verification. Release
  operations therefore use the installed CLI path and its verified flags.
