"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertTenantAccess = assertTenantAccess;
const app_error_1 = require("../errors/app-error");
const error_codes_1 = require("../errors/error-codes");
function assertTenantAccess(ctx, targetTenantId) {
    if (ctx.ownerType === 'PLATFORM_ADMIN' || ctx.ownerType === 'SYSTEM')
        return;
    if (ctx.tenantId !== targetTenantId) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.TENANT_SCOPE_VIOLATION, 'tenant_access_denied', 403, 'Access denied: cross-tenant operation');
    }
}
//# sourceMappingURL=tenant-guard.js.map