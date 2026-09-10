import { describe, expect, it } from 'vitest';
import {
  assertDisposableDatabaseConnection,
  resolveDisposableDatabaseUrl,
} from './integration-database-url';

describe('integration database configuration', () => {
  it('requires DATABASE_URL_TEST and never falls back to DATABASE_URL', () => {
    expect(() => resolveDisposableDatabaseUrl({
      DATABASE_URL: 'postgresql://production.example.com/db',
    })).toThrow('DATABASE_URL_TEST is required');
  });

  it('rejects a remote DATABASE_URL_TEST', () => {
    expect(() => resolveDisposableDatabaseUrl({
      DATABASE_URL_TEST: 'postgresql://postgres:postgres@production.example.com/ipeasy_test',
    })).toThrow('non-loopback host');
  });

  it('rejects a loopback URL with a non-PostgreSQL protocol', () => {
    expect(() => resolveDisposableDatabaseUrl({
      DATABASE_URL_TEST: 'ftp://127.0.0.1/ipeasy_test',
    })).toThrow('must use the postgresql:// or postgres:// protocol');
  });

  it('accepts an explicit PostgreSQL URL on the 127.0.0.0/8 loopback range', () => {
    const url = 'postgresql://postgres:postgres@127.0.0.2:5432/ipeasy_test';

    expect(resolveDisposableDatabaseUrl({ DATABASE_URL_TEST: url })).toBe(url);
  });

  it('requires the active Prisma URL to match the validated test URL', () => {
    expect(() => assertDisposableDatabaseConnection({
      DATABASE_URL_TEST: 'postgresql://postgres:postgres@127.0.0.1:5432/ipeasy_test',
      DATABASE_URL: 'postgresql://postgres:postgres@production.example.com/ipeasy',
    })).toThrow('DATABASE_URL must exactly match DATABASE_URL_TEST');

    const url = 'postgresql://postgres:postgres@127.0.0.1:5432/ipeasy_test';
    expect(assertDisposableDatabaseConnection({
      DATABASE_URL_TEST: url,
      DATABASE_URL: url,
    })).toBe(url);
  });
});
