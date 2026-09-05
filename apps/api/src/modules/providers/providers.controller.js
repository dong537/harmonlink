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
exports.ProvidersController = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("@ipeasy/db");
const guards_1 = require("../../common/auth/guards");
const current_context_decorator_1 = require("../../common/auth/current-context.decorator");
const config_service_1 = require("../../common/config/config.service");
const aes_gcm_1 = require("../../common/crypto/aes-gcm");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
const request_id_context_1 = require("../../common/logging/request-id.context");
const list_providers_use_case_1 = require("./use-cases/list-providers.use-case");
const health_check_provider_use_case_1 = require("./use-cases/health-check-provider.use-case");
const admin_access_1 = require("./admin-access");
const providers_repository_1 = require("./providers.repository");
const provider_registry_service_1 = require("./provider-registry.service");
const provider_base_url_1 = require("./provider-base-url");
const provider_credential_1 = require("./provider-credential");
/**
 * Platform-facing provider-health surface. Distinct from
 * `upstream-accounts` (the UPSTREAM_API gateway accounts): this reads native
 * `provider_accounts` and runs on-demand connectivity probes. PLATFORM_ADMIN
 * only — enforced in the use-cases.
 */
let ProvidersController = class ProvidersController {
    listUseCase;
    healthCheckUseCase;
    repo;
    registry;
    config;
    constructor(listUseCase, healthCheckUseCase, repo, registry, config) {
        this.listUseCase = listUseCase;
        this.healthCheckUseCase = healthCheckUseCase;
        this.repo = repo;
        this.registry = registry;
        this.config = config;
    }
    async list(ctx) {
        return this.listUseCase.execute(ctx);
    }
    async healthCheck(ctx, id) {
        return this.healthCheckUseCase.execute(ctx, id);
    }
    async create(ctx, body) {
        (0, admin_access_1.requireProviderAdmin)(ctx);
        assertRequestBody(body);
        const providerCode = assertProviderCode(body.providerCode);
        const baseUrl = assertBaseUrl(providerCode, body.baseUrl);
        const credential = (0, provider_credential_1.normalizeProviderCredential)(providerCode, body.credential, { partial: false });
        const account = await this.repo.create({
            siteId: ctx.siteId,
            providerCode,
            status: body.status === undefined ? 'ACTIVE' : assertProviderAccountStatus(body.status),
            credentialEncrypted: this.encryptCredential(credential),
            baseUrl,
            timeoutMs: body.timeoutMs === undefined ? undefined : assertTimeoutMs(body.timeoutMs),
            inventorySyncEnabled: body.inventorySyncEnabled === undefined ? undefined : assertBoolean(body.inventorySyncEnabled, 'inventory_sync_enabled_invalid'),
            enabledCountryCodes: normalizeEnabledCountryCodes(providerCode, body.enabledCountryCodes),
        });
        await writeAudit(ctx, account.id, 'provider_account.create', {
            providerCode,
            baseUrl,
            timeoutMs: account.timeoutMs,
            inventorySyncEnabled: account.inventorySyncEnabled,
            enabledCountryCodes: account.enabledCountryCodes,
        });
        return this.toListItem(account);
    }
    async update(ctx, id, body) {
        (0, admin_access_1.requireProviderAdmin)(ctx);
        assertRequestBody(body);
        const existing = await this.repo.findForSite(ctx.siteId, id);
        if (!existing)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'provider_account_not_found', 404);
        const data = {};
        if (body.status !== undefined)
            data.status = assertProviderAccountStatus(body.status);
        if (body.credential !== undefined) {
            data.credentialEncrypted = this.encryptMergedCredential(existing.providerCode, existing.credentialEncrypted, body.credential);
        }
        if (body.baseUrl !== undefined)
            data.baseUrl = assertBaseUrl(existing.providerCode, body.baseUrl);
        if (body.timeoutMs !== undefined)
            data.timeoutMs = assertTimeoutMs(body.timeoutMs);
        if (body.inventorySyncEnabled !== undefined) {
            data.inventorySyncEnabled = assertBoolean(body.inventorySyncEnabled, 'inventory_sync_enabled_invalid');
        }
        if (body.enabledCountryCodes !== undefined) {
            data.enabledCountryCodes = normalizeEnabledCountryCodes(existing.providerCode, body.enabledCountryCodes);
        }
        if (Object.keys(data).length === 0) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'provider_account_update_empty', 400);
        }
        const updated = await this.repo.update(ctx.siteId, id, data);
        if (!updated)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'provider_account_not_found', 404);
        const resourceConfigChangeReason = providerResourceConfigChangeReason(data);
        const resourceSelection = resourceConfigChangeReason
            ? await this.repo.hideProviderAccountResources(ctx.siteId, updated.providerCode, updated.id, resourceConfigChangeReason)
            : data.enabledCountryCodes === undefined
                ? null
                : await this.repo.applyEnabledCountrySelectionToResources(ctx.siteId, updated.providerCode, updated.enabledCountryCodes, updated.id);
        await writeAudit(ctx, id, 'provider_account.update', {
            changedFields: Object.keys(data).filter((key) => key !== 'credentialEncrypted').concat(data.credentialEncrypted ? ['credential'] : []),
            status: updated.status,
            baseUrl: updated.baseUrl,
            timeoutMs: updated.timeoutMs,
            inventorySyncEnabled: updated.inventorySyncEnabled,
            enabledCountryCodes: updated.enabledCountryCodes,
            resourceSelection,
        });
        return this.toListItem(updated);
    }
    async updateResourceSaleability(ctx, id, body) {
        (0, admin_access_1.requireProviderAdmin)(ctx);
        const items = normalizeResourceSaleabilityItems(body);
        const result = await this.repo.updateResourceSaleability(ctx.siteId, id, items);
        await writeAudit(ctx, id, 'provider_account.resource_saleability.update', {
            updated: result.updated,
            enabledCountryCodes: result.enabledCountryCodes,
        });
        return this.toListItem(result.account);
    }
    encryptCredential(credential) {
        return (0, aes_gcm_1.encryptAesGcm)(JSON.stringify(credential), this.config.get('APP_ENCRYPTION_KEY'));
    }
    encryptMergedCredential(providerCode, currentEncrypted, patch) {
        const currentCredential = this.decryptCredential(currentEncrypted);
        const patchCredential = (0, provider_credential_1.normalizeProviderCredential)(providerCode, patch, { partial: true });
        const merged = (0, provider_credential_1.normalizeProviderCredential)(providerCode, { ...currentCredential, ...patchCredential }, { partial: false });
        return this.encryptCredential(merged);
    }
    decryptCredential(encrypted) {
        try {
            const parsed = JSON.parse((0, aes_gcm_1.decryptAesGcm)(encrypted, this.config.get('APP_ENCRYPTION_KEY')));
            return (0, provider_credential_1.trimCredentialObject)(parsed, { partial: false });
        }
        catch {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.INTERNAL_ERROR, 'credential_decrypt_failed', 500);
        }
    }
    toListItem(record) {
        const adapter = this.registry.getAdapter(record.providerCode);
        return {
            id: record.id,
            providerCode: record.providerCode,
            tenantId: record.tenantId,
            status: record.status,
            baseUrl: record.baseUrl,
            timeoutMs: record.timeoutMs,
            inventorySyncEnabled: record.inventorySyncEnabled,
            enabledCountryCodes: record.enabledCountryCodes,
            availableCountries: availableCountriesForProvider(record.providerCode),
            capabilities: (0, admin_access_1.deriveCapabilities)(adapter, record.inventorySyncEnabled),
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
        };
    }
};
exports.ProvidersController = ProvidersController;
__decorate([
    (0, common_1.Get)(),
    (0, guards_1.RequireAuth)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ProvidersController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(':id/health-check'),
    (0, guards_1.RequireAuth)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ProvidersController.prototype, "healthCheck", null);
__decorate([
    (0, common_1.Post)(),
    (0, guards_1.RequireAuth)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ProvidersController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, guards_1.RequireAuth)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], ProvidersController.prototype, "update", null);
