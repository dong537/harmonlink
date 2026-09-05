import { Prisma } from '@ipeasy/db/generated/client';
import { PageQueryDto, PageResult } from '../../common/pagination/pagination.dto';
export type ResourceListQuery = PageQueryDto & {
    type?: string;
    providerCode?: string;
    countryCode?: string;
    publicOnly?: boolean;
    userId?: string;
    tenantId?: string | null;
    durationDays?: string | number;
    currency?: string;
};
export type ResourceListItem = Omit<ResourceWithInventory, 'inventory_snapshots' | 'resource_mappings' | 'upstreamCost' | 'upstreamCostCurrency'> & {
    countryCode: string;
    upstreamResourceId: string | null;
    stock: number | null;
    inventoryCapturedAt: Date | null;
    inventoryIsStale: boolean | null;
    unitPrice: string | null;
    priceCurrency: string | null;
    costGroupKey?: string | null;
    upstreamCost?: string | null;
    upstreamCostCurrency?: string | null;
};
export type PublicResourceCountryItem = {
    countryCode: string;
    totalResources: number;
    availableStock: number;
};
export type PriceableCatalogCountrySummaryItem = {
    countryCode: string;
    totalResources: number;
    regionCount: number;
    pricedCount: number;
    costGroupCount: number;
};
export type PriceableCatalogCountrySummaryResult = PageResult<PriceableCatalogCountrySummaryItem> & {
    totalResources: number;
};
export type PriceableCatalogGroupItem = {
    key: string;
    countryCode: string;
    regionKey: string;
    costGroupKey: string;
    resourceCount: number;
    pricedCount: number;
    unitPrice: string | null;
    priceCurrency: string | null;
    upstreamCost: string | null;
    upstreamCostCurrency: string | null;
    autoSelect: boolean;
    sampleResource: ResourceListItem;
};
export type PriceableCatalogGroupResult = PageResult<PriceableCatalogGroupItem> & {
    countryCode: string;
    totalResources: number;
};
export type PriceableCatalogGroupSelector = {
    countryCode?: string;
    regionKey?: string;
    costGroupKey?: string;
    autoSelect?: boolean | string;
    tenantId?: string | null;
    providerCode?: string;
    durationDays?: string | number;
    currency?: string;
};
export type ResourceCoverageKey = {
    code: string;
    ipType: 'NATIVE' | 'BROADCAST' | 'BOTH';
};
type ResourceWithInventory = Prisma.platform_resourcesGetPayload<{
    select: {
        id: true;
        upstreamAccountId: true;
        parentId: true;
        type: true;
        code: true;
        name: true;
        displayName: true;
        providerCode: true;
        ipType: true;
        protocol: true;
        status: true;
        sortOrder: true;
        isVisible: true;
        isSaleable: true;
        unsaleableReason: true;
        upstreamCost: true;
        upstreamCostCurrency: true;
        inventory_snapshots: {
            select: {
                stock: true;
                capturedAt: true;
                freshnessTtlSeconds: true;
                isStale: true;
            };
            orderBy: {
                capturedAt: 'desc';
            };
            take: 1;
        };
        resource_mappings: {
            select: {
                upstreamAccountId: true;
                providerResourceId: true;
            };
            orderBy: {
                weight: 'desc';
            };
            take: 1;
        };
    };
}>;
export declare class ResourcesRepository {
    findById(id: string): Prisma.Prisma__platform_resourcesClient<{
        status: import("@ipeasy/db/generated/client").$Enums.ResourceStatus;
        code: string;
        type: import("@ipeasy/db/generated/client").$Enums.ResourceType;
        protocol: import("@ipeasy/db/generated/client").$Enums.Protocol;
        providerCode: string;
        name: string;
        id: string;
        siteId: string;
        upstreamAccountId: string | null;
        createdAt: Date;
        updatedAt: Date;
        sortOrder: number;
        parentId: string | null;
        displayName: string | null;
        ipType: import("@ipeasy/db/generated/client").$Enums.IpType;
        upstreamCost: Prisma.Decimal | null;
        upstreamCostCurrency: string | null;
        isVisible: boolean;
        isSaleable: boolean;
        unsaleableReason: string | null;
    } | null, null, import("@ipeasy/db/generated/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
    findByIdInSite(id: string, siteId: string): Prisma.Prisma__platform_resourcesClient<{
        status: import("@ipeasy/db/generated/client").$Enums.ResourceStatus;
        code: string;
        type: import("@ipeasy/db/generated/client").$Enums.ResourceType;
        protocol: import("@ipeasy/db/generated/client").$Enums.Protocol;
        providerCode: string;
        name: string;
        id: string;
        siteId: string;
        upstreamAccountId: string | null;
        createdAt: Date;
        updatedAt: Date;
        sortOrder: number;
        parentId: string | null;
        displayName: string | null;
        ipType: import("@ipeasy/db/generated/client").$Enums.IpType;
        upstreamCost: Prisma.Decimal | null;
        upstreamCostCurrency: string | null;
        isVisible: boolean;
        isSaleable: boolean;
        unsaleableReason: string | null;
    } | null, null, import("@ipeasy/db/generated/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
    list(siteId: string, query?: ResourceListQuery): Promise<PageResult<ResourceListItem>>;
    listPriceableCatalog(siteId: string, query?: ResourceListQuery): Promise<PageResult<ResourceListItem>>;
    listPriceableCatalogSummary(siteId: string, query?: ResourceListQuery): Promise<PriceableCatalogCountrySummaryResult>;
    listPriceableCatalogGroups(siteId: string, query?: ResourceListQuery): Promise<PriceableCatalogGroupResult>;
    findPriceableCatalogGroupResourceIds(siteId: string, selector: PriceableCatalogGroupSelector): Promise<string[]>;
    updatePriceableCatalogGroupSaleability(siteId: string, selector: PriceableCatalogGroupSelector, saleable: boolean): Promise<{
        updated: number;
        resourceIds: string[];
    }>;
    listPublicCountries(siteId: string, query?: ResourceListQuery): Promise<{
        items: PublicResourceCountryItem[];
    }>;
    private buildPriceableCatalogWhere;
    private findPriceableCatalogRows;
    create(data: Prisma.platform_resourcesUncheckedCreateInput): Prisma.Prisma__platform_resourcesClient<{
        status: import("@ipeasy/db/generated/client").$Enums.ResourceStatus;
        code: string;
        type: import("@ipeasy/db/generated/client").$Enums.ResourceType;
        protocol: import("@ipeasy/db/generated/client").$Enums.Protocol;
        providerCode: string;
        name: string;
        id: string;
        siteId: string;
        upstreamAccountId: string | null;
        createdAt: Date;
        updatedAt: Date;
        sortOrder: number;
        parentId: string | null;
        displayName: string | null;
        ipType: import("@ipeasy/db/generated/client").$Enums.IpType;
        upstreamCost: Prisma.Decimal | null;
        upstreamCostCurrency: string | null;
        isVisible: boolean;
        isSaleable: boolean;
        unsaleableReason: string | null;
    }, never, import("@ipeasy/db/generated/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
    update(id: string, _siteId: string, data: Prisma.platform_resourcesUncheckedUpdateInput): Prisma.Prisma__platform_resourcesClient<{
        status: import("@ipeasy/db/generated/client").$Enums.ResourceStatus;
        code: string;
        type: import("@ipeasy/db/generated/client").$Enums.ResourceType;
        protocol: import("@ipeasy/db/generated/client").$Enums.Protocol;
        providerCode: string;
        name: string;
        id: string;
        siteId: string;
        upstreamAccountId: string | null;
        createdAt: Date;
        updatedAt: Date;
        sortOrder: number;
        parentId: string | null;
        displayName: string | null;
        ipType: import("@ipeasy/db/generated/client").$Enums.IpType;
        upstreamCost: Prisma.Decimal | null;
        upstreamCostCurrency: string | null;
        isVisible: boolean;
        isSaleable: boolean;
        unsaleableReason: string | null;
    }, never, import("@ipeasy/db/generated/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
    findSyncedResource(siteId: string, providerCode: string, upstreamAccountId: string | null | undefined, code: string, ipType: 'NATIVE' | 'BROADCAST'): Prisma.Prisma__platform_resourcesClient<{
        status: import("@ipeasy/db/generated/client").$Enums.ResourceStatus;
        code: string;
        type: import("@ipeasy/db/generated/client").$Enums.ResourceType;
        protocol: import("@ipeasy/db/generated/client").$Enums.Protocol;
        providerCode: string;
        name: string;
        id: string;
        siteId: string;
        upstreamAccountId: string | null;
        createdAt: Date;
        updatedAt: Date;
        sortOrder: number;
        parentId: string | null;
        displayName: string | null;
        ipType: import("@ipeasy/db/generated/client").$Enums.IpType;
        upstreamCost: Prisma.Decimal | null;
        upstreamCostCurrency: string | null;
        isVisible: boolean;
        isSaleable: boolean;
        unsaleableReason: string | null;
    } | null, null, import("@ipeasy/db/generated/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
    hasProviderMapping(siteId: string, resourceId: string, providerCode: string): Promise<boolean>;
    upsertSyncedResource(data: {
        siteId: string;
        providerCode: string;
        upstreamAccountId?: string | null;
        code: string;
        name: string;
        displayName?: string | null;
        type?: 'COUNTRY' | 'REGION' | 'ZONE';
        parentId?: string | null;
        ipType: 'NATIVE' | 'BROADCAST';
        protocol: 'HTTP' | 'SOCKS5' | 'BOTH';
        providerResourceId?: string | null;
        upstreamCost?: string | number | null;
        upstreamCostCurrency?: string | null;
        saleabilityOverride?: {
            status: 'ACTIVE' | 'HIDDEN' | 'DISABLED';
            isVisible: boolean;
            isSaleable: boolean;
            unsaleableReason: string | null;
        };
    }): Promise<{
        status: import("@ipeasy/db/generated/client").$Enums.ResourceStatus;
        code: string;
        type: import("@ipeasy/db/generated/client").$Enums.ResourceType;
        protocol: import("@ipeasy/db/generated/client").$Enums.Protocol;
        providerCode: string;
        name: string;
        id: string;
        siteId: string;
        upstreamAccountId: string | null;
        createdAt: Date;
        updatedAt: Date;
        sortOrder: number;
        parentId: string | null;
        displayName: string | null;
        ipType: import("@ipeasy/db/generated/client").$Enums.IpType;
        upstreamCost: Prisma.Decimal | null;
        upstreamCostCurrency: string | null;
        isVisible: boolean;
        isSaleable: boolean;
        unsaleableReason: string | null;
    }>;
    disableResourcesOutsideCoverage(siteId: string, providerCode: string, upstreamAccountId: string | null | undefined, allowedResources: ResourceCoverageKey[]): Prisma.PrismaPromise<Prisma.BatchPayload>;
    hideResourcesOutsideEnabledCountries(siteId: string, providerCode: string, allowedCodes: string[]): Prisma.PrismaPromise<Prisma.BatchPayload>;
    findProviderAccountTenant(siteId: string, providerCode: string, upstreamAccountId: string): Promise<string | null | undefined>;
    hideResourcesOutsideCurrentSync(siteId: string, providerCode: string, upstreamAccountId: string | null | undefined, currentResources: ResourceCoverageKey[]): Prisma.PrismaPromise<Prisma.BatchPayload>;
    hideResourcesFromOtherUpstreamAccounts(siteId: string, providerCode: string, upstreamAccountId: string): Promise<Prisma.BatchPayload>;
    hideUpstreamAccountResources(siteId: string, providerCode: string, upstreamAccountId: string, reason: string): Prisma.PrismaPromise<Prisma.BatchPayload>;
    upsertInventorySnapshot(data: {
        siteId: string;
        resourceId: string;
        providerCode: string;
        upstreamAccountId?: string | null;
        stock: number;
        capturedAt: Date;
        freshnessTtlSeconds?: number;
    }): Prisma.Prisma__inventory_snapshotsClient<{
        providerCode: string;
        id: string;
        siteId: string;
        upstreamAccountId: string | null;
        capturedAt: Date;
        resourceId: string;
        stock: number;
        freshnessTtlSeconds: number;
        isStale: boolean;
    }, never, import("@ipeasy/db/generated/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
    listInventory(resourceId: string, siteId?: string): Promise<{
        isStale: boolean;
        providerCode: string;
        id: string;
        siteId: string;
        upstreamAccountId: string | null;
        capturedAt: Date;
        resourceId: string;
        stock: number;
        freshnessTtlSeconds: number;
    }[]>;
    getLatestInventory(resourceId: string, siteId: string, upstreamAccountId?: string | null): Promise<{
        isStale: boolean;
        providerCode: string;
        id: string;
        siteId: string;
        upstreamAccountId: string | null;
        capturedAt: Date;
        resourceId: string;
        stock: number;
        freshnessTtlSeconds: number;
    } | null>;
    upsertMapping(data: {
        siteId: string;
        resourceId: string;
        providerCode: string;
        upstreamAccountId?: string | null;
        providerResourceId: string;
        weight?: number;
    }): Promise<{
        providerResourceId: string;
        providerCode: string;
        id: string;
        siteId: string;
        upstreamAccountId: string | null;
        resourceId: string;
        weight: number;
    }>;
    private listPublicSaleable;
    private getPublicPriceMap;
    private resolvePublicPriceScopes;
    private getAdminOverridePriceMap;
}
export {};
