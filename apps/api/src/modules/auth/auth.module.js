"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const auth_controller_1 = require("./auth.controller");
const auth_repository_1 = require("./auth.repository");
const login_use_case_1 = require("./use-cases/login.use-case");
const logout_use_case_1 = require("./use-cases/logout.use-case");
const change_password_use_case_1 = require("./use-cases/change-password.use-case");
const register_user_use_case_1 = require("./use-cases/register-user.use-case");
const config_service_1 = require("../../common/config/config.service");
const jwt_strategy_1 = require("../../common/auth/jwt.strategy");
const apikey_strategy_1 = require("../../common/auth/apikey.strategy");
const guards_1 = require("../../common/auth/guards");
const api_keys_repository_1 = require("../api-keys/api-keys.repository");
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        controllers: [auth_controller_1.AuthController],
        providers: [
            auth_repository_1.AuthRepository,
            api_keys_repository_1.ApiKeysRepository,
            jwt_strategy_1.JwtStrategy,
            apikey_strategy_1.ApiKeyStrategy,
            guards_1.AuthGuard,
            guards_1.UserGuard,
            guards_1.OperatorGuard,
            guards_1.TenantAdminGuard,
            guards_1.PlatformAdminGuard,
            guards_1.SystemGuard,
            login_use_case_1.LoginUseCase,
            logout_use_case_1.LogoutUseCase,
            change_password_use_case_1.ChangePasswordUseCase,
            register_user_use_case_1.RegisterUserUseCase,
            config_service_1.ConfigService,
        ],
        exports: [
            auth_repository_1.AuthRepository,
            api_keys_repository_1.ApiKeysRepository,
            jwt_strategy_1.JwtStrategy,
            apikey_strategy_1.ApiKeyStrategy,
            guards_1.AuthGuard,
            guards_1.UserGuard,
            guards_1.OperatorGuard,
            guards_1.TenantAdminGuard,
            guards_1.PlatformAdminGuard,
            guards_1.SystemGuard,
            login_use_case_1.LoginUseCase,
            logout_use_case_1.LogoutUseCase,
        ],
    })
], AuthModule);
//# sourceMappingURL=auth.module.js.map