__decorate([
    (0, common_1.Put)(':id/resources/saleability'),
    (0, guards_1.RequireAuth)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], ProvidersController.prototype, "updateResourceSaleability", null);
exports.ProvidersController = ProvidersController = __decorate([
    (0, common_1.Controller)('providers'),
    __metadata("design:paramtypes", [list_providers_use_case_1.ListProvidersUseCase,
        health_check_provider_use_case_1.HealthCheckProviderUseCase,
        providers_repository_1.ProvidersRepository,
        provider_registry_service_1.ProviderRegistryService,
        config_service_1.ConfigService])
], ProvidersController);
async function writeAudit(ctx, targetId, action, meta) {
    await db_1.prisma.audit_logs.create({
        data: {
            siteId: ctx.siteId,
            tenantId: null,
            actorType: ctx.ownerType === 'SYSTEM' ? 'SYSTEM' : 'ADMIN_USER',
            actorId: ctx.ownerId,
            targetType: 'provider_account',
            targetId,
            action,
            requestId: request_id_context_1.requestIdStorage.getStore() ?? ctx.requestId,
            meta: meta,
        },
    });
}
function assertProviderCode(value) {
    if (value === 'IPIPD' || value === 'NINE_EIGHT_FIVE' || value === 'PR' || value === 'UPSTREAM_API')
        return value;
    throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'provider_code_invalid', 400);
}
function availableCountriesForProvider(providerCode) {
    void providerCode;
    return [];
}
function normalizeEnabledCountryCodes(providerCode, value) {
    void providerCode;
    if (value === undefined)
        return [];
    if (!Array.isArray(value)) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'enabled_country_codes_invalid', 400);
    }
    const normalized = value.map((item) => {
        if (typeof item !== 'string') {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'enabled_country_codes_invalid', 400);
        }
        return item.trim().toUpperCase();
    }).filter(Boolean);
    const unique = [...new Set(normalized)];
    for (const code of unique) {
        if (!/^[A-Z]{2}$/.test(code)) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'enabled_country_code_not_supported', 400);
        }
    }
    return unique;
}
function normalizeResourceSaleabilityItems(body) {
    assertRequestBody(body);
    if (!Array.isArray(body.items) || body.items.length === 0) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'resource_saleability_items_required', 400);
    }
    const changes = new Map();
    for (const item of body.items) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'resource_saleability_item_invalid', 400);
        }
        const resourceId = item.resourceId;
        if (typeof resourceId !== 'string' || resourceId.trim() === '') {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'resource_id_required', 400);
        }
        if (typeof item.saleable !== 'boolean') {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'resource_saleability_invalid', 400);
        }
        changes.set(resourceId.trim(), item.saleable);
    }
    return [...changes.entries()].map(([resourceId, saleable]) => ({ resourceId, saleable }));
}
function assertProviderAccountStatus(value) {
    if (value === 'ACTIVE' || value === 'DISABLED')
        return value;
    throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'provider_account_status_invalid', 400);
}
function providerResourceConfigChangeReason(data) {
    if (data.status === 'DISABLED')
        return 'provider_disabled';
    if (data.inventorySyncEnabled === false)
        return 'inventory_sync_disabled';
    if (data.baseUrl !== undefined || data.credentialEncrypted !== undefined)
        return 'provider_config_changed';
    return null;
}
function assertTimeoutMs(value) {
    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric < 1000 || numeric > 120000) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'provider_timeout_invalid', 400);
    }
    return numeric;
}
function assertBaseUrl(providerCode, value) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'base_url_required', 400);
    }
    return (0, provider_base_url_1.normalizeProviderBaseUrl)(providerCode, value);
}
function assertBoolean(value, reasonKey) {
    if (typeof value !== 'boolean') {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, reasonKey, 400);
    }
    return value;
}
function assertRequestBody(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'invalid_request', 400);
    }
}
//# sourceMappingURL=providers.controller.js.map