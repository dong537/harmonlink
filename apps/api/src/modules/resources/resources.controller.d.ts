import { Prisma, IpType, Protocol, ResourceStatus, ResourceType } from '@ipeasy/db/generated/client';
import { AuthenticatedContext } from '../../common/auth/auth-context';
import { PageResult } from '../../common/pagination/pagination.dto';
import { ProviderCode } from '../providers/provider.types';
import { PublicResourceCountryItem, ResourceListItem, ResourceListQuery, ResourcesRepository } from './resources.repository';
import { SyncInventoryUseCase } from './use-cases/sync-inventory.use-case';
type CreateResourceBody = {
    parentId?: string | null;
    type: ResourceType;
    code: string;
    name: string;
    displayName?: string | null;
    providerCode: ProviderCode;
    ipType: IpType;
    protocol: Protocol;
    status?: ResourceStatus;
    sortOrder?: number;
    isVisible?: boolean;
    isSaleable?: boolean;
    unsaleableReason?: string | null;
};
type UpdateResourceBody = Partial<{
    parentId: string | null;
    type: ResourceType;
    code: string;
    name: string;
    displayName: string | null;
    providerCode: ProviderCode;
    ipType: IpType;
    protocol: Protocol;
    status: ResourceStatus;
    sortOrder: number;
    isVisible: boolean;
    isSaleable: boolean;
    unsaleableReason: string | null;
}>;
type SyncInventoryBody = {
    providerCode?: ProviderCode;
    accountId?: string | null;
};
type PriceableCatalogGroupSaleabilityBody = {
    countryCode?: string;
    regionKey?: string;
    costGroupKey?: string;
    autoSelect?: boolean;
    providerCode?: ProviderCode;
    saleable?: boolean;
};
type UpdateInventoryBody = {
    stock?: number | string;
    freshnessTtlSeconds?: number | string;
};
export declare class ResourcesController {
    private readonly repo;
    private readonly syncInventory;
    constructor(repo: ResourcesRepository, syncInventory: SyncInventoryUseCase);
    list(ctx: AuthenticatedContext, query: ResourceListQuery): Promise<PageResult<ResourceListItem>>;
    priceableCatalogSummary(ctx: AuthenticatedContext, query: ResourceListQuery): Promise<import("./resources.repository").PriceableCatalogCountrySummaryResult>;
    priceableCatalogGroups(ctx: AuthenticatedContext, query: ResourceListQuery): Promise<import("./resources.repository").PriceableCatalogGroupResult>;
    updatePriceableCatalogGroupSaleability(ctx: AuthenticatedContext, body: PriceableCatalogGroupSaleabilityBody): Promise<{
        updated: number;
        resourceIds: string[];
    }>;
    priceableCatalog(ctx: AuthenticatedContext, query: ResourceListQuery): Promise<PageResult<ResourceListItem>>;
    countries(ctx: AuthenticatedContext, query: ResourceListQuery): Promise<{
        items: PublicResourceCountryItem[];
    }>;
    create(ctx: AuthenticatedContext, body: CreateResourceBody): Prisma.Prisma__platform_resourcesClient<{
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
    update(ctx: AuthenticatedContext, id: string, body: UpdateResourceBody): Promise<{
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
    getInventory(ctx: AuthenticatedContext, id: string): Promise<{
        isStale: boolean;
        providerCode: string;
        id: string;
        siteId: string;
        upstreamAccountId: string | null;
        capturedAt: Date;
        resourceId: string;
        stock: number;
        freshnessTtlSeconds: number;
    }>;
    updateInventory(ctx: AuthenticatedContext, id: string, body: UpdateInventoryBody): Promise<{
        isStale: boolean;
        providerCode: string;
        id: string;
        siteId: string;
        upstreamAccountId: string | null;
        capturedAt: Date;
        resourceId: string;
        stock: number;
        freshnessTtlSeconds: number;
    }>;
    syncInventoryHandler(ctx: AuthenticatedContext, body: SyncInventoryBody): Promise<import("./use-cases/sync-inventory.use-case").SyncInventorySummary>;
    syncResourceInventory(ctx: AuthenticatedContext, id: string): Promise<import("./use-cases/sync-inventory.use-case").SyncInventorySummary>;
    private assertTenantCanUseProviderAccount;
}
export {};
