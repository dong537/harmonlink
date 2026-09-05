"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourcesRepository = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const db_1 = require("@ipeasy/db");
const client_1 = require("@ipeasy/db/generated/client");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
const domain_1 = require("./domain");
const base_price_1 = require("../pricing/base-price");
const price_scopes_1 = require("../pricing/price-scopes");
const provider_saleability_policy_1 = require("./provider-saleability-policy");
const inventory_freshness_1 = require("./inventory-freshness");
const current_resource_account_filter_1 = require("../providers/current-resource-account-filter");
const PRICEABLE_CATALOG_MAX_PAGE_SIZE = 500;
const PRICEABLE_CATALOG_SELECTOR_PAGE_SIZE = 20;
let ResourcesRepository = class ResourcesRepository {
    findById(id) {
        return db_1.prisma.platform_resources.findUnique({ where: { id } });
    }
    findByIdInSite(id, siteId) {
        return db_1.prisma.platform_resources.findFirst({ where: { id, siteId } });
    }
    async list(siteId, query = {}) {
        const page = parsePositiveInteger(query.page, 1, 'page');
        const pageSize = parsePositiveInteger(query.pageSize, 20, 'pageSize', 20);
        if (query.publicOnly) {
            return this.listPublicSaleable(siteId, { ...query, page, pageSize });
        }
        const where = { siteId };
        if (query.status) {
            if (!isResourceStatus(query.status)) {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'resource_status_invalid', 400);
            }
            where.status = query.status;
        }
        if (query.type) {
            if (!isResourceType(query.type)) {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'resource_type_invalid', 400);
            }
            where.type = query.type;
        }
        if (query.providerCode)
            where.providerCode = query.providerCode;
        appendWhereAnd(where, await (0, current_resource_account_filter_1.buildCurrentResourceAccountWhere)(siteId, {
            tenantId: query.tenantId,
            providerCode: query.providerCode,
        }));
        const searchConditions = buildResourceSearchConditions(query.search);
        if (searchConditions.length > 0)
            where.OR = searchConditions;
        const [total, rows] = await Promise.all([
            db_1.prisma.platform_resources.count({ where }),
            db_1.prisma.platform_resources.findMany({
                where,
                skip: (page - 1) * pageSize,
                take: pageSize,
                orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                include: {
                    inventory_snapshots: {
                        orderBy: { capturedAt: 'desc' },
                        take: 1,
                    },
                    resource_mappings: {
                        orderBy: { weight: 'desc' },
                        take: 1,
                    },
                },
            }),
        ]);
        const priceByResource = await this.getAdminOverridePriceMap(siteId, rows.map((row) => row.id), parsePositiveInteger(query.durationDays, 30, 'durationDays'), query.currency);
        return {
            page,
            pageSize,
            total,
            items: rows.map((row) => toResourceListItem(row, priceByResource.get(row.id) ?? null, true)),
        };
    }
    async listPriceableCatalog(siteId, query = {}) {
        const page = parsePositiveInteger(query.page, 1, 'page');
        const pageSize = parsePositiveInteger(query.pageSize, 20, 'pageSize', PRICEABLE_CATALOG_MAX_PAGE_SIZE);
        const durationDays = parsePositiveInteger(query.durationDays, 30, 'durationDays');
        const where = await this.buildPriceableCatalogWhere(siteId, query);
        const [total, rows] = await Promise.all([
            db_1.prisma.platform_resources.count({ where }),
            db_1.prisma.platform_resources.findMany({
                where,
                skip: (page - 1) * pageSize,
                take: pageSize,
                orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                select: {
                    id: true,
                    upstreamAccountId: true,
                    parentId: true,
                    type: true,
                    code: true,
                    name: true,
                    displayName: true,
                    providerCode: true,
                    ipType: true,
                    protocol: true,
                    status: true,
                    sortOrder: true,
                    isVisible: true,
                    isSaleable: true,
                    unsaleableReason: true,
                    upstreamCost: true,
                    upstreamCostCurrency: true,
                    resource_mappings: {
                        select: {
                            upstreamAccountId: true,
                            providerResourceId: true,
                        },
                        orderBy: { weight: 'desc' },
                        take: 1,
                    },
                },
            }),
        ]);
        const priceByResource = await this.getAdminOverridePriceMap(siteId, rows.map((row) => row.id), durationDays, query.currency);
        const items = rows.map((row) => toPriceableCatalogItem(row, priceByResource.get(row.id) ?? null));
        return {
            page,
            pageSize,
            total,
            items,
        };
    }
    async listPriceableCatalogSummary(siteId, query = {}) {
        const page = parsePositiveInteger(query.page, 1, 'page');
        const pageSize = parsePositiveInteger(query.pageSize, PRICEABLE_CATALOG_SELECTOR_PAGE_SIZE, 'pageSize', PRICEABLE_CATALOG_SELECTOR_PAGE_SIZE);
        const durationDays = parsePositiveInteger(query.durationDays, 30, 'durationDays');
        const where = await this.buildPriceableCatalogWhere(siteId, query);
        const rows = await db_1.prisma.platform_resources.findMany({
            where,
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            select: {
                id: true,
                code: true,
                name: true,
                displayName: true,
                upstreamCost: true,
                upstreamCostCurrency: true,
                resource_mappings: {
                    select: {
                        providerResourceId: true,
                    },
                    orderBy: { weight: 'desc' },
                    take: 1,
                },
            },
        });
        const priceByResource = await this.getAdminOverridePriceMap(siteId, rows.map((row) => row.id), durationDays, query.currency);
        const summaryByCountry = new Map();
        for (const row of rows) {
            const countryCode = (0, base_price_1.resourceCountryCode)(row.code);
            const current = summaryByCountry.get(countryCode) ?? {
                countryCode,
                totalResources: 0,
                pricedCount: 0,
                regionKeys: new Set(),
                costGroupKeys: new Set(),
            };
            current.totalResources += 1;
            if (priceByResource.has(row.id))
                current.pricedCount += 1;
            current.regionKeys.add(getPriceableCatalogRegionKey(row));
            current.costGroupKeys.add(toPublicCostGroupKey(row.upstreamCost, row.upstreamCostCurrency));
            summaryByCountry.set(countryCode, current);
        }
        const allItems = [...summaryByCountry.values()]
            .map((item) => ({
            countryCode: item.countryCode,
            totalResources: item.totalResources,
            regionCount: shouldCollapseCountrySummaryToAutoSelect(item) ? 1 : item.regionKeys.size,
            pricedCount: item.pricedCount,
            costGroupCount: item.costGroupKeys.size,
        }))
            .sort((left, right) => left.countryCode.localeCompare(right.countryCode));
        const start = (page - 1) * pageSize;
        return {
            page,
            pageSize,
            total: allItems.length,
            totalResources: rows.length,
            items: allItems.slice(start, start + pageSize),
        };
    }
    async listPriceableCatalogGroups(siteId, query = {}) {
        const countryCode = normalizeCountryCodeOrThrow(query.countryCode);
        const page = parsePositiveInteger(query.page, 1, 'page');
        const pageSize = parsePositiveInteger(query.pageSize, PRICEABLE_CATALOG_SELECTOR_PAGE_SIZE, 'pageSize', PRICEABLE_CATALOG_SELECTOR_PAGE_SIZE);
        const durationDays = parsePositiveInteger(query.durationDays, 30, 'durationDays');
        const rows = await this.findPriceableCatalogRows(siteId, { ...query, countryCode });
        const priceByResource = await this.getAdminOverridePriceMap(siteId, rows.map((row) => row.id), durationDays, query.currency);
        const groups = buildInternalPriceableCatalogGroups(rows)
            .map((group) => toPriceableCatalogGroupItem(group, priceByResource))
            .sort(comparePriceableCatalogGroups);
        const start = (page - 1) * pageSize;
        return {
            countryCode,
            page,
            pageSize,
            total: groups.length,
            totalResources: rows.length,
            items: groups.slice(start, start + pageSize),
        };
    }
    async findPriceableCatalogGroupResourceIds(siteId, selector) {
        const countryCode = normalizeCountryCodeOrThrow(selector.countryCode);
        const rows = await this.findPriceableCatalogRows(siteId, { ...selector, countryCode });
        const groups = buildInternalPriceableCatalogGroups(rows);
        const autoSelect = isTruthy(selector.autoSelect);
        const matched = groups.find((group) => {
            if (autoSelect)
                return group.autoSelect && group.countryCode === countryCode;
            return (group.countryCode === countryCode
                && group.regionKey === selector.regionKey
                && group.costGroupKey === selector.costGroupKey);
        });
        return matched?.resourceIds ?? [];
    }
    async updatePriceableCatalogGroupSaleability(siteId, selector, saleable) {
        const resourceIds = await this.findPriceableCatalogGroupResourceIds(siteId, selector);
        if (resourceIds.length === 0) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'resource_group_not_found', 404);
        }
        const result = await db_1.prisma.platform_resources.updateMany({
            where: {
                siteId,
                id: { in: resourceIds },
            },
            data: saleable
                ? {
                    status: 'ACTIVE',
                    isVisible: true,
                    isSaleable: true,
                    unsaleableReason: null,
                }
                : {
                    status: 'HIDDEN',
                    isVisible: false,
                    isSaleable: false,
                    unsaleableReason: 'provider_sale_disabled',
                },
        });
        return { updated: result.count, resourceIds };
    }
    async listPublicCountries(siteId, query = {}) {
        const where = {
            siteId,
            status: 'ACTIVE',
            isVisible: true,
            isSaleable: true,
        };
        applyConcreteSaleableResourceFilter(where, siteId);
        appendWhereAnd(where, await (0, current_resource_account_filter_1.buildCurrentResourceAccountWhere)(siteId, {
            tenantId: query.tenantId,
            providerCode: query.providerCode,
        }));
        if (query.providerCode)
            where.providerCode = query.providerCode;
        applyCountryCodeFilter(where, query.countryCode);
        const searchConditions = buildResourceSearchConditions(query.search);
        if (searchConditions.length > 0)
            where.OR = searchConditions;
        parsePositiveInteger(query.durationDays, 30, 'durationDays');
        const rows = await db_1.prisma.platform_resources.findMany({
            where,
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            select: {
                code: true,
                providerCode: true,
                ipType: true,
            },
        });
        const countries = new Map();
        for (const row of rows) {
            const countryCode = (0, base_price_1.resourceCountryCode)(row.code);
            const current = countries.get(countryCode) ?? { countryCode, totalResources: 0, availableStock: 0 };
            current.totalResources += 1;
            countries.set(countryCode, current);
        }
        return { items: [...countries.values()].sort((left, right) => left.countryCode.localeCompare(right.countryCode)) };
    }
    async buildPriceableCatalogWhere(siteId, query = {}) {
        const where = {
            siteId,
            status: 'ACTIVE',
            isVisible: true,
            isSaleable: true,
        };
        applyConcreteSaleableResourceFilter(where, siteId);
        if (query.providerCode)
            where.providerCode = query.providerCode;
        appendWhereAnd(where, await (0, current_resource_account_filter_1.buildCurrentResourceAccountWhere)(siteId, {
            tenantId: query.tenantId,
            providerCode: query.providerCode,
        }));
        applyCountryCodeFilter(where, query.countryCode);
        const searchConditions = buildResourceSearchConditions(query.search);
        if (searchConditions.length > 0)
            where.OR = searchConditions;
        return where;
    }
    async findPriceableCatalogRows(siteId, query = {}) {
        return db_1.prisma.platform_resources.findMany({
            where: await this.buildPriceableCatalogWhere(siteId, query),
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            select: {
                id: true,
                upstreamAccountId: true,
                parentId: true,
                type: true,
                code: true,
                name: true,
                displayName: true,
                providerCode: true,
                ipType: true,
                protocol: true,
                status: true,
                sortOrder: true,
                isVisible: true,
                isSaleable: true,
                unsaleableReason: true,
                upstreamCost: true,
                upstreamCostCurrency: true,
                resource_mappings: {
                    select: {
                        upstreamAccountId: true,
                        providerResourceId: true,
                    },
                    orderBy: { weight: 'desc' },
                    take: 1,
                },
            },
        });
    }
    create(data) {
        return db_1.prisma.platform_resources.create({ data });
    }
    update(id, _siteId, data) {
        return db_1.prisma.platform_resources.update({ where: { id }, data });
    }
    findSyncedResource(siteId, providerCode, upstreamAccountId, code, ipType) {
        return db_1.prisma.platform_resources.findFirst({
            where: {
                siteId,
                providerCode,
                upstreamAccountId: upstreamAccountId ?? null,
                code,
                ipType,
            },
        });
    }
    async hasProviderMapping(siteId, resourceId, providerCode) {
        const mapping = await db_1.prisma.resource_mappings.findFirst({
            where: {
                siteId,
                resourceId,
                providerCode,
            },
            select: { id: true },
        });
        return Boolean(mapping);
    }
    async upsertSyncedResource(data) {
        const cost = normalizeUpstreamCost(data.upstreamCost);
        const saleability = (0, provider_saleability_policy_1.getProviderResourceSaleability)(data);
        const saleabilityData = data.saleabilityOverride ?? (saleability.managed
            ? {
                status: saleability.saleable ? 'ACTIVE' : 'HIDDEN',
                isVisible: saleability.saleable,
                isSaleable: saleability.saleable,
                unsaleableReason: saleability.reason,
            }
            : { status: 'ACTIVE', isVisible: true, isSaleable: true, unsaleableReason: null });
        const createData = {
            siteId: data.siteId,
            upstreamAccountId: data.upstreamAccountId ?? null,
            parentId: data.parentId ?? undefined,
            providerCode: data.providerCode,
            code: data.code,
            name: data.name,
            displayName: data.displayName ?? data.name,
            type: data.type ?? 'COUNTRY',
            ipType: data.ipType,
            protocol: data.protocol,
            ...saleabilityData,
            upstreamCost: cost === null ? null : new client_1.Prisma.Decimal(cost),
            upstreamCostCurrency: cost === null ? null : data.upstreamCostCurrency ?? 'CNY',
        };
        const updateData = {
            name: data.name,
            displayName: data.displayName ?? data.name,
            ...(data.parentId !== undefined ? { parentId: data.parentId } : {}),
            ...(data.type ? { type: data.type } : {}),
            protocol: data.protocol,
            ...saleabilityData,
            upstreamCost: cost === null ? null : new client_1.Prisma.Decimal(cost),
            upstreamCostCurrency: cost === null ? null : data.upstreamCostCurrency ?? 'CNY',
        };
        if (!data.upstreamAccountId) {
            const existing = await db_1.prisma.platform_resources.findFirst({
                where: {
                    siteId: data.siteId,
                    providerCode: data.providerCode,
                    upstreamAccountId: null,
                    code: data.code,
                    ipType: data.ipType,
                },
                select: { id: true },
            });
            return existing
                ? db_1.prisma.platform_resources.update({ where: { id: existing.id }, data: updateData })
                : db_1.prisma.platform_resources.create({ data: createData });
        }
        return db_1.prisma.platform_resources.upsert({
            where: {
                siteId_providerCode_upstreamAccountId_code_ipType: {
                    siteId: data.siteId,
                    providerCode: data.providerCode,
                    upstreamAccountId: data.upstreamAccountId,
                    code: data.code,
                    ipType: data.ipType,
                },
            },
            create: createData,
            update: updateData,
        });
    }
    disableResourcesOutsideCoverage(siteId, providerCode, upstreamAccountId, allowedResources) {
        const keepFilter = buildResourceCoverageKeepFilter(allowedResources);
        return db_1.prisma.platform_resources.updateMany({
            where: {
                siteId,
                providerCode,
                upstreamAccountId: upstreamAccountId ?? null,
                status: { not: 'DISABLED' },
                ...(keepFilter ? { NOT: keepFilter } : {}),
            },
            data: {
                status: 'DISABLED',
                isVisible: false,
                isSaleable: false,
                unsaleableReason: 'provider_country_not_supported',
            },
        });
    }
    hideResourcesOutsideEnabledCountries(siteId, providerCode, allowedCodes) {
        return db_1.prisma.platform_resources.updateMany({
            where: {
                siteId,
                providerCode,
                code: { notIn: allowedCodes },
                status: { not: 'DISABLED' },
            },
            data: {
                status: 'HIDDEN',
                isVisible: false,
                isSaleable: false,
                unsaleableReason: 'provider_country_disabled',
            },
        });
    }
    async findProviderAccountTenant(siteId, providerCode, upstreamAccountId) {
        if (providerCode === 'UPSTREAM_API') {
            const account = await db_1.prisma.upstream_api_accounts.findFirst({
                where: { id: upstreamAccountId, siteId },
                select: { tenantId: true },
            });
            return account ? account.tenantId : undefined;
        }
        const account = await db_1.prisma.provider_accounts.findFirst({
            where: { id: upstreamAccountId, siteId, providerCode },
            select: { tenantId: true },
        });
        return account ? account.tenantId : undefined;
    }
    hideResourcesOutsideCurrentSync(siteId, providerCode, upstreamAccountId, currentResources) {
        const keepFilter = buildResourceCoverageKeepFilter(currentResources);
        return db_1.prisma.platform_resources.updateMany({
            where: {
                siteId,
                providerCode,
                upstreamAccountId: upstreamAccountId ?? null,
                status: { not: 'DISABLED' },
                ...(keepFilter ? { NOT: keepFilter } : {}),
            },
            data: {
                status: 'HIDDEN',
                isVisible: false,
                isSaleable: false,
                unsaleableReason: 'upstream_resource_not_returned',
            },
        });
    }
    async hideResourcesFromOtherUpstreamAccounts(siteId, providerCode, upstreamAccountId) {
        const currentAccountIds = await (0, current_resource_account_filter_1.resolveCurrentResourceAccountIdsForProvider)(siteId, providerCode);
        const keepAccountIds = [...new Set([...currentAccountIds, upstreamAccountId])];
        return db_1.prisma.platform_resources.updateMany({
            where: {
                siteId,
                providerCode,
                status: { not: 'DISABLED' },
                OR: [
                    { upstreamAccountId: { notIn: keepAccountIds } },
                    { upstreamAccountId: null },
                ],
            },
            data: {
                status: 'HIDDEN',
                isVisible: false,
                isSaleable: false,
                unsaleableReason: 'upstream_resource_not_returned',
            },
        });
    }
    hideUpstreamAccountResources(siteId, providerCode, upstreamAccountId, reason) {
        return db_1.prisma.platform_resources.updateMany({
            where: {
                siteId,
                providerCode,
                status: { not: 'DISABLED' },
                OR: [
                    { upstreamAccountId },
                    { upstreamAccountId: null },
                ],
            },
            data: {
                status: 'HIDDEN',
                isVisible: false,
                isSaleable: false,
                unsaleableReason: reason,
            },
        });
    }
    upsertInventorySnapshot(data) {
        return db_1.prisma.inventory_snapshots.create({
            data: {
                siteId: data.siteId,
                resourceId: data.resourceId,
                providerCode: data.providerCode,
                upstreamAccountId: data.upstreamAccountId ?? null,
                stock: data.stock,
                capturedAt: data.capturedAt,
                freshnessTtlSeconds: data.freshnessTtlSeconds ?? (0, inventory_freshness_1.inventoryFreshnessTtlSeconds)(data.providerCode),
                isStale: false,
            },
        });
    }
    async listInventory(resourceId, siteId) {
        const snapshots = await db_1.prisma.inventory_snapshots.findMany({
            where: { resourceId, ...(siteId ? { siteId } : {}) },
            orderBy: { capturedAt: 'desc' },
        });
        return snapshots.map((s) => ({ ...s, isStale: (0, domain_1.isInventorySnapshotStale)(s) }));
    }
    async getLatestInventory(resourceId, siteId, upstreamAccountId) {
        const snapshot = await db_1.prisma.inventory_snapshots.findFirst({
            where: {
                resourceId,
                siteId,
                ...(upstreamAccountId !== undefined ? { upstreamAccountId } : {}),
            },
            orderBy: { capturedAt: 'desc' },
        });
        return snapshot ? { ...snapshot, isStale: (0, domain_1.isInventorySnapshotStale)(snapshot) } : null;
    }
    async upsertMapping(data) {
        const createData = { ...data, upstreamAccountId: data.upstreamAccountId ?? null, weight: data.weight ?? 100 };
        const updateData = { providerResourceId: data.providerResourceId, weight: data.weight ?? 100 };
        if (!data.upstreamAccountId) {
            const existing = await db_1.prisma.resource_mappings.findFirst({
                where: {
                    siteId: data.siteId,
                    resourceId: data.resourceId,
                    providerCode: data.providerCode,
                    upstreamAccountId: null,
                },
                select: { id: true },
            });
            return existing
                ? db_1.prisma.resource_mappings.update({ where: { id: existing.id }, data: updateData })
                : db_1.prisma.resource_mappings.create({ data: createData });
        }
        return db_1.prisma.resource_mappings.upsert({
            where: {
                siteId_resourceId_providerCode_upstreamAccountId: {
                    siteId: data.siteId,
                    resourceId: data.resourceId,
                    providerCode: data.providerCode,
                    upstreamAccountId: data.upstreamAccountId,
                },
            },
            create: createData,
            update: updateData,
        });
    }
    async listPublicSaleable(siteId, query) {
        const durationDays = parsePositiveInteger(query.durationDays, 30, 'durationDays');
        const currency = query.currency || 'CNY';
        const where = {
            siteId,
            status: 'ACTIVE',
            isVisible: true,
            isSaleable: true,
        };
        applyConcreteSaleableResourceFilter(where, siteId);
        appendWhereAnd(where, await (0, current_resource_account_filter_1.buildCurrentResourceAccountWhere)(siteId, {
            tenantId: query.tenantId,
            providerCode: query.providerCode,
        }));
        if (query.type) {
            if (!isResourceType(query.type)) {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'resource_type_invalid', 400);
            }
            where.type = query.type;
        }
        if (query.providerCode)
            where.providerCode = query.providerCode;
        applyCountryCodeFilter(where, query.countryCode);
        const searchConditions = buildResourceSearchConditions(query.search);
        if (searchConditions.length > 0)
            where.OR = searchConditions;
        const [total, rows] = await Promise.all([
            db_1.prisma.platform_resources.count({ where }),
            db_1.prisma.platform_resources.findMany({
                where,
                skip: (query.page - 1) * query.pageSize,
                take: query.pageSize,
                orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                select: {
                    id: true,
                    upstreamAccountId: true,
                    parentId: true,
                    type: true,
                    code: true,
                    name: true,
                    displayName: true,
                    providerCode: true,
                    ipType: true,
                    protocol: true,
                    status: true,
                    sortOrder: true,
                    isVisible: true,
                    isSaleable: true,
                    unsaleableReason: true,
                    upstreamCost: true,
                    upstreamCostCurrency: true,
                    inventory_snapshots: {
                        select: {
                            stock: true,
                            capturedAt: true,
                            freshnessTtlSeconds: true,
                            isStale: true,
                        },
                        orderBy: { capturedAt: 'desc' },
                        take: 1,
                    },
                    resource_mappings: {
                        select: {
                            upstreamAccountId: true,
                            providerResourceId: true,
                        },
                        orderBy: { weight: 'desc' },
                        take: 1,
                    },
                },
            }),
        ]);
        const priceByResource = await this.getPublicPriceMap(siteId, query.userId, rows, durationDays, currency);
        return {
            page: query.page,
            pageSize: query.pageSize,
            total,
            items: rows.map((row) => toResourceListItem(row, priceByResource.get(row.id) ?? null, false)),
        };
    }
    async getPublicPriceMap(siteId, userId, resources, durationDays, currency) {
        const resourceIds = resources.map((resource) => resource.id);
        if (resourceIds.length === 0)
            return new Map();
        const rowsById = new Map(resources.map((resource) => [resource.id, resource]));
        const priceScopeByResource = await this.resolvePublicPriceScopes(siteId, resources);
        const priceScopeIds = [...new Set([...priceScopeByResource.values()].flat())];
        const [userOverrides, binding, user, resourceOverrides, defaultTemplate] = await Promise.all([
            userId
                ? db_1.prisma.user_resource_price_overrides.findMany({
                    where: { siteId, userId, resourceId: { in: priceScopeIds }, durationDays },
                })
                : Promise.resolve([]),
            userId ? db_1.prisma.user_price_bindings.findUnique({ where: { siteId_userId: { siteId, userId } } }) : Promise.resolve(null),
            userId
                ? db_1.prisma.users.findFirst({
                    where: { id: userId, siteId },
                    select: { tenantId: true, tenant: { select: { ownerUserId: true } } },
                })
                : Promise.resolve(null),
            db_1.prisma.price_overrides.findMany({ where: { siteId, resourceId: { in: priceScopeIds }, durationDays } }),
            db_1.prisma.price_templates.findFirst({ where: { siteId, tenantId: null, isDefault: true }, select: { id: true } }),
        ]);
        const tenantDefaultTemplate = user
            ? await db_1.prisma.price_templates.findFirst({ where: { siteId, tenantId: user.tenantId, isDefault: true }, select: { id: true } })
            : null;
        const [userTemplateRules, tenantDefaultRules, defaultRules] = await Promise.all([
            binding
                ? db_1.prisma.price_rules.findMany({
                    where: { siteId, templateId: binding.templateId, resourceId: { in: priceScopeIds }, durationDays, minQty: { lte: 1 } },
                    orderBy: { minQty: 'desc' },
                })
                : Promise.resolve([]),
            tenantDefaultTemplate
                ? db_1.prisma.price_rules.findMany({
                    where: { siteId, templateId: tenantDefaultTemplate.id, resourceId: { in: priceScopeIds }, durationDays, minQty: { lte: 1 } },
                    orderBy: { minQty: 'desc' },
                })
                : Promise.resolve([]),
            defaultTemplate
                ? db_1.prisma.price_rules.findMany({
                    where: { siteId, templateId: defaultTemplate.id, resourceId: { in: priceScopeIds }, durationDays, minQty: { lte: 1 } },
                    orderBy: { minQty: 'desc' },
                })
                : Promise.resolve([]),
        ]);
        const userOverrideByResource = new Map(userOverrides.map((item) => [item.resourceId, item]));
        const userRuleByResource = firstRuleByResource(userTemplateRules);
        const tenantDefaultRuleByResource = firstRuleByResource(tenantDefaultRules);
        const overrideByResource = new Map(resourceOverrides.map((item) => [item.resourceId, item]));
        const defaultRuleByResource = firstRuleByResource(defaultRules);
        const prices = new Map();
        for (const resourceId of resourceIds) {
            const resource = rowsById.get(resourceId);
            const priceScopeIdsForResource = priceScopeByResource.get(resourceId) ?? [resourceId];
            const candidates = [
                firstPriceInScope(userOverrideByResource, priceScopeIdsForResource),
                firstPriceInScope(userRuleByResource, priceScopeIdsForResource),
                firstPriceInScope(tenantDefaultRuleByResource, priceScopeIdsForResource),
                firstPriceInScope(overrideByResource, priceScopeIdsForResource),
                firstPriceInScope(defaultRuleByResource, priceScopeIdsForResource),
            ];
            const price = selectPublicPrice(candidates, currency);
            if (price === 'CURRENCY_MISMATCH') {
                continue;
            }
            if (price) {
                prices.set(resourceId, price);
                continue;
            }
            const basePrice = resource
                ? (0, base_price_1.getBaseStaticProxyPrice)({
                    code: resource.code,
                    providerCode: resource.providerCode,
                    durationDays,
                    currency,
                })
                : null;
            if (basePrice)
                prices.set(resourceId, basePrice);
        }
        return prices;
    }
    async resolvePublicPriceScopes(siteId, resources) {
        return (0, price_scopes_1.resolvePricingScopesForResources)(siteId, resources);
    }
    async getAdminOverridePriceMap(siteId, resourceIds, durationDays, currency) {
        if (resourceIds.length === 0)
            return new Map();
        const rows = await db_1.prisma.price_overrides.findMany({
            select: {
                resourceId: true,
                unitPrice: true,
                currency: true,
            },
            where: {
                siteId,
                resourceId: { in: resourceIds },
                durationDays,
                ...(currency ? { currency } : {}),
            },
        });
        return new Map(rows.map((row) => [
            row.resourceId,
            { unitPrice: row.unitPrice.toString(), currency: row.currency },
        ]));
    }
};
exports.ResourcesRepository = ResourcesRepository;
exports.ResourcesRepository = ResourcesRepository = __decorate([
    (0, common_1.Injectable)()
], ResourcesRepository);
function toResourceListItem(row, price, includeUpstreamCost) {
    const latest = row.inventory_snapshots[0];
    const mapping = row.resource_mappings[0] ?? null;
    const { inventory_snapshots: _snapshots, resource_mappings: _mappings, upstreamCost, upstreamCostCurrency, ...resource } = row;
    return {
        ...resource,
        countryCode: (0, base_price_1.resourceCountryCode)(resource.code),
        upstreamResourceId: mapping?.providerResourceId ?? null,
        stock: latest?.stock ?? null,
        inventoryCapturedAt: latest?.capturedAt ?? null,
        inventoryIsStale: latest ? (0, domain_1.isInventorySnapshotStale)({ ...latest, providerCode: row.providerCode }) : null,
        unitPrice: price?.unitPrice ?? null,
        priceCurrency: price?.currency ?? null,
        costGroupKey: toPublicCostGroupKey(upstreamCost, upstreamCostCurrency),
        ...(includeUpstreamCost
            ? {
                upstreamCost: upstreamCost?.toString() ?? null,
                upstreamCostCurrency: upstreamCostCurrency ?? null,
            }
            : {}),
    };
}
function toPriceableCatalogItem(row, price) {
    const mapping = row.resource_mappings[0] ?? null;
    const { resource_mappings: _mappings, upstreamCost, upstreamCostCurrency, ...resource } = row;
    return {
        ...resource,
        countryCode: (0, base_price_1.resourceCountryCode)(resource.code),
        upstreamResourceId: mapping?.providerResourceId ?? null,
        stock: null,
        inventoryCapturedAt: null,
        inventoryIsStale: null,
        unitPrice: price?.unitPrice ?? null,
        priceCurrency: price?.currency ?? null,
        costGroupKey: toPublicCostGroupKey(upstreamCost, upstreamCostCurrency),
        upstreamCost: upstreamCost?.toString() ?? null,
        upstreamCostCurrency: upstreamCostCurrency ?? null,
    };
}
function toPublicCostGroupKey(upstreamCost, upstreamCostCurrency) {
    if (!upstreamCost)
        return 'cost-missing';
    const currency = upstreamCostCurrency?.trim().toUpperCase() || 'CNY';
    const amount = normalizeCostAmount(upstreamCost.toString());
    const digest = (0, node_crypto_1.createHash)('sha256').update(`${currency}:${amount}`).digest('hex').slice(0, 16);
    return `cost-${digest}`;
}
function buildInternalPriceableCatalogGroups(rows) {
    const groupedByCountry = new Map();
    const rowsByCountry = new Map();
    for (const row of rows) {
        const countryCode = (0, base_price_1.resourceCountryCode)(row.code);
        const regionKey = getPriceableCatalogRegionKey(row);
        const costGroupKey = toPublicCostGroupKey(row.upstreamCost, row.upstreamCostCurrency);
        const groupKey = makePriceableCatalogGroupKey(countryCode, regionKey, costGroupKey, false);
        const groups = groupedByCountry.get(countryCode) ?? [];
        let group = groups.find((item) => item.key === groupKey);
        if (!group) {
            group = {
                key: groupKey,
                countryCode,
                regionKey,
                costGroupKey,
                resourceIds: [],
                sampleResource: row,
                autoSelect: false,
            };
            groups.push(group);
            groupedByCountry.set(countryCode, groups);
        }
        group.resourceIds.push(row.id);
        const countryRows = rowsByCountry.get(countryCode) ?? [];
        countryRows.push(row);
        rowsByCountry.set(countryCode, countryRows);
    }
    const normalized = [];
    for (const [countryCode, groups] of groupedByCountry.entries()) {
        const countryRows = rowsByCountry.get(countryCode) ?? [];
        if (shouldCollapseCountryRowsToAutoSelect(countryRows, groups)) {
            const first = countryRows[0];
            const costGroupKey = toPublicCostGroupKey(first.upstreamCost, first.upstreamCostCurrency);
            normalized.push({
                key: makePriceableCatalogGroupKey(countryCode, '__auto_select__', costGroupKey, true),
                countryCode,
                regionKey: '__auto_select__',
                costGroupKey,
                resourceIds: countryRows.map((row) => row.id),
                sampleResource: first,
                autoSelect: true,
            });
            continue;
        }
        normalized.push(...groups);
    }
    return normalized;
}
function shouldCollapseCountryRowsToAutoSelect(rows, groups) {
    if (rows.length <= 1 || groups.length <= 1)
        return false;
    const costKeys = rows.map((row) => toPublicCostGroupKey(row.upstreamCost, row.upstreamCostCurrency));
    if (costKeys.some((key) => key === 'cost-missing'))
        return false;
    return new Set(costKeys).size === 1;
}
function shouldCollapseCountrySummaryToAutoSelect(item) {
    if (item.totalResources <= 1 || item.regionKeys.size <= 1)
        return false;
    if (item.costGroupKeys.has('cost-missing'))
        return false;
    return item.costGroupKeys.size === 1;
}
function makePriceableCatalogGroupKey(countryCode, regionKey, costGroupKey, autoSelect) {
    const digest = (0, node_crypto_1.createHash)('sha256')
        .update(`${countryCode}:${regionKey}:${costGroupKey}:${autoSelect ? 'auto' : 'manual'}`)
        .digest('hex')
        .slice(0, 16);
    return `${countryCode}:${digest}`;
}
function getPriceableCatalogRegionKey(row) {
    const countryCode = (0, base_price_1.resourceCountryCode)(row.code);
    const mappingValue = stripIpipdCidr(row.resource_mappings[0]?.providerResourceId ?? null);
    const providerPath = parseProviderPathSegments(mappingValue, countryCode)
        ?? parseProviderPathSegments(row.code, countryCode)
        ?? parseProviderPathSegments(row.displayName, countryCode)
        ?? parseProviderPathSegments(row.name, countryCode);
    if (providerPath && providerPath.length > 0) {
        return normalizeGroupKey(providerPath.join('/'));
    }
    const codeDetail = parseCountryCodeDetail(row.code, countryCode);
    if (codeDetail)
        return normalizeGroupKey(codeDetail);
    return countryCode;
}
function stripIpipdCidr(value) {
    if (!value)
        return null;
    const marker = '|cidr=';
    const markerIndex = value.indexOf(marker);
    return markerIndex >= 0 ? value.slice(0, markerIndex) : value;
}
function parseProviderPathSegments(value, countryCode) {
    const raw = value?.trim();
    if (!raw || !raw.includes(':'))
        return null;
    const parts = raw.split(':').map((part) => part.trim()).filter(Boolean);
    if (parts.length <= 1)
        return null;
    if (parts[0]?.toUpperCase() !== countryCode)
        return null;
    const pathParts = parts.slice(1);
    if (pathParts.length > 1 && /^\d+$/.test(pathParts[0] ?? ''))
        pathParts.shift();
    return pathParts.length > 0 ? pathParts : null;
}
function parseCountryCodeDetail(value, countryCode) {
    const raw = value?.trim();
    if (!raw)
        return null;
    const normalizedCountry = countryCode.toUpperCase();
    if (raw.toUpperCase() === normalizedCountry)
        return null;
    if (raw.toUpperCase().startsWith(`${normalizedCountry}:`)) {
        return raw.slice(normalizedCountry.length + 1).trim() || null;
    }
    return null;
}
function normalizeGroupKey(value) {
    return value.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}
