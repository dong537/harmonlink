"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScopeGuard = exports.SystemGuard = exports.PlatformAdminGuard = exports.TenantAdminGuard = exports.OperatorGuard = exports.UserGuard = exports.AuthGuard = exports.REQUIRED_SCOPE_KEY = void 0;
exports.RequireAuth = RequireAuth;
exports.RequireScope = RequireScope;
exports.RequireUser = RequireUser;
exports.RequireOperator = RequireOperator;
exports.RequireTenantAdmin = RequireTenantAdmin;
exports.RequirePlatformAdmin = RequirePlatformAdmin;
exports.RequireSystem = RequireSystem;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const app_error_1 = require("../errors/app-error");
const error_codes_1 = require("../errors/error-codes");
const auth_context_1 = require("./auth-context");
const jwt_strategy_1 = require("./jwt.strategy");
const apikey_strategy_1 = require("./apikey.strategy");
exports.REQUIRED_SCOPE_KEY = 'ipeasy:requiredScope';
let AuthGuard = class AuthGuard {
    jwt;
    apiKey;
    constructor(jwt, apiKey) {
        this.jwt = jwt;
        this.apiKey = apiKey;
    }
    async canActivate(context) {
        const req = context.switchToHttp().getRequest();
        const authorization = req.headers['authorization'];
        const apikeyHeader = req.headers['apikey'];
        let ctx;
        if (authorization?.startsWith('Bearer ')) {
            const token = authorization.slice(7);
            const result = await this.jwt.authenticate(token);
            req.sessionId = result.sessionId;
            req.credentialType = 'SESSION';
            ctx = result;
        }
        else if (apikeyHeader) {
            const clientIp = req.ip ?? '';
            ctx = await this.apiKey.authenticate(apikeyHeader, clientIp);
            req.credentialType = 'API_KEY';
        }
        else {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.AUTH_REQUIRED, 'AUTH_REQUIRED', 401);
        }
        req.authContext = ctx;
        return true;
    }
};
exports.AuthGuard = AuthGuard;
exports.AuthGuard = AuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [jwt_strategy_1.JwtStrategy,
        apikey_strategy_1.ApiKeyStrategy])
], AuthGuard);
let UserGuard = class UserGuard {
    async canActivate(context) {
        const req = context.switchToHttp().getRequest();
        const ctx = req.authContext;
        if (!ctx || ctx.ownerType !== 'USER') {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
        }
        return true;
    }
};
exports.UserGuard = UserGuard;
exports.UserGuard = UserGuard = __decorate([
    (0, common_1.Injectable)()
], UserGuard);
let OperatorGuard = class OperatorGuard {
    async canActivate(context) {
        const req = context.switchToHttp().getRequest();
        const ctx = req.authContext;
        if (!ctx ||
            (ctx.ownerType !== 'PLATFORM_ADMIN' && ctx.ownerType !== 'OPERATOR' && ctx.ownerType !== 'SYSTEM')) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
        }
        return true;
    }
};
exports.OperatorGuard = OperatorGuard;
exports.OperatorGuard = OperatorGuard = __decorate([
    (0, common_1.Injectable)()
], OperatorGuard);
let TenantAdminGuard = class TenantAdminGuard {
    async canActivate(context) {
        const req = context.switchToHttp().getRequest();
        const ctx = req.authContext;
        if (!ctx || ctx.ownerType !== 'TENANT_ADMIN') {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
        }
        return true;
    }
};
exports.TenantAdminGuard = TenantAdminGuard;
exports.TenantAdminGuard = TenantAdminGuard = __decorate([
    (0, common_1.Injectable)()
], TenantAdminGuard);
let PlatformAdminGuard = class PlatformAdminGuard {
    async canActivate(context) {
        const req = context.switchToHttp().getRequest();
        const ctx = req.authContext;
        if (!ctx || ctx.ownerType !== 'PLATFORM_ADMIN') {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
        }
        return true;
    }
};
exports.PlatformAdminGuard = PlatformAdminGuard;
exports.PlatformAdminGuard = PlatformAdminGuard = __decorate([
    (0, common_1.Injectable)()
], PlatformAdminGuard);
let SystemGuard = class SystemGuard {
    async canActivate(context) {
        const req = context.switchToHttp().getRequest();
        const ctx = req.authContext;
        // Deny USER ownerType even if they somehow hold system:* scopes
        if (!ctx || ctx.ownerType === 'USER' || ctx.ownerType !== 'SYSTEM') {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
        }
        return true;
    }
};
exports.SystemGuard = SystemGuard;
exports.SystemGuard = SystemGuard = __decorate([
    (0, common_1.Injectable)()
], SystemGuard);
/**
 * Enforces the scope declared by @RequireScope() for API-key callers.
 *
 * Session callers are exempt: JwtStrategy has no scope source, so every session
 * would otherwise fail closed and lock the UI out of its own endpoints. Their
 * authorization stays with the ownerType guards, which still run. This narrows
 * api_keys below their ownerType; it never widens a session.
 *
 * Ordering matters: this must run after the ownerType guard so a USER key
 * holding system:* is rejected on ownerType, never admitted on scope.
 */
let ScopeGuard = class ScopeGuard {
    reflector;
    constructor(reflector) {
        this.reflector = reflector;
    }
    canActivate(context) {
        const requiredScope = this.reflector.getAllAndOverride(exports.REQUIRED_SCOPE_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!requiredScope)
            return true;
        const req = context.switchToHttp().getRequest();
        const ctx = req.authContext;
        if (!ctx) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.AUTH_REQUIRED, 'AUTH_REQUIRED', 401);
        }
        if (req.credentialType !== 'API_KEY')
            return true;
        (0, auth_context_1.requireScope)(ctx, requiredScope);
        return true;
    }
};
exports.ScopeGuard = ScopeGuard;
exports.ScopeGuard = ScopeGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector])
], ScopeGuard);
function RequireAuth() {
    return (0, common_1.applyDecorators)((0, common_1.UseGuards)(AuthGuard));
}
/**
 * Declares the api_keys scope required by a route. Compose with an ownerType
 * decorator, e.g. @RequireUser() @RequireScope('res_static:*').
 *
 * Metadata only, deliberately. ScopeGuard is registered by the ownerType
 * decorators below so it always runs after AuthGuard has set credentialType.
 * Adding UseGuards(ScopeGuard) here would prepend it to the chain and make it
 * run before authentication, where credentialType is still undefined and every
 * caller looks like a session — the check would silently never fire.
 */
function RequireScope(scope) {
    return (0, common_1.applyDecorators)((0, common_1.SetMetadata)(exports.REQUIRED_SCOPE_KEY, scope));
}
function RequireUser() {
    return (0, common_1.applyDecorators)((0, common_1.UseGuards)(AuthGuard, UserGuard, ScopeGuard));
}
function RequireOperator() {
    return (0, common_1.applyDecorators)((0, common_1.UseGuards)(AuthGuard, OperatorGuard, ScopeGuard));
}
function RequireTenantAdmin() {
    return (0, common_1.applyDecorators)((0, common_1.UseGuards)(AuthGuard, TenantAdminGuard, ScopeGuard));
}
function RequirePlatformAdmin() {
    return (0, common_1.applyDecorators)((0, common_1.UseGuards)(AuthGuard, PlatformAdminGuard, ScopeGuard));
}
function RequireSystem() {
    return (0, common_1.applyDecorators)((0, common_1.UseGuards)(AuthGuard, SystemGuard, ScopeGuard));
}
//# sourceMappingURL=guards.js.map