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
exports.ApiKeyStrategy = void 0;
const common_1 = require("@nestjs/common");
const crypto = __importStar(require("crypto"));
const app_error_1 = require("../errors/app-error");
const error_codes_1 = require("../errors/error-codes");
const api_keys_repository_1 = require("../../modules/api-keys/api-keys.repository");
const request_id_context_1 = require("../logging/request-id.context");
let ApiKeyStrategy = class ApiKeyStrategy {
    apiKeysRepo;
    constructor(apiKeysRepo) {
        this.apiKeysRepo = apiKeysRepo;
    }
    async authenticate(rawKey, clientIp) {
        const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
        const apiKey = await this.apiKeysRepo.findByKeyHash(hash);
        if (!apiKey || apiKey.status !== 'ACTIVE') {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.AUTH_REQUIRED, 'invalid_api_key', 401);
        }
        if (apiKey.ipWhitelist.length > 0 && !apiKey.ipWhitelist.includes(clientIp)) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'ip_not_whitelisted', 403);
        }
        await this.apiKeysRepo.updateLastUsed(apiKey.id);
        const ownerType = apiKey.ownerType === 'USER' ? 'USER' : 'TENANT_ADMIN';
        const requestId = request_id_context_1.requestIdStorage.getStore() ?? '';
        return {
            ownerId: apiKey.ownerId,
            ownerType,
            siteId: apiKey.siteId,
            tenantId: apiKey.tenantId,
            scopes: apiKey.scopes,
            requestId,
        };
    }
};
exports.ApiKeyStrategy = ApiKeyStrategy;
exports.ApiKeyStrategy = ApiKeyStrategy = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [api_keys_repository_1.ApiKeysRepository])
], ApiKeyStrategy);
//# sourceMappingURL=apikey.strategy.js.map