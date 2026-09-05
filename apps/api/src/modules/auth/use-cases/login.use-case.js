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
exports.LoginUseCase = void 0;
const common_1 = require("@nestjs/common");
const bcrypt = __importStar(require("bcryptjs"));
const db_1 = require("@ipeasy/db");
const app_error_1 = require("../../../common/errors/app-error");
const error_codes_1 = require("../../../common/errors/error-codes");
const auth_repository_1 = require("../auth.repository");
const auth_input_1 = require("../auth-input");
const request_id_context_1 = require("../../../common/logging/request-id.context");
let LoginUseCase = class LoginUseCase {
    authRepo;
    constructor(authRepo) {
        this.authRepo = authRepo;
    }
    async execute(input) {
        const identity = await this.authenticate(input);
        const { token, expiresAt } = await this.authRepo.issueSession(identity);
        await this.auditLogin(identity);
        return { token, expiresAt };
    }
    async executeLegacy(input, expectedOwnerType) {
        const identity = await this.authenticate(input, expectedOwnerType);
        const access = await this.authRepo.issueSession(identity);
        const refresh = await this.authRepo.issueRefreshSession(identity);
        await this.auditLogin(identity);
        return { token: access.token, expiresAt: access.expiresAt, refreshToken: refresh.token, identity };
    }
    /**
     * Shape validation lives here rather than in a controller because this is the
     * single funnel for both `/api/auth/login` and the legacy `/api/v1/auth/*`
     * entry points. There is no global ValidationPipe, so an unvalidated body
     * previously reached `bcrypt.compare(undefined, hash)`, which throws a plain
     * Error and surfaced as a 500 instead of a 400.
     *
     * Field-shape failures are 400. Credential mismatch stays 401
     * `invalid_credentials` and is deliberately identical for unknown email and
     * wrong password, so neither status nor reasonKey can be used to enumerate
     * accounts.
     */
    parseCredentials(input) {
        const body = (0, auth_input_1.authBody)(input, 'login_body_invalid');
        return {
            email: (0, auth_input_1.authEmail)(body['email'], 'login_email_required'),
            password: (0, auth_input_1.authSecret)(body['password'], 'login_password_required'),
            siteId: (0, auth_input_1.authToken)(body['siteId'], 'login_site_required'),
        };
    }
    async authenticate(input, expectedOwnerType) {
        const { email, password, siteId } = this.parseCredentials(input);
        const user = expectedOwnerType === 'ADMIN_USER'
            ? null
            : await db_1.prisma.users.findFirst({ where: { email, siteId } });
        const adminUser = expectedOwnerType === 'USER'
            ? null
            : user ? null : await db_1.prisma.admin_users.findFirst({ where: { email, siteId } });
        const record = user ?? adminUser;
        if (!record || !(await bcrypt.compare(password, record.passwordHash))) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.AUTH_REQUIRED, 'invalid_credentials', 401);
        }
        const ownerType = user ? 'USER' : 'ADMIN_USER';
        const admin = adminUser;
        return {
            ownerType,
            ownerId: record.id,
            siteId,
            tenantId: user ? user.tenantId : admin?.tenantId ?? null,
            email: record.email,
            name: user?.name ?? null,
            role: user ? 'user' : String(admin?.role ?? 'admin').toLowerCase(),
        };
    }
    async auditLogin(identity) {
        const requestId = request_id_context_1.requestIdStorage.getStore() ?? '';
        await db_1.prisma.audit_logs.create({
            data: {
                siteId: identity.siteId,
                tenantId: identity.tenantId,
                actorType: identity.ownerType === 'USER' ? 'USER' : 'ADMIN_USER',
                actorId: identity.ownerId,
                action: 'auth.login',
                requestId,
            },
        });
    }
};
exports.LoginUseCase = LoginUseCase;
exports.LoginUseCase = LoginUseCase = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [auth_repository_1.AuthRepository])
], LoginUseCase);
//# sourceMappingURL=login.use-case.js.map