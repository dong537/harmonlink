import { Prisma } from '@ipeasy/db';
export type Session = Prisma.sessionsGetPayload<Record<string, never>>;
export declare class AuthRepository {
    findSessionByTokenHash(hash: string): Promise<Session>;
    createSession(data: {
        ownerType: 'USER' | 'ADMIN_USER';
        ownerId: string;
        siteId: string;
        tenantId: string | null;
        token: string;
        expiresAt: Date;
    }): Promise<Session>;
    /**
     * Mints an opaque session token, persists only its sha256 hash, and returns the
     * plain token plus expiry. Single source of truth for session creation so login
     * and self-registration cannot drift on token format, hashing, or TTL.
     */
    issueSession(owner: {
        ownerType: 'USER' | 'ADMIN_USER';
        ownerId: string;
        siteId: string;
        tenantId: string | null;
    }): Promise<{
        token: string;
        expiresAt: Date;
    }>;
    issueRefreshSession(owner: {
        ownerType: 'USER' | 'ADMIN_USER';
        ownerId: string;
        siteId: string;
        tenantId: string | null;
    }): Promise<{
        token: string;
        expiresAt: Date;
    }>;
    /**
     * Identity email is unique per site, not globally, so this lookup MUST be
     * site-scoped. An unscoped lookup would both reject a legitimate signup for
     * someone who already holds an account on a different site and turn the
     * duplicate-email response into a cross-site account oracle.
     */
    findUserByEmail(siteId: string, email: string): Promise<{
        id: string;
    } | null>;
    /**
     * Resolves the tenant that open self-registration should land in: the earliest
     * created ACTIVE tenant of the site. Returns null when the site has no usable
     * tenant so the caller can fail loudly instead of guessing.
     */
    findSignupTenant(siteId: string): Promise<{
        id: string;
    } | null>;
    findSignupTenantById(siteId: string, tenantId: string): Promise<{
        id: string;
    } | null>;
    /**
     * Atomically creates an ACTIVE user, a zero-balance wallet, and the
     * `auth.register` audit row. All three share one transaction so a partial
     * signup (user without wallet) can never be observed.
     */
    createUserWithWallet(data: {
        siteId: string;
        tenantId: string;
        email: string;
        passwordHash: string;
        currency: string;
        requestId: string;
    }): Promise<{
        id: string;
    }>;
    revokeSession(id: string): Promise<void>;
    findUserPasswordHash(userId: string, siteId: string): Promise<string>;
    updateUserPassword(userId: string, siteId: string, passwordHash: string): Promise<void>;
    /**
     * Revokes every other active session for a USER, keeping the current session
     * (so the device that just changed the password stays signed in). Sessions on
     * other devices must re-authenticate with the new password.
     */
    revokeOtherUserSessions(userId: string, currentSessionId: string): Promise<number>;
}
