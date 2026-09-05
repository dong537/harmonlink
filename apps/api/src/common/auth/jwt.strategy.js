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
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JwtStrategy = void 0;
const common_1 = require("@nestjs/common");
const crypto = __importStar(require("crypto"));
const db_1 = require("@ipeasy/db");
const app_error_1 = require("../errors/app-error");
const error_codes_1 = require("../errors/error-codes");
const auth_repository_1 = require("../../modules/auth/auth.repository");
const request_id_context_1 = require("../logging/request-id.context");
let JwtStrategy = class JwtStrategy {
    authRepo;
    constructor(authRepo) {
        this.authRepo = authRepo;
    }
    async authenticate(bearerToken) {
        if (bearerToken.startsWith('rt_')) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.AUTH_REQUIRED, 'refresh_token_not_allowed', 401);
        }
        const hash = crypto.createHash('sha256').update(bearerToken).digest('hex');
        const session = await this.authRepo.findSessionByTokenHash(hash);
        if (session.revokedAt !== null || session.expiresAt < new Date()) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.AUTH_REQUIRED, 'session_expired', 401);
        }
        const requestId = request_id_context_1.requestIdStorage.getStore() ?? '';
        let ownerType;
        if (session.ownerType === 'USER') {
            ownerType = 'USER';
        }
        else {
            const adminUser = await db_1.prisma.admin_users.findUnique({ where: { id: session.ownerId } });
            if (!adminUser)
                throw new app_error_1.AppError(error_codes_1.ErrorCode.AUTH_REQUIRED, 'session_expired', 401);
            // Represent the DB role faithfully. Collapsing OPERATOR into
            // PLATFORM_ADMIN would make RequirePlatformAdmin() accept operators.
            if (adminUser.role === 'PLATFORM_ADMIN') {
                ownerType = 'PLATFORM_ADMIN';
            }
            else if (adminUser.role === 'OPERATOR') {
                ownerType = 'OPERATOR';
            }
            else {
                ownerType = 'TENANT_ADMIN';
            }
        }
        return {
            ownerId: session.ownerId,
            ownerType,
            siteId: session.siteId,
            tenantId: session.tenantId ?? null,
            scopes: [],
            requestId,
            sessionId: session.id,
        };
    }
};
exports.JwtStrategy = JwtStrategy;
exports.JwtStrategy = JwtStrategy = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [auth_repository_1.AuthRepository])
], JwtStrategy);
//# sourceMappingURL=jwt.strategy.js.map