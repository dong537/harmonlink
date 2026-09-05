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
exports.SyncInventoryUseCase = void 0;
const common_1 = require("@nestjs/common");
const provider_registry_service_1 = require("../../providers/provider-registry.service");
const resources_repository_1 = require("../resources.repository");
const app_error_1 = require("../../../common/errors/app-error");
const error_codes_1 = require("../../../common/errors/error-codes");
const provider_saleability_policy_1 = require("../provider-saleability-policy");
const inventory_freshness_1 = require("../inventory-freshness");
const dedicated_line_inventory_repository_1 = require("../../dedicated-line-orders/dedicated-line-inventory.repository");
let SyncInventoryUseCase = class SyncInventoryUseCase {
    registry;
    repo;
    dedicatedInventory;
    constructor(registry, repo, dedicatedInventory) {
        this.registry = registry;
        this.repo = repo;
        this.dedicatedInventory = dedicatedInventory;
    }
    async execute(siteId, providerCode, tenantId, accountId) {
        const config = accountId
            ? await this.registry.getConfigForProviderAccount(providerCode, siteId, accountId)
            : await this.registry.getConfig(providerCode, siteId, tenantId);
        if (config.status === 'DISABLED') {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_DISABLED, 'upstream_disabled', 422);
        }
        if (!config.inventorySyncEnabled) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_DISABLED, 'inventory_sync_disabled', 503);
        }
        const adapter = this.registry.getAdapter(providerCode);
        const result = await adapter.syncInventory(config);
        if (result.providerCode !== providerCode) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'inventory_provider_mismatch', 502);
        }
        const upstreamAccountId = config.upstreamAccountId ?? accountId ?? null;
        const selectedCountryCodes = resolveSelectedCountryCodes(providerCode, config.enabledCountryCodes);
        const selectedCountrySet = selectedCountryCodes ? new Set(selectedCountryCodes) : null;
        const items = result.items;
        const hiddenByCountrySelection = selectedCountrySet
            ? result.items.filter((item) => !selectedCountrySet.has(normalizeCountryCode(item.countryCode))).length
            : 0;
        if (items.length === 0) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'inventory_empty', 502);
        }
        if (upstreamAccountId && this.dedicatedInventory) {
            await this.dedicatedInventory.syncProviderSnapshot({
                siteId,
                providerAccountId: upstreamAccountId,
                providerCode,
                items,
                capturedAt: result.syncedAt,
            });
        }
        const countries = new Set();
        const allowedResources = new Map();
        let created = 0;
        let updated = 0;
        const skipped = hiddenByCountrySelection;
        let synced = 0;
        for (const item of items) {
            const resourceCode = syncedResourceCode(item.countryCode, item.providerResourceId);
            const resourceName = syncedResourceName(item.countryName, item.regionCode, item.providerResourceId, item.networkCidr);
            const existing = await this.repo.findSyncedResource(siteId, providerCode, upstreamAccountId, resourceCode, item.ipType);
            const selectionData = resourceSelectionState(providerCode, item.countryCode, selectedCountrySet, existing?.unsaleableReason);
            const resource = await this.repo.upsertSyncedResource({
                siteId,
                providerCode,
                upstreamAccountId,
                code: resourceCode,
                name: resourceName,
                displayName: resourceName,
                type: resourceCode === item.countryCode ? 'COUNTRY' : 'REGION',
                ipType: item.ipType,
                protocol: item.protocol,
                providerResourceId: item.providerResourceId,
                upstreamCost: item.upstreamCost,
                upstreamCostCurrency: item.upstreamCostCurrency,
                saleabilityOverride: selectionData ?? undefined,
            });
            if (existing) {
                updated++;
            }
            else {
                created++;
            }
            await this.repo.upsertInventorySnapshot({
                siteId,
                resourceId: resource.id,
                providerCode,
                upstreamAccountId,
                stock: item.stock,
                capturedAt: result.syncedAt,
                freshnessTtlSeconds: (0, inventory_freshness_1.inventoryFreshnessTtlSeconds)(providerCode),
            });
            await this.repo.upsertMapping({
                siteId,
                resourceId: resource.id,
                providerCode,
                upstreamAccountId,
                providerResourceId: item.providerResourceId,
            });
            allowedResources.set(resourceCoverageKey(resourceCode, item.ipType), {
                code: resourceCode,
                ipType: item.ipType,
            });
            synced++;
            countries.add(item.countryCode);
        }
        if ((0, provider_saleability_policy_1.isManagedNativeProviderCode)(providerCode)) {
            await this.repo.disableResourcesOutsideCoverage(siteId, providerCode, upstreamAccountId, [...allowedResources.values()]);
        }
        else if (providerCode === 'UPSTREAM_API') {
            await this.repo.hideResourcesOutsideCurrentSync(siteId, providerCode, upstreamAccountId, [...allowedResources.values()]);
        }
        if (upstreamAccountId) {
            await this.repo.hideResourcesFromOtherUpstreamAccounts(siteId, providerCode, upstreamAccountId);
        }
        return {
            attempted: result.items.length,
            created,
            updated,
            skipped,
            failed: 0,
            synced,
            syncedAt: result.syncedAt,
            upstreamRawStatus: 'SUCCESS',
            countries: [...countries].sort(),
        };
    }
    async requiresRefreshForProviderConfig(siteId, providerCode, tenantId, capturedAt, accountId) {
        const config = accountId
            ? await this.registry.getConfigForProviderAccount(providerCode, siteId, accountId)
            : await this.registry.getConfig(providerCode, siteId, tenantId);
        if (config.status !== 'ACTIVE' || !config.inventorySyncEnabled)
            return true;
        return Boolean(config.updatedAt && config.updatedAt.getTime() > capturedAt.getTime());
    }
    async resolveActiveUpstreamAccountId(siteId, providerCode, tenantId) {
        const config = await this.registry.getConfig(providerCode, siteId, tenantId);
        if (config.status !== 'ACTIVE') {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_DISABLED, 'provider_disabled', 503);
        }
        if (!config.inventorySyncEnabled) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_DISABLED, 'inventory_sync_disabled', 503);
        }
        return config.upstreamAccountId ?? null;
    }
};
exports.SyncInventoryUseCase = SyncInventoryUseCase;
exports.SyncInventoryUseCase = SyncInventoryUseCase = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [provider_registry_service_1.ProviderRegistryService,
        resources_repository_1.ResourcesRepository,
        dedicated_line_inventory_repository_1.DedicatedLineInventoryRepository])
], SyncInventoryUseCase);
function resolveSelectedCountryCodes(providerCode, enabledCountryCodes) {
    if (!(0, provider_saleability_policy_1.isManagedNativeProviderCode)(providerCode))
        return null;
    return Array.isArray(enabledCountryCodes)
        ? enabledCountryCodes
            .filter((code) => typeof code === 'string' && code.trim())
            .map((code) => code.trim().toUpperCase())
        : [];
}
function resourceSelectionState(providerCode, countryCode, selectedCountrySet, existingUnsaleableReason) {
    if (existingUnsaleableReason === 'provider_sale_disabled') {
        return {
            status: 'HIDDEN',
            isVisible: false,
            isSaleable: false,
            unsaleableReason: 'provider_sale_disabled',
        };
    }
    if (!(0, provider_saleability_policy_1.isManagedNativeProviderCode)(providerCode) || !selectedCountrySet)
        return null;
    if (selectedCountrySet.has(normalizeCountryCode(countryCode)))
        return null;
    return {
        status: 'HIDDEN',
        isVisible: false,
        isSaleable: false,
        unsaleableReason: 'provider_country_disabled',
    };
}
function normalizeCountryCode(countryCode) {
    return countryCode.trim().toUpperCase();
}
function syncedResourceCode(countryCode, providerResourceId) {
    const country = normalizeCountryCode(countryCode);
    const upstream = providerResourceId.trim();
    if (!upstream || upstream === country)
        return country;
    if (upstream.toUpperCase().startsWith(`${country}:`))
        return upstream;
    return `${country}:${upstream}`;
}
function resourceCoverageKey(code, ipType) {
    return `${ipType}:${code}`;
}
function syncedResourceName(countryName, regionCode, providerResourceId, networkCidr) {
    const base = countryName.trim() || providerResourceId;
    const region = regionCode?.trim();
    const locationName = region && !base.includes(region) ? `${base}-${region}` : base;
    const cidr = networkCidr?.trim();
    return cidr ? `${locationName}-${cidr}` : locationName;
}
//# sourceMappingURL=sync-inventory.use-case.js.map