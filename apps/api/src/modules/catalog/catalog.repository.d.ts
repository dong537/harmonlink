import { ServiceSku, SkuPriceCandidateSet, SkuQuoteSource } from './domain';
export declare class CatalogRepository implements SkuQuoteSource {
    assertBuyerScope(siteId: string, tenantId: string, userId: string): Promise<void>;
    listSkus(siteId: string, includeInactive?: boolean): Promise<ServiceSku[]>;
    listSaleableSkusForBuyer(siteId: string, tenantId: string, userId: string): Promise<ServiceSku[]>;
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
