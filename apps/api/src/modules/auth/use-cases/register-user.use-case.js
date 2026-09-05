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
exports.RegisterUserUseCase = void 0;
const common_1 = require("@nestjs/common");
const bcrypt = __importStar(require("bcryptjs"));
const app_error_1 = require("../../../common/errors/app-error");
const error_codes_1 = require("../../../common/errors/error-codes");
const auth_repository_1 = require("../auth.repository");
const auth_input_1 = require("../auth-input");
const config_service_1 = require("../../../common/config/config.service");
const request_id_context_1 = require("../../../common/logging/request-id.context");
const BCRYPT_COST = 10;
const MIN_PASSWORD_LENGTH = 8;
// Pragmatic single-pass email shape check; full RFC validation is left to the
// account lifecycle, not the signup gate.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let RegisterUserUseCase = class RegisterUserUseCase {
    authRepo;
    config;
    constructor(authRepo, config) {
        this.authRepo = authRepo;
        this.config = config;
    }
    /**
     * Self-service customer signup. Validates email shape and password strength,
     * rejects duplicate accounts (without leaking which field collided), lands the
     * user in the site's default signup tenant, then creates the user + zero-balance
     * wallet + audit row in one transaction and returns a session so the new user is
     * logged in immediately.
     */
    async execute(input) {
        // Narrow the body first: without a global ValidationPipe an absent body
        // arrives as `undefined`, and reading `.email` off it throws a TypeError
        // that would surface as a 500 instead of a 400.
        const body = (0, auth_input_1.authBody)(input, 'register_body_invalid');
        const email = typeof body['email'] === 'string' ? body['email'].trim() : '';
        const password = typeof body['password'] === 'string' ? body['password'] : '';
        const siteId = typeof body['siteId'] === 'string' ? body['siteId'] : '';
        const tenantId = typeof body['tenantId'] === 'string' ? body['tenantId'].trim() : '';
        if (!siteId) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'site_required', 400);
        }
        if (!EMAIL_PATTERN.test(email)) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'invalid_email', 400);
        }
        if (password.length < MIN_PASSWORD_LENGTH) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'password_too_weak', 400);
        }
        // users.email is unique per site, so dedup is scoped to this site. Checking
        // globally would reject someone who legitimately holds an account on another
        // site, and would make this 409 a cross-site account-existence oracle.
        const existing = await this.authRepo.findUserByEmail(siteId, email);
        if (existing) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'email_taken', 409);
        }
        const tenant = tenantId
            ? await this.authRepo.findSignupTenantById(siteId, tenantId)
            : await this.authRepo.findSignupTenant(siteId);
        if (!tenant) {
            // Misconfigured site (no ACTIVE tenant). Fail loudly instead of guessing.
            throw new app_error_1.AppError(tenantId ? error_codes_1.ErrorCode.VALIDATION_ERROR : error_codes_1.ErrorCode.INTERNAL_ERROR, tenantId ? 'signup_tenant_invalid' : 'no_signup_tenant', tenantId ? 400 : 500);
        }
        const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
        const currency = this.config.get('APP_PLATFORM_CURRENCY');
        const requestId = request_id_context_1.requestIdStorage.getStore() ?? '';
        const user = await this.authRepo.createUserWithWallet({
            siteId,
            tenantId: tenant.id,
            email,
            passwordHash,
            currency,
            requestId,
        });
        return this.authRepo.issueSession({
            ownerType: 'USER',
            ownerId: user.id,
            siteId,
            tenantId: tenant.id,
        });
    }
};
exports.RegisterUserUseCase = RegisterUserUseCase;
exports.RegisterUserUseCase = RegisterUserUseCase = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [auth_repository_1.AuthRepository,
        config_service_1.ConfigService])
], RegisterUserUseCase);
//# sourceMappingURL=register-user.use-case.js.map