import { ProviderAdapter, ProviderRuntimeConfig, ProviderHealthResult, InventorySyncResult, StaticProxyBuyInput, ProviderBuyResult, BuyRequestPreview, ProviderOrderQuery, ProviderOrderResult } from '../provider.types';
import { UpstreamLogRepository } from '../upstream-log.repository';
export declare class IpipdAdapter implements ProviderAdapter {
    private readonly upstreamLogRepo?;
    readonly code: "IPIPD";
    constructor(upstreamLogRepo?: UpstreamLogRepository | undefined);
    /**
     * Builds IPIPD HMAC-SHA256 auth headers.
     * Signature string: METHOD + URI + timestamp + nonce + body.
     */
    private buildAuthHeaders;
    /**
     * Parses the IPIPD response envelope and throws AppError on upstream failure.
     */
    private parseEnvelope;
    /**
     * Sends one signed IPIPD request and parses the response envelope.
     */
    private request;
    /**
     * Maps IPIPD order status integers into platform order status.
     */
    private mapOrderStatus;
    /**
     * Maps IPIPD static proxy instances into platform delivery records.
     */
    private mapInstance;
    healthCheck(config: ProviderRuntimeConfig): Promise<ProviderHealthResult>;
    syncInventory(config: ProviderRuntimeConfig): Promise<InventorySyncResult>;
    buyStaticProxy(input: StaticProxyBuyInput, config: ProviderRuntimeConfig): Promise<ProviderBuyResult>;
    buildBuyRequest(input: StaticProxyBuyInput): BuyRequestPreview;
    queryOrder(input: ProviderOrderQuery, config: ProviderRuntimeConfig): Promise<ProviderOrderResult>;
}
export declare function ipipdUrl(baseUrl: string, signedUri: string): string;
