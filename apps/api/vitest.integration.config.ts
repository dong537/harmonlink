import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import { resolveDisposableDatabaseUrl } from './src/test-utils/integration-database-url';

function resolveTestReleaseSha(): string {
  const configured = [process.env['RELEASE_GIT_SHA'], process.env['RAILWAY_GIT_COMMIT_SHA']].find(
    (value) => value !== undefined && /^[0-9a-f]{40}$/i.test(value),
  );
  return configured ?? '0'.repeat(40);
}

export default defineConfig({
  // The source tree currently contains tracked JavaScript build artifacts next
  // to their TypeScript sources. Keep integration tests on one module graph by
  // resolving TypeScript first; otherwise Nest sees duplicate DI token classes
  // (for example wallet.repository.ts and wallet.repository.js).
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '.json'],
  },
  // NestJS dependency injection relies on emitDecoratorMetadata, which esbuild
  // (vitest's default transformer) does not support. unplugin-swc emits the
  // design:paramtypes metadata so constructor injection resolves correctly.
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    include: ['src/**/tests/*-integration.spec.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Run integration specs serially: they share one Postgres test DB and
    // each spec truncates tables in beforeEach, so parallel files would race.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      // Health smoke tests assert the production release identifier shape.
      // Integration runs are source-tree tests, so provide a deterministic
      // full-length value instead of inheriting an empty local environment.
      RELEASE_GIT_SHA: resolveTestReleaseSha(),
      DATABASE_URL: resolveDisposableDatabaseUrl(),
      REDIS_URL: process.env['REDIS_URL'] ?? 'redis://localhost:6380',
      // env.schema.ts requires a 64-char hex AES-256 key. This fixed key is not a
      // secret: it only ever encrypts throwaway rows in the disposable test database.
      APP_ENCRYPTION_KEY:
        process.env['APP_ENCRYPTION_KEY'] ??
        '0000000000000000000000000000000000000000000000000000000000000001',
      JWT_SECRET: process.env['JWT_SECRET'] ?? 'integration-test-jwt-secret',
      APP_PLATFORM_CURRENCY: process.env['APP_PLATFORM_CURRENCY'] ?? 'CNY',
      // Keep payment confirmation disabled by default so the UPSTREAM_DISABLED
      // case is exercised. The "confirm enabled" case is skipped (see spec).
      PAYMENT_CONFIRMATION_ENABLED: process.env['PAYMENT_CONFIRMATION_ENABLED'] ?? 'false',
    },
  },
});
