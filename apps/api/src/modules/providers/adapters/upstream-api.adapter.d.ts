import { ProviderAdapter, ProviderCode, ProviderRuntimeConfig, ProviderHealthResult, InventorySyncResult, StaticProxyBuyInput, ProviderBuyResult, BuyRequestPreview, ProviderOrderQuery, ProviderOrderResult, ProviderProxyLifecycleInput, ProviderProxyLifecycleResult } from '../provider.types';
import { UpstreamLogRepository } from '../upstream-log.repository';
export declare class UpstreamApiAdapter implements ProviderAdapter {
    private readonly upstreamLogRepo?;
    readonly code: ProviderCode;
    constructor(upstreamLogRepo?: UpstreamLogRepository | undefined);
    private headers;
    private postEnvelope;
    healthCheck(config: ProviderRuntimeConfig): Promise<ProviderHealthResult>;
    syncInventory(config: ProviderRuntimeConfig): Promise<InventorySyncResult>;
    buyStaticProxy(input: StaticProxyBuyInput, config: ProviderRuntimeConfig): Promise<ProviderBuyResult>;
    buildBuyRequest(input: StaticProxyBuyInput): BuyRequestPreview;
    queryOrder(input: ProviderOrderQuery, config: ProviderRuntimeConfig): Promise<ProviderOrderResult>;
    renewStaticProxy(input: ProviderProxyLifecycleInput, config: ProviderRuntimeConfig): Promise<ProviderProxyLifecycleResult>;
    changeProxyPassword(input: ProviderProxyLifecycleInput, config: ProviderRuntimeConfig): Promise<ProviderProxyLifecycleResult>;
    switchProxyIp(input: ProviderProxyLifecycleInput, config: ProviderRuntimeConfig): Promise<ProviderProxyLifecycleResult>;
}
