# Integration Runner Concurrency Evidence

Date: 2026-09-08 (Asia/Shanghai)

## Finding

The intermittent tenant failures are caused by multiple Vitest processes
sharing one destructive PostgreSQL database. They are not reproducible in one
Vitest process with file parallelism disabled.

## Single-process controls

Using a migrated disposable PostgreSQL database and loopback Redis, this
command passed the tenant suite with 8/8 tests:

```text
DATABASE_URL_TEST=<disposable-loopback-postgres>
REDIS_URL=<loopback-redis>
pnpm --filter @ipeasy/api exec vitest run \
  --config vitest.integration.config.ts \
  --no-file-parallelism --maxWorkers=1 --reporter=verbose \
  src/modules/tenants/tests/tenants-integration.spec.ts
```

The same process ran `control-plane-admin-integration.spec.ts` together with
`tenants-integration.spec.ts` and passed 20/20. A three-file run containing
payments, admin pages, and tenants passed 34/34. The integration config already
sets `fileParallelism: false`, so the explicit CLI flags are a useful audit
signal rather than a behavioral workaround.

## Two-process reproduction

Two independent commands, each using the flags above but pointing at the same
disposable database, were started two seconds apart. The control-plane process
and tenant process then reproduced the historical failure shape:

* PostgreSQL `40P01` deadlock during `cleanDatabase()`;
* `tenants_siteId_fkey` and `admin_users_siteId_fkey` violations;
* login returning `401 invalid_credentials` after fixture creation;
* records disappearing between a write and the assertion.

This is exactly what concurrent `TRUNCATE ... RESTART IDENTITY CASCADE` calls
produce. The process-local `--maxWorkers=1` setting cannot coordinate separate
Vitest invocations (including invocations launched by different agents or
terminals).

## Verification rule

Before accepting a full integration result, ensure no other Vitest process is
running and use one disposable database per process. On PowerShell:

```powershell
Get-CimInstance Win32_Process |
  Where-Object {
    $_.ProcessId -ne $PID -and
    $_.Name -in @('node.exe', 'pnpm.exe') -and
    $_.CommandLine -match 'vitest|test:integration|vitest\.integration\.config'
  }
```

Filtering out the current PowerShell process is required because its own
command line contains the search expression. An empty result must be observed
before starting the exclusive run. Do not interpret a run that overlaps
another process as a business regression.
