# Dedicated control plane verification - 2026-08-18

## Code verification

- API tests: 65 files, 404 tests passed.
- Worker tests: 5 files, 23 tests passed.
- API typecheck, lint, and build passed.
- Worker typecheck, lint, and build passed.
- Prisma client generation and schema validation passed.
- `git diff --check` passed. No files under `apps/web` changed in this task.
- Purchase executor contract tests cover inventory gating, provider credential gating, upstream-order reconciliation, and uncertain purchase handling.
- OpenUI `go test ./...`, `go build ./...`, and `go vet ./...` passed in the managed-line-projection worktree.
- Online Railway `/health`, `/ready`, and frontend `/healthz` returned healthy responses; the online backend release SHA was `72fc85f9664223c11d1f3a255c166c564189fe90`, which is not the current local release.
- The ignored root `railway.json` frontend shim was removed so a root backend upload cannot select the wrong Nixpacks configuration.

## Runtime gate

The dedicated control execution gate remains disabled by default:

```text
DEDICATED_CONTROL_EXECUTION_ENABLED=false
DEDICATED_INVENTORY_SYNC_ENABLED=false
```

Do not enable it until every node passes the HTTPS management-channel and managed-projection smoke checks. The API client intentionally rejects plain HTTP management URLs.

## Node evidence

The three management ports were TCP reachable from the verification environment. HTTP/HTTPS behavior was not production-ready:

- `185.216.118.241:57323`: HTTP returned `404`; HTTPS TLS handshake failed.
- `185.216.118.242:22607`: TCP connect succeeded, but HTTP and HTTPS requests timed out.
- `185.216.118.243:41094`: HTTP returned `404`; HTTPS TLS handshake failed.

This proves port reachability only. It does not prove Bearer authentication, OpenUI managed projection capability, Xray readiness, egress verification, or SV/ZB delivery.

## Required before production

1. Deploy the same managed-line-projection OpenUI build to all three nodes.
2. Provision and verify HTTPS for every management endpoint; do not use HTTP or disable TLS verification.
3. Create one node-scoped Bearer token per node and store it only in the encrypted database fields.
4. Run authenticated health, version, apply, verify, readback, and delete smoke checks for both `SV` and `ZB` profiles.
5. Apply Prisma migrations against the production PostgreSQL database and verify rollback/backup procedure.
6. Enable inventory sync first; confirm fresh SK5 snapshots and Bark delivery for an out-of-stock gate.
7. Enable dedicated execution with a narrow provider/account allowlist, then run one controlled order before widening the allowlist.

Until these checks produce real responses and audit records, the system is code-ready but not production-accepted.

## OpenUI contract audit - 2026-08-18 continuation

The OpenUI worktree now exposes the contract consumed by the API:

- `PUT/GET/DELETE /panel/api/managed-line-projections/:projectionKey` use the native `{success,obj}` envelope.
- `POST /panel/api/managed-line-projections/:projectionKey/verify` returns sanitized projection status plus `xrayHealthy` and `egressReachable`.
- The managed-line route requires a valid Bearer token even when a browser session cookie exists; CSRF is bypassed only for that machine-to-machine auth path.
- The API adapter serializes `inboundTag`, protocol-specific client fields, SOCKS5 egress, and lifecycle fields, and sends the deletion version query parameter.

Verification evidence:

- OpenUI `go test ./...` passed.
- OpenUI `go build ./...` passed.
- API dedicated tests passed: 12 files, 58 tests.
- Worker tests passed: 5 files, 23 tests; API/Worker lint, typecheck, and build passed.
- Prisma schema validation and client generation passed with a supplied `DATABASE_URL`.
- API full test suite passed: 65 files, 404 tests. Worker full test suite passed: 5 files, 23 tests. API and Worker lint, typecheck, and build all passed.
- Railway variable reads succeeded, but variable writes returned `Unauthorized`; the CLI session must be re-authenticated before production configuration or deployment.
- `node scripts/predeploy-check.mjs` correctly rejects the current dirty worktree; no deployment claim is made until the intended change set is reviewed, committed, and uploaded.
- The three management TCP ports are reachable, but TLS handshakes were not valid from the verification environment. The execution gates remain disabled.

This is a code-level contract fix only. It is not a production acceptance or a substitute for deploying the same OpenUI build, configuring HTTPS, and running authenticated SV/ZB smoke orders on all three nodes.
