interface DeliveryExpiryOptions {
    timezoneLessUtc?: boolean;
}
export declare function requireFutureDeliveryExpiry(value: unknown, options?: DeliveryExpiryOptions): Date;
export {};
