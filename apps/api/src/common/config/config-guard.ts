import { env } from './env.schema';
import { parseAllowlist } from './allowlist';

export class ConfigGuard {
  static verify(): void {
    if (env.NODE_ENV === 'production') {
      const required = ['DATABASE_URL', 'REDIS_URL', 'APP_ENCRYPTION_KEY', 'JWT_SECRET'] as const;
      for (const key of required) {
        if (!env[key]) {
          console.error(`[ConfigGuard] Missing required production env: ${key}`);
          process.exit(1);
        }
      }
      if (
        env.PROVIDER_FULFILLMENT_EXECUTION_ENABLED === 'true' &&
        parseAllowlist(env.PROVIDER_FULFILLMENT_PROVIDER_ALLOWLIST).size === 0 &&
        parseAllowlist(env.PROVIDER_FULFILLMENT_UPSTREAM_ACCOUNT_ALLOWLIST).size === 0
      ) {
        console.error('[ConfigGuard] Provider fulfillment execution requires at least one allowlist');
        process.exit(1);
      }
      if (
        env.PROVIDER_INVENTORY_SYNC_ENABLED === 'true' &&
        env.WORKER_INVENTORY_SYNC_INTERVAL_MS >= env.DATABASE_INVENTORY_FRESHNESS_MS
      ) {
        console.error('[ConfigGuard] Inventory sync interval must be lower than inventory freshness TTL');
        process.exit(1);
      }
    }
  }
}
