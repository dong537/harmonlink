import { ProviderAdapter, ProviderCode, ProviderRuntimeConfig, ProviderHealthResult, InventorySyncResult, StaticProxyBuyInput, ProviderBuyResult, BuyRequestPreview, ProviderOrderQuery, ProviderOrderResult } from '../provider.types';
import { UpstreamLogRepository } from '../upstream-log.repository';
export declare class NineEightFiveAdapter implements ProviderAdapter {
    private readonly upstreamLogRepo?;
    readonly code: ProviderCode;
    constructor(upstreamLogRepo?: UpstreamLogRepository | undefined);
    private headers;
    private post;
    healthCheck(config: ProviderRuntimeConfig): Promise<ProviderHealthResult>;
    syncInventory(config: ProviderRuntimeConfig): Promise<InventorySyncResult>;
    buyStaticProxy(input: StaticProxyBuyInput, config: ProviderRuntimeConfig): Promise<ProviderBuyResult>;
    buildBuyRequest(input: StaticProxyBuyInput, config?: ProviderRuntimeConfig): BuyRequestPreview;
    queryOrder(input: ProviderOrderQuery, config: ProviderRuntimeConfig): Promise<ProviderOrderResult>;
    private mapProxies;
}
