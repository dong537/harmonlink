"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWalletForContext = getWalletForContext;
exports.requireTenantId = requireTenantId;
const tenant_guard_1 = require("../../common/auth/tenant-guard");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
async function getWalletForContext(repo, ctx, userId) {
    if (ctx.ownerType === 'USER') {
        if (ctx.ownerId !== userId) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'cannot_read_other_wallet', 403);
        }
        return repo.getWalletByUserId(userId, ctx.siteId, requireTenantId(ctx));
    }
    if (ctx.ownerType === 'TENANT_ADMIN') {
        const wallet = await repo.getWalletByUserId(userId, ctx.siteId);
        (0, tenant_guard_1.assertTenantAccess)(ctx, wallet.tenantId);
        return wallet;
    }
    if (ctx.ownerType === 'PLATFORM_ADMIN') {
        return repo.getWalletByUserId(userId, ctx.siteId);
    }
    throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
}
function requireTenantId(ctx) {
    if (!ctx.tenantId) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'tenant_context_required', 403);
    }
    return ctx.tenantId;
}
//# sourceMappingURL=access.js.map