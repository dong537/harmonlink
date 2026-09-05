import type { ProviderCode } from './provider.types';
export declare function normalizeProviderCredential(providerCode: ProviderCode, value: unknown, options: {
    partial: boolean;
}): Record<string, string>;
export declare function trimCredentialObject(value: unknown, options: {
    partial: boolean;
}): Record<string, string>;
