# Isolated PostgreSQL and API Integration Verification

Date: 2026-09-08 (Asia/Shanghai)

## Disposable services

The verification used disposable local containers only:

| Service | Container | Host endpoint | Credentials/data |
| --- | --- | --- | --- |
| PostgreSQL 16 | `codex-isolated-pg-20260908` | `127.0.0.1:55434` | database `ipeasy_test`, user/password `postgres` |
| Redis 7 | `codex-isolated-redis-20260908` | `127.0.0.1:56380` | no persistent application data |

PostgreSQL readiness and Redis `PONG` both passed. The temporary database
`ipeasy_existing_20260908` was also used for an independent migration probe;
it contained no production data.

## Prisma migration checks

Commands were run with `DATABASE_URL` pointed at the isolated PostgreSQL
container:

```text
pnpm --filter @ipeasy/db migrate:deploy       exit 0; 21 migrations applied
pnpm --filter @ipeasy/db migrate:deploy       exit 0; no pending migrations
pnpm --filter @ipeasy/db prisma generate      exit 0
pnpm --filter @ipeasy/db prisma migrate status exit 0; schema up to date
pnpm --filter @ipeasy/db prisma validate      exit 0
```

The existing-row/new-row probe passed: after applying the additive ticket
migration, the two rows had unique, increasing `legacyId` values `1` and `2`.

## Real repository probes

Using the generated Prisma client against the same database:

- owner-scoped numeric legacy ticket ID lookup passed;
- ticket UUID to numeric ID projection passed;
- notification `read=true` and `read=false` queries returned the filtered
  `total` and `items` values;
- notifications belonging to another user were excluded.

Strict `DATABASE_URL_TEST` coverage passed (`2/2`), and the focused unit and
regression suite passed (`6` files, `34` tests).

## Vitest module-graph finding

The API source tree contains tracked CommonJS build artifacts alongside the
TypeScript sources. Before the resolver correction, extensionless imports in
the Vitest integration graph could resolve `wallet.module.js` and
`wallet.repository.js` while payments loaded their TypeScript counterparts.
Nest then saw two different class tokens and failed to construct
`ConfirmPaymentOrderUseCase` with an unavailable `WalletRepository`.

The integration config now declares TypeScript-first extensions:

```ts
resolve: {
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '.json'],
},
```

With this configuration, Vite resolve diagnostics show the wallet and app
module imports resolving to `.ts`, and the API-v1 compatibility integration
passes all 9 tests. This removes the duplicate DI-token graph without hiding
or deleting generated artifacts.

## Focused integration status

The first full integration run was performed before the resolver correction
and therefore had bootstrap skips for API-v1, tickets, and notifications. It
also exposed unrelated environment/contract failures (payment confirmation
disabled by default, dedicated-line fixture identity validation, and
production-readiness expectations). These are retained in the full-run log:

```text
C:\Users\Lenovo\AppData\Local\Temp\codex-api-all-integration-20260908.log
```

After the resolver correction, the affected integration files were rerun
serially against the same disposable database:

| Test files | Result |
| --- | --- |
| `api-v1-compat-integration.spec.ts` | 1 file, 9/9 tests passed |
| `tickets-integration.spec.ts` and `admin-tickets-integration.spec.ts` | 2 files, 14/14 tests passed |
| `notifications-integration.spec.ts` | 1 file, 6/6 tests passed |

The four files completed with 29/29 tests passing and no bootstrap DI errors.

## Cleanup

The disposable PostgreSQL and Redis containers were stopped and removed after
the focused runs. No production database, `apps/web/**`, or frozen frontend
source was modified by this verification.
