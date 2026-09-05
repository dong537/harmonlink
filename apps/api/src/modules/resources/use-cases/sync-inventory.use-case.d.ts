import { ProviderRegistryService } from '../../providers/provider-registry.service';
import { ResourcesRepository } from '../resources.repository';
import { ProviderCode } from '../../providers/provider.types';
import { DedicatedLineInventoryRepository } from '../../dedicated-line-orders/dedicated-line-inventory.repository';
export interface SyncInventorySummary {
    attempted: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    synced: number;
    syncedAt: Date;
    upstreamRawStatus: 'SUCCESS';
    countries: string[];
}
export declare class SyncInventoryUseCase {
    private readonly registry;
    private readonly repo;
    private readonly dedicatedInventory?;
    constructor(registry: ProviderRegistryService, repo: ResourcesRepository, dedicatedInventory?: DedicatedLineInventoryRepository | undefined);
    execute(siteId: string, providerCode: ProviderCode, tenantId?: string | null, accountId?: string | null): Promise<SyncInventorySummary>;
    requiresRefreshForProviderConfig(siteId: string, providerCode: ProviderCode, tenantId: string | null | undefined, capturedAt: Date, accountId?: string | null): Promise<boolean>;
    resolveActiveUpstreamAccountId(siteId: string, providerCode: ProviderCode, tenantId: string | null | undefined): Promise<string | null>;
}
