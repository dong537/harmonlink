export interface QuoteInput {
    siteId: string;
    tenantId: string;
    userId: string;
    resourceId: string;
    durationDays: number;
    quantity: number;
    currency: string;
}
export interface QuoteResult {
    unitPrice: string;
    totalPrice: string;
    currency: string;
    resourceId: string;
    durationDays: number;
    quantity: number;
    priceSource: 'USER_OVERRIDE' | 'USER_TEMPLATE' | 'TENANT_DEFAULT_TEMPLATE' | 'RESOURCE_OVERRIDE' | 'DEFAULT_TEMPLATE';
    isSaleable: boolean;
    unsaleableReason?: string;
}
export type PriceSource = QuoteResult['priceSource'];
export interface PriceCandidate {
    unitPrice: string;
    currency: string;
    source: PriceSource;
}
export interface PriceCandidateSet {
    candidates: PriceCandidate[];
    hasCurrencyMismatch: boolean;
}
export declare function selectPriceCandidate(candidateSets: PriceCandidateSet[], currency: string): PriceCandidate | 'CURRENCY_MISMATCH' | null;
