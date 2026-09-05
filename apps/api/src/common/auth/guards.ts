import {
  Injectable,
  CanActivate,
  ExecutionContext,
  SetMetadata,
  applyDecorators,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';
import { AuthenticatedContext, requireScope } from './auth-context';
import { JwtStrategy } from './jwt.strategy';
import { ApiKeyStrategy } from './apikey.strategy';

/**
 * Which credential produced authContext. Scopes only exist on api_keys rows;
 * JwtStrategy always returns an empty scope list, so a scope check has to know
 * whether an empty list means "no grants" or "not a scoped credential at all".
 */
export type CredentialType = 'API_KEY' | 'SESSION';

export const REQUIRED_SCOPE_KEY = 'ipeasy:requiredScope';

// Attach parsed context to request so @CurrentContext() can read it
declare module 'fastify' {
  interface FastifyRequest {
    authContext?: AuthenticatedContext;
    sessionId?: string;
    credentialType?: CredentialType;
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtStrategy,
    private readonly apiKey: ApiKeyStrategy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const authorization = req.headers['authorization'];
    const apikeyHeader = req.headers['apikey'] as string | undefined;

    let ctx: AuthenticatedContext | undefined;

    if (authorization?.startsWith('Bearer ')) {
      const token = authorization.slice(7);
      const result = await this.jwt.authenticate(token);
      req.sessionId = result.sessionId;
      req.credentialType = 'SESSION';
      ctx = result;
    } else if (apikeyHeader) {
      const clientIp = req.ip ?? '';
      ctx = await this.apiKey.authenticate(apikeyHeader, clientIp);
      req.credentialType = 'API_KEY';
    } else {
      throw new AppError(ErrorCode.AUTH_REQUIRED, 'AUTH_REQUIRED', 401);
    }

    req.authContext = ctx;
    return true;
  }
}

@Injectable()
export class UserGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const ctx = req.authContext;
    if (!ctx || ctx.ownerType !== 'USER') {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
    }
    return true;
  }
}

@Injectable()
export class OperatorGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const ctx = req.authContext;
    if (
      !ctx ||
      (ctx.ownerType !== 'PLATFORM_ADMIN' && ctx.ownerType !== 'OPERATOR' && ctx.ownerType !== 'SYSTEM')
    ) {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
    }
    return true;
  }
}

@Injectable()
export class TenantAdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const ctx = req.authContext;
    if (!ctx || ctx.ownerType !== 'TENANT_ADMIN') {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
    }
    return true;
  }
}

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const ctx = req.authContext;
    if (!ctx || ctx.ownerType !== 'PLATFORM_ADMIN') {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
    }
    return true;
  }
}

@Injectable()
export class SystemGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const ctx = req.authContext;
    // Deny USER ownerType even if they somehow hold system:* scopes
    if (!ctx || ctx.ownerType === 'USER' || ctx.ownerType !== 'SYSTEM') {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
    }
    return true;
  }
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
@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScope = this.reflector.getAllAndOverride<string | undefined>(REQUIRED_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredScope) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const ctx = req.authContext;
    if (!ctx) {
      throw new AppError(ErrorCode.AUTH_REQUIRED, 'AUTH_REQUIRED', 401);
    }
    if (req.credentialType !== 'API_KEY') return true;

    requireScope(ctx, requiredScope);
    return true;
  }
}

export function RequireAuth() {
  return applyDecorators(UseGuards(AuthGuard));
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
export function RequireScope(scope: string) {
  return applyDecorators(SetMetadata(REQUIRED_SCOPE_KEY, scope));
}

export function RequireUser() {
  return applyDecorators(UseGuards(AuthGuard, UserGuard, ScopeGuard));
}

export function RequireOperator() {
  return applyDecorators(UseGuards(AuthGuard, OperatorGuard, ScopeGuard));
}

export function RequireTenantAdmin() {
  return applyDecorators(UseGuards(AuthGuard, TenantAdminGuard, ScopeGuard));
}

export function RequirePlatformAdmin() {
  return applyDecorators(UseGuards(AuthGuard, PlatformAdminGuard, ScopeGuard));
}

export function RequireSystem() {
  return applyDecorators(UseGuards(AuthGuard, SystemGuard, ScopeGuard));
}
