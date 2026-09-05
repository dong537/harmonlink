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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const login_use_case_1 = require("./use-cases/login.use-case");
const logout_use_case_1 = require("./use-cases/logout.use-case");
const change_password_use_case_1 = require("./use-cases/change-password.use-case");
const register_user_use_case_1 = require("./use-cases/register-user.use-case");
const guards_1 = require("../../common/auth/guards");
const current_context_decorator_1 = require("../../common/auth/current-context.decorator");
let AuthController = class AuthController {
    loginUseCase;
    logoutUseCase;
    changePasswordUseCase;
    registerUserUseCase;
    constructor(loginUseCase, logoutUseCase, changePasswordUseCase, registerUserUseCase) {
        this.loginUseCase = loginUseCase;
        this.logoutUseCase = logoutUseCase;
        this.changePasswordUseCase = changePasswordUseCase;
        this.registerUserUseCase = registerUserUseCase;
    }
    async login(body) {
        return this.loginUseCase.execute(body);
    }
    async register(body) {
        return this.registerUserUseCase.execute(body);
    }
    me(ctx) {
        return {
            ownerId: ctx.ownerId,
            ownerType: ctx.ownerType,
            siteId: ctx.siteId,
            tenantId: ctx.tenantId,
            scopes: ctx.scopes,
        };
    }
    async logout(ctx, req) {
        const sessionId = req.sessionId ?? '';
        await this.logoutUseCase.execute(ctx, sessionId);
    }
    async changePassword(ctx, req, body) {
        const sessionId = req.sessionId ?? '';
        await this.changePasswordUseCase.execute(ctx, sessionId, body);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('login'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('register'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "register", null);
__decorate([
    (0, common_1.Get)('me'),
    (0, guards_1.RequireAuth)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], AuthController.prototype, "me", null);
__decorate([
    (0, common_1.Post)('logout'),
    (0, guards_1.RequireAuth)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, common_1.Post)('change-password'),
    (0, guards_1.RequireAuth)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "changePassword", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [login_use_case_1.LoginUseCase,
        logout_use_case_1.LogoutUseCase,
        change_password_use_case_1.ChangePasswordUseCase,
        register_user_use_case_1.RegisterUserUseCase])
], AuthController);
//# sourceMappingURL=auth.controller.js.map