import { ProviderCode } from './provider.types';
export type NativeProviderCode = Extract<ProviderCode, 'IPIPD' | 'NINE_EIGHT_FIVE' | 'PR'>;
export type ProviderCountry = {
    code: string;
    name: string;
};
export declare const PROVIDER_COUNTRY_COVERAGE: Record<NativeProviderCode, readonly ProviderCountry[]>;
export declare const IPIPD_ALPHA3_TO_ALPHA2: Record<string, string>;
export declare const IPIPD_ALPHA2_TO_ALPHA3: Record<string, string>;
export declare function providerCountryName(providerCode: NativeProviderCode, countryCode: string): string | undefined;
export declare function providerCountryCodes(providerCode: NativeProviderCode): string[];
