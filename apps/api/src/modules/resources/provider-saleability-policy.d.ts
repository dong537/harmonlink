export type ManagedNativeProviderCode = 'PR' | 'IPIPD' | 'NINE_EIGHT_FIVE';
export declare const MANAGED_NATIVE_PROVIDER_CODES: readonly ManagedNativeProviderCode[];
export declare const MANAGED_RESOURCE_PRICE_30D = "39";
export declare const MANAGED_RESOURCE_PRICE_CURRENCY = "CNY";
export declare const MANAGED_RESOURCE_SALEABLE_COUNTRIES: Record<ManagedNativeProviderCode, readonly string[]>;
export type ProviderResourceSaleability = {
    managed: boolean;
    countryCode: string;
    saleable: boolean;
    reason: string | null;
};
export type ProviderResourceSaleabilityInput = {
    providerCode: string;
    code: string;
    name?: string | null;
    displayName?: string | null;
    providerResourceId?: string | null;
};
export declare function getProviderResourceSaleability(input: ProviderResourceSaleabilityInput): ProviderResourceSaleability;
export declare function isManagedNativeProviderCode(value: string): value is ManagedNativeProviderCode;
