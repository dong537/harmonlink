import { ProviderAdapter, ProviderCode, ProviderRuntimeConfig, ProviderHealthResult, InventorySyncResult, StaticProxyBuyInput, ProviderBuyResult, BuyRequestPreview, ProviderOrderQuery, ProviderOrderResult } from '../provider.types';
import { UpstreamLogRepository } from '../upstream-log.repository';
export declare class PrAdapter implements ProviderAdapter {
    private readonly upstreamLogRepo?;
    readonly code: ProviderCode;
    constructor(upstreamLogRepo?: UpstreamLogRepository | undefined);
    private buildUrl;
    private parseEnvelope;
    private request;
    private mapProxy;
    healthCheck(config: ProviderRuntimeConfig): Promise<ProviderHealthResult>;
    syncInventory(config: ProviderRuntimeConfig): Promise<InventorySyncResult>;
    private fetchResidentTarifCost;
    buyStaticProxy(input: StaticProxyBuyInput, config: ProviderRuntimeConfig): Promise<ProviderBuyResult>;
    buildBuyRequest(input: StaticProxyBuyInput): BuyRequestPreview;
    queryOrder(input: ProviderOrderQuery, config: ProviderRuntimeConfig): Promise<ProviderOrderResult>;
}
