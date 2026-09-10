# Zeabur Worker and CLI Runtime Evidence

Date: 2026-09-08 (Asia/Shanghai)

## CLI

- The npm registry still resolves `zeabur` to an older release and does not expose `0.22.2`.
- The official GitHub release `v0.22.2` Windows amd64 archive was downloaded and verified with SHA-256 before installation.
- The installed CLI reports version `0.22.2`, commit `4147c0b97322d6b1b7edda89af2cb8f2c9a077b7`.
- Existing authentication was reused successfully; no token or credential is recorded here.

## Worker configuration

The Worker service was updated without replacing its existing variable set:

- `RELEASE_GIT_SHA` now matches the active application commit.
- `PROVIDER_FULFILLMENT_EXECUTION_ENABLED=false`.
- `DEDICATED_LINE_ORDER_EXECUTION_ENABLED=false`.
- `DEDICATED_LINE_PROJECTION_EXECUTION_ENABLED=false`.
- `DEDICATED_LINE_MIGRATION_EXECUTION_ENABLED=false`.
- `DEDICATED_LINE_HEALTH_EXECUTION_ENABLED=false`.
- `BARK_ALERTS_ENABLED=false`.
- `PROVIDER_INVENTORY_SYNC_ENABLED=true`.

The service was restarted. Runtime evidence after restart shows the container starts with the expected `dist/worker/src/main.js` entrypoint, all high-risk execution workers report disabled, and the 985 inventory sync succeeds. IPIPD inventory sync still returns upstream HTTP 401 and must remain a release blocker for that provider.

## Production boundary

No real order, provider credential, Bark key, control-node activation, or frontend source was changed. The repository `zeabur.yaml` mirrors the explicit disabled execution flags so a future deployment cannot silently re-enable unverified fulfillment.
