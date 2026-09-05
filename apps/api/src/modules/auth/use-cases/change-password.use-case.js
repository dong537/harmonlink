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
exports.ChangePasswordUseCase = void 0;
const common_1 = require("@nestjs/common");
const bcrypt = __importStar(require("bcryptjs"));
const db_1 = require("@ipeasy/db");
const app_error_1 = require("../../../common/errors/app-error");
const error_codes_1 = require("../../../common/errors/error-codes");
const auth_repository_1 = require("../auth.repository");
const auth_input_1 = require("../auth-input");
const request_id_context_1 = require("../../../common/logging/request-id.context");
const BCRYPT_COST = 10;
const MIN_PASSWORD_LENGTH = 8;
let ChangePasswordUseCase = class ChangePasswordUseCase {
    authRepo;
    constructor(authRepo) {
        this.authRepo = authRepo;
    }
    /**
     * Changes the calling USER's login password. Verifies the old password with
     * bcrypt.compare (uniform error that does not reveal whether the account or the
     * password was at fault), enforces a minimum strength on the new password,
     * re-hashes with a production cost, and revokes the user's other sessions so a
     * leaked session elsewhere cannot survive a password change. The current
     * session is kept so the active device stays signed in.
     */
    async execute(ctx, currentSessionId, input) {
        if (ctx.ownerType !== 'USER') {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
        }
        // Permission is checked first so a non-USER caller cannot use body-shape
        // errors to probe this endpoint. Narrowing then keeps an absent body from
        // becoming a TypeError-driven 500.
        const body = (0, auth_input_1.authBody)(input, 'change_password_body_invalid');
        const oldPassword = typeof body['oldPassword'] === 'string' ? body['oldPassword'] : '';
        const newPassword = typeof body['newPassword'] === 'string' ? body['newPassword'] : '';
        if (newPassword.length < MIN_PASSWORD_LENGTH) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'password_too_weak', 400);
        }
        const currentHash = await this.authRepo.findUserPasswordHash(ctx.ownerId, ctx.siteId);
        const valid = await bcrypt.compare(oldPassword, currentHash);
        if (!valid) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'old_password_incorrect', 400);
        }
        if (await bcrypt.compare(newPassword, currentHash)) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'password_reuse', 400);
        }
        const newHash = await bcrypt.hash(newPassword, BCRYPT_COST);
        await this.authRepo.updateUserPassword(ctx.ownerId, ctx.siteId, newHash);
        await this.authRepo.revokeOtherUserSessions(ctx.ownerId, currentSessionId);
        const requestId = request_id_context_1.requestIdStorage.getStore() ?? '';
        await db_1.prisma.audit_logs.create({
            data: {
                siteId: ctx.siteId,
                tenantId: ctx.tenantId,
                actorType: 'USER',
                actorId: ctx.ownerId,
                targetType: 'user',
                targetId: ctx.ownerId,
                action: 'auth.change_password',
                requestId,
            },
        });
    }
};
exports.ChangePasswordUseCase = ChangePasswordUseCase;
exports.ChangePasswordUseCase = ChangePasswordUseCase = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [auth_repository_1.AuthRepository])
], ChangePasswordUseCase);
//# sourceMappingURL=change-password.use-case.js.map