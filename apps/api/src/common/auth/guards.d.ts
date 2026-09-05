import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedContext } from './auth-context';
import { JwtStrategy } from './jwt.strategy';
import { ApiKeyStrategy } from './apikey.strategy';
/**
 * Which credential produced authContext. Scopes only exist on api_keys rows;
 * JwtStrategy always returns an empty scope list, so a scope check has to know
 * whether an empty list means "no grants" or "not a scoped credential at all".
 */
export type CredentialType = 'API_KEY' | 'SESSION';
export declare const REQUIRED_SCOPE_KEY = "ipeasy:requiredScope";
declare module 'fastify' {
    interface FastifyRequest {
        authContext?: AuthenticatedContext;
        sessionId?: string;
        credentialType?: CredentialType;
    }
}
export declare class AuthGuard implements CanActivate {
    private readonly jwt;
    private readonly apiKey;
    constructor(jwt: JwtStrategy, apiKey: ApiKeyStrategy);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
export declare class UserGuard implements CanActivate {
    canActivate(context: ExecutionContext): Promise<boolean>;
}
export declare class OperatorGuard implements CanActivate {
    canActivate(context: ExecutionContext): Promise<boolean>;
}
export declare class TenantAdminGuard implements CanActivate {
    canActivate(context: ExecutionContext): Promise<boolean>;
}
export declare class PlatformAdminGuard implements CanActivate {
    canActivate(context: ExecutionContext): Promise<boolean>;
}
export declare class SystemGuard implements CanActivate {
    canActivate(context: ExecutionContext): Promise<boolean>;
}
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
export declare class ScopeGuard implements CanActivate {
    private readonly reflector;
    constructor(reflector: Reflector);
    canActivate(context: ExecutionContext): boolean;
}
export declare function RequireAuth(): <TFunction extends Function, Y>(target: TFunction | object, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<Y>) => void;
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
export declare function RequireScope(scope: string): <TFunction extends Function, Y>(target: TFunction | object, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<Y>) => void;
export declare function RequireUser(): <TFunction extends Function, Y>(target: TFunction | object, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<Y>) => void;
export declare function RequireOperator(): <TFunction extends Function, Y>(target: TFunction | object, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<Y>) => void;
export declare function RequireTenantAdmin(): <TFunction extends Function, Y>(target: TFunction | object, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<Y>) => void;
export declare function RequirePlatformAdmin(): <TFunction extends Function, Y>(target: TFunction | object, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<Y>) => void;
export declare function RequireSystem(): <TFunction extends Function, Y>(target: TFunction | object, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<Y>) => void;
