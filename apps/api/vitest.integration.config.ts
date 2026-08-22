import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

// Integration specs TRUNCATE every table in beforeEach, so they must never be
// pointed at a database anyone cares about. Requiring DATABASE_URL_TEST keeps
// that explicit: falling back to DATABASE_URL would silently wipe whatever the
// developer happened to have configured, including production.
function resolveTestDatabaseUrl(): string {
  const url = process.env['DATABASE_URL_TEST'];
  if (!url) {
    throw new Error(
      'DATABASE_URL_TEST is required to run integration tests. These specs TRUNCATE all tables, ' +
        'so they refuse to fall back to DATABASE_URL. Point it at a disposable database, e.g. ' +
        'DATABASE_URL_TEST="postgresql://postgres:postgres@127.0.0.1:5432/ipeasy_test"',
    );
  }
  return url;
}

export default defineConfig({
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
      DATABASE_URL: resolveTestDatabaseUrl(),
      REDIS_URL: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
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
