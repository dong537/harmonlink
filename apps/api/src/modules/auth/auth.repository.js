"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthRepository = void 0;
const common_1 = require("@nestjs/common");
const crypto = __importStar(require("crypto"));
const db_1 = require("@ipeasy/db");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
let AuthRepository = class AuthRepository {
    async findSessionByTokenHash(hash) {
        const session = await db_1.prisma.sessions.findUnique({ where: { token: hash } });
        if (!session) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.AUTH_REQUIRED, 'session_not_found', 401);
        }
        return session;
    }
    async createSession(data) {
        return db_1.prisma.sessions.create({
            data: {
                ownerType: data.ownerType,
                ownerId: data.ownerId,
                siteId: data.siteId,
                tenantId: data.tenantId,
                token: data.token,
                expiresAt: data.expiresAt,
            },
        });
    }
    /**
     * Mints an opaque session token, persists only its sha256 hash, and returns the
     * plain token plus expiry. Single source of truth for session creation so login
     * and self-registration cannot drift on token format, hashing, or TTL.
     */
    async issueSession(owner) {
        const plainToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
        const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
        const session = await this.createSession({ ...owner, token: tokenHash, expiresAt });
        return { token: plainToken, expiresAt: session.expiresAt };
    }
    async issueRefreshSession(owner) {
        const plainToken = `rt_${crypto.randomBytes(32).toString('hex')}`;
        const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
        const expiresAt = new Date(Date.now() + REFRESH_SESSION_TTL_MS);
        const session = await this.createSession({ ...owner, token: tokenHash, expiresAt });
        return { token: plainToken, expiresAt: session.expiresAt };
    }
    /**
     * Identity email is unique per site, not globally, so this lookup MUST be
     * site-scoped. An unscoped lookup would both reject a legitimate signup for
     * someone who already holds an account on a different site and turn the
     * duplicate-email response into a cross-site account oracle.
     */
    async findUserByEmail(siteId, email) {
        return db_1.prisma.users.findUnique({
            where: { siteId_email: { siteId, email } },
            select: { id: true },
        });
    }
    /**
     * Resolves the tenant that open self-registration should land in: the earliest
     * created ACTIVE tenant of the site. Returns null when the site has no usable
     * tenant so the caller can fail loudly instead of guessing.
     */
    async findSignupTenant(siteId) {
        return db_1.prisma.tenants.findFirst({
            where: { siteId, status: 'ACTIVE' },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
        });
    }
    async findSignupTenantById(siteId, tenantId) {
        return db_1.prisma.tenants.findFirst({
            where: { id: tenantId, siteId, status: 'ACTIVE' },
            select: { id: true },
        });
    }
    /**
     * Atomically creates an ACTIVE user, a zero-balance wallet, and the
     * `auth.register` audit row. All three share one transaction so a partial
     * signup (user without wallet) can never be observed.
     */
    async createUserWithWallet(data) {
        return db_1.prisma.$transaction(async (tx) => {
            const user = await tx.users.create({
                data: {
                    siteId: data.siteId,
                    tenantId: data.tenantId,
                    email: data.email,
                    passwordHash: data.passwordHash,
                    status: 'ACTIVE',
                    kycStatus: 'NONE',
                    riskStatus: 'NORMAL',
                },
                select: { id: true },
            });
            await tx.wallets.create({
                data: {
                    siteId: data.siteId,
                    tenantId: data.tenantId,
                    userId: user.id,
                    available: '0',
                    frozen: '0',
                    currency: data.currency,
                },
            });
            await tx.audit_logs.create({
                data: {
                    siteId: data.siteId,
                    tenantId: data.tenantId,
                    actorType: 'USER',
                    actorId: user.id,
                    targetType: 'user',
                    targetId: user.id,
                    action: 'auth.register',
                    requestId: data.requestId,
                },
            });
            return user;
        });
    }
    async revokeSession(id) {
        await db_1.prisma.sessions.update({
            where: { id },
            data: { revokedAt: new Date() },
        });
    }
    async findUserPasswordHash(userId, siteId) {
        const user = await db_1.prisma.users.findFirst({
            where: { id: userId, siteId },
            select: { passwordHash: true },
        });
        if (!user) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'user_not_found', 404);
        }
        return user.passwordHash;
    }
    async updateUserPassword(userId, siteId, passwordHash) {
        const result = await db_1.prisma.users.updateMany({
            where: { id: userId, siteId },
            data: { passwordHash },
        });
        if (result.count === 0) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'user_not_found', 404);
        }
    }
    /**
     * Revokes every other active session for a USER, keeping the current session
     * (so the device that just changed the password stays signed in). Sessions on
     * other devices must re-authenticate with the new password.
     */
    async revokeOtherUserSessions(userId, currentSessionId) {
        const result = await db_1.prisma.sessions.updateMany({
            where: {
                ownerType: 'USER',
                ownerId: userId,
                revokedAt: null,
                id: { not: currentSessionId },
            },
            data: { revokedAt: new Date() },
        });
        return result.count;
    }
};
exports.AuthRepository = AuthRepository;
exports.AuthRepository = AuthRepository = __decorate([
    (0, common_1.Injectable)()
], AuthRepository);
//# sourceMappingURL=auth.repository.js.map