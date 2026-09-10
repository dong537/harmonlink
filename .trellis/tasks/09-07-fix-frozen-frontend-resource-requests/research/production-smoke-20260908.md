# Production Smoke - 2026-09-08

## Local quality gate

- API and DB typecheck: passed.
- API and Web lint/typecheck: passed.
- API unit tests: 111 files, 689 tests passed.
- Compatibility and related unit tests: 83 tests passed.
- Isolated PostgreSQL integration: 21 migrations applied; 29 integration tests passed.
- Frozen frontend guard: no `apps/web` diff; no Railway origin in the frozen source or deployed entry module.

## Zeabur deployment

- Project: `untitled` (`6a786d80e4a69d66638d62e1`)
- Environment: `production` (`6a786d805f062718bc7b8dfb`)
- API service: `6a7c0cb82d4cb87f2ba391e1`
- API deployment: `6a9f78277b89d6943549e2d4`, Docker, `RUNNING`
- API runtime log: `API listening on port 8080`; Nest application started.
- Database command: `pnpm --filter @ipeasy/db migrate:deploy`; no pending migrations.

## Online checks

- API `/health`: HTTP 200.
- API `/ready`: HTTP 200; DB and Redis checks are `ok`.
- API `/api/v1/health`: HTTP 200.
- API and Web `/api/v1/settings/capabilities`: HTTP 200; dedicated UI/purchase enabled, residential UI/purchase disabled.
- Web `/healthz`: HTTP 200.
- API and Web `/api/v1/auth/me` without credentials: HTTP 401 with `AUTH_REQUIRED`.
- Clean Playwright login smoke: same-origin capabilities request and invalid-login POST; invalid credentials returned HTTP 401, no page error.
- Deployed Vite asset graph: entry plus 131 dependency assets, all HTTP 200.

## Explicit residual gates

- API and Worker `RELEASE_GIT_SHA` values now match the active application commit. This is a consistency marker only; deployment status, Docker build logs, route map, and runtime checks remain the source of deployment evidence.
- Worker service is `RUNNING` with PID 1 `node dist/worker/src/main.js`.
- Fulfillment, dedicated-line order/projection/migration/health, and Bark execution are explicitly disabled by policy pending provider acceptance tests and control-node/Bark setup.
- Worker was restarted after the configuration update; runtime logs show the disabled worker guards and a successful 985 inventory sync.
- `NINE_EIGHT_FIVE` inventory sync succeeds; `IPIPD` inventory sync returns upstream HTTP 401 (`upstream_auth_failed`). Do not enable IPIPD fulfillment or fabricate inventory until credentials are corrected.
- The frozen bundle still declares historical endpoints whose canonical source of truth is not implemented (for example user zones, residential/static, billing, referral, and dashboard surfaces). They remain unsupported/blocked rather than aliased to unrelated data.

## Recheck - 2026-09-08 16:29 +08:00

- Local API unit: 111 files / 689 tests passed.
- Local Web unit exited 0; API/Web/DB typecheck, API/Web lint, API/Web build,
  compatibility focus (7 files / 59 tests), YAML parse, and `git diff --check`
  passed.
- `apps/web/**` remains unchanged.
- `https://365pro.zeabur.app/`, `/healthz`, same-origin `/api/v1/health`, and
  same-origin capabilities returned HTTP 200.
- API `/health` and `/ready` returned HTTP 200; readiness reported DB and Redis
  `ok`.
- Unauthenticated same-origin `/api/v1/auth/me` and `/api/v1/dedicated-skus`
  returned typed HTTP 401.
- Vite entry plus 131 dependency assets returned HTTP 200 after retrying one
  transient TLS socket disconnect.
- Worker runtime logs still show fulfillment disabled; no provider execution was
  enabled.

## Security and runtime recheck - 2026-09-08 18:32 +08:00

- `pnpm run security:scan` passed after replacing the historical remote database
  credential in an operations note with placeholders.
- `node --test scripts/scan-secrets.spec.mjs` passed 6 boundary tests, including
  remote PostgreSQL detection with a weak password and ignored local/test fixtures.
- Zeabur service list shows `api`, `worker`, `web`, PostgreSQL, and Redis all
  `RUNNING`; the worker runtime log shows fulfillment guards disabled, successful
  `NINE_EIGHT_FIVE` inventory sync, and `IPIPD` inventory failure with upstream
  HTTP 401 / `upstream_auth_failed`.
- Public HTTP recheck returned: web `/` 200, web `/healthz` 200, same-origin
  `/api/v1/health` 200, capabilities 200, API `/health` 200, API `/ready` 200
  with DB/Redis `ok`, and unauthenticated `/api/v1/auth/me` plus
  `/api/v1/dedicated-skus` typed 401.
- The locally installed official Zeabur binary reports `0.22.0`; the CLI advertises
  `0.22.2` as available. This is an operator-tool upgrade note, not an application
  deployment failure.
