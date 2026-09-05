export declare const SKU_PRICE_PRIORITY: readonly ["USER_OVERRIDE", "USER_TEMPLATE", "TENANT_DEFAULT_TEMPLATE", "SITE_OVERRIDE", "SITE_DEFAULT_TEMPLATE"];
export type SkuPriceSource = (typeof SKU_PRICE_PRIORITY)[number];
export type SkuCapabilities = Readonly<Record<string, unknown>>;
export interface ServiceSku {
    id: string;
    siteId: string;
    code: string;
    name: string;
    description: string | null;
    isActive: boolean;
    isVisible: boolean;
    contractVersion: number;
    capabilities: Record<string, unknown>;
}
export interface SkuPriceCandidate {
    unitPrice: string;
    currency: string;
    source: SkuPriceSource;
}
export interface SkuPriceCandidateSet {
    source: SkuPriceSource;
    candidates: SkuPriceCandidate[];
    hasCurrencyMismatch: boolean;
}
export interface SkuQuoteInput {
    siteId: string;
    tenantId: string;
    userId: string;
    skuCode: string;
    durationDays: number;
    quantity: number;
    currency: string;
}
export interface SkuQuoteContract {
    readonly skuId: string;
    readonly skuCode: string;
    readonly name: string;
    readonly description: string | null;
    readonly version: number;
    readonly capabilities: SkuCapabilities;
}
export type SkuQuoteResult = Readonly<{
    skuId: string;
    skuCode: string;
    durationDays: number;
    quantity: number;
    unitPrice: string;
    totalPrice: string;
    currency: string;
    priceSource: SkuPriceSource;
    contractVersion: number;
    contract: Readonly<SkuQuoteContract>;
}>;
export interface SkuQuoteSource {
    assertBuyerScope(siteId: string, tenantId: string, userId: string): Promise<void>;
    findSku(siteId: string, skuCode: string): Promise<ServiceSku | null>;
    getPriceCandidates(input: {
        siteId: string;
        tenantId: string;
        userId: string;
        skuId: string;
        durationDays: number;
        quantity: number;
    }): Promise<SkuPriceCandidateSet[]>;
}
export declare function selectSkuPrice(candidateSets: SkuPriceCandidateSet[], currency: string): SkuPriceCandidate | null;
export declare class SkuQuoteUseCase {
    private readonly source;
    constructor(source: SkuQuoteSource);
    execute(input: SkuQuoteInput): Promise<SkuQuoteResult>;
}
