export declare class CreateDedicatedLineOrderDto {
    skuCode: string;
    countryCode: string;
    quantity: number;
    durationDays: number;
    currency: string;
    idempotencyKey: string;
    regionCode?: string;
    businessType?: string;
}
