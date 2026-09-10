export function resolveDisposableDatabaseUrl(
  environment: Record<string, string | undefined> = process.env,
): string {
  const url = environment['DATABASE_URL_TEST'];
  if (!url) {
    throw new Error(
      'DATABASE_URL_TEST is required for integration helpers. These specs TRUNCATE all tables, ' +
        'so they refuse to fall back to DATABASE_URL. Point it at a disposable database, e.g. ' +
        'DATABASE_URL_TEST="postgresql://postgres:postgres@127.0.0.1:5432/ipeasy_test"',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('DATABASE_URL_TEST must be a valid PostgreSQL URL for a local disposable database.');
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('DATABASE_URL_TEST must use the postgresql:// or postgres:// protocol.');
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const isLoopback = host === 'localhost' || host === '::1' || isLoopbackIpv4(host);
  if (!isLoopback) {
    throw new Error(
      `Refusing to run TRUNCATE-based integration helpers against non-loopback host "${host}". ` +
        'Set DATABASE_URL_TEST to a local disposable database.',
    );
  }
  return url;
}

/**
 * Prisma may already have resolved DATABASE_URL before a helper is called.
 * Refuse destructive queries unless the active URL is exactly the validated
 * test URL; changing process.env at this point would not make that safe.
 */
export function assertDisposableDatabaseConnection(
  environment: Record<string, string | undefined> = process.env,
): string {
  const testUrl = resolveDisposableDatabaseUrl(environment);
  if (environment['DATABASE_URL'] !== testUrl) {
    throw new Error(
      'DATABASE_URL must exactly match DATABASE_URL_TEST before integration helpers execute destructive queries.',
    );
  }
  return testUrl;
}

function isLoopbackIpv4(host: string): boolean {
  const parts = host.split('.');
  return parts.length === 4
    && parts.every((part) => /^\d+$/.test(part) && Number(part) <= 255)
    && Number(parts[0]) === 127;
}
