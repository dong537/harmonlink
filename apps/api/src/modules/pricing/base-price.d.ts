import type { PriceResult } from './pricing.repository';
export declare function isManagedStaticProxyProviderCode(value: string): boolean;
export declare function getBaseStaticProxyPrice(input: {
    code: string;
    providerCode: string;
    durationDays: number;
    currency: string;
}): PriceResult | null;
export declare function resourceCountryCode(code: string): string;
