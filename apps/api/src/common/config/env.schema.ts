import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string(),
  APP_ENCRYPTION_KEY: z.string().min(32),
  JWT_SECRET: z.string().min(16),
  APP_PLATFORM_CURRENCY: z.string().length(3),
  CORS_ORIGINS: z.string().default(''),
  ALLOW_PLACEHOLDER_APIKEYS: z.enum(['true', 'false']).default('false'),
  ALLOW_LOCAL_DEV_APIKEY: z.enum(['true', 'false']).default('false'),
  PAYMENT_CONFIRMATION_ENABLED: z.enum(['true', 'false']).default('false'),
  PROVIDER_FULFILLMENT_EXECUTION_ENABLED: z.enum(['true', 'false']).default('false'),
  PROVIDER_FULFILLMENT_PROVIDER_ALLOWLIST: z.string().default(''),
  PROVIDER_FULFILLMENT_UPSTREAM_ACCOUNT_ALLOWLIST: z.string().default(''),
  PROVIDER_INVENTORY_SYNC_ENABLED: z.enum(['true', 'false']).default('true'),
  DATABASE_INVENTORY_FRESHNESS_MS: z.coerce.number().int().min(60_000).default(3_600_000),
  WORKER_FULFILLMENT_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).default(5_000),
  WORKER_FULFILLMENT_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(20),
  WORKER_INVENTORY_SYNC_INTERVAL_MS: z.coerce.number().int().min(60_000).default(300_000),
  PROXY_CHECK_TARGET_URL: z.string().url().default('http://api.ipify.org/?format=json'),
  PROXY_CHECK_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(8_000),
});

export type EnvConfig = z.infer<typeof envSchema>;

function parseEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Environment validation failed:', result.error.format());
    process.exit(1);
  }
  return result.data;
}

export const env: EnvConfig = parseEnv();
