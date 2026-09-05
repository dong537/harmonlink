"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigGuard = void 0;
const env_schema_1 = require("./env.schema");
const allowlist_1 = require("./allowlist");
class ConfigGuard {
    static verify() {
        if (env_schema_1.env.NODE_ENV === 'production') {
            const required = ['DATABASE_URL', 'REDIS_URL', 'APP_ENCRYPTION_KEY', 'JWT_SECRET'];
            for (const key of required) {
                if (!env_schema_1.env[key]) {
                    console.error(`[ConfigGuard] Missing required production env: ${key}`);
                    process.exit(1);
                    return;
                }
            }
            if (env_schema_1.env.LEGACY_API_V1_ENABLED === 'true' && !env_schema_1.env.LEGACY_API_SITE_ID.trim()) {
                console.error('[ConfigGuard] Legacy API v1 requires LEGACY_API_SITE_ID');
                process.exit(1);
                return;
            }
            if (env_schema_1.env.PROVIDER_FULFILLMENT_EXECUTION_ENABLED === 'true' &&
                (0, allowlist_1.parseAllowlist)(env_schema_1.env.PROVIDER_FULFILLMENT_PROVIDER_ALLOWLIST).size === 0 &&
                (0, allowlist_1.parseAllowlist)(env_schema_1.env.PROVIDER_FULFILLMENT_UPSTREAM_ACCOUNT_ALLOWLIST).size === 0) {
                console.error('[ConfigGuard] Provider fulfillment execution requires at least one allowlist');
                process.exit(1);
                return;
            }
            if (!/^[0-9a-f]{40}$/i.test(env_schema_1.env.RELEASE_GIT_SHA)) {
                console.error('[ConfigGuard] RELEASE_GIT_SHA must be a full Git commit SHA');
                process.exit(1);
            }
            if (env_schema_1.env.DEDICATED_LINE_ORDER_EXECUTION_ENABLED === 'true' &&
                (0, allowlist_1.parseAllowlist)(env_schema_1.env.DEDICATED_LINE_ORDER_PROVIDER_ALLOWLIST).size === 0 &&
                (0, allowlist_1.parseAllowlist)(env_schema_1.env.DEDICATED_LINE_ORDER_ACCOUNT_ALLOWLIST).size === 0) {
                console.error('[ConfigGuard] Dedicated-line order execution requires at least one allowlist');
                process.exit(1);
                return;
            }
            if (env_schema_1.env.DEDICATED_LINE_ORDER_EXECUTION_ENABLED === 'true' &&
                (env_schema_1.env.DEDICATED_LINE_PROJECTION_EXECUTION_ENABLED !== 'true' ||
                    env_schema_1.env.PROVIDER_INVENTORY_SYNC_ENABLED !== 'true' ||
                    env_schema_1.env.BARK_ALERTS_ENABLED !== 'true')) {
                console.error('[ConfigGuard] Dedicated-line order execution requires projection execution, provider inventory sync, and Bark alerts');
                process.exit(1);
                return;
            }
            if (env_schema_1.env.BARK_ALERTS_ENABLED === 'true' && !env_schema_1.env.BARK_DEVICE_KEYS.trim()) {
                console.error('[ConfigGuard] Bark alerts require at least one device key');
                process.exit(1);
                return;
            }
            if (env_schema_1.env.DEDICATED_LINE_MIGRATION_EXECUTION_ENABLED === 'true'
                && env_schema_1.env.DEDICATED_LINE_PROJECTION_EXECUTION_ENABLED !== 'true') {
                console.error('[ConfigGuard] Dedicated-line migration execution requires projection execution');
                process.exit(1);
                return;
            }
            if (env_schema_1.env.DEDICATED_LINE_MIGRATION_EXECUTION_ENABLED === 'true'
                && !isHttpsNonLoopbackUrl(env_schema_1.env.DEDICATED_LINE_MIGRATION_SMOKE_TARGET_URL)) {
                console.error('[ConfigGuard] Dedicated-line migration execution requires an HTTPS non-loopback smoke runner');
                process.exit(1);
                return;
            }
            if (env_schema_1.env.PROVIDER_INVENTORY_SYNC_ENABLED === 'true' &&
                env_schema_1.env.WORKER_INVENTORY_SYNC_INTERVAL_MS >= env_schema_1.env.DATABASE_INVENTORY_FRESHNESS_MS) {
                console.error('[ConfigGuard] Inventory sync interval must be lower than inventory freshness TTL');
                process.exit(1);
                return;
            }
        }
    }
}
exports.ConfigGuard = ConfigGuard;
function isHttpsNonLoopbackUrl(value) {
    try {
        return new URL(value).protocol === 'https:' && !isLoopbackUrl(value);
    }
    catch {
        return false;
    }
}
function isLoopbackUrl(value) {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (hostname === 'localhost' || hostname === '::1')
        return true;
    const ipv4 = hostname.split('.');
    if (isLoopbackIpv4(ipv4))
        return true;
    const mapped = hostname.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (!mapped)
        return false;
    const first = Number.parseInt(mapped[1], 16);
    const second = Number.parseInt(mapped[2], 16);
    return isLoopbackIpv4([
        String((first >> 8) & 0xff),
        String(first & 0xff),
        String((second >> 8) & 0xff),
        String(second & 0xff),
    ]);
}
function isLoopbackIpv4(ipv4) {
    return ipv4.length === 4
        && ipv4.every((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255)
        && Number(ipv4[0]) === 127;
}
//# sourceMappingURL=config-guard.js.map