export type OwnerType = 'USER' | 'TENANT_ADMIN' | 'PLATFORM_ADMIN' | 'OPERATOR' | 'SYSTEM';
export interface AuthenticatedContext {
    ownerId: string;
    ownerType: OwnerType;
    siteId: string;
    tenantId: string | null;
    scopes: string[];
    requestId: string;
}
export declare function requireAuthenticatedContext(ctx: unknown): AuthenticatedContext;
export declare function requireUserContext(ctx: AuthenticatedContext): void;
export declare function requireOperatorContext(ctx: AuthenticatedContext): void;
export declare function requireTenantAdminContext(ctx: AuthenticatedContext, tenantId: string): void;
export declare function requirePlatformAdminContext(ctx: AuthenticatedContext): void;
export declare function requireSystemContext(ctx: AuthenticatedContext): void;
export declare function requireScope(ctx: AuthenticatedContext, requiredScope: string): void;
