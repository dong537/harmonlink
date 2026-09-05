export type ProviderCode = 'IPIPD' | 'NINE_EIGHT_FIVE' | 'PR' | 'UPSTREAM_API';
export type UpstreamRequestStatus = 'SUCCESS' | 'ERROR' | 'TIMEOUT';
export interface ProviderHealthResult {
    healthy: boolean;
    latencyMs: number;
    error?: string;
}
export interface InventorySyncResult {
    providerCode: ProviderCode;
    items: InventoryItem[];
    syncedAt: Date;
}
export interface InventoryItem {
    countryCode: string;
    countryName: string;
    regionCode?: string;
    networkCidr?: string;
    stock: number;
    ipType: 'NATIVE' | 'BROADCAST';
    protocol: 'HTTP' | 'SOCKS5' | 'BOTH';
    providerResourceId: string;
    upstreamCost?: string | number | null;
    upstreamCostCurrency?: string | null;
}
export interface StaticProxyBuyInput {
    countryCode: string;
    regionCode?: string;
    quantity: number;
    durationDays: number;
    ipType: 'NATIVE' | 'BROADCAST';
    protocol: 'HTTP' | 'SOCKS5' | 'BOTH';
    businessType?: string;
    currency: string;
    providerResourceId?: string;
    idempotencyKey: string;
}
export interface ProviderBuyResult {
    upstreamOrderId: string;
    status: 'PENDING' | 'COMPLETED' | 'FAILED';
    proxies: ProxyDelivery[];
    failReason?: string;
}
export interface BuyRequestPreview {
    method: 'GET' | 'POST';
    path: string;
    body: Record<string, unknown>;
}
export interface ProxyDelivery {
    upstreamProxyId?: string;
    ip: string;
    port: number;
    username: string;
    password: string;
    protocol: 'HTTP' | 'SOCKS5';
    expiresAt: Date;
    countryCode: string;
}
export interface ProviderOrderQuery {
    upstreamOrderId: string;
    protocol?: 'HTTP' | 'SOCKS5';
    countryCode?: string;
}
export interface ProviderOrderResult {
    upstreamOrderId: string;
    status: 'PENDING' | 'COMPLETED' | 'FAILED';
    proxies: ProxyDelivery[];
    failReason?: string;
}
export interface ProviderProxyLifecycleInput {
    upstreamProxyId: string;
    durationDays?: number;
    idempotencyKey?: string;
}
export interface ProviderProxyLifecycleResult {
    proxy?: ProxyDelivery;
}
export interface ProviderRuntimeConfig {
    code: ProviderCode;
    status: 'ACTIVE' | 'DISABLED';
    siteId?: string;
    upstreamAccountId?: string;
    updatedAt?: Date;
    baseUrl: string;
    timeoutMs: number;
    inventorySyncEnabled: boolean;
    enabledCountryCodes: string[];
    credential: Record<string, string>;
}
export interface ProviderAdapter {
    readonly code: ProviderCode;
    healthCheck(config: ProviderRuntimeConfig): Promise<ProviderHealthResult>;
    syncInventory(config: ProviderRuntimeConfig): Promise<InventorySyncResult>;
    buyStaticProxy(input: StaticProxyBuyInput, config: ProviderRuntimeConfig): Promise<ProviderBuyResult>;
    buildBuyRequest(input: StaticProxyBuyInput, config?: ProviderRuntimeConfig): BuyRequestPreview;
    queryOrder(input: ProviderOrderQuery, config: ProviderRuntimeConfig): Promise<ProviderOrderResult>;
    renewStaticProxy?(input: ProviderProxyLifecycleInput, config: ProviderRuntimeConfig): Promise<ProviderProxyLifecycleResult>;
    changeProxyPassword?(input: ProviderProxyLifecycleInput, config: ProviderRuntimeConfig): Promise<ProviderProxyLifecycleResult>;
    switchProxyIp?(input: ProviderProxyLifecycleInput, config: ProviderRuntimeConfig): Promise<ProviderProxyLifecycleResult>;
}
