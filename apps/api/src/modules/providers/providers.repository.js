"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProvidersRepository = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("@ipeasy/db");
const provider_saleability_policy_1 = require("../resources/provider-saleability-policy");
const base_price_1 = require("../pricing/base-price");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
const provider_account_order_1 = require("./provider-account-order");
/**
 * Read access to `provider_accounts` for the platform provider-health panel.
 * Listing is scoped to a site (PLATFORM_ADMIN); `findForSite` enforces the same
 * site boundary so a cross-site id resolves to "not found".
 */
let ProvidersRepository = class ProvidersRepository {
    async listForSite(siteId) {
        const rows = await db_1.prisma.provider_accounts.findMany({
            where: { siteId },
            orderBy: [{ providerCode: 'asc' }, ...provider_account_order_1.CURRENT_PROVIDER_ACCOUNT_ORDER_BY],
        });
        return rows.map(toRecord);
    }
    async findForSite(siteId, id) {
        const row = await db_1.prisma.provider_accounts.findFirst({ where: { id, siteId } });
        return row ? toRecord(row) : null;
    }
    async listInventorySyncEnabled() {
        const rows = await db_1.prisma.provider_accounts.findMany({
            select: {
                id: true,
                siteId: true,
                tenantId: true,
                providerCode: true,
                status: true,
                inventorySyncEnabled: true,
                enabledCountryCodes: true,
            },
            orderBy: [{ siteId: 'asc' }, { tenantId: 'asc' }, { providerCode: 'asc' }, ...provider_account_order_1.CURRENT_PROVIDER_ACCOUNT_ORDER_BY],
        });
        const latestByScope = new Map();
        for (const row of rows) {
            const key = `${row.siteId}:${row.tenantId ?? ''}:${row.providerCode}`;
            if (latestByScope.has(key))
                continue;
            latestByScope.set(key, {
                id: row.id,
                siteId: row.siteId,
                tenantId: row.tenantId,
                providerCode: row.providerCode,
                status: row.status,
                inventorySyncEnabled: row.inventorySyncEnabled,
                enabledCountryCodes: row.enabledCountryCodes,
            });
        }
        return [...latestByScope.values()].filter((row) => row.status === 'ACTIVE' && row.inventorySyncEnabled);
    }
    async create(data) {
        const row = await db_1.prisma.provider_accounts.create({
            data: {
                siteId: data.siteId,
                providerCode: data.providerCode,
                status: data.status,
                credentialEncrypted: data.credentialEncrypted,
                baseUrl: data.baseUrl,
                timeoutMs: data.timeoutMs,
                inventorySyncEnabled: data.inventorySyncEnabled,
                enabledCountryCodes: data.enabledCountryCodes,
            },
        });
        return toRecord(row);
    }
    async update(siteId, id, data) {
        const existing = await db_1.prisma.provider_accounts.findFirst({ where: { id, siteId }, select: { id: true } });
        if (!existing)
            return null;
        const row = await db_1.prisma.provider_accounts.update({
            where: { id: existing.id },
            data,
        });
        return toRecord(row);
    }
    async updateResourceSaleability(siteId, providerAccountId, items) {
        const account = await this.findForSite(siteId, providerAccountId);
        if (!account)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'provider_account_not_found', 404);
        const changeByResource = new Map(items.map((item) => [item.resourceId, item.saleable]));
        const resourceIds = [...changeByResource.keys()];
        if (resourceIds.length === 0) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'resource_saleability_items_required', 400);
        }
        const resources = await db_1.prisma.platform_resources.findMany({
            where: {
                siteId,
                providerCode: account.providerCode,
                upstreamAccountId: account.id,
            },
            select: {
                id: true,
                code: true,
                name: true,
                displayName: true,
                status: true,
                isVisible: true,
                isSaleable: true,
                unsaleableReason: true,
                resource_mappings: {
                    select: { providerResourceId: true },
                    orderBy: { weight: 'desc' },
                    take: 1,
                },
            },
        });
        const resourceById = new Map(resources.map((resource) => [resource.id, resource]));
        if (resourceIds.some((resourceId) => !resourceById.has(resourceId))) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'resource_not_found', 404);
        }
        const finalStateByResource = new Map();
        for (const resource of resources) {
            const requestedSaleable = changeByResource.get(resource.id);
            finalStateByResource.set(resource.id, requestedSaleable === undefined
                ? currentSaleabilityState(resource)
                : nextRequestedSaleabilityState(account.providerCode, resource, requestedSaleable));
        }
        const enabledCountryCodes = [...new Set(resources
                .filter((resource) => isSaleabilityEnabled(finalStateByResource.get(resource.id)))
                .map((resource) => (0, base_price_1.resourceCountryCode)(resource.code)))]
            .sort();
        const resourceUpdates = resourceIds.map((resourceId) => {
            const state = finalStateByResource.get(resourceId);
            if (!state)
                throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'resource_not_found', 404);
            return db_1.prisma.platform_resources.update({ where: { id: resourceId }, data: state });
        });
        const writes = [
            ...resourceUpdates,
            db_1.prisma.provider_accounts.update({
                where: { id: account.id },
                data: { enabledCountryCodes },
            }),
        ];
        const results = await db_1.prisma.$transaction(writes);
        const updatedAccount = results[results.length - 1];
        return {
            account: toRecord(updatedAccount),
            updated: resourceIds.length,
            enabledCountryCodes,
        };
    }
    async applyEnabledCountrySelectionToResources(siteId, providerCode, enabledCountryCodes, upstreamAccountId) {
        const plan = await this.planEnabledCountrySelectionToResources(siteId, providerCode, enabledCountryCodes, upstreamAccountId);
        const writes = [];
        if (plan.saleableIds.length > 0) {
            writes.push(db_1.prisma.platform_resources.updateMany({
                where: { siteId, id: { in: plan.saleableIds } },
                data: {
                    status: 'ACTIVE',
                    isVisible: true,
                    isSaleable: true,
                    unsaleableReason: null,
                },
            }));
        }
        if (plan.hiddenByPolicyIds.length > 0) {
            writes.push(db_1.prisma.platform_resources.updateMany({
                where: { siteId, id: { in: plan.hiddenByPolicyIds } },
                data: {
                    status: 'HIDDEN',
                    isVisible: false,
                    isSaleable: false,
                    unsaleableReason: 'provider_sale_policy_disabled',
                },
            }));
        }
        if (plan.hiddenByCountryIds.length > 0) {
            writes.push(db_1.prisma.platform_resources.updateMany({
                where: { siteId, id: { in: plan.hiddenByCountryIds } },
                data: {
                    status: 'HIDDEN',
                    isVisible: false,
                    isSaleable: false,
                    unsaleableReason: 'provider_country_disabled',
                },
            }));
        }
        if (plan.hiddenByManualIds.length > 0) {
            writes.push(db_1.prisma.platform_resources.updateMany({
                where: { siteId, id: { in: plan.hiddenByManualIds } },
                data: {
                    status: 'HIDDEN',
                    isVisible: false,
                    isSaleable: false,
                    unsaleableReason: 'provider_sale_disabled',
                },
            }));
        }
        if (writes.length > 0)
            await db_1.prisma.$transaction(writes);
        return { updated: plan.total, saleable: plan.saleable, hidden: plan.hidden };
    }
    async planEnabledCountrySelectionToResources(siteId, providerCode, enabledCountryCodes, upstreamAccountId) {
        const selectedCountries = resolveSelectedCountries(providerCode, enabledCountryCodes);
        const resources = await db_1.prisma.platform_resources.findMany({
            where: {
                siteId,
                providerCode,
                ...(upstreamAccountId !== undefined ? { upstreamAccountId } : {}),
                OR: [
                    { status: { not: 'DISABLED' } },
                    { unsaleableReason: { in: ['provider_country_disabled', 'provider_country_not_supported', 'provider_sale_disabled'] } },
                ],
            },
            select: {
                id: true,
                code: true,
                name: true,
                displayName: true,
                status: true,
                isVisible: true,
                isSaleable: true,
                unsaleableReason: true,
                resource_mappings: {
                    select: { providerResourceId: true },
                    orderBy: { weight: 'desc' },
                    take: 1,
                },
            },
        });
        const saleableIds = [];
        const hiddenByCountryIds = [];
        const hiddenByPolicyIds = [];
        const hiddenByManualIds = [];
        let changed = 0;
        for (const resource of resources) {
            const countrySelected = selectedCountries === null || selectedCountries.has((0, base_price_1.resourceCountryCode)(resource.code));
            const policy = (0, provider_saleability_policy_1.getProviderResourceSaleability)({
                providerCode,
                code: resource.code,
                name: resource.name,
                displayName: resource.displayName,
                providerResourceId: resource.resource_mappings?.[0]?.providerResourceId,
            });
            const manuallyHidden = countrySelected
                && policy.saleable
                && resource.status === 'HIDDEN'
                && resource.isVisible === false
                && resource.isSaleable === false
                && resource.unsaleableReason === 'provider_sale_disabled';
            const isSaleable = countrySelected && policy.saleable;
            if (manuallyHidden) {
                hiddenByManualIds.push(resource.id);
                if (resource.status !== 'HIDDEN'
                    || resource.isVisible
                    || resource.isSaleable
                    || resource.unsaleableReason !== 'provider_sale_disabled') {
                    changed++;
                }
            }
            else if (isSaleable) {
                saleableIds.push(resource.id);
                if (resource.status !== 'ACTIVE' || !resource.isVisible || !resource.isSaleable || resource.unsaleableReason !== null) {
                    changed++;
                }
            }
            else if (countrySelected) {
                hiddenByPolicyIds.push(resource.id);
                if (resource.status !== 'HIDDEN'
                    || resource.isVisible
                    || resource.isSaleable
                    || resource.unsaleableReason !== 'provider_sale_policy_disabled') {
                    changed++;
                }
            }
            else {
                hiddenByCountryIds.push(resource.id);
                if (resource.status !== 'HIDDEN'
                    || resource.isVisible
                    || resource.isSaleable
                    || resource.unsaleableReason !== 'provider_country_disabled') {
                    changed++;
                }
            }
        }
        return {
            total: resources.length,
            saleable: saleableIds.length,
            hiddenByCountry: hiddenByCountryIds.length,
            hiddenByPolicy: hiddenByPolicyIds.length,
            hiddenByManual: hiddenByManualIds.length,
            hidden: hiddenByPolicyIds.length + hiddenByCountryIds.length + hiddenByManualIds.length,
            changed,
            saleableIds,
            hiddenByCountryIds,
            hiddenByPolicyIds,
            hiddenByManualIds,
        };
    }
    hideProviderAccountResources(siteId, providerCode, upstreamAccountId, reason) {
        return db_1.prisma.platform_resources.updateMany({
            where: {
                siteId,
                providerCode,
                OR: [
                    { upstreamAccountId },
                    { upstreamAccountId: null },
                ],
                status: { not: 'DISABLED' },
            },
            data: {
                status: 'HIDDEN',
                isVisible: false,
                isSaleable: false,
                unsaleableReason: reason,
            },
        });
    }
};
exports.ProvidersRepository = ProvidersRepository;
exports.ProvidersRepository = ProvidersRepository = __decorate([
    (0, common_1.Injectable)()
], ProvidersRepository);
function resolveSelectedCountries(providerCode, enabledCountryCodes) {
    const normalized = enabledCountryCodes.map((code) => code.trim().toUpperCase()).filter(Boolean);
    if (normalized.length > 0)
        return new Set(normalized);
    if ((0, provider_saleability_policy_1.isManagedNativeProviderCode)(providerCode))
        return new Set();
    return null;
}
function nextRequestedSaleabilityState(providerCode, resource, requestedSaleable) {
    const policy = (0, provider_saleability_policy_1.getProviderResourceSaleability)({
        providerCode,
        code: resource.code,
        name: resource.name,
        displayName: resource.displayName,
        providerResourceId: resource.resource_mappings?.[0]?.providerResourceId,
    });
    if (requestedSaleable && policy.saleable) {
        return {
            status: 'ACTIVE',
            isVisible: true,
            isSaleable: true,
            unsaleableReason: null,
        };
    }
    return {
        status: 'HIDDEN',
        isVisible: false,
        isSaleable: false,
        unsaleableReason: saleabilityDisabledReason(requestedSaleable),
    };
}
function currentSaleabilityState(resource) {
    return {
        status: resource.status === 'ACTIVE' ? 'ACTIVE' : 'HIDDEN',
        isVisible: resource.isVisible,
        isSaleable: resource.isSaleable,
        unsaleableReason: resource.unsaleableReason,
    };
}
function isSaleabilityEnabled(state) {
    return Boolean(state && state.status === 'ACTIVE' && state.isVisible && state.isSaleable);
}
function saleabilityDisabledReason(requestedSaleable) {
    if (!requestedSaleable)
        return 'provider_sale_disabled';
    return 'provider_sale_policy_disabled';
}
function toRecord(row) {
    return {
        id: row.id,
        siteId: row.siteId,
        tenantId: row.tenantId,
        providerCode: row.providerCode,
        status: row.status,
        credentialEncrypted: row.credentialEncrypted,
        baseUrl: row.baseUrl,
        timeoutMs: row.timeoutMs,
        inventorySyncEnabled: row.inventorySyncEnabled,
        enabledCountryCodes: row.enabledCountryCodes,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
//# sourceMappingURL=providers.repository.js.map