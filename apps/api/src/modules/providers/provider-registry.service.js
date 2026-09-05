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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderRegistryService = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("@ipeasy/db");
const config_service_1 = require("../../common/config/config.service");
const aes_gcm_1 = require("../../common/crypto/aes-gcm");
const upstream_log_repository_1 = require("./upstream-log.repository");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
const provider_account_order_1 = require("./provider-account-order");
let ProviderRegistryService = class ProviderRegistryService {
    config;
    upstreamLogRepo;
    adapters;
    constructor(config, upstreamLogRepo, adapters) {
        this.config = config;
        this.upstreamLogRepo = upstreamLogRepo;
        this.adapters = adapters;
    }
    async getConfig(providerCode, siteId, tenantId) {
        if (providerCode === 'UPSTREAM_API') {
            if (!siteId)
                return disabledUpstreamApiConfig(undefined);
            const config = await this.getConfigForUpstreamAccount(siteId, tenantId ?? null);
            return config ?? disabledUpstreamApiConfig(siteId);
        }
        const account = await findProviderAccount(providerCode, siteId, tenantId);
        if (!account || account.status === 'DISABLED') {
            return {
                code: providerCode,
                status: 'DISABLED',
                siteId: account?.siteId ?? siteId,
                upstreamAccountId: account?.id,
                updatedAt: account?.updatedAt,
                baseUrl: account?.baseUrl ?? '',
                timeoutMs: account?.timeoutMs ?? 15000,
                inventorySyncEnabled: account?.inventorySyncEnabled ?? false,
                enabledCountryCodes: account?.enabledCountryCodes ?? [],
                credential: {},
            };
        }
        const encryptionKey = this.config.get('APP_ENCRYPTION_KEY');
        let credential;
        try {
            credential = JSON.parse((0, aes_gcm_1.decryptAesGcm)(account.credentialEncrypted, encryptionKey));
        }
        catch {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.INTERNAL_ERROR, 'credential_decrypt_failed', 500);
        }
        return {
            code: providerCode,
            status: 'ACTIVE',
            siteId: account.siteId,
            upstreamAccountId: account.id,
            updatedAt: account.updatedAt,
            baseUrl: account.baseUrl,
            timeoutMs: account.timeoutMs,
            inventorySyncEnabled: account.inventorySyncEnabled,
            enabledCountryCodes: account.enabledCountryCodes,
            credential,
        };
    }
    async getConfigForProviderAccount(providerCode, siteId, accountId) {
        if (providerCode === 'UPSTREAM_API') {
            return this.getConfigForUpstreamAccountById(siteId, accountId);
        }
        const account = await db_1.prisma.provider_accounts.findFirst({
            where: { id: accountId, siteId, providerCode },
        });
        if (!account || account.status === 'DISABLED') {
            return {
                code: providerCode,
                status: 'DISABLED',
                siteId: account?.siteId ?? siteId,
                upstreamAccountId: account?.id ?? accountId,
                updatedAt: account?.updatedAt,
                baseUrl: account?.baseUrl ?? '',
                timeoutMs: account?.timeoutMs ?? 15000,
                inventorySyncEnabled: account?.inventorySyncEnabled ?? false,
                enabledCountryCodes: account?.enabledCountryCodes ?? [],
                credential: {},
            };
        }
        const encryptionKey = this.config.get('APP_ENCRYPTION_KEY');
        let credential;
        try {
            credential = JSON.parse((0, aes_gcm_1.decryptAesGcm)(account.credentialEncrypted, encryptionKey));
        }
        catch {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.INTERNAL_ERROR, 'credential_decrypt_failed', 500);
        }
        return {
            code: providerCode,
            status: 'ACTIVE',
            siteId: account.siteId,
            upstreamAccountId: account.id,
            updatedAt: account.updatedAt,
            baseUrl: account.baseUrl,
            timeoutMs: account.timeoutMs,
            inventorySyncEnabled: account.inventorySyncEnabled,
            enabledCountryCodes: account.enabledCountryCodes,
            credential,
        };
    }
    async getConfigForUpstreamAccountById(siteId, accountId) {
        const account = await db_1.prisma.upstream_api_accounts.findFirst({
            where: { id: accountId, siteId },
        });
        if (!account || account.status === 'DISABLED') {
            return disabledUpstreamApiConfig(account?.siteId ?? siteId, account?.id ?? accountId, account ?? undefined);
        }
        const encryptionKey = this.config.get('APP_ENCRYPTION_KEY');
        let apiKey;
        try {
            apiKey = (0, aes_gcm_1.decryptAesGcm)(account.apiKeyEncrypted, encryptionKey);
        }
        catch {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.INTERNAL_ERROR, 'credential_decrypt_failed', 500);
        }
        return upstreamApiConfig(account, apiKey);
    }
    async getConfigForUpstreamAccount(siteId, tenantId) {
        const account = (tenantId
            ? await db_1.prisma.upstream_api_accounts.findFirst({
                where: { siteId, tenantId, status: 'ACTIVE' },
                orderBy: provider_account_order_1.CURRENT_UPSTREAM_API_ACCOUNT_ORDER_BY,
            })
            : null) ??
            (await db_1.prisma.upstream_api_accounts.findFirst({
                where: { siteId, tenantId: null, status: 'ACTIVE' },
                orderBy: provider_account_order_1.CURRENT_UPSTREAM_API_ACCOUNT_ORDER_BY,
            }));
        if (!account)
            return null;
        const encryptionKey = this.config.get('APP_ENCRYPTION_KEY');
        let apiKey;
        try {
            apiKey = (0, aes_gcm_1.decryptAesGcm)(account.apiKeyEncrypted, encryptionKey);
        }
        catch {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.INTERNAL_ERROR, 'credential_decrypt_failed', 500);
        }
        return upstreamApiConfig(account, apiKey);
    }
    getAdapter(code) {
        const adapter = this.adapters.find((a) => a.code === code);
        if (!adapter)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.INTERNAL_ERROR, 'adapter_not_found', 500);
        return adapter;
    }
    async logUpstreamRequest(data) {
        await this.upstreamLogRepo.create(data);
    }
};
exports.ProviderRegistryService = ProviderRegistryService;
exports.ProviderRegistryService = ProviderRegistryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService,
        upstream_log_repository_1.UpstreamLogRepository, Array])
], ProviderRegistryService);
function upstreamApiConfig(account, apiKey) {
    return {
        code: 'UPSTREAM_API',
        status: 'ACTIVE',
        siteId: account.siteId,
        upstreamAccountId: account.id,
        updatedAt: account.updatedAt,
        baseUrl: account.baseUrl,
        timeoutMs: account.timeoutMs,
        inventorySyncEnabled: account.inventorySyncEnabled,
        enabledCountryCodes: [],
        credential: { apiKey },
    };
}
function disabledUpstreamApiConfig(siteId, accountId, account) {
    return {
        code: 'UPSTREAM_API',
        status: 'DISABLED',
        siteId,
        upstreamAccountId: accountId,
        updatedAt: account?.updatedAt,
        baseUrl: account?.baseUrl ?? '',
        timeoutMs: account?.timeoutMs ?? 15000,
        inventorySyncEnabled: account?.inventorySyncEnabled ?? false,
        enabledCountryCodes: [],
        credential: {},
    };
}
async function findProviderAccount(providerCode, siteId, tenantId) {
    let tenantAccount = null;
    if (siteId && tenantId) {
        tenantAccount = await db_1.prisma.provider_accounts.findFirst({
            where: { siteId, tenantId, providerCode },
            orderBy: provider_account_order_1.CURRENT_PROVIDER_ACCOUNT_ORDER_BY,
        });
        if (tenantAccount?.status === 'ACTIVE')
            return tenantAccount;
    }
    const siteAccount = await db_1.prisma.provider_accounts.findFirst({
        where: {
            providerCode,
            tenantId: null,
            ...(siteId ? { siteId } : {}),
        },
        orderBy: provider_account_order_1.CURRENT_PROVIDER_ACCOUNT_ORDER_BY,
    });
    return siteAccount ?? tenantAccount;
}
//# sourceMappingURL=provider-registry.service.js.map