function toPriceableCatalogGroupItem(group, priceByResource) {
    const samplePrice = priceByResource.get(group.sampleResource.id) ?? null;
    const commonPrice = getCommonGroupPrice(group.resourceIds, priceByResource);
    return {
        key: group.key,
        countryCode: group.countryCode,
        regionKey: group.regionKey,
        costGroupKey: group.costGroupKey,
        resourceCount: group.resourceIds.length,
        pricedCount: group.resourceIds.filter((resourceId) => priceByResource.has(resourceId)).length,
        unitPrice: commonPrice?.unitPrice ?? null,
        priceCurrency: commonPrice?.currency ?? samplePrice?.currency ?? null,
        upstreamCost: group.sampleResource.upstreamCost?.toString() ?? null,
        upstreamCostCurrency: group.sampleResource.upstreamCostCurrency ?? null,
        autoSelect: group.autoSelect,
        sampleResource: toPriceableCatalogItem(group.sampleResource, samplePrice),
    };
}
function getCommonGroupPrice(resourceIds, priceByResource) {
    if (resourceIds.length === 0)
        return null;
    const prices = resourceIds.map((resourceId) => priceByResource.get(resourceId));
    if (prices.some((price) => !price))
        return null;
    const first = prices[0];
    return prices.every((price) => price?.unitPrice === first.unitPrice && price.currency === first.currency)
        ? first
        : null;
}
function comparePriceableCatalogGroups(left, right) {
    if (left.autoSelect !== right.autoSelect)
        return left.autoSelect ? -1 : 1;
    const regionCompare = left.regionKey.localeCompare(right.regionKey);
    if (regionCompare !== 0)
        return regionCompare;
    return comparePriceableCatalogCost(left, right);
}
function comparePriceableCatalogCost(left, right) {
    const leftSort = getPriceableCatalogCostSort(left);
    const rightSort = getPriceableCatalogCostSort(right);
    if (leftSort.hasCost !== rightSort.hasCost)
        return leftSort.hasCost ? -1 : 1;
    const currencyCompare = leftSort.currency.localeCompare(rightSort.currency);
    if (currencyCompare !== 0)
        return currencyCompare;
    const amountCompare = leftSort.amount - rightSort.amount;
    if (amountCompare !== 0)
        return amountCompare;
    return left.key.localeCompare(right.key);
}
function getPriceableCatalogCostSort(item) {
    const amount = item.upstreamCost === null ? Number.NaN : Number(item.upstreamCost);
    if (!Number.isFinite(amount))
        return { hasCost: false, currency: '', amount: Number.POSITIVE_INFINITY };
    return {
        hasCost: true,
        currency: item.upstreamCostCurrency?.trim().toUpperCase() || 'CNY',
        amount,
    };
}
function normalizeCostAmount(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? String(amount) : value.trim();
}
function firstRuleByResource(rows) {
    const map = new Map();
    for (const row of rows) {
        if (!map.has(row.resourceId))
            map.set(row.resourceId, row);
    }
    return map;
}
function firstPriceInScope(rows, resourceIds) {
    for (const resourceId of resourceIds) {
        const row = rows.get(resourceId);
        if (row)
            return row;
    }
    return null;
}
function selectPublicPrice(rows, currency) {
    for (const row of rows) {
        if (!row)
            continue;
        if (row.currency !== currency)
            return 'CURRENCY_MISMATCH';
        return { unitPrice: row.unitPrice.toString(), currency: row.currency };
    }
    return null;
}
function buildResourceSearchConditions(search) {
    const trimmed = search?.trim();
    if (!trimmed)
        return [];
    const conditions = [];
    const seen = new Set();
    const normalized = normalizeSearchAlias(trimmed);
    const countryMatches = RESOURCE_COUNTRY_SEARCH_ALIASES.filter((country) => country.aliases.some((alias) => normalizeSearchAlias(alias) === normalized));
    const cityMatches = RESOURCE_CITY_SEARCH_ALIASES.filter((city) => city.aliases.some((alias) => normalizeSearchAlias(alias) === normalized));
    const isTwoLetterCountryAlias = normalized.length === 2 && countryMatches.length > 0;
    if (!isTwoLetterCountryAlias) {
        addContainsConditions(conditions, seen, trimmed);
    }
    for (const country of countryMatches) {
        addCondition(conditions, seen, { code: { startsWith: country.code, mode: 'insensitive' } });
        addContainsConditions(conditions, seen, country.englishName);
    }
    for (const city of cityMatches) {
        for (const term of city.nameContains)
            addContainsConditions(conditions, seen, term);
        for (const code of city.codeStartsWith ?? []) {
            addCondition(conditions, seen, { code: { startsWith: code, mode: 'insensitive' } });
        }
        for (const code of city.codeContains ?? []) {
            addCondition(conditions, seen, { code: { contains: code, mode: 'insensitive' } });
        }
    }
    return conditions;
}
function addContainsConditions(conditions, seen, text) {
    addCondition(conditions, seen, { code: { contains: text, mode: 'insensitive' } });
    addCondition(conditions, seen, { name: { contains: text, mode: 'insensitive' } });
    addCondition(conditions, seen, { displayName: { contains: text, mode: 'insensitive' } });
    addCondition(conditions, seen, { providerCode: { contains: text, mode: 'insensitive' } });
}
function addCondition(conditions, seen, condition) {
    const key = JSON.stringify(condition);
    if (seen.has(key))
        return;
    seen.add(key);
    conditions.push(condition);
}
function applyCountryCodeFilter(where, countryCode) {
    const normalized = countryCode?.trim().toUpperCase();
    if (!normalized || !/^[A-Z]{2}$/.test(normalized))
        return;
    const countryCondition = {
        OR: [
            { code: { equals: normalized, mode: 'insensitive' } },
            { code: { startsWith: `${normalized}:`, mode: 'insensitive' } },
        ],
    };
    appendWhereAnd(where, countryCondition);
}
function normalizeCountryCodeOrThrow(countryCode) {
    const normalized = countryCode?.trim().toUpperCase();
    if (!normalized || !/^[A-Z]{2}$/.test(normalized)) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'country_code_invalid', 400);
    }
    return normalized;
}
function applyConcreteSaleableResourceFilter(where, siteId) {
    appendWhereAnd(where, {
        OR: [
            { type: { not: 'COUNTRY' } },
            { resource_mappings: { some: { siteId } } },
        ],
    });
}
function appendWhereAnd(where, condition) {
    where.AND = Array.isArray(where.AND) ? [...where.AND, condition] : [condition];
}
function normalizeSearchAlias(value) {
    return value.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}
