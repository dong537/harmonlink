"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CatalogRepository = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("@ipeasy/db");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
let CatalogRepository = class CatalogRepository {
    async assertBuyerScope(siteId, tenantId, userId) {
        const buyer = await db_1.prisma.users.findFirst({
            where: { id: userId, siteId, tenantId },
            select: { id: true },
        });
        if (!buyer) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'user_not_found', 404);
        }
    }
    async listSkus(siteId, includeInactive = false) {
        const rows = await db_1.prisma.service_skus.findMany({
            where: {
                siteId,
                ...(includeInactive ? {} : { isActive: true, isVisible: true }),
            },
            orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        });
        return rows.map(toServiceSku);
    }
    async listSaleableSkusForBuyer(siteId, tenantId, userId) {
        const [tenant, binding, tenantDefaultTemplate] = await Promise.all([
            db_1.prisma.tenants.findFirst({ where: { id: tenantId, siteId }, select: { ownerUserId: true } }),
            db_1.prisma.user_price_bindings.findFirst({
                where: { siteId, tenantId, userId },
                select: { templateId: true },
            }),
            db_1.prisma.price_templates.findFirst({
                where: { siteId, tenantId, isDefault: true },
                orderBy: { updatedAt: 'desc' },
                select: { id: true },
            }),
        ]);
        if (!tenant)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'tenant_not_found', 404);
        const skus = await this.listSkus(siteId, false);
        const dedicatedSkus = skus.filter((sku) => sku.capabilities['delivery'] === 'dedicated-line');
        if (!tenant.ownerUserId)
            return dedicatedSkus;
        const templateIds = [binding?.templateId, tenantDefaultTemplate?.id].filter((id) => Boolean(id));
        const [userOverrides, templateRules] = await Promise.all([
            db_1.prisma.user_sku_price_overrides.findMany({
                where: { siteId, tenantId, userId },
                select: { skuId: true },
            }),
            templateIds.length > 0
                ? db_1.prisma.sku_price_rules.findMany({
                    where: { siteId, templateId: { in: templateIds } },
                    select: { skuId: true },
                })
                : Promise.resolve([]),
        ]);
        const enabledSkuIds = new Set([...userOverrides, ...templateRules].map((rule) => rule.skuId));
        return dedicatedSkus.filter((sku) => enabledSkuIds.has(sku.id));
    }
    async findSku(siteId, skuCode) {
        const row = await db_1.prisma.service_skus.findUnique({
            where: { siteId_code: { siteId, code: skuCode.trim().toUpperCase() } },
        });
        return row ? toServiceSku(row) : null;
    }
    async getPriceCandidates(input) {
        const [tenant, binding, tenantDefaultTemplate, siteDefaultTemplate] = await Promise.all([
            db_1.prisma.tenants.findFirst({ where: { id: input.tenantId, siteId: input.siteId }, select: { ownerUserId: true } }),
            db_1.prisma.user_price_bindings.findFirst({
                where: { siteId: input.siteId, tenantId: input.tenantId, userId: input.userId },
                select: { templateId: true },
            }),
            db_1.prisma.price_templates.findFirst({
                where: { siteId: input.siteId, tenantId: input.tenantId, isDefault: true },
                orderBy: { updatedAt: 'desc' },
                select: { id: true },
            }),
            db_1.prisma.price_templates.findFirst({
                where: { siteId: input.siteId, tenantId: null, isDefault: true },
                orderBy: { updatedAt: 'desc' },
                select: { id: true },
            }),
        ]);
        if (!tenant)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'tenant_not_found', 404);
        const priceWhere = {
            siteId: input.siteId,
            skuId: input.skuId,
            durationDays: input.durationDays,
            minQty: { lte: input.quantity },
        };
        const [userOverride, userTemplate, tenantDefault, siteOverride, siteDefault] = await Promise.all([
            db_1.prisma.user_sku_price_overrides.findMany({
                where: { ...priceWhere, tenantId: input.tenantId, userId: input.userId },
                orderBy: { minQty: 'desc' },
            }),
            binding
                ? db_1.prisma.sku_price_rules.findMany({
                    where: { ...priceWhere, templateId: binding.templateId },
                    orderBy: { minQty: 'desc' },
                })
                : Promise.resolve([]),
            tenantDefaultTemplate
                ? db_1.prisma.sku_price_rules.findMany({
                    where: { ...priceWhere, templateId: tenantDefaultTemplate.id },
                    orderBy: { minQty: 'desc' },
                })
                : Promise.resolve([]),
            tenant.ownerUserId
                ? Promise.resolve([])
                : db_1.prisma.sku_price_overrides.findMany({
                    where: priceWhere,
                    orderBy: { minQty: 'desc' },
                }),
            tenant.ownerUserId || !siteDefaultTemplate
                ? Promise.resolve([])
                : db_1.prisma.sku_price_rules.findMany({
                    where: { ...priceWhere, templateId: siteDefaultTemplate.id },
                    orderBy: { minQty: 'desc' },
                }),
        ]);
        return [
            toCandidateSet('USER_OVERRIDE', userOverride),
            toCandidateSet('USER_TEMPLATE', userTemplate),
            toCandidateSet('TENANT_DEFAULT_TEMPLATE', tenantDefault),
            toCandidateSet('SITE_OVERRIDE', siteOverride),
            toCandidateSet('SITE_DEFAULT_TEMPLATE', siteDefault),
        ];
    }
};
exports.CatalogRepository = CatalogRepository;
exports.CatalogRepository = CatalogRepository = __decorate([
    (0, common_1.Injectable)()
], CatalogRepository);
function toServiceSku(row) {
    if (row.capabilities === null || Array.isArray(row.capabilities) || typeof row.capabilities !== 'object') {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.INTERNAL_ERROR, 'sku_capabilities_invalid', 500);
    }
    return {
        id: row.id,
        siteId: row.siteId,
        code: row.code,
        name: row.name,
        description: row.description,
        isActive: row.isActive,
        isVisible: row.isVisible,
        contractVersion: row.contractVersion,
        capabilities: row.capabilities,
    };
}
function toCandidateSet(source, rows) {
    const candidates = rows.map((row) => ({
        unitPrice: row.unitPrice.toString(),
        currency: row.currency,
        source,
    }));
    return { source, candidates, hasCurrencyMismatch: candidates.length > 0 };
}
//# sourceMappingURL=catalog.repository.js.map