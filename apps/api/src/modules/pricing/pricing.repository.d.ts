import { Prisma } from '@ipeasy/db/generated/client';
import { PageQueryDto, PageResult } from '../../common/pagination/pagination.dto';
export interface PriceResult {
    unitPrice: string;
    currency: string;
    source: 'USER_OVERRIDE' | 'USER_TEMPLATE' | 'TENANT_DEFAULT_TEMPLATE' | 'RESOURCE_OVERRIDE' | 'DEFAULT_TEMPLATE';
}
export type PriceTemplateListItem = Prisma.price_templatesGetPayload<{
    include: {
        price_rules: {
            include: {
                resource: {
                    select: {
                        id: true;
                        code: true;
                        name: true;
                    };
                };
            };
            orderBy: [{
                durationDays: 'asc';
            }, {
                createdAt: 'asc';
            }];
        };
    };
}>;
export type CreateTemplateInput = {
    siteId: string;
    name: string;
    description?: string | null;
    isDefault?: boolean;
};
export type UpsertPriceRuleInput = {
    siteId: string;
    templateId: string;
    resourceId: string;
    durationDays: number;
    unitPrice: string;
    currency: string;
    minQty?: number;
};
export type PricingMatrixQuery = PageQueryDto & {
    providerCode?: string;
    ipType?: string;
    stockState?: string;
    durationDays?: string | number;
    currency?: string;
    configurableOnly?: string | boolean;
    includeTotal?: string | boolean;
    withInventory?: string | boolean;
    tenantId?: string | null;
};
export type PricingMatrixSummaryQuery = {
    providerCode?: string;
    durationDays?: string | number;
    currency?: string;
    tenantId?: string | null;
};
export type PricingMatrixItem = {
    resourceId: string;
    code: string;
    name: string;
    displayName: string | null;
    providerCode: string;
    ipType: string;
    protocol: string;
    status: string;
    isSaleable: boolean;
    stock: number | null;
    inventoryCapturedAt: Date | null;
    inventoryIsStale: boolean | null;
    overridePrice: string | null;
    effectivePrice: string | null;
    currency: string | null;
    upstreamCost: string | null;
    upstreamCostCurrency: string | null;
};
export type PricingMatrixSummaryItem = {
    providerCode: string;
    total: number;
    enabled: number;
    synced: number;
    priced: number;
};
export type UpsertSkuPriceRuleInput = {
    skuId: string;
    durationDays: number;
    unitPrice: string;
    currency: string;
    minQty?: number;
};
export type SkuPriceRuleQuery = {
    templateId?: string;
    skuId?: string;
};
export type DedicatedSkuPricingItem = {
    skuId: string;
    code: string;
    name: string;
    description: string | null;
    templateRules: Array<{
        id: string;
        durationDays: number;
        minQty: number;
        unitPrice: string;
        currency: string;
    }>;
    globalOverrides: Array<{
        id: string;
        durationDays: number;
        minQty: number;
        unitPrice: string;
        currency: string;
    }>;
};
export declare class PricingRepository {
    listDedicatedSkuPricing(siteId: string): Promise<{
        templateId: string | null;
        items: DedicatedSkuPricingItem[];
    }>;
    upsertDedicatedSkuOverride(input: {
        siteId: string;
        skuId: string;
        durationDays: number;
        minQty: number;
        unitPrice: string;
        currency: string;
    }): Promise<{
        durationDays: number;
        currency: string;
        skuId: string;
        id: string;
        siteId: string;
        createdAt: Date;
        updatedAt: Date;
        minQty: number;
        unitPrice: Prisma.Decimal;
    }>;
    upsertDedicatedSkuTemplateRule(input: {
        siteId: string;
        templateId: string;
        skuId: string;
        durationDays: number;
        minQty: number;
        unitPrice: string;
        currency: string;
    }): Promise<{
        durationDays: number;
        currency: string;
        skuId: string;
        id: string;
        siteId: string;
        createdAt: Date;
        updatedAt: Date;
        templateId: string;
        minQty: number;
        unitPrice: Prisma.Decimal;
    }>;
    upsertUserDedicatedSkuOverride(input: {
        siteId: string;
        tenantId: string;
        userId: string;
        skuId: string;
        durationDays: number;
        minQty: number;
        unitPrice: string;
        currency: string;
    }): Promise<{
        durationDays: number;
        currency: string;
        skuId: string;
        id: string;
        siteId: string;
        createdAt: Date;
        updatedAt: Date;
        tenantId: string;
        userId: string;
        minQty: number;
        unitPrice: Prisma.Decimal;
    }>;
    upsertSkuRules(templateId: string, siteId: string, rules: UpsertSkuPriceRuleInput[]): Promise<{
        durationDays: number;
        currency: string;
        skuId: string;
        id: string;
        siteId: string;
        createdAt: Date;
        updatedAt: Date;
        templateId: string;
        minQty: number;
        unitPrice: Prisma.Decimal;
    }[]>;
    upsertSkuOverride(data: UpsertSkuPriceRuleInput & {
        siteId: string;
    }): Promise<{
        durationDays: number;
        currency: string;
        skuId: string;
        id: string;
        siteId: string;
        createdAt: Date;
        updatedAt: Date;
        minQty: number;
        unitPrice: Prisma.Decimal;
    }>;
    upsertUserSkuOverride(data: UpsertSkuPriceRuleInput & {
        siteId: string;
        tenantId: string;
        userId: string;
    }): Promise<{
        durationDays: number;
        currency: string;
        skuId: string;
        id: string;
        siteId: string;
        createdAt: Date;
        updatedAt: Date;
        tenantId: string;
        userId: string;
        minQty: number;
        unitPrice: Prisma.Decimal;
    }>;
    listSkuRules(siteId: string, query?: SkuPriceRuleQuery): Prisma.PrismaPromise<({
        sku: {
            code: string;
            name: string;
            id: string;
        };
    } & {
        durationDays: number;
        currency: string;
        skuId: string;
        id: string;
        siteId: string;
        createdAt: Date;
        updatedAt: Date;
        templateId: string;
        minQty: number;
        unitPrice: Prisma.Decimal;
    })[]>;
    private assertDedicatedLineSkus;
    private requireDedicatedSku;
    getPriceForUser(siteId: string, userId: string, resourceId: string, durationDays: number, quantity: number, currency: string): Promise<PriceResult | null>;
    createTemplate(data: CreateTemplateInput): Promise<{
        name: string;
        id: string;
        siteId: string;
        createdAt: Date;
        updatedAt: Date;
        tenantId: string | null;
        description: string | null;
        isDefault: boolean;
    }>;
    listTemplates(siteId: string, query?: PageQueryDto): Promise<PageResult<PriceTemplateListItem>>;
    upsertRules(templateId: string, siteId: string, rules: Array<Omit<UpsertPriceRuleInput, 'siteId' | 'templateId'>>): Promise<{
        durationDays: number;
        currency: string;
        id: string;
        siteId: string;
        createdAt: Date;
        updatedAt: Date;
        templateId: string;
        minQty: number;
        unitPrice: Prisma.Decimal;
        resourceId: string;
    }[]>;
    upsertOverride(data: {
        siteId: string;
        resourceId: string;
        durationDays: number;
        unitPrice: string;
        currency: string;
    }): Promise<{
        durationDays: number;
        currency: string;
        id: string;
        siteId: string;
        unitPrice: Prisma.Decimal;
        resourceId: string;
    }>;
    replaceOverridesForResources(data: {
        siteId: string;
        resourceIds: string[];
        durationDays: number;
        unitPrice: string;
        currency: string;
    }): Promise<{
        updated: number;
        durationDays: number;
        currency: string;
    }>;
    upsertUserOverride(data: {
        siteId: string;
        tenantId: string;
        userId: string;
        resourceId: string;
        durationDays: number;
        unitPrice: string;
        currency: string;
    }): Prisma.Prisma__user_resource_price_overridesClient<{
        durationDays: number;
        currency: string;
        id: string;
        siteId: string;
        tenantId: string;
        userId: string;
        unitPrice: Prisma.Decimal;
        resourceId: string;
    }, never, import("@ipeasy/db/generated/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
    bindUserTemplate(data: {
        siteId: string;
        tenantId: string;
        userId: string;
        templateId: string;
    }): Prisma.Prisma__user_price_bindingsClient<{
        id: string;
        siteId: string;
        tenantId: string;
        userId: string;
        templateId: string;
    }, never, import("@ipeasy/db/generated/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
    listMatrixSummary(siteId: string, query?: PricingMatrixSummaryQuery): Promise<PricingMatrixSummaryItem[]>;
    listMatrix(siteId: string, query?: PricingMatrixQuery): Promise<PageResult<PricingMatrixItem>>;
}