function normalizeUpstreamCost(value) {
    if (value === null || value === undefined || value === '')
        return null;
    const text = String(value).trim();
    if (text === '')
        return null;
    return /^\d+(\.\d+)?$/.test(text) ? text : null;
}
function buildResourceCoverageKeepFilter(resources) {
    const codesByIpType = new Map();
    for (const resource of resources) {
        const code = resource.code.trim();
        if (!code)
            continue;
        const current = codesByIpType.get(resource.ipType) ?? new Set();
        current.add(code);
        codesByIpType.set(resource.ipType, current);
    }
    const keepConditions = [...codesByIpType.entries()].map(([ipType, codes]) => ({
        ipType,
        code: { in: [...codes] },
    }));
    return keepConditions.length > 0 ? { OR: keepConditions } : null;
}
function parsePositiveInteger(value, fallback, field, max) {
    const parsed = Number(value ?? fallback);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, `${field}_invalid`, 400);
    }
    return max === undefined ? parsed : Math.min(parsed, max);
}
function isTruthy(value) {
    return value === true || value === 'true' || value === '1';
}
function isResourceStatus(value) {
    return ['ACTIVE', 'HIDDEN', 'DISABLED'].includes(value);
}
function isResourceType(value) {
    return ['COUNTRY', 'REGION', 'ZONE'].includes(value);
}
const RESOURCE_COUNTRY_SEARCH_ALIASES = [
    {
        code: 'AE',
        englishName: 'United Arab Emirates',
        aliases: ['阿联酋', '阿聯酋', 'united arab emirates', 'uae', 'ae'],
    },
    { code: 'AT', englishName: 'Austria', aliases: ['奥地利', '奧地利', 'austria', 'at'] },
    { code: 'AU', englishName: 'Australia', aliases: ['澳大利亚', '澳大利亞', 'australia', 'au'] },
    { code: 'BR', englishName: 'Brazil', aliases: ['巴西', 'brazil', 'br'] },
    { code: 'CA', englishName: 'Canada', aliases: ['加拿大', 'canada', 'ca'] },
    { code: 'DE', englishName: 'Germany', aliases: ['德国', '德國', 'germany', 'de'] },
    { code: 'ES', englishName: 'Spain', aliases: ['西班牙', 'spain', 'es'] },
    { code: 'FR', englishName: 'France', aliases: ['法国', '法國', 'france', 'fr'] },
    { code: 'GB', englishName: 'United Kingdom', aliases: ['英国', '英國', 'united kingdom', 'uk', 'gb'] },
    { code: 'HK', englishName: 'Hong Kong', aliases: ['中国香港', '中國香港', '香港', 'hong kong', 'hk'] },
    { code: 'ID', englishName: 'Indonesia', aliases: ['印度尼西亚', '印度尼西亞', 'indonesia', 'id'] },
    { code: 'IL', englishName: 'Israel', aliases: ['以色列', 'israel', 'il'] },
    { code: 'IN', englishName: 'India', aliases: ['印度', 'india', 'in'] },
    { code: 'IT', englishName: 'Italy', aliases: ['意大利', 'italy', 'it'] },
    { code: 'JP', englishName: 'Japan', aliases: ['日本', 'japan', 'jp'] },
    { code: 'KR', englishName: 'South Korea', aliases: ['韩国', '韓國', 'south korea', 'korea', 'kr'] },
    { code: 'LV', englishName: 'Latvia', aliases: ['拉脱维亚', '拉脫維亞', 'latvia', 'lv'] },
    { code: 'MY', englishName: 'Malaysia', aliases: ['马来西亚', '馬來西亞', 'malaysia', 'my'] },
    { code: 'NL', englishName: 'Netherlands', aliases: ['荷兰', '荷蘭', 'netherlands', 'nl'] },
    { code: 'PH', englishName: 'Philippines', aliases: ['菲律宾', '菲律賓', 'philippines', 'ph'] },
    { code: 'PL', englishName: 'Poland', aliases: ['波兰', '波蘭', 'poland', 'pl'] },
    { code: 'RO', englishName: 'Romania', aliases: ['罗马尼亚', '羅馬尼亞', 'romania', 'ro'] },
    { code: 'SG', englishName: 'Singapore', aliases: ['新加坡', 'singapore', 'sg'] },
    { code: 'TH', englishName: 'Thailand', aliases: ['泰国', '泰國', 'thailand', 'th'] },
    { code: 'TR', englishName: 'Turkey', aliases: ['土耳其', 'turkey', 'tr'] },
    { code: 'TW', englishName: 'Taiwan', aliases: ['中国台湾', '中國台灣', '台湾', '台灣', 'taiwan', 'tw'] },
    { code: 'UA', englishName: 'Ukraine', aliases: ['乌克兰', '烏克蘭', 'ukraine', 'ua'] },
    {
        code: 'US',
        englishName: 'United States',
        aliases: ['美国', '美國', 'united states', 'usa', 'america', 'us'],
    },
    { code: 'VN', englishName: 'Vietnam', aliases: ['越南', 'vietnam', 'vn'] },
    { code: 'ZA', englishName: 'South Africa', aliases: ['南非', 'south africa', 'za'] },
];
const RESOURCE_CITY_SEARCH_ALIASES = [
    {
        aliases: ['纽约', '紐約', 'new york', 'nyc'],
        nameContains: ['New York'],
        codeStartsWith: ['NY'],
        codeContains: [':NY', 'USANY', 'NYC', 'NYS'],
    },
    {
        aliases: ['洛杉矶', '洛杉磯', 'los angeles', 'lax'],
        nameContains: ['Los Angeles'],
        codeStartsWith: ['LAX'],
        codeContains: ['LAX', 'USACAL'],
    },
    {
        aliases: ['阿什本', 'ashburn'],
        nameContains: ['Ashburn'],
        codeStartsWith: ['ASH'],
        codeContains: ['ASH', 'VIRASH'],
    },
    {
        aliases: ['波士顿', '波士頓', 'boston'],
        nameContains: ['Boston'],
        codeStartsWith: ['BOS'],
        codeContains: ['BOS', 'MASBOS'],
    },
    {
        aliases: ['芝加哥', 'chicago'],
        nameContains: ['Chicago'],
        codeStartsWith: ['CHI'],
        codeContains: ['CHI'],
    },
    {
        aliases: ['达拉斯', '達拉斯', 'dallas'],
        nameContains: ['Dallas'],
        codeStartsWith: ['DAL'],
        codeContains: ['DAL'],
    },
    {
        aliases: ['迈阿密', '邁阿密', 'miami'],
        nameContains: ['Miami'],
        codeStartsWith: ['MIA'],
        codeContains: ['MIA'],
    },
    {
        aliases: ['旧金山', '舊金山', 'san francisco', 'sfo'],
        nameContains: ['San Francisco'],
        codeStartsWith: ['SFO'],
        codeContains: ['SFO'],
    },
    {
        aliases: ['西雅图', '西雅圖', 'seattle'],
        nameContains: ['Seattle'],
        codeStartsWith: ['SEA'],
        codeContains: ['SEA'],
    },
    {
        aliases: ['东京', '東京', 'tokyo'],
        nameContains: ['Tokyo'],
    },
    {
        aliases: ['香港', 'hong kong'],
        nameContains: ['Hong Kong'],
        codeStartsWith: ['HK'],
    },
    {
        aliases: ['新加坡', 'singapore'],
        nameContains: ['Singapore'],
        codeStartsWith: ['SG'],
        codeContains: ['SINGAPORE'],
    },
];
//# sourceMappingURL=resources.repository.js.map