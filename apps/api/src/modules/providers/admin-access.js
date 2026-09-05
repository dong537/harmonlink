"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireProviderAdmin = requireProviderAdmin;
exports.deriveCapabilities = deriveCapabilities;
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
/**
 * Provider accounts are platform-level resources, so the provider-health panel
 * is PLATFORM_ADMIN-only. Any other caller (TENANT_ADMIN, USER, SYSTEM) is
 * rejected before any account is read.
 */
function requireProviderAdmin(ctx) {
    if (ctx.ownerType !== 'PLATFORM_ADMIN') {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
    }
}
/**
 * Derives the capability summary from the account toggle (`inventorySync`) and
 * which optional lifecycle methods the matching adapter implements. Reflects
 * real behaviour rather than a hardcoded matrix.
 */
function deriveCapabilities(adapter, inventorySyncEnabled) {
    return {
        inventorySync: inventorySyncEnabled,
        renew: typeof adapter.renewStaticProxy === 'function',
        changePassword: typeof adapter.changeProxyPassword === 'function',
        switchIp: typeof adapter.switchProxyIp === 'function',
    };
}
//# sourceMappingURL=admin-access.js.map