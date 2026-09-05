import { AuthenticatedContext } from '../../common/auth/auth-context';
import { ConfigService } from '../../common/config/config.service';
import { ListProvidersUseCase } from './use-cases/list-providers.use-case';
import { HealthCheckProviderUseCase } from './use-cases/health-check-provider.use-case';
import { CreateProviderAccountDto, ProviderAccountListItemDto, ProviderHealthCheckResultDto, UpdateProviderAccountDto } from './dto';
import { ProvidersRepository } from './providers.repository';
import { ProviderRegistryService } from './provider-registry.service';
type ProviderResourceSaleabilityBody = {
    items?: Array<{
        resourceId?: unknown;
        saleable?: unknown;
    }>;
};
/**
 * Platform-facing provider-health surface. Distinct from
 * `upstream-accounts` (the UPSTREAM_API gateway accounts): this reads native
 * `provider_accounts` and runs on-demand connectivity probes. PLATFORM_ADMIN
 * only — enforced in the use-cases.
 */
export declare class ProvidersController {
    private readonly listUseCase;
    private readonly healthCheckUseCase;
    private readonly repo;
    private readonly registry;
    private readonly config;
    constructor(listUseCase: ListProvidersUseCase, healthCheckUseCase: HealthCheckProviderUseCase, repo: ProvidersRepository, registry: ProviderRegistryService, config: ConfigService);
    list(ctx: AuthenticatedContext): Promise<ProviderAccountListItemDto[]>;
    healthCheck(ctx: AuthenticatedContext, id: string): Promise<ProviderHealthCheckResultDto>;
    create(ctx: AuthenticatedContext, body: CreateProviderAccountDto): Promise<ProviderAccountListItemDto>;
    update(ctx: AuthenticatedContext, id: string, body: UpdateProviderAccountDto): Promise<ProviderAccountListItemDto>;
    updateResourceSaleability(ctx: AuthenticatedContext, id: string, body: ProviderResourceSaleabilityBody): Promise<ProviderAccountListItemDto>;
    private encryptCredential;
    private encryptMergedCredential;
    private decryptCredential;
    private toListItem;
}
export {};
