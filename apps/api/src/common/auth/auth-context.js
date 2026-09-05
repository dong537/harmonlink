"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuthenticatedContext = requireAuthenticatedContext;
exports.requireUserContext = requireUserContext;
exports.requireOperatorContext = requireOperatorContext;
exports.requireTenantAdminContext = requireTenantAdminContext;
exports.requirePlatformAdminContext = requirePlatformAdminContext;
exports.requireSystemContext = requireSystemContext;
exports.requireScope = requireScope;
const app_error_1 = require("../errors/app-error");
const error_codes_1 = require("../errors/error-codes");
function requireAuthenticatedContext(ctx) {
    if (ctx !== null &&
        typeof ctx === 'object' &&
        'ownerId' in ctx &&
        'ownerType' in ctx &&
        'siteId' in ctx &&
        'scopes' in ctx &&
        'requestId' in ctx) {
        return ctx;
    }
    throw new app_error_1.AppError(error_codes_1.ErrorCode.AUTH_REQUIRED, 'AUTH_REQUIRED', 401);
}
function requireUserContext(ctx) {
    if (ctx.ownerType !== 'USER') {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'PERMISSION_DENIED', 403);
    }
}
function requireOperatorContext(ctx) {
    if (ctx.ownerType !== 'PLATFORM_ADMIN' && ctx.ownerType !== 'OPERATOR' && ctx.ownerType !== 'SYSTEM') {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'PERMISSION_DENIED', 403);
    }
}
function requireTenantAdminContext(ctx, tenantId) {
    if (ctx.ownerType !== 'TENANT_ADMIN' || ctx.tenantId !== tenantId) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'PERMISSION_DENIED', 403);
    }
}
function requirePlatformAdminContext(ctx) {
    if (ctx.ownerType !== 'PLATFORM_ADMIN') {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'PERMISSION_DENIED', 403);
    }
}
function requireSystemContext(ctx) {
    if (ctx.ownerType !== 'SYSTEM') {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'PERMISSION_DENIED', 403);
    }
}
function requireScope(ctx, requiredScope) {
    const wildcard = requiredScope.includes(':')
        ? `${requiredScope.slice(0, requiredScope.indexOf(':'))}:*`
        : '*';
    if (!ctx.scopes.includes(requiredScope) && !ctx.scopes.includes(wildcard) && !ctx.scopes.includes('*')) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'insufficient_scope', 403);
    }
}
//# sourceMappingURL=auth-context.js.map