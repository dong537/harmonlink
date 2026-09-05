import { ConfigService } from '../../common/config/config.service';
import { ProviderCode, ProviderAdapter, ProviderRuntimeConfig } from './provider.types';
import { UpstreamLogRepository, CreateUpstreamLogInput } from './upstream-log.repository';
export declare class ProviderRegistryService {
    private readonly config;
    private readonly upstreamLogRepo;
    private readonly adapters;
    constructor(config: ConfigService, upstreamLogRepo: UpstreamLogRepository, adapters: ProviderAdapter[]);
    getConfig(providerCode: ProviderCode, siteId?: string, tenantId?: string | null): Promise<ProviderRuntimeConfig>;
    getConfigForProviderAccount(providerCode: ProviderCode, siteId: string, accountId: string): Promise<ProviderRuntimeConfig>;
    getConfigForUpstreamAccountById(siteId: string, accountId: string): Promise<ProviderRuntimeConfig>;
    getConfigForUpstreamAccount(siteId: string, tenantId?: string | null): Promise<ProviderRuntimeConfig | null>;
    getAdapter(code: ProviderCode): ProviderAdapter;
    logUpstreamRequest(data: Omit<CreateUpstreamLogInput, never>): Promise<void>;
}
