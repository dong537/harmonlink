import { Prisma } from '@ipeasy/db';
import { ProviderCode } from './provider.types';
/**
 * Internal record for a provider account, including the encrypted credential.
 * Stays inside the backend; the credential is only ever used to build a runtime
 * config for a live probe and is never mapped into a response DTO.
 */
export interface ProviderAccountRecord {
    id: string;
    siteId: string;
    tenantId: string | null;
    providerCode: ProviderCode;
    status: 'ACTIVE' | 'DISABLED';
    credentialEncrypted: string;
    baseUrl: string;
    timeoutMs: number;
    inventorySyncEnabled: boolean;
    enabledCountryCodes: string[];
    createdAt: Date;
    updatedAt: Date;
}
export type ProviderAccountSyncRecord = Pick<ProviderAccountRecord, 'id' | 'siteId' | 'tenantId' | 'providerCode' | 'status' | 'inventorySyncEnabled' | 'enabledCountryCodes'>;
export type ProviderResourceSelectionPlan = {
    total: number;
    saleable: number;
    hiddenByCountry: number;
    hiddenByPolicy: number;
    hiddenByManual: number;
    hidden: number;
    changed: number;
    saleableIds: string[];
    hiddenByCountryIds: string[];
    hiddenByPolicyIds: string[];
    hiddenByManualIds: string[];
};
export type ProviderResourceSaleabilityChange = {
    resourceId: string;
    saleable: boolean;
};
export type ProviderResourceSaleabilityUpdateResult = {
    account: ProviderAccountRecord;
    updated: number;
    enabledCountryCodes: string[];
};
/**
 * Read access to `provider_accounts` for the platform provider-health panel.
 * Listing is scoped to a site (PLATFORM_ADMIN); `findForSite` enforces the same
 * site boundary so a cross-site id resolves to "not found".
 */
export declare class ProvidersRepository {
    listForSite(siteId: string): Promise<ProviderAccountRecord[]>;
    findForSite(siteId: string, id: string): Promise<ProviderAccountRecord | null>;
    listInventorySyncEnabled(): Promise<ProviderAccountSyncRecord[]>;
    create(data: {
        siteId: string;
        providerCode: ProviderCode;
        status: 'ACTIVE' | 'DISABLED';
        credentialEncrypted: string;
        baseUrl: string;
        timeoutMs?: number;
        inventorySyncEnabled?: boolean;
        enabledCountryCodes?: string[];
    }): Promise<ProviderAccountRecord>;
    update(siteId: string, id: string, data: Partial<{
        status: 'ACTIVE' | 'DISABLED';
        credentialEncrypted: string;
        baseUrl: string;
        timeoutMs: number;
        inventorySyncEnabled: boolean;
        enabledCountryCodes: string[];
    }>): Promise<ProviderAccountRecord | null>;
    updateResourceSaleability(siteId: string, providerAccountId: string, items: ProviderResourceSaleabilityChange[]): Promise<ProviderResourceSaleabilityUpdateResult>;
    applyEnabledCountrySelectionToResources(siteId: string, providerCode: ProviderCode, enabledCountryCodes: string[], upstreamAccountId?: string | null): Promise<{
        updated: number;
        saleable: number;
        hidden: number;
    }>;
    planEnabledCountrySelectionToResources(siteId: string, providerCode: ProviderCode, enabledCountryCodes: string[], upstreamAccountId?: string | null): Promise<ProviderResourceSelectionPlan>;
    hideProviderAccountResources(siteId: string, providerCode: ProviderCode, upstreamAccountId: string, reason: string): Promise<Prisma.BatchPayload>;
}
