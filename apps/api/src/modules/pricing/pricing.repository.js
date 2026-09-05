"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PricingRepository = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("@ipeasy/db");
const client_1 = require("@ipeasy/db/generated/client");
const decimal_js_1 = __importDefault(require("decimal.js"));
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
const domain_1 = require("./domain");
const price_scopes_1 = require("./price-scopes");
const current_resource_account_filter_1 = require("../providers/current-resource-account-filter");
const domain_2 = require("../resources/domain");
const PRICING_MATRIX_DEFAULT_PAGE_SIZE = 20;
const PRICING_MATRIX_MAX_PAGE_SIZE = 20;
let PricingRepository = class PricingRepository {
    async listDedicatedSkuPricing(siteId) {
        const skus = await db_1.prisma.service_skus.findMany({
            where: {
                siteId,
                isActive: true,
                isVisible: true,
                capabilities: { path: ['delivery'], equals: 'dedicated-line' },
            },
            orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        });
        const template = await db_1.prisma.price_templates.findFirst({
            where: { siteId, tenantId: null, isDefault: true },
            orderBy: { updatedAt: 'desc' },
            select: { id: true },
        });
        const skuIds = skus.map((sku) => sku.id);
        const [rules, overrides] = await Promise.all([
            template && skuIds.length > 0
                ? db_1.prisma.sku_price_rules.findMany({ where: { siteId, templateId: template.id, skuId: { in: skuIds } }, orderBy: [{ durationDays: 'asc' }, { minQty: 'desc' }] })
                : Promise.resolve([]),
            skuIds.length > 0
                ? db_1.prisma.sku_price_overrides.findMany({ where: { siteId, skuId: { in: skuIds } }, orderBy: [{ durationDays: 'asc' }, { minQty: 'desc' }] })
                : Promise.resolve([]),
        ]);
        return {
            templateId: template?.id ?? null,
            items: skus.map((sku) => ({
                skuId: sku.id,
                code: sku.code,
                name: sku.name,
                description: sku.description,
                templateRules: rules.filter((rule) => rule.skuId === sku.id).map(toDedicatedSkuPriceRule),
                globalOverrides: overrides.filter((override) => override.skuId === sku.id).map(toDedicatedSkuPriceRule),
            })),
        };
    }
    async upsertDedicatedSkuOverride(input) {
        await this.requireDedicatedSku(input.siteId, input.skuId);
        return db_1.prisma.sku_price_overrides.upsert({
            where: {
                siteId_skuId_durationDays_minQty: {
                    siteId: input.siteId,
                    skuId: input.skuId,
                    durationDays: input.durationDays,
                    minQty: input.minQty,
                },
            },
            create: { ...input, unitPrice: new decimal_js_1.default(input.unitPrice) },
            update: { unitPrice: new decimal_js_1.default(input.unitPrice), currency: input.currency },
        });
    }
    async upsertDedicatedSkuTemplateRule(input) {
        const template = await db_1.prisma.price_templates.findFirst({ where: { id: input.templateId, siteId: input.siteId, tenantId: null } });
        if (!template)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'price_template_not_found', 404);
        await this.requireDedicatedSku(input.siteId, input.skuId);
        return db_1.prisma.sku_price_rules.upsert({
            where: {
                siteId_templateId_skuId_durationDays_minQty: {
                    siteId: input.siteId,
                    templateId: input.templateId,
                    skuId: input.skuId,
                    durationDays: input.durationDays,
                    minQty: input.minQty,
                },
            },
            create: { ...input, unitPrice: new decimal_js_1.default(input.unitPrice) },
            update: { unitPrice: new decimal_js_1.default(input.unitPrice), currency: input.currency },
        });
    }
    async upsertUserDedicatedSkuOverride(input) {
        await this.requireDedicatedSku(input.siteId, input.skuId);
        const user = await db_1.prisma.users.findFirst({ where: { id: input.userId, siteId: input.siteId, tenantId: input.tenantId }, select: { id: true } });
        if (!user)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'user_not_found', 404);
        return db_1.prisma.user_sku_price_overrides.upsert({
            where: {
                siteId_userId_skuId_durationDays_minQty: {
                    siteId: input.siteId,
                    userId: input.userId,
                    skuId: input.skuId,
                    durationDays: input.durationDays,
                    minQty: input.minQty,
                },
            },
            create: { ...input, unitPrice: new decimal_js_1.default(input.unitPrice) },
            update: { unitPrice: new decimal_js_1.default(input.unitPrice), currency: input.currency },
        });
    }
    async upsertSkuRules(templateId, siteId, rules) {
        const template = await db_1.prisma.price_templates.findFirst({ where: { id: templateId, siteId } });
        if (!template)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'price_template_not_found', 404);
        await this.assertDedicatedLineSkus(siteId, rules.map((rule) => rule.skuId));
        return db_1.prisma.$transaction(rules.map((rule) => db_1.prisma.sku_price_rules.upsert({
            where: {
                siteId_templateId_skuId_durationDays_minQty: {
                    siteId,
                    templateId,
                    skuId: rule.skuId,
                    durationDays: rule.durationDays,
                    minQty: rule.minQty ?? 1,
                },
            },
            create: {
                siteId,
                templateId,
                skuId: rule.skuId,
                durationDays: rule.durationDays,
                minQty: rule.minQty ?? 1,
                unitPrice: new decimal_js_1.default(rule.unitPrice),
                currency: rule.currency,
            },
            update: {
                unitPrice: new decimal_js_1.default(rule.unitPrice),
                currency: rule.currency,
            },
        })));
    }
    async upsertSkuOverride(data) {
        await this.assertDedicatedLineSkus(data.siteId, [data.skuId]);
        const minQty = data.minQty ?? 1;
        return db_1.prisma.sku_price_overrides.upsert({
            where: {
                siteId_skuId_durationDays_minQty: {
                    siteId: data.siteId,
                    skuId: data.skuId,
                    durationDays: data.durationDays,
                    minQty,
                },
            },
            create: {
                siteId: data.siteId,
                skuId: data.skuId,
                durationDays: data.durationDays,
                minQty,
                unitPrice: new decimal_js_1.default(data.unitPrice),
                currency: data.currency,
            },
            update: {
                unitPrice: new decimal_js_1.default(data.unitPrice),
                currency: data.currency,
            },
        });
    }
    async upsertUserSkuOverride(data) {
        await this.assertDedicatedLineSkus(data.siteId, [data.skuId]);
        const buyer = await db_1.prisma.users.findFirst({
            where: { id: data.userId, siteId: data.siteId, tenantId: data.tenantId },
            select: { id: true },
        });
        if (!buyer)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'user_not_found', 404);
        const minQty = data.minQty ?? 1;
        return db_1.prisma.user_sku_price_overrides.upsert({
            where: {
                siteId_userId_skuId_durationDays_minQty: {
                    siteId: data.siteId,
                    userId: data.userId,
                    skuId: data.skuId,
                    durationDays: data.durationDays,
                    minQty,
                },
            },
            create: {
                siteId: data.siteId,
                tenantId: data.tenantId,
                userId: data.userId,
                skuId: data.skuId,
                durationDays: data.durationDays,
                minQty,
                unitPrice: new decimal_js_1.default(data.unitPrice),
                currency: data.currency,
            },
            update: {
                unitPrice: new decimal_js_1.default(data.unitPrice),
                currency: data.currency,
            },
        });
    }
    listSkuRules(siteId, query = {}) {
        return db_1.prisma.sku_price_rules.findMany({
            where: {
                siteId,
                ...(query.templateId ? { templateId: query.templateId } : {}),
                ...(query.skuId ? { skuId: query.skuId } : {}),
            },
            orderBy: [{ durationDays: 'asc' }, { minQty: 'asc' }],
            include: { sku: { select: { id: true, code: true, name: true } } },
        });
    }
    async assertDedicatedLineSkus(siteId, skuIds) {
        const uniqueSkuIds = [...new Set(skuIds)];
        const skus = await db_1.prisma.service_skus.findMany({
            where: { id: { in: uniqueSkuIds }, siteId },
            select: { id: true, capabilities: true },
        });
        const byId = new Map(skus.map((sku) => [sku.id, sku]));
        for (const skuId of uniqueSkuIds) {
            const sku = byId.get(skuId);
            if (!sku)
                throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'sku_not_found', 404);
            if (!isDedicatedLineCapabilities(sku.capabilities)) {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'sku_not_dedicated_line', 422);
            }
        }
    }
    async requireDedicatedSku(siteId, skuId) {
        const sku = await db_1.prisma.service_skus.findFirst({
            where: { id: skuId, siteId, isActive: true, isVisible: true },
            select: { id: true, capabilities: true },
        });
        if (!sku || !isDedicatedLineCapabilities(sku.capabilities)) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'dedicated_sku_not_found', 404);
        }
        return sku;
    }
    async getPriceForUser(siteId, userId, resourceId, durationDays, quantity, currency) {
        const priceScopeIds = await (0, price_scopes_1.resolvePricingResourceIds)(siteId, resourceId);
        // 1. user_resource_price_overrides
        const userOverrides = await db_1.prisma.user_resource_price_overrides.findMany({
            where: { siteId, userId, resourceId: { in: priceScopeIds }, durationDays },
        });
        const userOverride = firstPriceInScope(userOverrides, priceScopeIds);
        // 2. user_price_bindings -> price_rules
        const binding = await db_1.prisma.user_price_bindings.findUnique({
            where: { siteId_userId: { siteId, userId } },
        });
        let userTemplateRule = null;
        if (binding) {
            const userTemplateRules = await db_1.prisma.price_rules.findMany({
                where: {
                    siteId,
                    templateId: binding.templateId,
                    resourceId: { in: priceScopeIds },
                    durationDays,
                    minQty: { lte: quantity },
                },
                orderBy: { minQty: 'desc' },
            });
            userTemplateRule = firstPriceInScope(userTemplateRules, priceScopeIds);
        }
        const user = await db_1.prisma.users.findFirst({
            where: { id: userId, siteId },
            select: { tenantId: true },
        });
        let tenantDefaultRule = null;
        if (user) {
            const tenantDefaultTemplate = await db_1.prisma.price_templates.findFirst({
                where: { siteId, tenantId: user.tenantId, isDefault: true },
                select: { id: true },
            });
            if (tenantDefaultTemplate) {
                const tenantDefaultRules = await db_1.prisma.price_rules.findMany({
                    where: {
                        siteId,
                        templateId: tenantDefaultTemplate.id,
                        resourceId: { in: priceScopeIds },
                        durationDays,
                        minQty: { lte: quantity },
                    },
                    orderBy: { minQty: 'desc' },
                });
                tenantDefaultRule = firstPriceInScope(tenantDefaultRules, priceScopeIds);
            }
        }
        // 3. price_overrides
        const overrides = await db_1.prisma.price_overrides.findMany({
            where: { siteId, resourceId: { in: priceScopeIds }, durationDays },
        });
        const override = firstPriceInScope(overrides, priceScopeIds);
        // 4. site-global default price_template -> price_rules
        const defaultTemplate = await db_1.prisma.price_templates.findFirst({
            where: { siteId, tenantId: null, isDefault: true },
        });
        let defaultRule = null;
        if (defaultTemplate) {
            const defaultRules = await db_1.prisma.price_rules.findMany({
                where: {
                    siteId,
                    templateId: defaultTemplate.id,
                    resourceId: { in: priceScopeIds },
                    durationDays,
                    minQty: { lte: quantity },
                },
                orderBy: { minQty: 'desc' },
            });
            defaultRule = firstPriceInScope(defaultRules, priceScopeIds);
        }
        const candidate = (0, domain_1.selectPriceCandidate)([
            toCandidateSet(userOverride, 'USER_OVERRIDE'),
            toCandidateSet(userTemplateRule, 'USER_TEMPLATE'),
            toCandidateSet(tenantDefaultRule, 'TENANT_DEFAULT_TEMPLATE'),
            toCandidateSet(override, 'RESOURCE_OVERRIDE'),
            toCandidateSet(defaultRule, 'DEFAULT_TEMPLATE'),
        ], currency);
        if (candidate === 'CURRENCY_MISMATCH') {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.CURRENCY_NOT_SUPPORTED, 'currency_not_supported', 422);
        }
        return candidate;
    }
    async createTemplate(data) {
        if (data.isDefault) {
            return db_1.prisma.$transaction(async (tx) => {
                await tx.price_templates.updateMany({
                    where: { siteId: data.siteId, tenantId: null, isDefault: true },
                    data: { isDefault: false },
                });
                return tx.price_templates.create({ data });
            });
        }
        return db_1.prisma.price_templates.create({ data });
    }
    async listTemplates(siteId, query = {}) {
        const page = parsePositiveInteger(query.page, 1, 'page');
        const pageSize = parsePositiveInteger(query.pageSize, 20, 'pageSize', 20);
        const where = { siteId, tenantId: null };
        if (query.search) {
            where.OR = [
                { name: { contains: query.search, mode: 'insensitive' } },
                { description: { contains: query.search, mode: 'insensitive' } },
            ];
        }
        const [total, items] = await Promise.all([
            db_1.prisma.price_templates.count({ where }),
            db_1.prisma.price_templates.findMany({
                where,
                orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
                skip: (page - 1) * pageSize,
                take: pageSize,
                include: {
                    price_rules: {
                        orderBy: [{ durationDays: 'asc' }, { createdAt: 'asc' }],
                        include: {
                            resource: { select: { id: true, code: true, name: true } },
                        },
                    },
                },
            }),
        ]);
        return { page, pageSize, total, items };
    }
    async upsertRules(templateId, siteId, rules) {
        const template = await db_1.prisma.price_templates.findFirst({ where: { id: templateId, siteId } });
        if (!template)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'price_template_not_found', 404);
        return db_1.prisma.$transaction(rules.map((rule) => db_1.prisma.price_rules.upsert({
            where: {
                siteId_templateId_resourceId_durationDays: {
                    siteId,
                    templateId,
                    resourceId: rule.resourceId,
                    durationDays: rule.durationDays,
                },
            },
            create: {
                siteId,
                templateId,
                resourceId: rule.resourceId,
                durationDays: rule.durationDays,
                unitPrice: new decimal_js_1.default(rule.unitPrice),
                currency: rule.currency,
                minQty: rule.minQty ?? 1,
            },
            update: {
                unitPrice: new decimal_js_1.default(rule.unitPrice),
                currency: rule.currency,
                minQty: rule.minQty ?? 1,
            },
        })));
    }
    async upsertOverride(data) {
        const resource = await db_1.prisma.platform_resources.findFirst({
            where: { id: data.resourceId, siteId: data.siteId },
            select: { id: true, status: true, isVisible: true, isSaleable: true, unsaleableReason: true },
        });
        if (!resource)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'resource_not_found', 404);
        return db_1.prisma.$transaction(async (tx) => {
            const override = await tx.price_overrides.upsert({
                where: { siteId_resourceId_durationDays: { siteId: data.siteId, resourceId: data.resourceId, durationDays: data.durationDays } },
                create: { ...data, unitPrice: new decimal_js_1.default(data.unitPrice) },
                update: { unitPrice: new decimal_js_1.default(data.unitPrice), currency: data.currency },
            });
            if (resource.status === 'ACTIVE'
                && resource.isVisible
                && !resource.isSaleable
                && PRICE_MISSING_REASONS.has(resource.unsaleableReason ?? '')) {
                await tx.platform_resources.update({
                    where: { id: resource.id },
                    data: {
                        isVisible: true,
                        isSaleable: true,
                        unsaleableReason: null,
                    },
                });
            }
            return override;
        });
    }
    async replaceOverridesForResources(data) {
        const uniqueResourceIds = [...new Set(data.resourceIds)];
        if (uniqueResourceIds.length === 0) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'price_resources_missing', 400);
        }
        const chunks = chunk(uniqueResourceIds, 500);
        await db_1.prisma.$transaction(async (tx) => {
            for (const resourceIds of chunks) {
                await tx.price_overrides.deleteMany({
                    where: {
                        siteId: data.siteId,
                        durationDays: data.durationDays,
                        resourceId: { in: resourceIds },
                    },
                });
                await tx.price_overrides.createMany({
                    data: resourceIds.map((resourceId) => ({
                        siteId: data.siteId,
                        resourceId,
                        durationDays: data.durationDays,
                        unitPrice: new decimal_js_1.default(data.unitPrice),
                        currency: data.currency,
                    })),
                });
            }
        });
        return { updated: uniqueResourceIds.length, durationDays: data.durationDays, currency: data.currency };
    }
    upsertUserOverride(data) {
        return db_1.prisma.user_resource_price_overrides.upsert({
            where: { siteId_userId_resourceId_durationDays: { siteId: data.siteId, userId: data.userId, resourceId: data.resourceId, durationDays: data.durationDays } },
            create: { ...data, unitPrice: new decimal_js_1.default(data.unitPrice) },
            update: { unitPrice: new decimal_js_1.default(data.unitPrice), currency: data.currency },
        });
    }
    bindUserTemplate(data) {
        return db_1.prisma.user_price_bindings.upsert({
            where: { siteId_userId: { siteId: data.siteId, userId: data.userId } },
            create: data,
            update: { templateId: data.templateId },
        });
    }
    async listMatrixSummary(siteId, query = {}) {
        const durationDays = parsePositiveInteger(query.durationDays, 30, 'durationDays');
        const currency = query.currency || undefined;
        const baseWhere = configurableMatrixWhere(siteId, query.providerCode);
        appendWhereAnd(baseWhere, await (0, current_resource_account_filter_1.buildCurrentResourceAccountWhere)(siteId, {
            tenantId: query.tenantId,
            providerCode: query.providerCode,
        }));
        const groups = await db_1.prisma.platform_resources.groupBy({
            by: ['providerCode'],
            where: baseWhere,
            _count: { _all: true },
            orderBy: { providerCode: 'asc' },
        });
        const providerCodes = query.providerCode ? [query.providerCode] : groups.map((group) => group.providerCode);
        const totalByProvider = new Map(groups.map((group) => [group.providerCode, group._count._all]));
        return Promise.all(providerCodes.map(async (providerCode) => {
            const providerWhere = { ...baseWhere, providerCode };
            const priceCurrencyWhere = currency ? { currency } : {};
            const [enabled, synced, priced] = await Promise.all([
                db_1.prisma.platform_resources.count({
                    where: {
                        ...providerWhere,
                        status: 'ACTIVE',
                        isVisible: true,
                        isSaleable: true,
                    },
                }),
                db_1.prisma.platform_resources.count({
                    where: {
                        ...providerWhere,
                        inventory_snapshots: { some: { siteId } },
                    },
                }),
                db_1.prisma.platform_resources.count({
                    where: {
                        ...providerWhere,
                        OR: [
                            {
                                price_overrides: {
                                    some: { siteId, durationDays, ...priceCurrencyWhere },
                                },
                            },
                            {
                                price_rules: {
                                    some: {
                                        siteId,
                                        durationDays,
                                        minQty: { lte: 1 },
                                        ...priceCurrencyWhere,
                                        template: { tenantId: null, isDefault: true },
                                    },
                                },
                            },
                        ],
                    },
                }),
            ]);
            return {
                providerCode,
                total: totalByProvider.get(providerCode) ?? 0,
                enabled,
                synced,
                priced,
            };
        }));
    }
    async listMatrix(siteId, query = {}) {
        const page = parsePositiveInteger(query.page, 1, 'page');
        const pageSize = parsePositiveInteger(query.pageSize, PRICING_MATRIX_DEFAULT_PAGE_SIZE, 'pageSize', PRICING_MATRIX_MAX_PAGE_SIZE);
        const durationDays = parsePositiveInteger(query.durationDays, 30, 'durationDays');
        const currency = query.currency || undefined;
        const includeTotal = !isFalsey(query.includeTotal);
        const withInventory = !isFalsey(query.withInventory);
        const where = { siteId };
        if (query.providerCode)
            where.providerCode = query.providerCode;
        if (isTruthy(query.configurableOnly)) {
            where.type = { not: 'COUNTRY' };
            where.status = { not: 'DISABLED' };
            appendWhereAnd(where, await (0, current_resource_account_filter_1.buildCurrentResourceAccountWhere)(siteId, {
                tenantId: query.tenantId,
                providerCode: query.providerCode,
            }));
        }
        if (query.ipType) {
            if (!isIpType(query.ipType)) {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'ip_type_invalid', 400);
            }
            where.ipType = query.ipType;
        }
        if (query.search) {
            where.OR = [
                { code: { contains: query.search, mode: 'insensitive' } },
                { name: { contains: query.search, mode: 'insensitive' } },
                { displayName: { contains: query.search, mode: 'insensitive' } },
                { providerCode: { contains: query.search, mode: 'insensitive' } },
            ];
        }
        const resourceRows = await db_1.prisma.platform_resources.findMany({
            where,
            skip: (page - 1) * pageSize,
            take: pageSize,
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            ...(withInventory
                ? { include: { inventory_snapshots: { orderBy: { capturedAt: 'desc' }, take: 1 } } }
                : {}),
        });
        const resourceTotal = includeTotal
            ? await db_1.prisma.platform_resources.count({ where })
            : ((page - 1) * pageSize) + resourceRows.length;
        const resourceIds = resourceRows.map((row) => row.id);
        const [overrides, defaultTemplate] = await Promise.all([
            resourceIds.length === 0
                ? Promise.resolve([])
                : db_1.prisma.price_overrides.findMany({ where: { siteId, resourceId: { in: resourceIds }, durationDays } }),
            db_1.prisma.price_templates.findFirst({ where: { siteId, tenantId: null, isDefault: true }, select: { id: true } }),
        ]);
        const rules = defaultTemplate && resourceIds.length > 0
            ? await db_1.prisma.price_rules.findMany({
                where: {
                    siteId,
                    templateId: defaultTemplate.id,
                    resourceId: { in: resourceIds },
                    durationDays,
                    minQty: { lte: 1 },
                },
                orderBy: { minQty: 'desc' },
            })
            : [];
        const overrideByResource = new Map(overrides.map((item) => [item.resourceId, item]));
        const ruleByResource = new Map();
        for (const rule of rules) {
            if (!ruleByResource.has(rule.resourceId))
                ruleByResource.set(rule.resourceId, rule);
        }
        const allItems = resourceRows.map((resource) => toMatrixItem(resource, overrideByResource.get(resource.id) ?? null, ruleByResource.get(resource.id) ?? null, currency));
        const items = applyStockState(allItems, query.stockState);
        return { page, pageSize, total: query.stockState ? items.length : resourceTotal, items };
    }
};
exports.PricingRepository = PricingRepository;
exports.PricingRepository = PricingRepository = __decorate([
    (0, common_1.Injectable)()
], PricingRepository);
function configurableMatrixWhere(siteId, providerCode) {
    return {
        siteId,
        ...(providerCode ? { providerCode } : {}),
        type: { not: 'COUNTRY' },
        status: { not: 'DISABLED' },
    };
}
function appendWhereAnd(where, condition) {
    where.AND = Array.isArray(where.AND) ? [...where.AND, condition] : [condition];
}
const PRICE_MISSING_REASONS = new Set(['price_missing', 'no_price_rule', 'not_configured']);
function toCandidateSet(row, source) {
    const candidates = row
        ? [{ unitPrice: row.unitPrice.toString(), currency: row.currency, source }]
        : [];
    return { candidates, hasCurrencyMismatch: candidates.length > 0 };
}
function firstPriceInScope(rows, resourceIds) {
    for (const resourceId of resourceIds) {
        const row = rows.find((item) => item.resourceId === resourceId);
        if (row)
            return row;
    }
    return null;
}
function isDedicatedLineCapabilities(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value) && value.delivery === 'dedicated-line');
}
function toDedicatedSkuPriceRule(row) {
    return {
        id: row.id,
        durationDays: row.durationDays,
        minQty: row.minQty,
        unitPrice: row.unitPrice.toString(),
        currency: row.currency,
    };
}
function parsePositiveInteger(value, fallback, field, max) {
    const parsed = Number(value ?? fallback);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, `${field}_invalid`, 400);
    }
    return max === undefined ? parsed : Math.min(parsed, max);
}
function toMatrixItem(resource, override, defaultRule, currency) {
    const latest = resource.inventory_snapshots?.[0];
    const effective = override ?? defaultRule;
    const currencyMatchedEffective = effective && (!currency || effective.currency === currency) ? effective : null;
    return {
        resourceId: resource.id,
        code: resource.code,
        name: resource.name,
        displayName: resource.displayName,
        providerCode: resource.providerCode,
        ipType: resource.ipType,
        protocol: resource.protocol,
        status: resource.status,
        isSaleable: resource.isSaleable,
        stock: latest?.stock ?? null,
        inventoryCapturedAt: latest?.capturedAt ?? null,
        inventoryIsStale: latest ? (0, domain_2.isInventorySnapshotStale)({ ...latest, providerCode: resource.providerCode }) : null,
        overridePrice: override && (!currency || override.currency === currency) ? override.unitPrice.toString() : null,
        effectivePrice: currencyMatchedEffective ? currencyMatchedEffective.unitPrice.toString() : null,
        currency: currencyMatchedEffective?.currency ?? override?.currency ?? defaultRule?.currency ?? currency ?? null,
        upstreamCost: resource.upstreamCost?.toString() ?? null,
        upstreamCostCurrency: resource.upstreamCostCurrency,
    };
}
function applyStockState(items, stockState) {
    if (!stockState)
        return items;
    if (stockState === 'available')
        return items.filter((item) => (item.stock ?? 0) > 0);
    if (stockState === 'empty')
        return items.filter((item) => item.stock === 0);
    if (stockState === 'missing')
        return items.filter((item) => item.stock === null);
    throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'stock_state_invalid', 400);
}
function isIpType(value) {
    return value === client_1.IpType.NATIVE || value === client_1.IpType.BROADCAST || value === client_1.IpType.BOTH;
}
function isTruthy(value) {
    return value === true || value === 'true' || value === '1';
}
function isFalsey(value) {
    return value === false || value === 'false' || value === '0';
}
function chunk(items, size) {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}
//# sourceMappingURL=pricing.repository.js.map